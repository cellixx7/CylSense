import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import {
  CONTRACTS_VERSION,
  type ApiError,
  type ApiErrorCode,
  type AuthStatusResponse,
  type GameAccount,
  type HealthResponse,
  LoginRequest,
  type MatchListResponse,
  RegisterRequest,
  type MeResponse,
  type SyncResponse,
} from "@cyl/contracts";
import {
  normalizeMatch,
  type AuthProvider,
  type GameAdapter,
  type MatchProvider,
  type ProviderError,
  type ProviderErrorCode,
} from "@cyl/core";
import Fastify, { type FastifyReply, type FastifyRequest, type FastifyServerOptions } from "fastify";
import { z } from "zod";
import type { ApiConfig } from "./config";
import { createPkcePair, hashPassword, randomToken, safeEqual, verifyPassword } from "./security";
import { MemoryStore } from "./store";

export const SESSION_COOKIE = "cyl_session";
export const STATE_COOKIE = "cyl_login_state";
/** Cabecalho exigido em requisicoes que alteram estado (anti-CSRF; forca preflight CORS). */
export const CSRF_HEADER = "x-cyl-request";

const LOGIN_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SYNC_LIMIT = 20;

export interface AppDeps {
  config: ApiConfig;
  auth: AuthProvider;
  matches: MatchProvider;
  adapter: GameAdapter;
  store?: MemoryStore;
  now?: () => number;
  newId?: () => string;
  logger?: FastifyServerOptions["logger"];
}

/**
 * Logger sem credenciais: a URL e registrada sem query string (o callback
 * OAuth carrega `code` e `state`) e cabecalhos de cookie/autorizacao sao omitidos.
 */
export function loggerOptions(
  level: string,
  stream?: { write(msg: string): void },
): Exclude<FastifyServerOptions["logger"], boolean | undefined> {
  return {
    level,
    ...(stream ? { stream } : {}),
    redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
    serializers: {
      req: (req: { method: string; url: string }) => ({ method: req.method, path: req.url.split("?")[0] }),
    },
  };
}

const PROVIDER_HTTP: Record<ProviderErrorCode, { status: number; code: ApiErrorCode }> = {
  not_configured: { status: 503, code: "not_configured" },
  unauthorized: { status: 401, code: "unauthorized" },
  invalid_state: { status: 400, code: "invalid_state" },
  invalid_data: { status: 502, code: "upstream_unavailable" },
  not_found: { status: 404, code: "not_found" },
  rate_limited: { status: 429, code: "rate_limited" },
  network: { status: 502, code: "upstream_unavailable" },
};

const CallbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(256).optional(),
});

const AccountParams = z.object({ accountId: z.string().min(1).max(128) });

function sendError(reply: FastifyReply, status: number, code: ApiErrorCode, message: string) {
  const body: ApiError = { error: { code, message } };
  return reply.status(status).send(body);
}

function sendProviderError(reply: FastifyReply, error: ProviderError) {
  const mapped = PROVIDER_HTTP[error.code];
  if (error.retryAfterSeconds !== undefined) reply.header("retry-after", String(error.retryAfterSeconds));
  return sendError(reply, mapped.status, mapped.code, error.message);
}

