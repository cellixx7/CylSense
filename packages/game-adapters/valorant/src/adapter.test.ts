import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Match, matchDataAvailability, sideOf } from "@cyl/contracts";
import { normalizeMatch } from "@cyl/core";
import { valorantSyntheticAdapter } from "./adapter";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../fixtures/valorant/${name}`, import.meta.url)), "utf8"));

const ctx = { newId: () => "match-1" };

function normalized(name: string): Match {
  const r = normalizeMatch(valorantSyntheticAdapter, fixture(name), ctx);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("valorantSyntheticAdapter", () => {
  it.each(["syn-0001.json", "syn-0002.json"])("normaliza a fixture %s para o contrato Match", (name) => {
    const m = normalized(name);
    expect(Match.safeParse(m).success).toBe(true);
    expect(m.origin).toBe("synthetic");
    expect(m.participants).toHaveLength(10);
  });

  it("mapeia times, lados, condicao de vitoria, placar e ids estaveis", () => {
    const m = normalized("syn-0001.json");
    expect(m.rounds[0]).toEqual({ number: 1, winningTeam: "red", attackingTeam: "red", winCondition: "spike_detonated" });
    expect(sideOf(m.rounds[1]!, "blue")).toBe("defense");
    expect(m.result).toEqual({ score: { red: 2, blue: 1 }, winner: "red" });
    expect(m.events.find((e) => e.type === "spike_plant")?.id).toBe("syn-0001:r1:e2");
    expect(m.events[0]).toMatchObject({ headshot: true, assistRefs: ["p2"] });
    expect(m.participants[0]).toMatchObject({ headshotKills: 2, damageDealt: 620 });

    const again = normalizeMatch(valorantSyntheticAdapter, fixture("syn-0001.json"), { newId: () => "outro" });
    if (!again.ok) throw new Error(again.error.message);
    expect(again.value.events).toEqual(m.events);
  });

  it("mantem ausentes os dados que a origem nao informa", () => {
    const m = normalized("syn-0002.json");
    expect(m.participants[0]).not.toHaveProperty("headshotKills");
    expect(m.participants[0]).not.toHaveProperty("damageDealt");
    expect(m.result?.winner).toBe("draw");
    expect(matchDataAvailability(m)).toEqual({
      eventCoverage: "partial",
      headshots: false,
      damage: false,
      sides: true,
      winConditions: true,
      result: true,
    });
    expect(matchDataAvailability(normalized("syn-0001.json")).headshots).toBe(true);
  });

  it("rejeita payload em outro formato com erro invalid_data", () => {
    const r = normalizeMatch(valorantSyntheticAdapter, { matchId: "x", metadata: {} }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("invalid_data");
  });

  it("rejeita evento que referencia jogador inexistente", () => {
    const raw = fixture("syn-0001.json") as { rounds: { events: { victim?: string }[] }[] };
    raw.rounds[0]!.events[0]!.victim = "p99";
    const r = normalizeMatch(valorantSyntheticAdapter, raw, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("participante inexistente");
  });

  it.each([
    ["score-mismatch.json", "placar diferente dos rounds"],
    ["counters-below-events.json", "kills menor que o total nos eventos"],
    ["defuse-without-plant.json", "defuse sem plant anterior"],
    ["win-condition-mismatch.json", "vencedor incoerente com spike_detonated"],
    ["unknown-format.json", "partida invalida"],
  ])("rejeita a fixture invalida %s", (name, message) => {
    const r = normalizeMatch(valorantSyntheticAdapter, fixture(`invalid/${name}`), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("invalid_data");
      expect(r.error.message).toContain(message);
    }
  });
});
