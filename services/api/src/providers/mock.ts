import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { err, ok, providerError, type AuthProvider, type MatchProvider } from "@cyl/core";

/**
 * Provedores SIMULADOS para desenvolvimento e demonstracao (CYL_AUTH_MODE=mock).
 * A config recusa este modo em producao. Nao ha tela de consentimento: o
 * "provedor" devolve o usuario direto ao callback com um codigo ficticio.
 */

const MOCK_CODE = /^mock-([a-z]{1,16})$/;

export function createMockAuthProvider(): AuthProvider {
  return {
    id: "mock",
    enabled: true,
    async beginLogin({ state, redirectUri }) {
      const url = new URL(redirectUri);
      url.searchParams.set("code", "mock-alpha");
      url.searchParams.set("state", state);
      return ok({ authorizationUrl: url.toString() });
    },
    async completeLogin({ code, codeVerifier }) {
      const persona = MOCK_CODE.exec(code)?.[1];
      if (!persona || codeVerifier.length < 43) {
        return err(providerError("unauthorized", "codigo de autorizacao invalido"));
      }
      const name = persona[0]!.toUpperCase() + persona.slice(1);
      return ok({
        identity: {
          provider: "mock",
          externalId: `mock-${persona}`,
          gameName: `Synth ${name}`,
          tagLine: "DEMO",
          grantedScopes: ["mock"],
        },
        grant: { accessToken: `mock-token-${persona}`, expiresAt: new Date(Date.now() + 3_600_000) },
      });
    },
    async revoke() {
      return ok(undefined);
    },
  };
}

/** Le partidas sinteticas de uma pasta de fixtures (formato cyl-synthetic-valorant). */
export function createMockMatchProvider(fixturesDir: string): MatchProvider {
  return {
    id: "mock",
    enabled: true,
    async listMatchIds(_account, _grant, { limit }) {
      try {
        const files = (await readdir(fixturesDir)).filter((f) => f.endsWith(".json")).sort();
        return ok(files.slice(0, limit).map((f) => f.replace(/\.json$/, "")));
      } catch {
        return err(providerError("network", "pasta de fixtures indisponivel"));
      }
    },
    async getRawMatch(_account, _grant, matchId) {
      if (!/^[\w-]+$/.test(matchId)) return err(providerError("not_found", "partida inexistente"));
      try {
        return ok(JSON.parse(await readFile(join(fixturesDir, `${matchId}.json`), "utf8")) as unknown);
      } catch {
        return err(providerError("not_found", "partida inexistente ou ilegivel"));
      }
    },
  };
}
