import type { Match } from "@cyl/contracts";
import { METRIC_CATALOG } from "../metrics/catalog";
import { analyzeMatch, metricOf } from "../metrics/match-metrics";
import { sessionMetricOf } from "../sessions/aggregate";
import { analyzeSession } from "../sessions/session";
import { buildMatch, type RoundSpec } from "./builders";

/** Metricas que dependem de todos os eventos; as demais vem de contadores ou rodadas. */
const EVENT_DERIVED = ["first_kills", "first_deaths", "spike_plants", "spike_defuses"];

const rounds: RoundSpec[] = Array.from({ length: 12 }, (_, r) => ({
  winner: "red",
  kills: [{ t: r * 100_000 + 1_000, actor: "p6", target: "p1" }],
  plant: { t: r * 100_000 + 5_000, actor: "p2" },
}));

function analyze(match: Match) {
  const r = analyzeMatch(match, "p1");
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("contadores x eventos e cobertura", () => {
  it("cobertura parcial: contadores (inclusive acima dos eventos) valem; metricas de eventos nao", () => {
    // p1 tem 3 abates nos contadores e nenhum nos eventos registrados.
    const a = analyze(buildMatch({ coverage: "partial", rounds, extra: { p1: { kills: 3, assists: 2 } } }));
    expect(metricOf(a, "kills")).toMatchObject({ status: "available", value: 3 });
    expect(metricOf(a, "kd_ratio")).toMatchObject({ status: "available", value: 3 / 12 });
    for (const key of EVENT_DERIVED) expect(metricOf(a, key as never)).toMatchObject({ status: "unavailable", reason: "partial_event_coverage" });
    expect([a.rounds.opening, a.rounds.spike, a.rounds.wonVsLost]).toEqual([null, null, null]);
  });

  it("eventCoverage ausente e tratado como parcial, nunca como completo", () => {
    const { eventCoverage: _, ...rest } = buildMatch({ rounds });
    const a = analyze(rest as Match);
    expect(a.availability.eventCoverage).toBe("partial");
    for (const key of EVENT_DERIVED) expect(metricOf(a, key as never)).toMatchObject({ status: "unavailable", reason: "partial_event_coverage" });
  });

  it("mesma partida com cobertura completa libera as metricas de eventos", () => {
    const a = analyze(buildMatch({ rounds }));
    expect(metricOf(a, "first_deaths")).toMatchObject({ status: "available", value: 12, sampleSize: 12 });
  });

  it("sessao: partida parcial entra nos contadores, mas nao nas razoes de abertura", () => {
    const partial = buildMatch({ id: "p", coverage: "partial", rounds, extra: { p1: { kills: 3 } } });
    const complete = buildMatch({ id: "c", startedAt: "2026-10-02T00:00:00Z", rounds });
    const s = analyzeSession("s", [{ match: partial, playerRef: "p1" }, { match: complete, playerRef: "p1" }]);
    if (!s.ok) throw new Error(s.error.message);
    expect(sessionMetricOf(s.value.metrics, "kills")).toMatchObject({ value: 3, matchesUsed: 2 });
    expect(sessionMetricOf(s.value.metrics, "first_death_ratio")).toMatchObject({ value: 1, denominator: 12, matchesUsed: 1 });
  });
});

describe("headshot por abates nao e HS% de disparos", () => {
  it("rotulo, formula e limitacao deixam a diferenca explicita", () => {
    const def = METRIC_CATALOG.find((d) => d.key === "headshot_kill_ratio")!;
    expect(def.label).toBe("Abates com headshot / abates");
    expect(def.label).not.toMatch(/HS%|taxa de headshot/i);
    expect(def.formula).toMatch(/nao e o HS% por disparos/);
    const a = analyze(buildMatch({ rounds: [{ winner: "red", kills: [{ t: 1, actor: "p1", target: "p6", headshot: true }] }] }));
    expect(a.limitations).toContain("Headshot aqui e a fracao de abates com headshot, nao o HS% por disparos.");
  });
});
