import { z } from "zod";
import { Id, IsoDateTime } from "./common";

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
    /**
     * Deslocamento entre o inicio do video e o inicio da partida: a partida
     * comeca em `offsetMs` no tempo do video (negativo = video comecou depois).
     */
    offsetMs: z.int(),
    storage: z.literal("local"),
    importedAt: IsoDateTime,
  })
  .refine((v) => !/[\\/]/.test(v.fileName), { path: ["fileName"], message: "use somente o nome do arquivo" });
export type VideoReference = z.infer<typeof VideoReference>;

/** Marcacao feita pelo usuario em um instante do video. Sem analise automatica. */
export const VideoMarker = z.object({
  id: Id,
  videoId: Id,
  /** Instante no tempo do video, em milissegundos. */
  timestampMs: z.int().nonnegative(),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(1000).optional(),
  /** Round associado, quando o usuario informa. */
  roundNumber: z.int().positive().optional(),
  source: z.literal("manual"),
  createdAt: IsoDateTime,
});
export type VideoMarker = z.infer<typeof VideoMarker>;

/** Converte um instante do video para o tempo da partida (ms desde o inicio). */
export const videoToMatchTimeMs = (video: Pick<VideoReference, "offsetMs">, videoMs: number): number =>
  videoMs - video.offsetMs;

/** Converte um instante da partida para o tempo do video. */
export const matchToVideoTimeMs = (video: Pick<VideoReference, "offsetMs">, matchMs: number): number =>
  matchMs + video.offsetMs;

/** Problemas de uma marcacao em relacao ao video ao qual pertence (lista vazia = ok). */
export function checkVideoMarker(marker: VideoMarker, video: VideoReference): string[] {
  const issues: string[] = [];
  if (marker.videoId !== video.id) issues.push("marcacao pertence a outro video");
  if (marker.timestampMs > video.durationMs) issues.push("marcacao apos o fim do video");
  if (marker.roundNumber !== undefined && video.matchId === undefined) {
    issues.push("round informado em video sem partida associada");
  }
  return issues;
}
