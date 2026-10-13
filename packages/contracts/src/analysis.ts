import { z } from "zod";
import { Id, IsoDateTime, SchemaVersion } from "./common";

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
export const Evidence = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("metric"), matchId: Id, metricKey: z.string().min(1), value: z.number().finite() }),
  z.object({ kind: z.literal("event"), matchId: Id, eventId: Id }),
  z.object({
    kind: z.literal("video"),
    videoId: Id,
    startMs: z.int().nonnegative(),
    endMs: z.int().nonnegative(),
  }),
]);
export type Evidence = z.infer<typeof Evidence>;

/**
 * Diagnostico. `fact` = observado diretamente nos dados; `hypothesis` =
 * interpretacao plausivel, sempre com confianca e limitacoes declaradas.
 */
export const Finding = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fact"),
    id: Id,
    sessionId: Id,
    title: z.string().min(1),
    statement: z.string().min(1),
    evidence: z.array(Evidence).min(1),
  }),
  z.object({
    kind: z.literal("hypothesis"),
    id: Id,
    sessionId: Id,
    title: z.string().min(1),
    statement: z.string().min(1),
    evidence: z.array(Evidence).min(1),
    confidence: z.number().min(0).max(1),
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

/**
 * Video importado manualmente. O arquivo fica no disco do usuario: o
 * contrato guarda apenas o nome e a sincronizacao, nunca o caminho absoluto
 * fora do desktop, e o video nao e enviado a servicos externos.
 */
export const VideoReference = z
  .object({
    id: Id,
    matchId: Id.optional(),
    fileName: z.string().min(1),
    durationMs: z.int().positive(),
    /** Deslocamento entre o inicio do video e o inicio da partida. */
    offsetMs: z.int(),
    storage: z.literal("local"),
    importedAt: IsoDateTime,
  })
  .refine((v) => !/[\\/]/.test(v.fileName), { path: ["fileName"], message: "use somente o nome do arquivo" });
export type VideoReference = z.infer<typeof VideoReference>;
