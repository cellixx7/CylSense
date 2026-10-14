import { MatchMetrics } from "@cyl/contracts";
import { analyzeMatch, metricOf, toMatchMetrics, type MatchAnalysis } from "../metrics/match-metrics";
import { METRIC_CATALOG, type MetricKey } from "../metrics/catalog";
import { ANALYTICS_ENGINE_VERSION } from "../version";
import { buildMatch, fixture } from "./builders";

function analysis(...args: Parameters<typeof analyzeMatch>): MatchAnalysis {
  const r = analyzeMatch(...args);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const value = (a: MatchAnalysis, key: MetricKey) => {
  const m = metricOf(a, key);
  if (m.status !== "available") throw new Error(`${key} indisponivel: ${m.detail}`);
  return m.value;
};
const reason = (a: MatchAnalysis, key: MetricKey) => {
  const m = metricOf(a, key);
  return m.status === "unavailable" ? m.reason : null;
};

describe("metricas por partida", () => {
  it("syn-0001 (Synth Alpha): contadores, razoes, dano, headshot e rodadas", () => {
    const a = analysis(fixture("syn-0001.json"), "p1");
    expect(a.metrics.map((m) => m.key)).toEqual(METRIC_CATALOG.map((d) => d.key));
    expect([value(a, "kills"), value(a, "deaths"), value(a, "assists")]).toEqual([3, 1, 0]);
    expect(value(a, "kd_ratio")).toBe(3);
    expect(value(a, "kda_ratio")).toBe(3);
    expect(value(a, "headshot_kills")).toBe(2);
    expect(value(a, "headshot_kill_ratio")).toBeCloseTo(2 / 3);
    expect(value(a, "damage_dealt")).toBe(620);
    expect(value(a, "damage_per_round")).toBeCloseTo(620 / 3);
    expect(value(a, "rounds_played")).toBe(3);
    expect(value(a, "rounds_won")).toBe(2);
    expect(value(a, "round_win_ratio")).toBeCloseTo(2 / 3);
    expect(value(a, "kills_per_round")).toBe(1);
    expect(a.outcome).toBe("win");
    expect(a.observedEvents).toEqual({ kill: 12, spike_plant: 2, spike_defuse: 0 });
  });

  it("ataque e defesa: lado sem rodadas fica indisponivel por denominador zero", () => {
    const a = analysis(fixture("syn-0001.json"), "p1");
    expect([value(a, "attack_rounds_played"), value(a, "attack_rounds_won")]).toEqual([3, 2]);
    expect(value(a, "defense_rounds_played")).toBe(0);
    expect(reason(a, "defense_round_win_ratio")).toBe("zero_denominator");
    const blue = analysis(fixture("syn-0001.json"), "p6");
    expect([value(blue, "defense_rounds_played"), value(blue, "defense_rounds_won")]).toEqual([3, 1]);
    expect(blue.outcome).toBe("loss");
  });

  it("cobertura parcial: contadores valem, analises que dependem de todos os eventos nao", () => {
    const a = analysis(fixture("syn-0001.json"), "p1");
    for (const key of ["first_kills", "first_deaths", "spike_plants", "spike_defuses"] as const) {
      expect(reason(a, key)).toBe("partial_event_coverage");
    }
    expect(a.rounds.opening).toBeNull();
    expect(a.limitations.join(" ")).toMatch(/Cobertura parcial/);
  });

  it("campos opcionais ausentes (syn-0002) viram indisponivel, nunca zero", () => {
    const a = analysis(fixture("syn-0002.json"), "p1");
    for (const key of ["headshot_kills", "headshot_kill_ratio", "damage_dealt", "damage_per_round"] as const) {
      expect(reason(a, key)).toBe("missing_data");
    }
    expect(a.outcome).toBe("draw");
    expect(value(a, "kd_ratio")).toBe(1);
  });

  it("K/D e KDA com zero mortes: indisponiveis, sem Infinity", () => {
    const m = buildMatch({ rounds: [{ winner: "red", kills: [{ t: 1000, actor: "p1", target: "p6", assists: ["p2"] }] }] });
    const a = analysis(m, "p1");
    expect(reason(a, "kd_ratio")).toBe("zero_denominator");
    expect(reason(a, "kda_ratio")).toBe("zero_denominator");
    expect(a.metrics.every((x) => x.status === "unavailable" || Number.isFinite(x.value))).toBe(true);
  });

  it("KDA = (abates + assistencias) / mortes", () => {
    const m = buildMatch({
      rounds: [
        { winner: "red", kills: [{ t: 1, actor: "p1", target: "p6" }, { t: 2, actor: "p2", target: "p7", assists: ["p1"] }, { t: 3, actor: "p8", target: "p1" }] },
        { winner: "blue", kills: [{ t: 10, actor: "p1", target: "p9" }, { t: 11, actor: "p3", target: "p10", assists: ["p1"] }, { t: 12, actor: "p6", target: "p1" }] },
        { winner: "red", kills: [{ t: 20, actor: "p4", target: "p6", assists: ["p1"] }] },
      ],
    });
    const a = analysis(m, "p1");
    expect([value(a, "kills"), value(a, "assists"), value(a, "deaths")]).toEqual([2, 3, 2]);
    expect(value(a, "kda_ratio")).toBe(2.5);
    expect(value(a, "kd_ratio")).toBe(1);
  });

  it("headshot sem abates: razao indisponivel; contagem continua disponivel", () => {
    const m = buildMatch({ rounds: [{ winner: "blue", kills: [{ t: 1, actor: "p6", target: "p1", headshot: true }] }] });
    const a = analysis(m, "p1");
    expect(value(a, "headshot_kills")).toBe(0);
    expect(reason(a, "headshot_kill_ratio")).toBe("zero_denominator");
    expect(value(analysis(m, "p6"), "headshot_kill_ratio")).toBe(1);
  });

  it("partida sem rodadas e sem placar", () => {
    const a = analysis(buildMatch({ rounds: [], result: false }), "p1");
    expect(reason(a, "rounds_played")).toBe("no_rounds");
    expect(reason(a, "kills_per_round")).toBe("no_rounds");
    expect(reason(a, "attack_round_win_ratio")).toBe("no_rounds");
    expect(value(a, "kills")).toBe(0);
    expect(a.outcome).toBe("unknown");
  });

  it("lados ausentes: ataque/defesa indisponiveis por falta de dado", () => {
    const a = analysis(buildMatch({ rounds: [{ winner: "red" }, { winner: "blue" }] }), "p1");
    expect(reason(a, "attack_rounds_played")).toBe("missing_data");
    expect(value(a, "round_win_ratio")).toBe(0.5);
  });

  it("recusa jogador inexistente e partida fora do contrato", () => {
    const m = fixture("syn-0001.json");
    const missing = analyzeMatch(m, "p99");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("player_not_found");
    const broken = analyzeMatch({ ...m, events: [{ ...m.events[0]!, targetRef: "p99" }] }, "p1");
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error.code).toBe("invalid_match");
  });

  it("deterministico e sem mutar a entrada", () => {
    const m = fixture("syn-0001.json");
    const before = structuredClone(m);
    expect(analysis(m, "p2")).toEqual(analysis(structuredClone(m), "p2"));
    expect(m).toEqual(before);
  });

  it("toMatchMetrics respeita o contrato e leva so as metricas disponiveis", () => {
    const a = analysis(fixture("syn-0002.json"), "p1");
    const out = toMatchMetrics(a, "2026-10-14T12:00:00.000Z");
    expect(MatchMetrics.safeParse(out).success).toBe(true);
    expect(out.engineVersion).toBe(ANALYTICS_ENGINE_VERSION);
    expect(out.values.map((v) => v.key)).not.toContain("damage_dealt");
    expect(out.values.find((v) => v.key === "kd_ratio")).toEqual({ key: "kd_ratio", value: 1, unit: "ratio", sampleSize: 2 });
  });
});
