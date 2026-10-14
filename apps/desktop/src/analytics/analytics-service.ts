import {
  analyzeMatch,
  analyzeSession,
  MAX_SESSION_MATCHES,
  type AnalyticsErrorCode,
  type MatchAnalysis,
  type SessionAnalysis,
  type SessionEntry,
} from "@cyl/analytics";
import type { Match } from "@cyl/contracts";
import { err, ok, type Result } from "@cyl/core";
import type { LocalStore, StorageErrorCode } from "@/storage/local-store";

/**
 * Camada de aplicacao entre o `LocalStore` e o `@cyl/analytics` (P0-05).
 * Calcula sob demanda (sem cache nem tabelas novas), devolve resultados
 * tipados e converte qualquer falha em `Result`, sem derrubar a interface.
 */

export type AnalyticsServiceErrorCode =
  | AnalyticsErrorCode
  /** Falha ao ler do banco local; `storageCode` traz o motivo. */
  | "storage"
  /** Partida nao encontrada no banco local. */
  | "not_found"
  /** Excecao inesperada do motor (bug); mensagem generica. */
  | "engine_failure";

export interface AnalyticsServiceError {
  code: AnalyticsServiceErrorCode;
  message: string;
  storageCode?: StorageErrorCode;
}

export interface SessionSelection {
  matchId: string;
  /** Jogador analisado nesta partida (`playerRef` so vale dentro dela). */
  playerRef: string;
}

export interface AnalyticsService {
  analyzeMatch(matchId: string, playerRef: string): Promise<Result<MatchAnalysis, AnalyticsServiceError>>;
  analyzeSession(sessionId: string, selections: readonly SessionSelection[]): Promise<Result<SessionAnalysis, AnalyticsServiceError>>;
}

const fail = (code: AnalyticsServiceErrorCode, message: string) => err<AnalyticsServiceError>({ code, message });

/** Executa o motor protegendo a UI de excecoes inesperadas. */
function guarded<T>(run: () => Result<T, { code: AnalyticsErrorCode; message: string }>): Result<T, AnalyticsServiceError> {
  try {
    return run();
  } catch {
    return fail("engine_failure", "falha inesperada no motor de analise");
  }
}

/** Analise sincrona de uma partida ja carregada (ex.: tela de detalhe). */
export function analyzeLoadedMatch(match: Match, playerRef: string): Result<MatchAnalysis, AnalyticsServiceError> {
  return guarded(() => analyzeMatch(match, playerRef));
}

export function createAnalyticsService(store: LocalStore): AnalyticsService {
  async function load(matchId: string): Promise<Result<Match, AnalyticsServiceError>> {
    // O LocalStore ja valida a partida lida contra o contrato `Match`.
    const r = await store.getMatch(matchId);
    if (!r.ok) return err({ code: "storage", message: r.error.message, storageCode: r.error.code });
    return r.value ? ok(r.value.match) : fail("not_found", "partida nao encontrada no banco local");
  }

  return {
    async analyzeMatch(matchId, playerRef) {
      const m = await load(matchId);
      return m.ok ? analyzeLoadedMatch(m.value, playerRef) : m;
    },

    async analyzeSession(sessionId, selections) {
      // Limite antes de ler do banco: nao carrega milhares de partidas sem controle.
      if (selections.length > MAX_SESSION_MATCHES) {
        return fail("too_many_matches", `selecione no maximo ${MAX_SESSION_MATCHES} partidas`);
      }
      const entries: SessionEntry[] = [];
      for (const s of selections) {
        const m = await load(s.matchId);
        if (!m.ok) return m;
        entries.push({ match: m.value, playerRef: s.playerRef });
      }
      return guarded(() => analyzeSession(sessionId, entries));
    },
  };
}
