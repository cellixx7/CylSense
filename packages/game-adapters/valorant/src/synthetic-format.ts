import { z } from "zod";

/**
 * Formato SINTETICO do CYL Sense para fixtures de VALORANT.
 *
 * Nao e o formato da Riot API. Ele existe para testes e demonstracao; o
 * adaptador do payload oficial sera escrito a partir da documentacao da Riot
 * quando houver acesso autorizado. Partidas neste formato saem sempre com
 * origin = "synthetic".
 */
export const SYNTHETIC_FORMAT = "cyl-synthetic-valorant";

const SyntheticTeam = z.enum(["Red", "Blue"]);

const SyntheticEvent = z.object({
  t: z.int().nonnegative(),
  type: z.enum(["kill", "plant", "defuse"]),
  actor: z.string().min(1).optional(),
  victim: z.string().min(1).optional(),
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
      }),
    )
    .min(1),
  rounds: z.array(
    z.object({
      number: z.int().positive(),
      winner: SyntheticTeam,
      events: z.array(SyntheticEvent),
    }),
  ),
});
export type SyntheticValorantMatch = z.infer<typeof SyntheticValorantMatch>;
