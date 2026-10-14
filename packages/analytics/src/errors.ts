export type AnalyticsErrorCode =
  /** A partida nao respeita o contrato `Match`. */
  | "invalid_match"
  /** O `playerRef` escolhido nao participa da partida. */
  | "player_not_found"
  /** A mesma partida aparece mais de uma vez na sessao. */
  | "duplicate_match"
  /** Sessao acima do limite: o chamador deve paginar ou reduzir o periodo. */
  | "too_many_matches";

/** Erro do motor; `message` nao ecoa conteudo da partida. */
export interface AnalyticsError {
  code: AnalyticsErrorCode;
  message: string;
}

export const analyticsError = (code: AnalyticsErrorCode, message: string): AnalyticsError => ({ code, message });
