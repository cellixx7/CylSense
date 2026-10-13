import type { Match } from "@cyl/contracts";
import { type GameAdapter, normalizeMatch } from "./providers";
import { err, ok, providerError } from "./result";

const fakeMatch = { id: "m" } as unknown as Match;

const adapter: GameAdapter<{ n: number }> = {
  game: "valorant",
  normalizer: {
    parse: (input) =>
      typeof input === "object" && input !== null && "n" in input
        ? ok({ n: Number((input as { n: unknown }).n) })
        : err(providerError("invalid_data", "formato invalido")),
    normalize: () => ok(fakeMatch),
  },
};

describe("normalizeMatch", () => {
  it("encadeia parse e normalize", () => {
    expect(normalizeMatch(adapter, { n: 1 }, { newId: () => "x" })).toEqual({ ok: true, value: fakeMatch });
  });

  it("propaga o erro de parse sem normalizar", () => {
    const r = normalizeMatch(adapter, "lixo", { newId: () => "x" });
    expect(r).toEqual({ ok: false, error: { code: "invalid_data", message: "formato invalido" } });
  });
});

describe("providerError", () => {
  it("so inclui retryAfterSeconds quando informado", () => {
    expect(providerError("network", "falha")).toEqual({ code: "network", message: "falha" });
    expect(providerError("rate_limited", "limite", 30).retryAfterSeconds).toBe(30);
  });
});
