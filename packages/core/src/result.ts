export type Result<T, E = ProviderError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type ProviderErrorCode =
  | "not_configured"
  | "unauthorized"
  | "invalid_state"
  | "invalid_data"
  | "not_found"
  | "rate_limited"
  | "network";

/**
 * Erro explicito de provedor externo. `message` deve ser seguro para log:
 * nunca incluir tokens, codigos de autorizacao ou credenciais.
 */
export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

export const providerError = (code: ProviderErrorCode, message: string, retryAfterSeconds?: number): ProviderError =>
  retryAfterSeconds === undefined ? { code, message } : { code, message, retryAfterSeconds };
