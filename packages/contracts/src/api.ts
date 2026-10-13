import { z } from "zod";
import { CONTRACTS_VERSION } from "./common";
import { GameAccount, User } from "./identity";
import { MatchSummary } from "./match";

/** Contratos HTTP da API v1. Respostas sao validadas tambem no cliente. */

export const ApiErrorCode = z.enum([
  "not_configured",
  "unauthorized",
  "invalid_request",
  "invalid_state",
  "not_found",
  "rate_limited",
  "upstream_unavailable",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({
  error: z.object({ code: ApiErrorCode, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;

export const HealthResponse = z.object({
  status: z.literal("ok"),
  contractsVersion: z.literal(CONTRACTS_VERSION),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/**
 * `disabled`: sem credenciais/aprovacao Riot (padrao).
 * `mock`: somente desenvolvimento/demonstracao, recusado em producao.
 */
export const AuthMode = z.enum(["disabled", "mock"]);
export type AuthMode = z.infer<typeof AuthMode>;

export const AuthStatusResponse = z.object({
  provider: z.literal("riot"),
  mode: AuthMode,
});
export type AuthStatusResponse = z.infer<typeof AuthStatusResponse>;

export const MeResponse = z.object({
  user: User,
  gameAccounts: z.array(GameAccount),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const MatchListResponse = z.object({
  matches: z.array(MatchSummary),
  /** true quando algum item e sintetico; a UI deve exibir o aviso. */
  containsSyntheticData: z.boolean(),
});
export type MatchListResponse = z.infer<typeof MatchListResponse>;

export const SyncResponse = z.object({
  imported: z.int().nonnegative(),
  unchanged: z.int().nonnegative(),
  rejected: z.int().nonnegative(),
});
export type SyncResponse = z.infer<typeof SyncResponse>;