export function buildApp(deps: AppDeps) {
  const { config, auth, matches, adapter } = deps;
  const store = deps.store ?? new MemoryStore();
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? randomUUID;
  const isoNow = () => new Date(now()).toISOString();
  const redirectUri = `${config.publicApiUrl}/v1/auth/riot/callback`;
  const cookieBase = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.env === "production",
  };

  const app = Fastify({
    logger: deps.logger ?? loggerOptions(config.env === "test" ? "silent" : "info"),  });
  app.register(cookie);

  app.addHook("onRequest", async (req, reply) => {
    const safe = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
    if (!safe && req.headers[CSRF_HEADER] !== "1") {
      return sendError(reply, 403, "invalid_request", `cabecalho ${CSRF_HEADER} ausente`);
    }
  });

  app.setNotFoundHandler((_req, reply) => sendError(reply, 404, "not_found", "rota inexistente"));
  app.setErrorHandler((error, req, reply) => {
    const name = error instanceof Error ? error.name : "unknown";
    req.log.error({ err: { name } }, "erro nao tratado");
    return sendError(reply, 500, "internal", "erro interno");
  });

  function sessionUserId(req: FastifyRequest): string | undefined {
    const sessionId = req.cookies[SESSION_COOKIE];
    return sessionId ? store.getSession(sessionId, now())?.userId : undefined;
  }

  /** `persistent: false` gera cookie de sessao do navegador (some ao fechar). */
  function startSession(reply: FastifyReply, userId: string, persistent: boolean) {
    const sessionId = randomToken();
    store.createSession(sessionId, { userId, expiresAt: now() + SESSION_TTL_MS });
    reply.setCookie(SESSION_COOKIE, sessionId, persistent ? { ...cookieBase, maxAge: SESSION_TTL_MS / 1000 } : cookieBase);
  }

  function meOf(userId: string): MeResponse | undefined {
    const user = store.getUser(userId);
    return user ? { user, gameAccounts: store.listAccounts(userId) } : undefined;
  }

  // Hash de referencia para e-mails inexistentes: o login leva o mesmo tempo
  // com ou sem conta, sem revelar quais e-mails estao cadastrados.
  let decoyHash: Promise<string> | undefined;
  const decoy = () => (decoyHash ??= hashPassword(randomToken()));

  app.get("/v1/health", async () => {
    const body: HealthResponse = { status: "ok", contractsVersion: CONTRACTS_VERSION };
    return body;
  });

  app.post("/v1/auth/register", async (req, reply) => {
    const body = RegisterRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, "invalid_request", "dados de cadastro invalidos");
    const { displayName, email, password } = body.data;
    if (store.findCredential(email)) return sendError(reply, 409, "conflict", "e-mail ja cadastrado");

    const passwordHash = await hashPassword(password);
    // Outro cadastro com o mesmo e-mail pode ter terminado durante o hash.
    if (store.findCredential(email)) return sendError(reply, 409, "conflict", "e-mail ja cadastrado");

    const userId = newId();
    store.saveUser({ id: userId, displayName, createdAt: isoNow() });
    store.saveCredential(email, { userId, passwordHash });
    startSession(reply, userId, true);
    return reply.status(201).send(meOf(userId));
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const body = LoginRequest.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, "invalid_request", "dados de login invalidos");
    const credential = store.findCredential(body.data.email);
    const valid = await verifyPassword(body.data.password, credential?.passwordHash ?? (await decoy()));
    if (!credential || !valid) return sendError(reply, 401, "unauthorized", "e-mail ou senha incorretos");

    startSession(reply, credential.userId, body.data.remember === true);
    return meOf(credential.userId);
  });

  app.get("/v1/auth/riot/status", async () => {
    const body: AuthStatusResponse = { provider: "riot", mode: auth.enabled ? config.authMode : "disabled" };
    return body;
  });

  app.get("/v1/auth/riot/start", async (_req, reply) => {
    if (!auth.enabled) return sendError(reply, 503, "not_configured", "integracao Riot desativada neste ambiente");

    const state = randomToken();
    const { verifier, challenge } = createPkcePair();
    const begin = await auth.beginLogin({ state, codeChallenge: challenge, redirectUri });
    if (!begin.ok) return sendProviderError(reply, begin.error);

    store.savePendingLogin(state, { codeVerifier: verifier, expiresAt: now() + LOGIN_TTL_MS });
    reply.setCookie(STATE_COOKIE, state, { ...cookieBase, maxAge: LOGIN_TTL_MS / 1000 });
    return reply.redirect(begin.value.authorizationUrl);
  });

  app.get("/v1/auth/riot/callback", async (req, reply) => {
    // Com sessao ativa (conta propria), o login Riot apenas vincula a conta.
    const sessionUser = sessionUserId(req);
    const fail = (reason: string) => {
      reply.clearCookie(STATE_COOKIE, { path: "/" });
      return reply.redirect(`${config.webOrigin}${sessionUser ? "/vincular" : "/entrar"}?erro=${reason}`);
    };

    const query = CallbackQuery.safeParse(req.query);
    if (!query.success) return fail("invalid_request");
    // O texto de erro do provedor nao e refletido para o cliente.
    if (query.data.error !== undefined) return fail("consent_denied");
    const { code, state } = query.data;
    if (code === undefined || state === undefined) return fail("invalid_request");

    const cookieState = req.cookies[STATE_COOKIE];
    const pending = store.consumePendingLogin(state, now());
    if (!pending || cookieState === undefined || !safeEqual(cookieState, state)) return fail("invalid_state");

    const result = await auth.completeLogin({ code, codeVerifier: pending.codeVerifier, redirectUri });
    if (!result.ok) {
      req.log.warn({ providerError: result.error.code }, "login recusado pelo provedor");
      return fail(result.error.code === "not_configured" ? "not_configured" : "unauthorized");
    }

    const { identity, grant } = result.value;
    const existing = store.findAccountByExternalId(identity.provider, identity.externalId);
    if (sessionUser && existing && existing.userId !== sessionUser) return fail("already_linked");
    let userId = sessionUser ?? existing?.userId;
    if (userId === undefined) {
      userId = newId();
      store.saveUser({ id: userId, displayName: identity.gameName, createdAt: isoNow() });
    }
    const account: GameAccount = {
      id: existing?.id ?? newId(),
      userId,
      game: adapter.game,
      provider: identity.provider,
      externalId: identity.externalId,
      gameName: identity.gameName,
      tagLine: identity.tagLine,
      linkedAt: existing?.linkedAt ?? isoNow(),
      consent: { scopes: identity.grantedScopes, grantedAt: isoNow() },
    };
    store.saveAccount(account, identity, grant);

    reply.clearCookie(STATE_COOKIE, { path: "/" });
    if (sessionUser) return reply.redirect(`${config.webOrigin}/painel?vinculada=1`);
    startSession(reply, userId, true);
    return reply.redirect(`${config.webOrigin}/partidas`);
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    if (sessionId) store.deleteSession(sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/v1/me", async (req, reply) => {
    const userId = sessionUserId(req);
    const body = userId ? meOf(userId) : undefined;
    if (!body) return sendError(reply, 401, "unauthorized", "sessao ausente ou expirada");
    return body;
  });

  app.post("/v1/me/sync", async (req, reply) => {
    const userId = sessionUserId(req);
    if (!userId) return sendError(reply, 401, "unauthorized", "sessao ausente ou expirada");
    if (!matches.enabled) return sendError(reply, 503, "not_configured", "sincronizacao desativada neste ambiente");

    const result: SyncResponse = { imported: 0, unchanged: 0, rejected: 0 };
    for (const account of store.listAccounts(userId)) {
      const credentials = store.getGrant(account.id);
      if (!credentials) continue;

      const ids = await matches.listMatchIds(credentials.identity, credentials.grant, { limit: SYNC_LIMIT });
      if (!ids.ok) return sendProviderError(reply, ids.error);

      for (const externalId of ids.value) {
        // Idempotente: partidas ja sincronizadas nao sao baixadas de novo.
        if (store.hasMatch(account.id, externalId)) {
          result.unchanged++;
          continue;
        }
        const raw = await matches.getRawMatch(credentials.identity, credentials.grant, externalId);
        if (!raw.ok) {
          // Limite de requisicoes interrompe o lote; o que ja foi salvo permanece.
          if (raw.error.code === "rate_limited") return sendProviderError(reply, raw.error);
          result.rejected++;
          continue;
        }
        const normalized = normalizeMatch(adapter, raw.value, { newId });
        if (!normalized.ok) {
          req.log.warn({ externalId, reason: normalized.error.message }, "partida rejeitada na normalizacao");
          result.rejected++;
          continue;
        }
        store.saveMatch(account.id, normalized.value);
        result.imported++;
      }
    }
    return result;
  });

  app.get("/v1/me/matches", async (req, reply) => {
    const userId = sessionUserId(req);
    if (!userId) return sendError(reply, 401, "unauthorized", "sessao ausente ou expirada");
    const list = store
      .listMatches(userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((m) => ({
        id: m.id,
        game: m.game,
        origin: m.origin,
        map: m.map,
        mode: m.mode,
        startedAt: m.startedAt,
        durationSeconds: m.durationSeconds,
        roundsPlayed: m.rounds.length,
      }));
    const body: MatchListResponse = {
      matches: list,
      containsSyntheticData: list.some((m) => m.origin === "synthetic"),
    };
    return body;
  });

  app.delete("/v1/me/game-accounts/:accountId", async (req, reply) => {
    const userId = sessionUserId(req);
    if (!userId) return sendError(reply, 401, "unauthorized", "sessao ausente ou expirada");
    const params = AccountParams.safeParse(req.params);
    const account = params.success ? store.getAccount(userId, params.data.accountId) : undefined;
    if (!account) return sendError(reply, 404, "not_found", "conta nao encontrada");

    const credentials = store.getGrant(account.id);
    if (credentials) {
      const revoked = await auth.revoke(credentials.grant);
      // Os dados locais sao apagados mesmo se a revogacao remota falhar.
      if (!revoked.ok) req.log.warn({ providerError: revoked.error.code }, "revogacao remota falhou");
    }
    store.deleteAccount(account.id);
    return reply.status(204).send();
  });

  return app;
}
