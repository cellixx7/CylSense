import { z } from "zod";

/**
 * Formato SINTETICO do CYL Sense para fixtures de VALORANT.
 *
 * Nao e o formato da Riot API. Ele existe para testes e demonstracao; o
 * adaptador do payload oficial sera escrito a partir da documentacao da Riot
 * quando houver acesso autorizado. Partidas neste formato saem sempre com
 * origin = "synthetic".
 *
 * Campos opcionais (headshotKills, damage, attackers, winCondition, score,
 * eventCoverage, headshot, assists) foram adicionados mantendo formatVersion 1:
 * arquivos antigos continuam validos e o dado ausente segue ausente.
 */
export const SYNTHETIC_FORMAT = "cyl-synthetic-valorant";

const SyntheticTeam = z.enum(["Red", "Blue"]);

const SyntheticEvent = z.object({
  t: z.int().nonnegative(),
  type: z.enum(["kill", "plant", "defuse"]),
  actor: z.string().min(1).optional(),
  victim: z.string().min(1).optional(),
  headshot: z.boolean().optional(),
  assists: z.array(z.string().min(1)).optional(),
});

export const SyntheticValorantMatch = z.object({
  format: z.literal(SYNTHETIC_FORMAT),
  formatVersion: z.literal(1),
  note: z.string().optional(),
  matchId: z.string().min(1),
  map: z.string().min(1),
  queue: z.string().min(1),
  startedAt: z.iso.datetime({ offset: true }),
  durationSeconds: z.int().positive(),
  eventCoverage: z.enum(["complete", "partial"]).optional(),
  score: z.object({ Red: z.int().nonnegative(), Blue: z.int().nonnegative() }).optional(),
  players: z
    .array(
      z.object({
        ref: z.string().min(1),
        name: z.string().min(1),
        team: SyntheticTeam,
        agent: z.string().min(1),
        kills: z.int().nonnegative(),
        deaths: z.int().nonnegative(),
        assists: z.int().nonnegative(),
        headshotKills: z.int().nonnegative().optional(),
        /** Dano total causado, em pontos de vida. */
        damage: z.int().nonnegative().optional(),
      }),
    )
    .min(1),
  rounds: z.array(
    z.object({
      number: z.int().positive(),
      winner: SyntheticTeam,
      attackers: SyntheticTeam.optional(),
      winCondition: z.enum(["elimination", "detonate", "defuse", "time"]).optional(),
      events: z.array(SyntheticEvent),
    }),
  ),
});
export type SyntheticValorantMatch = z.infer<typeof SyntheticValorantMatch>;
