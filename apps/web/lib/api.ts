import {
  ApiError,
  AuthStatusResponse,
  MatchListResponse,
  MeResponse,
  SyncResponse,
  type ApiErrorCode,
} from "@cyl/contracts";
import type { z } from "zod";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: ApiErrorCode | "network" | "invalid_response"; message: string };

/** Cabecalho anti-CSRF exigido pela API em requisicoes de escrita. */
const WRITE_HEADERS = { "x-cyl-request": "1" };

/**
 * Cliente da CYL Sense API para o navegador. Toda resposta e validada com os
 * contratos compartilhados antes de chegar na UI.
 */
export function createApiClient(fetchImpl: typeof fetch = fetch, base = "/api") {
  async function request<S extends z.ZodType>(path: string, schema: S | null, init?: RequestInit): Promise<ApiResult<z.infer<S>>> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, { credentials: "same-origin", ...init });
    } catch {
      return { ok: false, status: 0, code: "network", message: "API indisponivel" };
    }

    const body: unknown = res.status === 204 ? null : await res.json().catch(() => undefined);
    if (!res.ok) {
      const parsed = ApiError.safeParse(body);
      return parsed.success
        ? { ok: false, status: res.status, ...parsed.data.error }
        : { ok: false, status: res.status, code: "invalid_response", message: `resposta inesperada (${res.status})` };
    }
    if (schema === null) return { ok: true, data: undefined as z.infer<S> };

    const parsed = schema.safeParse(body);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, status: res.status, code: "invalid_response", message: "resposta fora do contrato" };
  }

  return {
    authStatus: () => request("/v1/auth/riot/status", AuthStatusResponse),
    me: () => request("/v1/me", MeResponse),
    matches: () => request("/v1/me/matches", MatchListResponse),
    sync: () => request("/v1/me/sync", SyncResponse, { method: "POST", headers: WRITE_HEADERS }),
    logout: () => request("/v1/auth/logout", null, { method: "POST", headers: WRITE_HEADERS }),
    /** Navegacao (nao fetch): o fluxo OAuth precisa de redirects de pagina inteira. */
    loginUrl: `${base}/v1/auth/riot/start`,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
