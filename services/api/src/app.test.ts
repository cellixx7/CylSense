import { AuthStatusResponse, HealthResponse, MatchListResponse, MeResponse, SyncResponse } from "@cyl/contracts";
import { err, providerError, type MatchProvider } from "@cyl/core";
import { valorantSyntheticAdapter } from "@cyl/game-adapter-valorant";
import { afterEach, vi } from "vitest";
import { buildApp, CSRF_HEADER, loggerOptions, SESSION_COOKIE, STATE_COOKIE, type AppDeps } from "./app";
import { loadConfig } from "./config";
import { createMockAuthProvider, createMockMatchProvider } from "./providers/mock";
import { createDisabledRiotAuthProvider, createDisabledRiotMatchProvider } from "./providers/riot";

const WRITE = { [CSRF_HEADER]: "1" };

function mockApp(overrides: Partial<AppDeps> = {}) {
  const config = loadConfig({ NODE_ENV: "test", CYL_AUTH_MODE: "mock" });
  return buildApp({
    config,
    auth: createMockAuthProvider(),
    matches: createMockMatchProvider(config.fixturesDir),
    adapter: valorantSyntheticAdapter,
    ...overrides,
  });
}

function cookieFrom(res: { cookies: { name: string; value: string }[] }, name: string): string {
  const c = res.cookies.find((x) => x.name === name);
  if (!c) throw new Error(`cookie ${name} ausente`);
  return c.value;
}

/** Executa o fluxo start -> callback do provedor mock e devolve o cookie de sessao. */
async function login(app: ReturnType<typeof mockApp>, code = "mock-alpha"): Promise<string> {
  const start = await app.inject({ method: "GET", url: "/v1/auth/riot/start" });
  expect(start.statusCode).toBe(302);
  const location = new URL(start.headers.location as string);
  const state = location.searchParams.get("state")!;
  expect(cookieFrom(start, STATE_COOKIE)).toBe(state);

  const cb = await app.inject({
    method: "GET",
    url: `/v1/auth/riot/callback?code=${code}&state=${state}`,
    cookies: { [STATE_COOKIE]: state },
  });
  expect(cb.statusCode).toBe(302);
  expect(cb.headers.location).toBe("http://localhost:3000/partidas");
  return cookieFrom(cb, SESSION_COOKIE);
}

afterEach(() => vi.restoreAllMocks());

describe("config", () => {
  it("usa integracao desativada por padrao", () => {
    expect(loadConfig({}).authMode).toBe("disabled");
  });

  it("recusa modo mock em producao", () => {
    expect(() => loadConfig({ NODE_ENV: "production", CYL_AUTH_MODE: "mock" })).toThrow(/proibido em producao/);
  });

  it("rejeita valores invalidos sem ecoar o valor", () => {
    expect(() => loadConfig({ PORT: "abc", CYL_AUTH_MODE: "segredo-xyz" })).toThrow(/PORT, CYL_AUTH_MODE/);
    try {
      loadConfig({ CYL_AUTH_MODE: "segredo-xyz" });
    } catch (e) {
      expect(String(e)).not.toContain("segredo-xyz");
    }
  });
});

describe("integracao Riot desativada (padrao)", () => {
  const app = buildApp({
    config: loadConfig({ NODE_ENV: "test" }),
    auth: createDisabledRiotAuthProvider(),
    matches: createDisabledRiotMatchProvider(),
    adapter: valorantSyntheticAdapter,
  });

  it("health responde com a versao dos contratos", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toBeTruthy();
  });

  it("informa modo disabled e recusa iniciar login sem nenhuma chamada de rede", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const status = await app.inject({ method: "GET", url: "/v1/auth/riot/status" });
    expect(AuthStatusResponse.parse(status.json()).mode).toBe("disabled");

    const start = await app.inject({ method: "GET", url: "/v1/auth/riot/start" });
    expect(start.statusCode).toBe(503);
    expect(start.json()).toMatchObject({ error: { code: "not_configured" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rotas de usuario exigem sessao", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/me/matches" })).statusCode).toBe(401);
  });
});

describe("fluxo mock de autenticacao", () => {
  it("cria sessao, devolve /me e permite logout", async () => {
    const app = mockApp();
    const session = await login(app);

    const me = await app.inject({ method: "GET", url: "/v1/me", cookies: { [SESSION_COOKIE]: session } });
    const body = MeResponse.parse(me.json());
    expect(body.gameAccounts).toHaveLength(1);
    expect(body.gameAccounts[0]).toMatchObject({ provider: "mock", gameName: "Synth Alpha" });
    expect(JSON.stringify(body)).not.toContain("mock-token");

    const out = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: WRITE, cookies: { [SESSION_COOKIE]: session } });
    expect(out.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/v1/me", cookies: { [SESSION_COOKIE]: session } })).statusCode).toBe(401);
  });

  it("rejeita state divergente do cookie e state reutilizado", async () => {
    const app = mockApp();
    const start = await app.inject({ method: "GET", url: "/v1/auth/riot/start" });
    const state = new URL(start.headers.location as string).searchParams.get("state")!;

    const forged = await app.inject({
      method: "GET",
      url: `/v1/auth/riot/callback?code=mock-alpha&state=${state}`,
      cookies: { [STATE_COOKIE]: "outro-state" },
    });
    expect(forged.headers.location).toBe("http://localhost:3000/entrar?erro=invalid_state");

    // O state foi consumido na tentativa anterior: nao pode ser reutilizado.
    const replay = await app.inject({
      method: "GET",
      url: `/v1/auth/riot/callback?code=mock-alpha&state=${state}`,
      cookies: { [STATE_COOKIE]: state },
    });
    expect(replay.headers.location).toBe("http://localhost:3000/entrar?erro=invalid_state");
  });

  it("rejeita state expirado", async () => {
    let t = 1_000_000;
    const app = mockApp({ now: () => t });
    const start = await app.inject({ method: "GET", url: "/v1/auth/riot/start" });
    const state = new URL(start.headers.location as string).searchParams.get("state")!;
    t += 11 * 60 * 1000;
    const cb = await app.inject({
      method: "GET",
      url: `/v1/auth/riot/callback?code=mock-alpha&state=${state}`,
      cookies: { [STATE_COOKIE]: state },
    });
    expect(cb.headers.location).toBe("http://localhost:3000/entrar?erro=invalid_state");
  });

  it("trata consentimento negado sem refletir a mensagem do provedor", async () => {
    const app = mockApp();
    const cb = await app.inject({ method: "GET", url: "/v1/auth/riot/callback?error=<script>&state=x" });
    expect(cb.headers.location).toBe("http://localhost:3000/entrar?erro=consent_denied");
  });

  it("exige o cabecalho anti-CSRF em requisicoes de escrita", async () => {
    const app = mockApp();
    const session = await login(app);
    const res = await app.inject({ method: "POST", url: "/v1/me/sync", cookies: { [SESSION_COOKIE]: session } });
    expect(res.statusCode).toBe(403);
  });
});

