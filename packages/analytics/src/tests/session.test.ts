import { analyzeMatch } from "../metrics/match-metrics";
import { compareGroups, sessionMetricOf, type SessionMetric } from "../sessions/aggregate";
import { analyzeSession, MAX_SESSION_MATCHES, type SessionAnalysis, type SessionEntry } from "../sessions/session";
import { buildMatch, fixture, randomMatch } from "./builders";

function session(entries: SessionEntry[], id = "s1"): SessionAnalysis {
  const r = analyzeSession(id, entries);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const metric = (s: SessionAnalysis, key: Parameters<typeof sessionMetricOf>[1]): SessionMetric => sessionMetricOf(s.metrics, key);
const codes = (s: SessionAnalysis) => s.warnings.map((w) => w.code);

describe("sessoes", () => {
  it("entrada vazia: sessao vazia, metricas indisponiveis, padroes sem dados", () => {
    const s = session([]);
    expect(s.matchCount).toBe(0);
    expect(s.period).toBeNull();
    expect(s.metrics.every((m) => m.status === "unavailable" && m.matchesUsed === 0)).toBe(true);
    expect(s.patterns.every((p) => p.status === "insufficient_data")).toBe(true);
    expect(s.findings).toEqual([]);
    expect(codes(s)).toEqual(["empty"]);
  });

  it("fixtures: totais, razoes ponderadas e alertas", () => {
    const s = session([
      { match: fixture("syn-0002.json"), playerRef: "p1" },
      { match: fixture("syn-0001.json"), playerRef: "p1" },
    ]);
    expect(s.matches.map((m) => m.externalId)).toEqual(["syn-0001", "syn-0002"]);
    expect(metric(s, "kills")).toMatchObject({ status: "available", value: 5, matchesUsed: 2 });
    expect(metric(s, "kd_ratio")).toMatchObject({ value: 5 / 3, numerator: 5, denominator: 3 });
    // Headshot so existe em syn-0001: a agregacao usa so ela.
    expect(metric(s, "headshot_kill_ratio")).toMatchObject({ value: 2 / 3, matchesUsed: 1 });
    expect(metric(s, "first_death_ratio")).toMatchObject({ status: "unavailable", reason: "missing_data" });
    expect(s.outcomes).toEqual({ win: 1, loss: 0, draw: 1, unknown: 0 });
    expect(s.coverage).toEqual({ completeEvents: 0, headshots: 1, damage: 1, sides: 2, result: 2 });
    expect(s.context).toMatchObject({ modes: ["competitive", "unrated"], maps: ["Ascent", "Bind"], containsSynthetic: true });
    expect(codes(s)).toEqual(["small_sample", "mixed_modes", "synthetic_data", "partial_metric", "partial_metric"]);
    expect(s.period).toEqual({ from: "2026-10-01T20:00:00.000Z", to: "2026-10-02T19:30:00.000Z" });
  });

  it("denominadores diferentes: soma/soma, nao media das porcentagens", () => {
    const one = buildMatch({ id: "a", startedAt: "2026-10-01T10:00:00Z", rounds: [{ winner: "red" }] });
    const ten = buildMatch({
      id: "b",
      startedAt: "2026-10-02T10:00:00Z",
      rounds: Array.from({ length: 10 }, (_, i) => ({ winner: i < 3 ? ("red" as const) : ("blue" as const) })),
    });
    const s = session([{ match: one, playerRef: "p1" }, { match: ten, playerRef: "p1" }]);
    // Media ingenua seria (100% + 30%) / 2 = 65%.
    expect(metric(s, "round_win_ratio")).toMatchObject({ value: 4 / 11, numerator: 4, denominator: 11 });
  });

  it("K/D agregado usa as mortes de todas as partidas, inclusive onde o K/D da partida era indisponivel", () => {
    const flawless = buildMatch({ id: "f", rounds: [{ winner: "red", kills: [{ t: 1, actor: "p1", target: "p6" }] }] });
    const other = buildMatch({ id: "g", startedAt: "2026-10-02T00:00:00Z", rounds: [{ winner: "blue", kills: [{ t: 1, actor: "p6", target: "p1" }] }] });
    const s = session([{ match: flawless, playerRef: "p1" }, { match: other, playerRef: "p1" }]);
    expect(metric(s, "kd_ratio")).toMatchObject({ value: 1, numerator: 1, denominator: 1, matchesUsed: 2 });
  });

  it("independe da ordem de entrada e e deterministico (empate de data resolvido pelo id)", () => {
    const entries = [3, 1, 2, 5, 4].map((seed) => ({
      match: randomMatch(seed, { id: `m${seed}`, startedAt: seed === 4 || seed === 5 ? "2026-10-05T00:00:00Z" : undefined }),
      playerRef: "p3",
    }));
    const a = session(entries);
    const b = session([...entries].reverse());
    expect(b).toEqual(a);
    expect(JSON.stringify(session(entries))).toBe(JSON.stringify(a));
    expect(a.matches.map((m) => m.matchId).slice(-2)).toEqual(["m4", "m5"]);
  });

  it("recusa partida repetida, jogador inexistente e excesso de partidas", () => {
    const m = fixture("syn-0001.json");
    const dup = analyzeSession("s", [{ match: m, playerRef: "p1" }, { match: { ...m, id: "outro-id" }, playerRef: "p1" }]);
    expect(dup.ok ? null : dup.error.code).toBe("duplicate_match");
    const missing = analyzeSession("s", [{ match: m, playerRef: "p1" }, { match: fixture("syn-0002.json"), playerRef: "p42" }]);
    expect(missing.ok ? null : missing.error).toEqual({ code: "player_not_found", message: "partida 2: jogador nao participa da partida" });
    const many = analyzeSession("s", Array.from({ length: MAX_SESSION_MATCHES + 1 }, () => ({ match: m, playerRef: "p1" })));
    expect(many.ok ? null : many.error.code).toBe("too_many_matches");
  });

  it("compara grupos com diferencas so onde as duas metricas existem", () => {
    const analyses = [1, 2, 3, 4, 5, 6].map((seed) => {
      const r = analyzeMatch(randomMatch(seed), "p1");
      if (!r.ok) throw new Error(r.error.message);
      return r.value;
    });
    const c = compareGroups(analyses.slice(0, 3), analyses.slice(3));
    expect(c.a.matchCount).toBe(3);
    const kpr = c.differences.find((d) => d.key === "kills_per_round")!;
    expect(kpr.difference).toBeCloseTo(kpr.b - kpr.a);
    expect(c.differences.some((d) => d.key === "kills")).toBe(false);
    expect(c.warnings).toEqual([]);
    expect(compareGroups(analyses.slice(0, 1), analyses.slice(1, 2)).warnings[0]).toMatch(/menos de 3/);
  });
});
