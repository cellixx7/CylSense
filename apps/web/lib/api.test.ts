import { createApiClient } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createApiClient", () => {
  it("valida respostas com os contratos compartilhados", async () => {
    const api = createApiClient(async () => json(200, { provider: "riot", mode: "disabled" }));
    expect(await api.authStatus()).toEqual({ ok: true, data: { provider: "riot", mode: "disabled" } });
  });

  it("rejeita resposta fora do contrato", async () => {
    const api = createApiClient(async () => json(200, { provider: "riot", mode: "enabled-for-real" }));
    expect(await api.authStatus()).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("propaga o erro tipado da API", async () => {
    const api = createApiClient(async () => json(401, { error: { code: "unauthorized", message: "sessao ausente" } }));
    expect(await api.me()).toEqual({ ok: false, status: 401, code: "unauthorized", message: "sessao ausente" });
  });

  it("trata falha de rede", async () => {
    const api = createApiClient(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await api.matches()).toMatchObject({ ok: false, code: "network" });
  });

  it("envia o cabecalho anti-CSRF nas escritas", async () => {
    let seen: RequestInit | undefined;
    const api = createApiClient(async (_url, init) => {
      seen = init;
      return json(200, { imported: 2, unchanged: 0, rejected: 0 });
    });
    expect(await api.sync()).toMatchObject({ ok: true });
    expect(seen?.method).toBe("POST");
    expect(seen?.headers).toEqual({ "x-cyl-request": "1" });
  });

  it("aceita 204 sem corpo no logout", async () => {
    const api = createApiClient(async () => new Response(null, { status: 204 }));
    expect(await api.logout()).toEqual({ ok: true, data: undefined });
  });

  it("envia cadastro como JSON com o cabecalho anti-CSRF e valida a resposta", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const me = { user: { id: "u1", displayName: "Jogador", createdAt: "2026-10-16T00:00:00.000Z" }, gameAccounts: [] };
    const api = createApiClient(async (url, init) => {
      seen = { url: String(url), init };
      return json(201, me);
    });
    const body = { displayName: "Jogador", email: "j@exemplo.com", password: "senha-forte-123", acceptTerms: true as const };
    expect(await api.register(body)).toEqual({ ok: true, data: me });
    expect(seen?.url).toBe("/api/v1/auth/register");
    expect(seen?.init?.headers).toEqual({ "x-cyl-request": "1", "content-type": "application/json" });
    expect(JSON.parse(String(seen?.init?.body))).toEqual(body);
  });
});