describe("sincronizacao mock", () => {
  it("importa partidas sinteticas de forma idempotente", async () => {
    const app = mockApp();
    const session = await login(app);
    const sync = () => app.inject({ method: "POST", url: "/v1/me/sync", headers: WRITE, cookies: { [SESSION_COOKIE]: session } });

    expect(SyncResponse.parse((await sync()).json())).toEqual({ imported: 2, unchanged: 0, rejected: 0 });
    expect(SyncResponse.parse((await sync()).json())).toEqual({ imported: 0, unchanged: 2, rejected: 0 });

    const list = MatchListResponse.parse(
      (await app.inject({ method: "GET", url: "/v1/me/matches", cookies: { [SESSION_COOKIE]: session } })).json(),
    );
    expect(list.matches.map((m) => m.map)).toEqual(["Bind", "Ascent"]);
    expect(list.containsSyntheticData).toBe(true);
  });

  it("separa os dados por usuario e apaga tudo ao desvincular a conta", async () => {
    const app = mockApp();
    const alpha = await login(app, "mock-alpha");
    const bravo = await login(app, "mock-bravo");
    await app.inject({ method: "POST", url: "/v1/me/sync", headers: WRITE, cookies: { [SESSION_COOKIE]: alpha } });

    const matchesOf = async (s: string) =>
      MatchListResponse.parse((await app.inject({ method: "GET", url: "/v1/me/matches", cookies: { [SESSION_COOKIE]: s } })).json())
        .matches.length;
    expect(await matchesOf(alpha)).toBe(2);
    expect(await matchesOf(bravo)).toBe(0);

    const me = MeResponse.parse((await app.inject({ method: "GET", url: "/v1/me", cookies: { [SESSION_COOKIE]: alpha } })).json());
    const accountId = me.gameAccounts[0]!.id;

    const foreign = await app.inject({
      method: "DELETE",
      url: `/v1/me/game-accounts/${accountId}`,
      headers: WRITE,
      cookies: { [SESSION_COOKIE]: bravo },
    });
    expect(foreign.statusCode).toBe(404);

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/me/game-accounts/${accountId}`,
      headers: WRITE,
      cookies: { [SESSION_COOKIE]: alpha },
    });
    expect(del.statusCode).toBe(204);
    expect(await matchesOf(alpha)).toBe(0);
  });

  it("propaga limite de requisicoes como 429 com retry-after", async () => {
    const limited: MatchProvider = {
      id: "mock",
      enabled: true,
      listMatchIds: async () => err(providerError("rate_limited", "limite atingido", 30)),
      getRawMatch: async () => err(providerError("not_found", "x")),
    };
    const app = mockApp({ matches: limited });
    const session = await login(app);
    const res = await app.inject({ method: "POST", url: "/v1/me/sync", headers: WRITE, cookies: { [SESSION_COOKIE]: session } });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("30");
    expect(res.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("conta como rejeitada a partida que falha na normalizacao", async () => {
    const broken: MatchProvider = {
      id: "mock",
      enabled: true,
      listMatchIds: async () => ({ ok: true, value: ["bad-1"] }),
      getRawMatch: async () => ({ ok: true, value: { format: "outro" } }),
    };
    const app = mockApp({ matches: broken });
    const session = await login(app);
    const res = await app.inject({ method: "POST", url: "/v1/me/sync", headers: WRITE, cookies: { [SESSION_COOKIE]: session } });
    expect(SyncResponse.parse(res.json())).toEqual({ imported: 0, unchanged: 0, rejected: 1 });
  });
});

describe("logs", () => {
  it("nao registram code, state, cookies nem tokens", async () => {
    const lines: string[] = [];
    const app = mockApp({ logger: loggerOptions("info", { write: (m) => void lines.push(m) }) });
    const session = await login(app);
    await app.inject({ method: "GET", url: "/v1/me", cookies: { [SESSION_COOKIE]: session } });

    const output = lines.join("\n");
    expect(output).toContain("/v1/auth/riot/callback");
    expect(output).not.toContain("mock-alpha");
    expect(output).not.toContain("state=");
    expect(output).not.toContain(session);
    expect(output).not.toContain("mock-token");
  });
});
