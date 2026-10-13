import type { Match } from "@cyl/contracts";
import { normalizeMatch, type ProviderError, type Result } from "@cyl/core";
import { valorantSyntheticAdapter } from "@cyl/game-adapter-valorant";

/**
 * Normaliza uma partida no formato sintetico `cyl-synthetic-valorant` para o
 * contrato Match compartilhado. Somente dados sinteticos (origin = "synthetic");
 * a importacao de arquivos do usuario e o P0-04 e a persistencia, o P0-03.
 */
export function normalizeSyntheticMatch(raw: unknown, newId: () => string = () => crypto.randomUUID()): Result<Match, ProviderError> {
  return normalizeMatch(valorantSyntheticAdapter, raw, { newId });
}
