import type { Team } from "@cyl/contracts";
import { buildEvidenceIndex, checkEvidence, checkFinding } from "../evidence/evidence";
import { analyzeMatch } from "../metrics/match-metrics";
import { PATTERN_RULES, type PatternId, type PatternResult } from "../patterns/detectors";
import { analyzeSession, type SessionAnalysis } from "../sessions/session";
import { buildMatch, fixture, type KillSpec, type RoundSpec } from "./builders";

const day = (i: number) => `2026-09-${String(i + 1).padStart(2, "0")}T20:00:00.000Z`;

function run(matches: ReturnType<typeof buildMatch>[], player = "p1"): SessionAnalysis {
  const r = analyzeSession("s-pat", matches.map((match) => ({ match, playerRef: player })));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const pattern = (s: SessionAnalysis, id: PatternId): PatternResult => s.patterns.find((p) => p.patternId === id)!;

/** Garante que finding e rodadas de revisao apontam para dados da sessao. */
function expectTraceable(s: SessionAnalysis, p: PatternResult, matches: ReturnType<typeof buildMatch>[]) {
  const index = buildEvidenceIndex(s.sessionId, matches.map((match) => {
    const a = analyzeMatch(match, "p1");
    if (!a.ok) throw new Error(a.error.message);
    return { match, analysis: a.value };
  }));
  expect(p.finding?.kind).toBe("fact");
  expect(checkFinding(p.finding!, index)).toEqual([]);
  for (const h of p.hypotheses) for (const e of h.review) expect(checkEvidence(e, index)).toBeNull();
}

/** 24 rodadas: red ataca nas 12 primeiras. `atkWins`/`defWins` = vitorias do red em cada lado. */
function sided(id: string, i: number, atkWins: number, defWins: number) {
  const rounds: RoundSpec[] = Array.from({ length: 24 }, (_, r) => {
    const attack = r < 12;
    const won = attack ? r < atkWins : r - 12 < defWins;
    return { winner: (won ? "red" : "blue") as Team, attackers: (attack ? "red" : "blue") as Team };
  });
  return buildMatch({ id, startedAt: day(i), rounds });
}

describe("padrao: ataque x defesa", () => {
  it("detecta diferenca com amostra suficiente e evidencias rastreaveis", () => {
    const matches = [sided("a", 0, 3, 10), sided("b", 1, 4, 9)];
    const s = run(matches);
    const p = pattern(s, "side_round_win_gap");
    expect(p.status).toBe("detected");
    expect(p.sample).toEqual({ count: 48, unit: "rounds" });
    expect(p.finding!.statement).toMatch(/29% das rodadas no ataque e 79% na defesa/);
    expect(p.finding!.evidence).toHaveLength(4);
    expect(p.hypotheses[0]!.review).toHaveLength(9 + 8); // rodadas perdidas no ataque
    expectTraceable(s, p, matches);
  });

  it("nao detecta quando os lados sao parecidos", () => {
    const p = pattern(run([sided("a", 0, 6, 7)]), "side_round_win_gap");
    expect(p.status).toBe("not_detected");
    expect(p.finding).toBeUndefined();
    expect(p.observation).toMatch(/Ataque: 6 de 12/);
  });

  it("amostra insuficiente nas fixtures (3 e 2 rodadas)", () => {
    const s = run([fixture("syn-0001.json"), fixture("syn-0002.json")]);
    const p = pattern(s, "side_round_win_gap");
    expect(p.status).toBe("insufficient_data");
    expect(p.reason).toMatch(/minimo 12/);
  });
});

/** 12 rodadas; nas `firstDeaths` primeiras o p1 e a primeira morte. Todas com 2 abates. */
function openings(id: string, i: number, firstDeaths: number, coverage: "complete" | "partial" = "complete") {
  const rounds: RoundSpec[] = Array.from({ length: 12 }, (_, r) => {
    const t = r * 100_000 + 10_000;
    const kills: KillSpec[] =
      r < firstDeaths
        ? [{ t, actor: "p6", target: "p1" }, { t: t + 5_000, actor: "p2", target: "p6" }]
        : [{ t, actor: "p2", target: "p7" }, { t: t + 5_000, actor: "p8", target: "p3" }];
    return { winner: "red", kills };
  });
  return buildMatch({ id, startedAt: day(i), rounds, coverage, ...(coverage === "partial" ? { extra: { p1: { kills: 1 } } } : {}) });
}

describe("padrao: primeiras mortes", () => {
  it("detecta frequencia acima de 2x a referencia uniforme", () => {
    const matches = [openings("a", 0, 5), openings("b", 1, 4)];
    const s = run(matches);
    const p = pattern(s, "first_death_frequency");
    expect(p.status).toBe("detected");
    expect(p.observation).toMatch(/9 de 24 rodadas determinaveis \(38%\); referencia uniforme 10%/);
    expect(p.finding!.evidence.filter((e) => e.kind === "event")).toHaveLength(9);
    expectTraceable(s, p, matches);
  });

  it("nao detecta abaixo do limiar", () => {
    expect(pattern(run([openings("a", 0, 1), openings("b", 1, 2)]), "first_death_frequency").status).toBe("not_detected");
  });

  it("uma partida so nao basta, mesmo com muitas rodadas", () => {
    const p = pattern(run([openings("a", 0, 12)]), "first_death_frequency");
    expect(p.status).toBe("insufficient_data");
    expect(p.reason).toMatch(/minimo 2/);
  });

  it("cobertura parcial nunca gera o padrao", () => {
    const p = pattern(run([openings("a", 0, 12, "partial"), openings("b", 1, 12, "partial")]), "first_death_frequency");
    expect(p.status).toBe("insufficient_data");
    expect(p.sample.count).toBe(0);
  });
});

/** 12 rodadas; o p1 faz `kills` abates no total (um por rodada, nas primeiras). */
function killsMatch(id: string, i: number, kills: number) {
  const rounds: RoundSpec[] = Array.from({ length: 12 }, (_, r) => ({
    winner: "red",
    kills: r < kills ? [{ t: r * 100_000 + 1_000, actor: "p1", target: "p6" }] : [{ t: r * 100_000 + 1_000, actor: "p6", target: "p1" }],
  }));
  return buildMatch({ id, startedAt: day(i), rounds });
}

describe("padrao: tendencia na sessao", () => {
  it("detecta queda entre a primeira e a segunda metade", () => {
    const matches = [10, 9, 10, 5, 6, 5].map((k, i) => killsMatch(`t${i}`, i, k));
    const s = run(matches);
    const p = pattern(s, "session_trend");
    expect(p.status).toBe("detected");
    expect(p.finding!.statement).toMatch(/Abates por rodada caiu 45% \(0,81 -> 0,44\)/);
    expect(p.finding!.statement).toMatch(/Mortes por rodada subiu/);
    expectTraceable(s, p, matches);
  });

  it("nao detecta quando estavel; partida do meio fica fora com quantidade impar", () => {
    const matches = [6, 6, 6, 0, 6, 6, 6].map((k, i) => killsMatch(`t${i}`, i, k));
    const p = pattern(run(matches), "session_trend");
    expect(p.status).toBe("not_detected");
    expect(p.sample.count).toBe(6);
  });

  it("menos de 3 partidas por metade e insuficiente", () => {
    const matches = [10, 9, 2, 1, 1].map((k, i) => killsMatch(`t${i}`, i, k));
    expect(pattern(run(matches), "session_trend").status).toBe("insufficient_data");
  });
});

describe("padroes: regras gerais", () => {
  it("todo resultado tem id, versao, elegibilidade, amostra e limitacoes; findings so como fato", () => {
    const s = run([sided("a", 0, 3, 10), sided("b", 1, 4, 9)]);
    expect(s.patterns.map((p) => p.patternId)).toEqual(Object.keys(PATTERN_RULES));
    for (const p of s.patterns) {
      expect(p.ruleVersion).toBeGreaterThan(0);
      expect(p.eligibility.length).toBeGreaterThan(0);
      expect(p.limitations.length).toBeGreaterThan(0);
      expect(p.status === "detected").toBe(p.finding !== undefined);
      if (p.status === "insufficient_data") expect(p.reason).toBeDefined();
    }
    expect(s.findings.every((f) => f.kind === "fact")).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/confidence/);
  });
});
