import { Match, matchDataAvailability } from "@cyl/contracts";
import syn0001 from "../../../../fixtures/valorant/syn-0001.json";
import syn0002 from "../../../../fixtures/valorant/syn-0002.json";
import invalidScore from "../../../../fixtures/valorant/invalid/score-mismatch.json";
import { normalizeSyntheticMatch } from "./synthetic";

describe("desktop + contratos compartilhados", () => {
  it.each([
    ["syn-0001", syn0001],
    ["syn-0002", syn0002],
  ])("normaliza a fixture %s pelo adaptador e valida com Zod", (_name, raw) => {
    const r = normalizeSyntheticMatch(raw, () => "m-desktop");
    if (!r.ok) throw new Error(r.error.message);
    expect(Match.safeParse(r.value).success).toBe(true);
    expect(r.value).toMatchObject({ id: "m-desktop", game: "valorant", origin: "synthetic" });
  });

  it("expoe a disponibilidade dos dados em vez de presumir zero", () => {
    const r = normalizeSyntheticMatch(syn0002, () => "m");
    if (!r.ok) throw new Error(r.error.message);
    expect(matchDataAvailability(r.value)).toMatchObject({ headshots: false, damage: false, sides: true });
  });

  it("rejeita fixture inconsistente com erro legivel", () => {
    const r = normalizeSyntheticMatch(invalidScore, () => "m");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("placar diferente dos rounds");
  });
});
