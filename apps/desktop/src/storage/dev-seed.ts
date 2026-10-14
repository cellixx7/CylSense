import syn0001 from "../../../../fixtures/valorant/syn-0001.json";
import syn0002 from "../../../../fixtures/valorant/syn-0002.json";
import { normalizeSyntheticMatch } from "@/domain/synthetic";
import type { LocalStore, SaveMatchOutcome } from "./local-store";

/** Caminho ficticio: so a referencia e gravada; nenhum arquivo e lido. */
export const DEV_SEED_VIDEO_PATH = "C:\CYL-Sense-dev\synthetic-demo.mp4";

export interface DevSeedReport {
  matches: { externalId: string; id: string; outcome: SaveMatchOutcome }[];
  videoCreated: boolean;
  markersAdded: number;
}

/**
 * Fluxo de teste controlado do P0-03 (somente em desenvolvimento): grava as
 * fixtures sinteticas, uma referencia de video e uma marcacao. Idempotente:
 * rodar de novo nao duplica nada. Nao e importacao de usuario (P0-04).
 */
export async function seedSyntheticData(store: LocalStore): Promise<DevSeedReport> {
  const report: DevSeedReport = { matches: [], videoCreated: false, markersAdded: 0 };
  for (const raw of [syn0001, syn0002]) {
    const normalized = normalizeSyntheticMatch(raw);
    if (!normalized.ok) throw new Error(normalized.error.message);
    const saved = await store.saveMatch(normalized.value);
    if (!saved.ok) throw new Error(`${saved.error.code}: ${saved.error.message}`);
    report.matches.push({ externalId: normalized.value.externalId, ...saved.value });
  }
  const first = report.matches[0];
  if (!first) return report;
  const attached = await store.attachVideo({ matchId: first.id, localPath: DEV_SEED_VIDEO_PATH, durationMs: 600_000, offsetMs: 2_000 });
  if (!attached.ok) throw new Error(`${attached.error.code}: ${attached.error.message}`);
  report.videoCreated = attached.value.created;
  const markers = await store.listMarkers(attached.value.video.id);
  if (!markers.ok) throw new Error(`${markers.error.code}: ${markers.error.message}`);
  if (markers.value.length === 0) {
    const added = await store.addMarker({ videoId: attached.value.video.id, timestampMs: 15_000, label: "Marcacao sintetica", roundNumber: 1 });
    if (!added.ok) throw new Error(`${added.error.code}: ${added.error.message}`);
    report.markersAdded = 1;
  }
  return report;
}
