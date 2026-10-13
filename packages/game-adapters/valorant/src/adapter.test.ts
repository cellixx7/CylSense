import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Match } from "@cyl/contracts";
import { normalizeMatch } from "@cyl/core";
import { valorantSyntheticAdapter } from "./adapter";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../fixtures/valorant/${name}`, import.meta.url)), "utf8"));

const ctx = { newId: () => "match-1" };

describe("valorantSyntheticAdapter", () => {
  it.each(["syn-0001.json", "syn-0002.json"])("normaliza a fixture %s para o contrato Match", (name) => {
    const r = normalizeMatch(valorantSyntheticAdapter, fixture(name), ctx);
    if (!r.ok) throw new Error(r.error.message);
    expect(Match.safeParse(r.value).success).toBe(true);
    expect(r.value.origin).toBe("synthetic");
    expect(r.value.participants).toHaveLength(10);
  });

  it("mapeia times, eventos e ids estaveis", () => {
    const r = normalizeMatch(valorantSyntheticAdapter, fixture("syn-0001.json"), ctx);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.rounds[0]).toEqual({ number: 1, winningTeam: "red" });
    expect(r.value.events.find((e) => e.type === "spike_plant")?.id).toBe("syn-0001:r1:e2");

    const again = normalizeMatch(valorantSyntheticAdapter, fixture("syn-0001.json"), { newId: () => "outro" });
    if (!again.ok) throw new Error(again.error.message);
    expect(again.value.events.map((e) => e.id)).toEqual(r.value.events.map((e) => e.id));
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
});
