import { z } from "zod";
import { DataOrigin, GameId, Id, IsoDateTime, SchemaVersion } from "./common";

/** Referencia a um jogador dentro de uma partida (estavel apenas nela). */
export const PlayerRef = z.string().min(1);

export const Team = z.enum(["red", "blue"]);
export type Team = z.infer<typeof Team>;

export const MatchParticipant = z.object({
  playerRef: PlayerRef,
  /** Preenchido somente quando o participante e uma conta vinculada do usuario. */
  gameAccountId: Id.optional(),
  displayName: z.string().min(1),
  team: Team,
  agent: z.string().min(1),
  kills: z.int().nonnegative(),
  deaths: z.int().nonnegative(),
  assists: z.int().nonnegative(),
});
export type MatchParticipant = z.infer<typeof MatchParticipant>;

export const MatchEventType = z.enum(["kill", "spike_plant", "spike_defuse"]);

export const MatchEvent = z.object({
  id: Id,
  roundNumber: z.int().positive(),
  type: MatchEventType,
  /** Milissegundos desde o inicio da partida. */
  timeMs: z.int().nonnegative(),
  actorRef: PlayerRef.optional(),
  targetRef: PlayerRef.optional(),
});
export type MatchEvent = z.infer<typeof MatchEvent>;

export const Round = z.object({
  number: z.int().positive(),
  winningTeam: Team,
});
export type Round = z.infer<typeof Round>;

/** Partida normalizada: formato canonico independente do jogo de origem. */
export const Match = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    game: GameId,
    origin: DataOrigin,
    /** Id no sistema de origem; usado para sincronizacao idempotente. */
    externalId: z.string().min(1),
    map: z.string().min(1),
    mode: z.string().min(1),
    startedAt: IsoDateTime,
    durationSeconds: z.int().positive(),
    participants: z.array(MatchParticipant).min(1),
    rounds: z.array(Round),
    events: z.array(MatchEvent),
  })
  .superRefine((match, ctx) => {
    const refs = new Set(match.participants.map((p) => p.playerRef));
    if (refs.size !== match.participants.length) {
      ctx.addIssue({ code: "custom", path: ["participants"], message: "playerRef duplicado" });
    }
    const roundNumbers = new Set(match.rounds.map((r) => r.number));
    match.events.forEach((event, i) => {
      if (!roundNumbers.has(event.roundNumber)) {
        ctx.addIssue({ code: "custom", path: ["events", i, "roundNumber"], message: "round inexistente" });
      }
      for (const key of ["actorRef", "targetRef"] as const) {
        const ref = event[key];
        if (ref !== undefined && !refs.has(ref)) {
          ctx.addIssue({ code: "custom", path: ["events", i, key], message: "participante inexistente" });
        }
      }
    });
  });
export type Match = z.infer<typeof Match>;

/** Resumo para listagens (web e desktop). */
export const MatchSummary = z.object({
  id: Id,
  game: GameId,
  origin: DataOrigin,
  map: z.string(),
  mode: z.string(),
  startedAt: IsoDateTime,
  durationSeconds: z.int().positive(),
  roundsPlayed: z.int().nonnegative(),
});
export type MatchSummary = z.infer<typeof MatchSummary>;

export const MatchMetricValue = z.object({
  key: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(["count", "ratio", "percent", "per_round", "ms"]),
  /** Tamanho da amostra; metricas com amostra pequena devem ser sinalizadas na UI. */
  sampleSize: z.int().nonnegative(),
});
export type MatchMetricValue = z.infer<typeof MatchMetricValue>;

/** Metricas calculadas (deterministicas) para um jogador em uma partida. */
export const MatchMetrics = z.object({
  schemaVersion: SchemaVersion,
  matchId: Id,
  playerRef: PlayerRef,
  computedAt: IsoDateTime,
  /** Versao do motor que calculou, para reproducibilidade. */
  engineVersion: z.string().min(1),
  values: z.array(MatchMetricValue),
});
export type MatchMetrics = z.infer<typeof MatchMetrics>;
