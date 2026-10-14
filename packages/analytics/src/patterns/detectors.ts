import type { Evidence, Finding } from "@cyl/contracts";
import { eventEvidence, metricEvidence, roundEvidence } from "../evidence/evidence";
import type { MetricKey } from "../metrics/catalog";
import { metricOf, type MatchAnalysis } from "../metrics/match-metrics";
import { isAvailable } from "../metrics/metric";
import { aggregate, sessionMetricOf, type SessionMetric, type SessionMetricKey } from "../sessions/aggregate";

export type PatternId = "side_round_win_gap" | "first_death_frequency" | "session_trend";

/** Hipotese interpretativa a conferir (normalmente no video). Sem confianca numerica: nao ha calibracao. */
export interface HypothesisToVerify {
  statement: string;
  howToVerify: string;
  /** Rodadas/eventos sugeridos para revisao; todos validados contra os dados. */
  review: Evidence[];
}

export interface PatternResult {
  patternId: PatternId;
  /** Muda quando a regra (limiar, amostra minima) muda. */
  ruleVersion: number;
  title: string;
  description: string;
  eligibility: string;
  status: "detected" | "not_detected" | "insufficient_data";
  /** Amostra efetivamente considerada pela regra (pode ser 0). */
  sample: { count: number; unit: "matches" | "rounds" };
  /** Por que a amostra nao basta (somente `insufficient_data`). */
  reason?: string;
  /** Valores observados, mesmo quando o padrao nao e detectado. */
  observation?: string;
  /** Fato observado com evidencias (somente `detected`). */
  finding?: Finding;
  hypotheses: HypothesisToVerify[];
  limitations: string[];
}

export interface DetectorInput {
  sessionId: string;
  /** Em ordem cronologica. */
  analyses: readonly MatchAnalysis[];
}

/** Limiares e amostras minimas; justificativa em docs/analytics/pattern-rules.md. */
export const PATTERN_RULES = {
  side_round_win_gap: { ruleVersion: 1, minRoundsPerSide: 12, minGap: 0.25 },
  first_death_frequency: { ruleVersion: 1, minMatches: 2, minRounds: 20, baselineMultiplier: 2 },
  session_trend: { ruleVersion: 1, minMatchesPerHalf: 3, minRoundsPerHalf: 36, minRelativeChange: 0.2 },
} as const;

const NO_SIGNIFICANCE = "Regra descritiva: nao e teste de significancia estatistica.";
const NOT_CAUSAL = "Correlacao observada nao indica causa.";

export const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toFixed(2).replace(".", ",");

const available = (analyses: readonly MatchAnalysis[], key: MetricKey) => analyses.filter((a) => isAvailable(metricOf(a, key)));
const evidenceFor = (analyses: readonly MatchAnalysis[], key: MetricKey) =>
  available(analyses, key).map((a) => metricEvidence(a, key));
const valueOf = (m: SessionMetric) => (isAvailable(m) ? m : undefined);

function fact(sessionId: string, id: PatternId, f: Omit<Extract<Finding, { kind: "fact" }>, "kind" | "id" | "sessionId">): Finding {
  return { kind: "fact", id: `${sessionId}:${id}`, sessionId, ...f };
}

