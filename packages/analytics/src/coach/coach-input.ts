import type { Finding } from "@cyl/contracts";
import { metricDefinition } from "../metrics/catalog";
import type { MetricUnit, UnavailableReason } from "../metrics/metric";
import type { PatternResult } from "../patterns/detectors";
import type { SessionAnalysis } from "../sessions/session";

export const COACH_INPUT_VERSION = 1;

const SESSION_ONLY_LABELS: Record<string, string> = {
  first_kill_ratio: "Fracao de primeiros abates da rodada",
  first_death_ratio: "Fracao de primeiras mortes da rodada",
};

/**
 * Entrada estruturada para o futuro CYL Coach (P0-08). O Coach interpreta;
 * nao recalcula. Somente dados ja calculados e validados pelo motor, com
 * limitacoes explicitas. Sem texto livre gerado por IA.
 */
export interface CoachInput {
  version: typeof COACH_INPUT_VERSION;
  engineVersion: string;
  sessionId: string;
  context: Pick<SessionAnalysis, "matchCount" | "period" | "outcomes" | "coverage"> & SessionAnalysis["context"];
  metrics: { key: string; label: string; unit: MetricUnit; value: number; sampleSize: number; matchesUsed: number }[];
  unavailableMetrics: { key: string; label: string; reason: UnavailableReason; detail: string }[];
  patterns: (Pick<PatternResult, "patternId" | "ruleVersion" | "status" | "title" | "eligibility" | "sample" | "limitations" | "hypotheses"> & {
    observation?: string;
    reason?: string;
    findingId?: string;
  })[];
  findings: Finding[];
  /** Alertas da sessao e limitacoes das partidas, sem repeticao. */
  limitations: string[];
}

const labelOf = (key: string) => metricDefinition(key)?.label ?? SESSION_ONLY_LABELS[key] ?? key;

export function toCoachInput(s: SessionAnalysis): CoachInput {
  return {
    version: COACH_INPUT_VERSION,
    engineVersion: s.engineVersion,
    sessionId: s.sessionId,
    context: { matchCount: s.matchCount, period: s.period, outcomes: s.outcomes, coverage: s.coverage, ...s.context },
    metrics: s.metrics.flatMap((m) =>
      m.status === "available"
        ? [{ key: m.key, label: labelOf(m.key), unit: m.unit, value: m.value, sampleSize: m.sampleSize, matchesUsed: m.matchesUsed }]
        : [],
    ),
    unavailableMetrics: s.metrics.flatMap((m) =>
      m.status === "unavailable" ? [{ key: m.key, label: labelOf(m.key), reason: m.reason, detail: m.detail }] : [],
    ),
    patterns: s.patterns.map((p) => ({
      patternId: p.patternId,
      ruleVersion: p.ruleVersion,
      status: p.status,
      title: p.title,
      eligibility: p.eligibility,
      sample: p.sample,
      limitations: p.limitations,
      hypotheses: p.hypotheses,
      ...(p.observation === undefined ? {} : { observation: p.observation }),
      ...(p.reason === undefined ? {} : { reason: p.reason }),
      ...(p.finding === undefined ? {} : { findingId: p.finding.id }),
    })),
    findings: s.findings,
    limitations: [...new Set([...s.warnings.map((w) => w.message), ...s.matches.flatMap((m) => m.limitations)])],
  };
}
