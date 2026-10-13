import { z } from "zod";
import { Id, IsoDateTime, SchemaVersion } from "./common";
import type { Match } from "./match";
import type { VideoReference } from "./video";

export const AnalysisEngine = z.enum(["local_rules", "external_ai"]);

export const AnalysisSession = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  userId: Id,
  matchIds: z.array(Id).min(1),
  engine: AnalysisEngine,
  createdAt: IsoDateTime,
});
export type AnalysisSession = z.infer<typeof AnalysisSession>;

/** Evidencia rastreavel: aponta para o dado que sustenta um Finding. */
export const Evidence = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("metric"), matchId: Id, metricKey: z.string().min(1), value: z.number().finite() }),
    z.object({ kind: z.literal("event"), matchId: Id, eventId: Id }),
    z.object({ kind: z.literal("round"), matchId: Id, roundNumber: z.int().positive() }),
    z.object({
      kind: z.literal("video"),
      videoId: Id,
      startMs: z.int().nonnegative(),
      endMs: z.int().nonnegative(),
    }),
  ])
  .superRefine((e, ctx) => {
    if (e.kind === "video" && e.endMs < e.startMs) {
      ctx.addIssue({ code: "custom", path: ["endMs"], message: "endMs antes de startMs" });
    }
  });
export type Evidence = z.infer<typeof Evidence>;

/** Quantas observacoes sustentam o diagnostico, e de que tipo. */
export const SampleSize = z.object({
  count: z.int().positive(),
  unit: z.enum(["matches", "rounds", "events"]),
});
export type SampleSize = z.infer<typeof SampleSize>;

const findingBase = {
  id: Id,
  sessionId: Id,
  title: z.string().min(1),
  /** Descricao do diagnostico. */
  statement: z.string().min(1),
  evidence: z.array(Evidence).min(1),
  sampleSize: SampleSize.optional(),
};

/**
 * Diagnostico. `fact` = observado diretamente nos dados; `hypothesis` =
 * interpretacao plausivel, sempre com confianca (< 1: nunca comprovada) e
 * limitacoes declaradas. Recomendacoes apontam para Findings
 * (`CoachingRecommendation.findingIds`), nao o contrario.
 */
export const Finding = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fact"),
    ...findingBase,
    limitations: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    kind: z.literal("hypothesis"),
    ...findingBase,
    confidence: z.number().min(0).lt(1),
    limitations: z.array(z.string().min(1)).min(1),
  }),
]);
export type Finding = z.infer<typeof Finding>;

export const CoachingRecommendation = z.object({
  id: Id,
  sessionId: Id,
  /** Toda recomendacao deriva de ao menos um Finding. */
  findingIds: z.array(Id).min(1),
  title: z.string().min(1),
  practice: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
});
export type CoachingRecommendation = z.infer<typeof CoachingRecommendation>;

export interface AnalysisContext {
  session: AnalysisSession;
  matches: readonly Match[];
  videos?: readonly VideoReference[];
}

/**
 * Valida um Finding contra os dados da sessao: toda evidencia deve apontar
 * para partida, evento, round ou video existentes. Lista vazia = ok.
 */
export function checkFindingInContext(finding: Finding, ctx: AnalysisContext): string[] {
  const issues: string[] = [];
  if (finding.sessionId !== ctx.session.id) issues.push("finding de outra sessao");
  const sessionMatches = new Set(ctx.session.matchIds);
  const matches = new Map(ctx.matches.map((m) => [m.id, m]));
  const videos = new Map((ctx.videos ?? []).map((v) => [v.id, v]));

  finding.evidence.forEach((e, i) => {
    const where = `evidence[${i}]`;
    if (e.kind === "video") {
      const video = videos.get(e.videoId);
      if (!video) issues.push(`${where}: video inexistente`);
      else if (e.endMs > video.durationMs) issues.push(`${where}: trecho alem do fim do video`);
      return;
    }
    const match = matches.get(e.matchId);
    if (!sessionMatches.has(e.matchId) || !match) {
      issues.push(`${where}: partida fora da sessao`);
      return;
    }
    if (e.kind === "event" && !match.events.some((ev) => ev.id === e.eventId)) issues.push(`${where}: evento inexistente`);
    if (e.kind === "round" && !match.rounds.some((r) => r.number === e.roundNumber)) issues.push(`${where}: round inexistente`);
  });

  if (finding.sampleSize?.unit === "matches" && finding.sampleSize.count > ctx.session.matchIds.length) {
    issues.push("sampleSize maior que as partidas da sessao");
  }
  return issues;
}

/** Valida que a recomendacao aponta para Findings existentes da mesma sessao. */
export function checkRecommendationLinks(rec: CoachingRecommendation, findings: readonly Finding[]): string[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  return rec.findingIds.flatMap((id) => {
    const f = byId.get(id);
    if (!f) return [`finding ${id} inexistente`];
    return f.sessionId === rec.sessionId ? [] : [`finding ${id} de outra sessao`];
  });
}
