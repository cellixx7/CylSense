import { MatchMetrics } from "@cyl/contracts";
import { toCoachInput } from "../coach/coach-input";
import { analyzeMatch, metricOf, toMatchMetrics, type MatchAnalysis } from "../metrics/match-metrics";
import { isAvailable } from "../metrics/metric";
import { sessionMetricOf } from "../sessions/aggregate";
import { analyzeSession } from "../sessions/session";
import { BLUE, fixture, RED, randomMatch } from "./builders";

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);
const analyze = (seed: number, player: string): MatchAnalysis => {
  const r = analyzeMatch(randomMatch(seed), player);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe("invariantes (lotes sinteticos reproduziveis)", () => {
  it.each(SEEDS)("seed %i: valores finitos, razoes em [0,1] e lados somando as rodadas", (seed) => {
    for (const player of ["p1", "p7"]) {
      const a = analyze(seed, player);
      for (const m of a.metrics) {
        if (!isAvailable(m)) continue;
        expect(Number.isFinite(m.value)).toBe(true);
        expect(m.value).toBeGreaterThanOrEqual(0);
        if (/win_ratio|headshot_kill_ratio/.test(m.key)) expect(m.value).toBeLessThanOrEqual(1);
      }
      const side = a.rounds.bySide!;
      expect(side.attack.played + side.defense.played).toBe(a.rounds.rounds.length);
      expect(MatchMetrics.safeParse(toMatchMetrics(a, "2026-10-14T12:00:00Z")).success).toBe(true);
    }
  });

  it.each(SEEDS)("seed %i: cada rodada determinavel tem exatamente uma primeira morte entre os participantes", (seed) => {
    const all = [...RED, ...BLUE].map((p) => analyze(seed, p));
    const o = all[0]!.rounds.opening!;
    const noKillRounds = all[0]!.rounds.rounds.filter((r) => r.events?.opening.kind === "none").length;
    const firstDeaths = all.reduce((acc, a) => acc + a.rounds.opening!.playerFirstDeaths, 0);
    const firstKills = all.reduce((acc, a) => acc + a.rounds.opening!.playerFirstKills, 0);
    expect(firstDeaths + noKillRounds).toBe(o.firstDeathSample);
    expect(firstKills + noKillRounds).toBe(o.firstKillSample);
    // Abates do time = mortes do outro time, rodada a rodada.
    const red = analyze(seed, "p1");
    const blue = analyze(seed, "p6");
    red.rounds.rounds.forEach((r, i) => expect(r.events!.teamKills).toBe(blue.rounds.rounds[i]!.events!.teamDeaths));
  });

  it("sessao: totais = soma das partidas e razoes = soma/soma, em qualquer ordem", () => {
    const entries = SEEDS.map((seed) => ({ match: randomMatch(seed), playerRef: "p4" }));
    const s = analyzeSession("prop", entries);
    const shuffled = analyzeSession("prop", [...entries].sort((a, b) => (a.match.id.length % 3) - (b.match.id.length % 3) || (a.match.id < b.match.id ? 1 : -1)));
    if (!s.ok || !shuffled.ok) throw new Error("sessao invalida");
    expect(shuffled.value).toEqual(s.value);

    const sum = (key: "kills" | "deaths" | "rounds_played") =>
      s.value.matches.reduce((acc, a) => acc + (metricOf(a, key) as { value: number }).value, 0);
    expect(sessionMetricOf(s.value.metrics, "kills")).toMatchObject({ value: sum("kills") });
    expect(sessionMetricOf(s.value.metrics, "kd_ratio")).toMatchObject({ value: sum("kills") / sum("deaths") });
    expect(sessionMetricOf(s.value.metrics, "kills_per_round")).toMatchObject({ value: sum("kills") / sum("rounds_played") });
    const chronological = s.value.matches.map((m) => Date.parse(m.startedAt));
    expect(chronological).toEqual([...chronological].sort((a, b) => a - b));
  });

  it("entrada do Coach: serializavel, sem NaN/Infinity e com findings referenciados", () => {
    const s = analyzeSession("coach", [
      { match: fixture("syn-0001.json"), playerRef: "p1" },
      { match: fixture("syn-0002.json"), playerRef: "p6" },
      ...SEEDS.slice(0, 6).map((seed) => ({ match: randomMatch(seed), playerRef: "p2" })),
    ]);
    if (!s.ok) throw new Error(s.error.message);
    const input = toCoachInput(s.value);
    const json = JSON.stringify(input);
    expect(json).not.toMatch(/NaN|Infinity/);
    expect(JSON.parse(json)).toEqual(input);
    expect(input.context.containsSynthetic).toBe(true);
    expect(input.metrics.every((m) => Number.isFinite(m.value) && m.label.length > 0)).toBe(true);
    expect(input.unavailableMetrics.map((m) => m.key)).not.toContain("kills");
    const ids = new Set(input.findings.map((f) => f.id));
    for (const p of input.patterns) if (p.findingId) expect(ids.has(p.findingId)).toBe(true);
    expect(input.limitations).toContain("Contem dados sinteticos: nao representam partidas reais.");
    expect(new Set(input.limitations).size).toBe(input.limitations.length);
  });
});

describe("desempenho", () => {
  it("sessao com 500 partidas de 24 rodadas fica bem abaixo de 1 s por partida", () => {
    const entries = Array.from({ length: 500 }, (_, i) => ({ match: randomMatch(i + 1, { rounds: 24 }), playerRef: "p1" }));
    const t0 = performance.now();
    const s = analyzeSession("perf", entries);
    const ms = performance.now() - t0;
    expect(s.ok).toBe(true);
    // Limite folgado (5 s para 500) so para pegar regressao grosseira; o tempo medido vai para o aceite.
    expect(ms).toBeLessThan(5_000);
    console.info(`[perf] analyzeSession 500 partidas x 24 rodadas: ${ms.toFixed(0)} ms`);
  });
});