/** Aproveitamento de rodadas do time no ataque x na defesa. */
export function detectSideGap({ sessionId, analyses }: DetectorInput): PatternResult {
  const rule = PATTERN_RULES.side_round_win_gap;
  const eligible = available(analyses, "attack_rounds_played");
  const pool = aggregate(eligible);
  const atk = valueOf(sessionMetricOf(pool, "attack_round_win_ratio"));
  const def = valueOf(sessionMetricOf(pool, "defense_round_win_ratio"));
  const atkPlayed = atk?.denominator ?? 0;
  const defPlayed = def?.denominator ?? 0;
  const base = {
    patternId: "side_round_win_gap" as const,
    ruleVersion: rule.ruleVersion,
    title: "Aproveitamento diferente entre ataque e defesa",
    description: "Compara a fracao de rodadas vencidas pelo time do jogador no ataque e na defesa, somando todas as partidas com lado informado.",
    eligibility: `Partidas com lado informado em todas as rodadas; ao menos ${rule.minRoundsPerSide} rodadas em cada lado. Detectado quando a diferenca e de ${pct(rule.minGap)} ou mais.`,
    sample: { count: atkPlayed + defPlayed, unit: "rounds" as const },
    hypotheses: [],
    limitations: [
      "O resultado da rodada e do time, nao uma medida individual.",
      "Mapas, adversarios e composicoes variam entre partidas.",
      NO_SIGNIFICANCE,
    ],
  };
  if (!atk || !def || atkPlayed < rule.minRoundsPerSide || defPlayed < rule.minRoundsPerSide) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `Rodadas com lado informado: ${atkPlayed} no ataque e ${defPlayed} na defesa (minimo ${rule.minRoundsPerSide} em cada).`,
    };
  }
  const observation = `Ataque: ${atk.numerator} de ${atkPlayed} rodadas (${pct(atk.value)}). Defesa: ${def.numerator} de ${defPlayed} rodadas (${pct(def.value)}). ${eligible.length} partida(s).`;
  const gap = atk.value - def.value;
  if (Math.abs(gap) < rule.minGap) return { ...base, status: "not_detected", observation };

  const weaker = gap < 0 ? "attack" : "defense";
  const review = eligible.flatMap((a) =>
    a.rounds.rounds.filter((r) => r.side === weaker && r.outcome === "lost").map((r) => roundEvidence(a.matchId, r.number)),
  );
  return {
    ...base,
    status: "detected",
    observation,
    finding: fact(sessionId, "side_round_win_gap", {
      title: base.title,
      statement: `O time venceu ${pct(atk.value)} das rodadas no ataque e ${pct(def.value)} na defesa (diferenca de ${pct(Math.abs(gap))}). ${observation}`,
      evidence: [...evidenceFor(eligible, "attack_round_win_ratio"), ...evidenceFor(eligible, "defense_round_win_ratio")],
      sampleSize: { count: atkPlayed + defPlayed, unit: "rounds" },
      limitations: base.limitations,
    }),
    hypotheses: [
      {
        statement: `O desempenho do time pode depender do lado; o ${weaker === "attack" ? "ataque" : "a defesa"} concentra mais rodadas perdidas.`,
        howToVerify: "Revisar no video as rodadas perdidas no lado com menor aproveitamento e anotar o que se repete.",
        review,
      },
    ],
  };
}

/** Frequencia com que o jogador foi a primeira morte da rodada. */
export function detectFirstDeaths({ sessionId, analyses }: DetectorInput): PatternResult {
  const rule = PATTERN_RULES.first_death_frequency;
  const eligible = available(analyses, "first_deaths");
  const pool = valueOf(sessionMetricOf(aggregate(eligible), "first_death_ratio"));
  const rounds = pool?.denominator ?? 0;
  const base = {
    patternId: "first_death_frequency" as const,
    ruleVersion: rule.ruleVersion,
    title: "Primeira morte da rodada com frequencia",
    description: "Conta as rodadas em que o jogador foi o alvo do primeiro abate, so em partidas com cobertura completa de eventos.",
    eligibility: `Partidas com cobertura completa de eventos; ao menos ${rule.minMatches} partidas e ${rule.minRounds} rodadas determinaveis. Detectado quando a fracao e pelo menos ${rule.baselineMultiplier}x a referencia uniforme (1 / participantes).`,
    sample: { count: rounds, unit: "rounds" as const },
    hypotheses: [],
    limitations: [
      "Ser a primeira morte nao indica erro: pode refletir funcao (entrada) ou troca planejada.",
      "A referencia uniforme e uma simplificacao, nao a media de jogadores reais.",
      "Rodadas com abates simultaneos no primeiro instante sao excluidas.",
      NO_SIGNIFICANCE,
    ],
  };
  if (!pool || eligible.length < rule.minMatches || rounds < rule.minRounds) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `Partidas com cobertura completa: ${eligible.length} (minimo ${rule.minMatches}); rodadas determinaveis: ${rounds} (minimo ${rule.minRounds}).`,
    };
  }
  // Referencia ponderada pelas rodadas de cada partida: sum(rodadas_i / participantes_i) / sum(rodadas_i).
  const expected =
    eligible.reduce((acc, a) => acc + (metricOf(a, "first_deaths") as { sampleSize: number }).sampleSize / a.participantCount, 0) / rounds;
  const observation = `Primeira morte em ${pool.numerator} de ${rounds} rodadas determinaveis (${pct(pool.value)}); referencia uniforme ${pct(expected)}. ${eligible.length} partida(s).`;
  if (pool.value < rule.baselineMultiplier * expected) return { ...base, status: "not_detected", observation };

  const deathEvents = eligible.flatMap((a) => (a.rounds.opening?.firstDeathEventIds ?? []).map((id) => eventEvidence(a.matchId, id)));
  return {
    ...base,
    status: "detected",
    observation,
    finding: fact(sessionId, "first_death_frequency", {
      title: base.title,
      statement: `O jogador foi a primeira morte da rodada em ${pct(pool.value)} das rodadas determinaveis, ${num(pool.value / expected)}x a referencia uniforme. ${observation}`,
      evidence: [...evidenceFor(eligible, "first_deaths"), ...deathEvents],
      sampleSize: { count: rounds, unit: "rounds" },
      limitations: base.limitations,
    }),
    hypotheses: [
      {
        statement: "Pode haver exposicao recorrente no inicio das rodadas.",
        howToVerify: "Revisar no video os segundos anteriores a cada primeira morte (posicao, informacao disponivel, apoio do time).",
        review: deathEvents,
      },
    ],
  };
}

