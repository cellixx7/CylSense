import { Evidence, Finding, type Match } from "@cyl/contracts";
import { describeIssues } from "@cyl/core";
import type { MetricKey } from "../metrics/catalog";
import type { MatchAnalysis } from "../metrics/match-metrics";
import { isAvailable, sameValue } from "../metrics/metric";

/** O que foi analisado: base para validar que uma evidencia aponta para dado real. */
export interface EvidenceIndex {
  sessionId: string;
  matches: ReadonlyMap<string, { match: Match; analysis: MatchAnalysis }>;
}

export function buildEvidenceIndex(sessionId: string, entries: readonly { match: Match; analysis: MatchAnalysis }[]): EvidenceIndex {
  return { sessionId, matches: new Map(entries.map((e) => [e.match.id, e])) };
}

/** Evidencia de metrica com o valor calculado; falha (bug) se a metrica nao estiver disponivel. */
export function metricEvidence(analysis: MatchAnalysis, key: MetricKey): Evidence {
  const m = analysis.metrics.find((x) => x.key === key);
  if (!isAvailable(m)) throw new Error(`evidencia de metrica indisponivel: ${key}`);
  return { kind: "metric", matchId: analysis.matchId, metricKey: key, value: m.value };
}

export const eventEvidence = (matchId: string, eventId: string): Evidence => ({ kind: "event", matchId, eventId });
export const roundEvidence = (matchId: string, roundNumber: number): Evidence => ({ kind: "round", matchId, roundNumber });

/**
 * Valida uma evidencia contra os dados analisados. Mais estrito que
 * `checkFindingInContext` dos contratos: a metrica precisa existir, estar
 * disponivel e ter o mesmo valor calculado. Video fica fora do motor (P0-07).
 * Retorna o problema, ou `null` quando ok.
 */
export function checkEvidence(e: Evidence, index: EvidenceIndex): string | null {
  const shape = Evidence.safeParse(e);
  if (!shape.success) return `evidencia malformada: ${describeIssues(shape.error.issues)}`;
  if (e.kind === "video") return "evidencia de video nao e produzida nem aceita pelo motor de analytics";
  const entry = index.matches.get(e.matchId);
  if (!entry) return "partida fora dos dados analisados";
  switch (e.kind) {
    case "event":
      return entry.match.events.some((ev) => ev.id === e.eventId) ? null : "evento inexistente na partida";
    case "round":
      return entry.match.rounds.some((r) => r.number === e.roundNumber) ? null : "rodada inexistente na partida";
    case "metric": {
      const m = entry.analysis.metrics.find((x) => x.key === e.metricKey);
      if (!m) return "metrica desconhecida";
      if (!isAvailable(m)) return "metrica indisponivel nesta partida";
      return sameValue(m.value, e.value) ? null : "valor diferente do calculado";
    }
  }
}

/** Valida contrato, sessao e todas as evidencias de um Finding. Lista vazia = ok. */
export function checkFinding(finding: Finding, index: EvidenceIndex): string[] {
  const shape = Finding.safeParse(finding);
  if (!shape.success) return [`finding malformado: ${describeIssues(shape.error.issues)}`];
  const issues: string[] = [];
  if (finding.sessionId !== index.sessionId) issues.push("finding de outra sessao");
  finding.evidence.forEach((e, i) => {
    const problem = checkEvidence(e, index);
    if (problem) issues.push(`evidence[${i}]: ${problem}`);
  });
  if (finding.sampleSize?.unit === "matches" && finding.sampleSize.count > index.matches.size) {
    issues.push("sampleSize maior que as partidas analisadas");
  }
  return issues;
}
