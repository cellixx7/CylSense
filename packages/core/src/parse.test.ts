import { Match } from "@cyl/contracts";
import { describeIssues, parseWith } from "./parse";

describe("parseWith", () => {
  it("devolve ok com o dado validado", () => {
    const schema = { safeParse: (x: unknown) => ({ success: true as const, data: String(x) }) };
    expect(parseWith(schema, 1, "x")).toEqual({ ok: true, value: "1" });
  });

  it("devolve invalid_data com caminho legivel, sem ecoar valores", () => {
    const r = parseWith(Match, { schemaVersion: 1, id: "segredo-123" }, "partida");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("invalid_data");
      expect(r.error.message).toMatch(/^partida: game: .+; \(\+\d+\)$/);
      expect(r.error.message).not.toContain("segredo-123");
    }
  });

  it("descreve erro na raiz", () => {
    expect(describeIssues([{ path: [], message: "esperado objeto" }])).toBe("(raiz): esperado objeto");
  });
});
