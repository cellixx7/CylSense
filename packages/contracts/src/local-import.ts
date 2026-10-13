import { z } from "zod";
import { DataOrigin, IsoDateTime, SchemaVersion } from "./common";
import { Match } from "./match";
import { VideoMarker, VideoReference } from "./video";

export const LOCAL_IMPORT_KIND = "cyl-local-bundle";

/**
 * Envelope versionado para arquivos locais do CYL Sense (exportacao/backup).
 * Prepara as migracoes do P0-03/P0-04: `schemaVersion` diz qual migracao
 * aplicar. Nao e um importador; nao le formatos de terceiros.
 */
export const LocalImportEnvelope = z
  .object({
    kind: z.literal(LOCAL_IMPORT_KIND),
    schemaVersion: SchemaVersion,
    createdAt: IsoDateTime,
    /** Procedencia declarada de todo o conteudo; cada partida deve coincidir. */
    origin: DataOrigin,
    matches: z.array(Match),
    videos: z.array(VideoReference).default([]),
    markers: z.array(VideoMarker).default([]),
  })
  .superRefine((env, ctx) => {
    env.matches.forEach((m, i) => {
      if (m.origin !== env.origin) ctx.addIssue({ code: "custom", path: ["matches", i, "origin"], message: "origem diferente do envelope" });
    });
    const matchIds = new Set(env.matches.map((m) => m.id));
    const videoIds = new Set(env.videos.map((v) => v.id));
    env.videos.forEach((v, i) => {
      if (v.matchId !== undefined && !matchIds.has(v.matchId)) {
        ctx.addIssue({ code: "custom", path: ["videos", i, "matchId"], message: "partida inexistente no envelope" });
      }
    });
    env.markers.forEach((mk, i) => {
      if (!videoIds.has(mk.videoId)) ctx.addIssue({ code: "custom", path: ["markers", i, "videoId"], message: "video inexistente no envelope" });
    });
  });
export type LocalImportEnvelope = z.infer<typeof LocalImportEnvelope>;
