import { z } from "zod";
import { GameId, Id, IsoDateTime } from "./common";

export const User = z.object({
  id: Id,
  displayName: z.string().min(1).max(64),
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof User>;

/**
 * Consentimento dado pelo usuario ao vincular a conta. `scopes` guarda
 * literalmente o que o provedor concedeu; nao inventamos nomes de escopo.
 */
export const Consent = z.object({
  scopes: z.array(z.string().min(1)),
  grantedAt: IsoDateTime,
  revokedAt: IsoDateTime.optional(),
});
export type Consent = z.infer<typeof Consent>;

export const GameAccount = z.object({
  id: Id,
  userId: Id,
  game: GameId,
  provider: z.enum(["riot", "mock"]),
  /** Identificador opaco do provedor. Nunca e um token ou credencial. */
  externalId: z.string().min(1),
  gameName: z.string().min(1),
  tagLine: z.string().min(1),
  linkedAt: IsoDateTime,
  consent: Consent,
});
export type GameAccount = z.infer<typeof GameAccount>;
