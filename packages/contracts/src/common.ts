import { z } from "zod";

/**
 * Versao dos contratos compartilhados. Mudanca incompativel => incrementar MAJOR
 * e manter o schema anterior enquanto houver consumidores (desktop instalado).
 */
export const CONTRACTS_VERSION = "1.0.0";

/** Versao de schema gravada nos agregados persistidos ou trafegados. */
export const SCHEMA_VERSION = 1 as const;
export const SchemaVersion = z.literal(SCHEMA_VERSION);

export const Id = z.string().min(1).max(128);
export type Id = z.infer<typeof Id>;

export const IsoDateTime = z.iso.datetime({ offset: true });

export const GameId = z.enum(["valorant"]);
export type GameId = z.infer<typeof GameId>;

/**
 * Procedencia do dado. Toda tela que exibe partidas deve indicar quando a
 * origem e `synthetic`: dado sintetico nunca pode ser apresentado como real.
 */
export const DataOrigin = z.enum(["synthetic", "riot_api", "user_import"]);
export type DataOrigin = z.infer<typeof DataOrigin>;
