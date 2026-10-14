import type { DataOrigin, Finding, GameId, Match } from "@cyl/contracts";
import { err, ok, type Result } from "@cyl/core";
import { analyticsError, type AnalyticsError } from "../errors";
import { buildEvidenceIndex, checkEvidence, checkFinding } from "../evidence/evidence";
import { analyzeMatch, type MatchAnalysis, type MatchOutcome } from "../metrics/match-metrics";
import { DETECTORS, type PatternResult } from "../patterns/detectors";
import { ANALYTICS_ENGINE_VERSION } from "../version";
import { aggregate, type SessionMetric } from "./aggregate";

/** Limite por chamada: o chamador pagina ou reduz o periodo (ver analytics-engine.md). */
export const MAX_SESSION_MATCHES = 500;
/** Abaixo disto a sessao recebe alerta de amostra pequena. */
export const SMALL_SESSION_MATCHES = 5;

/** Partida + jogador analisado nela (`playerRef` so vale dentro da partida). */
export interface SessionEntry {
  match: Match;
  playerRef: string;
}

export type SessionWarningCode =
  | "empty"
  | "small_sample"
  | "mixed_games"
  | "mixed_modes"
  | "synthetic_data"
  | "mixed_origins"
  | "partial_metric";

export interface SessionWarning {
  code: SessionWarningCode;
  message: string;
}

export interface SessionAnalysis {
  sessionId: string;
  engineVersion: string;
  matchCount: number;
  /** Ordem cronologica (startedAt, depois id). */
  matches: MatchAnalysis[];
  period: { from: string; to: string } | null;
  context: { games: GameId[]; modes: string[]; maps: string[]; origins: DataOrigin[]; containsSynthetic: boolean };
  outcomes: Record<MatchOutcome, number>;
  /** Quantas partidas tem cada tipo de dado. */
  coverage: { completeEvents: number; headshots: number; damage: number; sides: number; result: number };
  /** Agregacao ponderada (soma/soma), nunca media de razoes. */
  metrics: SessionMetric[];
  patterns: PatternResult[];
  /** Findings dos padroes detectados; todas as evidencias validadas. */
  findings: Finding[];
  warnings: SessionWarning[];
}

const time = (iso: string) => Date.parse(iso);
const chronological = (a: MatchAnalysis, b: MatchAnalysis) =>
  time(a.startedAt) - time(b.startedAt) || (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0);
const sortedUnique = <T extends string>(xs: Iterable<T>) => [...new Set(xs)].sort();

const PARTIAL_LABELS = [
  ["headshot_kill_ratio", "abates com headshot"],
  ["damage_per_round", "dano"],
  ["attack_round_win_ratio", "lados"],
  ["first_death_ratio", "eventos completos"],
] as const;

/**
 * Analisa varias partidas do mesmo jogador (um `playerRef` por partida).
 * Independe da ordem de entrada: ordena por data e id. Entrada vazia gera
 * uma sessao vazia (metricas indisponiveis, padroes sem dados), nao erro.
 */
export function analyzeSession(sessionId: string, entries: readonly SessionEntry[]): Result<SessionAnalysis, AnalyticsError> {
  if (entries.length > MAX_SESSION_MATCHES) {
    return err(analyticsError("too_many_matches", `sessao com ${entries.length} partidas (maximo ${MAX_SESSION_MATCHES})`));
  }
  const ids = new Set<string>();
  const external = new Set<string>();
  const analyzed: { match: Match; analysis: MatchAnalysis }[] = [];
  for (const [i, { match, playerRef }] of entries.entries()) {
    const ext = `${match.game}|${match.origin}|${match.externalId}`;
    if (ids.has(match.id) || external.has(ext)) return err(analyticsError("duplicate_match", `partida ${i + 1} repetida na sessao`));
    ids.add(match.id);
    external.add(ext);
    const r = analyzeMatch(match, playerRef);
    if (!r.ok) return err(analyticsError(r.error.code, `partida ${i + 1}: ${r.error.message}`));
    analyzed.push({ match, analysis: r.value });
  }

  const matches = analyzed.map((x) => x.analysis).sort(chronological);
  const metrics = aggregate(matches);
  const patterns = DETECTORS.map((detect) => detect({ sessionId, analyses: matches }));

  // Toda evidencia emitida precisa apontar para os dados analisados; falha aqui e bug do motor.
  const index = buildEvidenceIndex(sessionId, analyzed);
  for (const p of patterns) {
    const issues = [
      ...(p.finding ? checkFinding(p.finding, index) : []),
      ...p.hypotheses.flatMap((h) => h.review.map((e) => checkEvidence(e, index)).filter((x): x is string => x !== null)),
    ];
    if (issues.length > 0) throw new Error(`padrao ${p.patternId} com evidencia invalida: ${issues.join("; ")}`);
  }

  const outcomes: Record<MatchOutcome, number> = { win: 0, loss: 0, draw: 0, unknown: 0 };
  const coverage = { completeEvents: 0, headshots: 0, damage: 0, sides: 0, result: 0 };
  for (const m of matches) {
    outcomes[m.outcome]++;
    const a = m.availability;
    if (a.eventCoverage === "complete") coverage.completeEvents++;
    if (a.headshots) coverage.headshots++;
    if (a.damage) coverage.damage++;
    if (a.sides) coverage.sides++;
    if (a.result) coverage.result++;
  }

  const context = {
    games: sortedUnique(matches.map((m) => m.game)),
    modes: sortedUnique(matches.map((m) => m.mode)),
    maps: sortedUnique(matches.map((m) => m.map)),
    origins: sortedUnique(matches.map((m) => m.origin)),
    containsSynthetic: matches.some((m) => m.origin === "synthetic"),
  };

  const warnings: SessionWarning[] = [];
  const warn = (code: SessionWarningCode, message: string) => warnings.push({ code, message });
  if (matches.length === 0) warn("empty", "Nenhuma partida para analisar.");
  else if (matches.length < SMALL_SESSION_MATCHES) {
    warn("small_sample", `Somente ${matches.length} partida(s): medias e padroes podem refletir variacao normal.`);
  }
  if (context.games.length > 1) warn("mixed_games", "Partidas de jogos diferentes na mesma sessao.");
  if (context.modes.length > 1) warn("mixed_modes", `Modos diferentes (${context.modes.join(", ")}): as partidas podem nao ser comparaveis.`);
  if (context.containsSynthetic) warn("synthetic_data", "Contem dados sinteticos: nao representam partidas reais.");
  if (context.origins.length > 1) warn("mixed_origins", "Partidas de origens diferentes.");
  for (const [key, label] of PARTIAL_LABELS) {
    const used = metrics.find((m) => m.key === key)?.matchesUsed ?? 0;
    if (used > 0 && used < matches.length) {
      warn("partial_metric", `${label}: disponivel em ${used} de ${matches.length} partidas; a agregacao usa so essas.`);
    }
  }

  const first = matches[0];
  const last = matches[matches.length - 1];
  return ok({
    sessionId,
    engineVersion: ANALYTICS_ENGINE_VERSION,
    matchCount: matches.length,
    matches,
    period: first && last ? { from: first.startedAt, to: last.startedAt } : null,
    context,
    outcomes,
    coverage,
    metrics,
    patterns,
    findings: patterns.flatMap((p) => (p.finding ? [p.finding] : [])),
    warnings,
  });
}
