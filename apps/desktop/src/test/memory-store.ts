import { CONTRACTS_VERSION, type Match } from "@cyl/contracts";
import { err, ok } from "@cyl/core";
import type { LocalStore, MatchListItem, SaveMatchOutcome, StorageError, StoredMatch } from "@/storage/local-store";

/**
 * `LocalStore` em memoria para testes de UI e do pipeline de importacao.
 * Reproduz as regras do Rust que importam aqui: identidade (game, origin,
 * externalId), `unchanged` para conteudo igual e lote atomico. As regras
 * reais do SQLite sao testadas em src-tauri/src/storage/tests.rs.
 */
export function memoryStore(options: { now?: () => string } = {}) {
  const now = options.now ?? (() => "2026-10-14T12:00:00.000Z");
  const rows = new Map<string, StoredMatch>();
  let failure: StorageError | null = null;
  const sameContent = (a: Match, b: Match) => JSON.stringify({ ...a, id: "" }) === JSON.stringify({ ...b, id: "" });

  function saveOne(match: Match, target: Map<string, StoredMatch>): { id: string; outcome: SaveMatchOutcome } {
    const existing = [...target.values()].find(
      (r) => r.match.game === match.game && r.match.origin === match.origin && r.externalId === match.externalId,
    );
    if (!existing) {
      const t = now();
      target.set(match.id, {
        id: match.id,
        externalId: match.externalId,
        contractsVersion: CONTRACTS_VERSION,
        matchSchemaVersion: match.schemaVersion,
        importedAt: t,
        updatedAt: t,
        match,
      });
      return { id: match.id, outcome: "inserted" };
    }
    if (sameContent(existing.match, match)) return { id: existing.id, outcome: "unchanged" };
    target.set(existing.id, { ...existing, updatedAt: now(), match: { ...match, id: existing.id } });
    return { id: existing.id, outcome: "updated" };
  }

  const store: LocalStore = {
    async status() {
      if (failure) return err(failure);
      return ok({ available: true, schemaVersion: 1, supportedSchemaVersion: 1, counts: { matches: rows.size, videos: 0, markers: 0 } });
    },
    async saveMatch(match) {
      if (failure) return err(failure);
      return ok(saveOne(match, rows));
    },
    async saveMatches(matches) {
      if (failure) return err(failure);
      const draft = new Map(rows);
      const results = matches.map((m) => saveOne(m, draft));
      rows.clear();
      for (const [k, v] of draft) rows.set(k, v);
      return ok(results);
    },
    async getMatch(id) {
      if (failure) return err(failure);
      return ok(rows.get(id) ?? null);
    },
    async listMatches() {
      if (failure) return err(failure);
      const items: MatchListItem[] = [...rows.values()]
        .sort((a, b) => b.match.startedAt.localeCompare(a.match.startedAt))
        .map(({ match: m, importedAt, updatedAt }) => ({
          id: m.id,
          externalId: m.externalId,
          game: m.game,
          origin: m.origin,
          map: m.map,
          mode: m.mode,
          startedAt: m.startedAt,
          durationSeconds: m.durationSeconds,
          roundsPlayed: m.rounds.length,
          ...(m.result ? { result: m.result } : {}),
          importedAt,
          updatedAt,
        }));
      return ok(items);
    },
    attachVideo: async () => err({ code: "write_failed", message: "nao simulado" }),
    listVideos: async () => ok([]),
    addMarker: async () => err({ code: "write_failed", message: "nao simulado" }),
    listMarkers: async () => ok([]),
    updateMarker: async () => err({ code: "write_failed", message: "nao simulado" }),
    deleteMarker: async () => ok(undefined),
  };

  return {
    store,
    rows,
    /** Faz toda operacao seguinte falhar com o erro dado (`null` restaura). */
    failWith(e: StorageError | null) {
      failure = e;
    },
  };
}
