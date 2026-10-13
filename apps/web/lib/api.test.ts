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
});
