import { analyzeMatch, metricOf } from "../metrics/match-metrics";
import { analyzeRounds } from "../rounds/round-analysis";
import { buildMatch, fixture } from "./builders";

// r1: p1 abre (ataque), plant de p2, vence por detonacao.
// r2: p1 e a primeira morte (ataque), plant de p3, defuse de p6.
// r3: abates simultaneos no primeiro instante (defesa) -> ambigua.
// r4: sem abates; red defende ate o tempo acabar.
// r5: primeiro abate sem autor informado (vitima azul).
const match = buildMatch({
  rounds: [
    {
      winner: "red",
      attackers: "red",
      winCondition: "spike_detonated",
      kills: [{ t: 1_000, actor: "p1", target: "p6" }, { t: 5_000, actor: "p1", target: "p7", headshot: true }],
      plant: { t: 6_000, actor: "p2" },
    },
    {
      winner: "blue",
      attackers: "red",
      winCondition: "spike_defused",
      kills: [{ t: 121_000, actor: "p6", target: "p1" }, { t: 125_000, actor: "p2", target: "p8" }],
      plant: { t: 130_000, actor: "p3" },
      defuse: { t: 160_000, actor: "p6" },
    },
    {
      winner: "red",
      attackers: "blue",
      kills: [{ t: 245_000, actor: "p1", target: "p9" }, { t: 245_000, actor: "p10", target: "p2" }],
    },
    { winner: "red", attackers: "blue", winCondition: "time_expired" },
    { winner: "blue", attackers: "blue", kills: [{ t: 485_000, target: "p7" }, { t: 490_000, actor: "p6", target: "p1" }] },
  ],
});

describe("analise por rodada", () => {
  const r = analyzeRounds(match, "p1", "red");

  it("resultado e lado por rodada", () => {
    expect(r.rounds.map((x) => [x.number, x.outcome, x.side])).toEqual([
      [1, "won", "attack"],
      [2, "lost", "attack"],
      [3, "won", "defense"],
      [4, "won", "defense"],
      [5, "lost", "defense"],
    ]);
    expect(r.bySide).toEqual({ attack: { played: 2, won: 1 }, defense: { played: 3, won: 2 } });
  });

  it("abates, mortes e assistencias em rodadas vencidas x perdidas", () => {
    expect(r.wonVsLost).toEqual({
      won: { rounds: 3, playerKills: 3, playerDeaths: 0, playerAssists: 0 },
      lost: { rounds: 2, playerKills: 0, playerDeaths: 2, playerAssists: 0 },
    });
    expect(r.playerKillsDistribution).toEqual([3, 1, 1, 0, 0, 0]);
    expect(r.rounds[0]!.events).toMatchObject({ teamKills: 2, teamDeaths: 0 });
  });

  it("abertura: empate no primeiro instante e autor ausente ficam fora da amostra certa", () => {
    expect(r.rounds[2]!.events!.opening).toEqual({ kind: "ambiguous", eventIds: [`m1:r3:e0`, `m1:r3:e1`] });
    expect(r.rounds[3]!.events!.opening).toEqual({ kind: "none" });
    expect(r.opening).toEqual({
      firstDeathSample: 4, // r1, r2, r4, r5
      firstKillSample: 3, // r5 sem autor
      ambiguousRounds: 1,
      playerFirstKills: 1,
      playerFirstDeaths: 1,
      firstKillEventIds: ["m1:r1:e0"],
      firstDeathEventIds: ["m1:r2:e0"],
    });
    expect(r.limitations.join(" ")).toMatch(/simultaneos/);
    expect(r.limitations.join(" ")).toMatch(/sem autor/);
  });

  it("spike: plants do time, vitorias apos plant e acoes do jogador", () => {
    expect(r.spike).toEqual({ teamPlantRounds: 2, teamPlantRoundsWon: 1, unattributedPlantRounds: 0, playerPlants: 0, playerDefuses: 0 });
    expect(r.rounds[1]!.events).toMatchObject({ spikePlanted: true, spikeDefused: true, teamPlanted: true });
    const blue = analyzeRounds(match, "p6", "blue");
    expect(blue.spike).toMatchObject({ teamPlantRounds: 0, playerDefuses: 1 });
  });

  it("metricas de abertura e spike vem da analise de rodadas", () => {
    const a = analyzeMatch(match, "p1");
    if (!a.ok) throw new Error(a.error.message);
    expect(metricOf(a.value, "first_kills")).toMatchObject({ status: "available", value: 1, sampleSize: 3 });
    expect(metricOf(a.value, "first_deaths")).toMatchObject({ status: "available", value: 1, sampleSize: 4 });
    const p2 = analyzeMatch(match, "p2");
    if (!p2.ok) throw new Error(p2.error.message);
    expect(metricOf(p2.value, "spike_plants")).toMatchObject({ status: "available", value: 1 });
  });

  it("todas as rodadas ambiguas: abertura indisponivel por falta de ordem determinavel", () => {
    const m = buildMatch({ rounds: [{ winner: "red", kills: [{ t: 9, actor: "p1", target: "p6" }, { t: 9, actor: "p7", target: "p2" }] }] });
    const a = analyzeMatch(m, "p1");
    if (!a.ok) throw new Error(a.error.message);
    expect(metricOf(a.value, "first_deaths")).toMatchObject({ status: "unavailable", reason: "missing_data" });
  });

  it("plant sem autor e sem lado nao e atribuido a nenhum time", () => {
    const m = buildMatch({ rounds: [{ winner: "red", kills: [], plant: { t: 5 } }] });
    const rr = analyzeRounds(m, "p1", "red");
    expect(rr.spike).toMatchObject({ teamPlantRounds: 0, unattributedPlantRounds: 1 });
    expect(rr.bySide).toBeNull();
  });

  it("cobertura parcial: sem detalhe por evento, apenas resultado e lado", () => {
    const p = analyzeRounds(fixture("syn-0001.json"), "p1", "red");
    expect(p.eventDetail).toBe("partial");
    expect(p.rounds.every((x) => x.events === undefined)).toBe(true);
    expect([p.wonVsLost, p.opening, p.spike, p.playerKillsDistribution]).toEqual([null, null, null, null]);
    expect(p.bySide).toEqual({ attack: { played: 3, won: 2 }, defense: { played: 0, won: 0 } });
  });
});