const TREND_KEYS = [
  ["kills_per_round", "Abates por rodada"],
  ["deaths_per_round", "Mortes por rodada"],
] as const satisfies readonly (readonly [SessionMetricKey & MetricKey, string])[];

/** Variacao entre a primeira e a segunda metade da sessao (ordem cronologica). */
export function detectSessionTrend({ sessionId, analyses }: DetectorInput): PatternResult {
  const rule = PATTERN_RULES.session_trend;
  const eligible = available(analyses, "rounds_played");
  const half = Math.floor(eligible.length / 2);
  // Quantidade impar: a partida do meio fica de fora, para as metades terem o mesmo tamanho.
  const early = eligible.slice(0, half);
  const late = eligible.slice(eligible.length - half);
  const pe = aggregate(early);
  const pl = aggregate(late);
  const roundsOf = (p: SessionMetric[]) => valueOf(sessionMetricOf(p, "rounds_played"))?.value ?? 0;
  const base = {
    patternId: "session_trend" as const,
    ruleVersion: rule.ruleVersion,
    title: "Mudanca entre o inicio e o fim do periodo",
    description: "Compara abates e mortes por rodada da primeira metade das partidas (em ordem cronologica) com a segunda metade.",
    eligibility: `Partidas com rodadas; ao menos ${rule.minMatchesPerHalf} partidas e ${rule.minRoundsPerHalf} rodadas em cada metade. Detectado quando alguma metrica muda ${pct(rule.minRelativeChange)} ou mais em relacao a primeira metade.`,
    sample: { count: early.length + late.length, unit: "matches" as const },
    hypotheses: [],
    limitations: [
      NOT_CAUSAL,
      "Adversarios, mapas e modos podem diferir entre as metades.",
      "Com quantidade impar, a partida do meio nao entra na comparacao.",
      NO_SIGNIFICANCE,
    ],
  };
  if (half < rule.minMatchesPerHalf || roundsOf(pe) < rule.minRoundsPerHalf || roundsOf(pl) < rule.minRoundsPerHalf) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `Partidas por metade: ${half} (minimo ${rule.minMatchesPerHalf}); rodadas: ${roundsOf(pe)} e ${roundsOf(pl)} (minimo ${rule.minRoundsPerHalf} em cada).`,
    };
  }

  const changes: { key: MetricKey; label: string; a: number; b: number; rel: number }[] = [];
  const parts: string[] = [];
  for (const [key, label] of TREND_KEYS) {
    const a = valueOf(sessionMetricOf(pe, key));
    const b = valueOf(sessionMetricOf(pl, key));
    if (!a || !b) continue;
    parts.push(`${label}: ${num(a.value)} -> ${num(b.value)}`);
    if (a.value === 0) continue; // variacao relativa indefinida
    const rel = (b.value - a.value) / a.value;
    if (Math.abs(rel) >= rule.minRelativeChange) changes.push({ key, label, a: a.value, b: b.value, rel });
  }
  const observation = `${parts.join("; ")} (${early.length} partidas/${roundsOf(pe)} rodadas x ${late.length} partidas/${roundsOf(pl)} rodadas).`;
  if (changes.length === 0) return { ...base, status: "not_detected", observation };

  const statement = changes
    .map((c) => `${c.label} ${c.rel > 0 ? "subiu" : "caiu"} ${pct(Math.abs(c.rel))} (${num(c.a)} -> ${num(c.b)})`)
    .join("; ");
  return {
    ...base,
    status: "detected",
    observation,
    finding: fact(sessionId, "session_trend", {
      title: base.title,
      statement: `Da primeira para a segunda metade do periodo: ${statement}. ${observation}`,
      evidence: changes.flatMap((c) => evidenceFor([...early, ...late], c.key)),
      sampleSize: { count: early.length + late.length, unit: "matches" },
      limitations: base.limitations,
    }),
    hypotheses: [
      {
        statement: "O desempenho pode ter mudado ao longo do periodo; a causa nao e identificavel so pelas estatisticas.",
        howToVerify: "Comparar o contexto das partidas (horario, sequencia, adversarios, funcao) antes de concluir.",
        review: [],
      },
    ],
  };
}

export const DETECTORS = [detectSideGap, detectFirstDeaths, detectSessionTrend] as const;
