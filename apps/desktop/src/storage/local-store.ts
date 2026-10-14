import {
  CONTRACTS_VERSION,
  IsoDateTime,
  Match,
  MatchResult,
  MatchSummary,
  VideoMarker,
  VideoReference,
} from "@cyl/contracts";
import { describeIssues, err, ok, type Result, type SafeParser } from "@cyl/core";

/**
 * Repositorio local do desktop (P0-03). Fala com os comandos Rust do Tauri;
 * nunca envia SQL. Toda partida e validada com o contrato `Match` antes de
 * gravar e depois de ler; respostas do lado nativo tambem sao validadas.
 */

export type StorageErrorCode =
  | "unavailable"
  | "corrupt"
  | "incompatible_schema"
  | "migration_failed"
  | "invalid_data"
  | "not_found"
  | "conflict"
  | "write_failed";

export interface StorageError {
  code: StorageErrorCode;
  message: string;
}

export type SaveMatchOutcome = "inserted" | "unchanged" | "updated";

export interface StoredMatch {
  id: string;
  externalId: string;
  /** Versao dos contratos usada ao gravar (independente do schema SQLite). */
  contractsVersion: string;
  matchSchemaVersion: number;
  importedAt: string;
  updatedAt: string;
  match: Match;
}

export type MatchListItem = MatchSummary & {
  externalId: string;
  /** Placar gravado; ausente = nao informado pela origem. */
  result?: MatchResult;
  importedAt: string;
  updatedAt: string;
};

/** `VideoReference` + caminho local (fica so no desktop). */
export type StoredVideo = VideoReference & { localPath: string; updatedAt: string };
export type StoredMarker = VideoMarker & { updatedAt: string };

export interface StorageStatus {
  available: boolean;
  /** Versao do schema SQLite (`user_version`). */
  schemaVersion?: number;
  supportedSchemaVersion: number;
  counts?: { matches: number; videos: number; markers: number };
  error?: StorageError;
}

export interface AttachVideoInput {
  matchId?: string;
  localPath: string;
  durationMs: number;
  offsetMs: number;
}

export interface MarkerInput {
  videoId: string;
  timestampMs: number;
  label: string;
  description?: string;
  roundNumber?: number;
}

export interface MarkerUpdate {
  id: string;
  timestampMs: number;
  label: string;
  description?: string;
  roundNumber?: number;
}

export interface LocalStore {
  status(): Promise<Result<StorageStatus, StorageError>>;
  saveMatch(match: Match): Promise<Result<{ id: string; outcome: SaveMatchOutcome }, StorageError>>;
  /** Lote atomico: todas as partidas sao gravadas, ou nenhuma. */
  saveMatches(matches: Match[]): Promise<Result<{ id: string; outcome: SaveMatchOutcome }[], StorageError>>;
  getMatch(id: string): Promise<Result<StoredMatch | null, StorageError>>;
  listMatches(page?: { limit?: number; offset?: number }): Promise<Result<MatchListItem[], StorageError>>;
  attachVideo(input: AttachVideoInput): Promise<Result<{ video: StoredVideo; created: boolean }, StorageError>>;
  listVideos(matchId: string): Promise<Result<StoredVideo[], StorageError>>;
  addMarker(input: MarkerInput): Promise<Result<StoredMarker, StorageError>>;
  listMarkers(videoId: string): Promise<Result<StoredMarker[], StorageError>>;
  updateMarker(input: MarkerUpdate): Promise<Result<StoredMarker, StorageError>>;
  deleteMarker(id: string): Promise<Result<void, StorageError>>;
}

export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const ERROR_CODES: readonly StorageErrorCode[] = [
  "unavailable",
  "corrupt",
  "incompatible_schema",
  "migration_failed",
  "invalid_data",
  "not_found",
  "conflict",
  "write_failed",
];

const fail = (code: StorageErrorCode, message: string) => err<StorageError>({ code, message });

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isDate = (v: unknown): v is string => IsoDateTime.safeParse(v).success;

/** Erro devolvido pelo comando Rust, ou um erro generico se o formato nao bater. */
export function toStorageError(e: unknown): StorageError {
  if (isObj(e) && ERROR_CODES.includes(e.code as StorageErrorCode) && typeof e.message === "string") {
    return { code: e.code as StorageErrorCode, message: e.message };
  }
  return { code: "unavailable", message: "falha na comunicacao com o armazenamento local" };
}

/** Resposta nativa fora do formato esperado e tratada como dado corrompido. */
function parse<T>(schema: SafeParser<T>, value: unknown, label: string): Result<T, StorageError> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail("corrupt", `${label}: ${describeIssues(r.error.issues)}`);
}

function localFields(v: unknown, keys: readonly string[], label: string): Result<Obj, StorageError> {
  if (!isObj(v)) return fail("corrupt", `${label}: resposta invalida`);
  for (const k of keys) {
    const ok_ = k === "localPath" ? isStr(v[k]) : isDate(v[k]);
    if (!ok_) return fail("corrupt", `${label}: campo ${k} invalido`);
  }
  return ok(v);
}

export function parseStoredMatch(v: unknown): Result<StoredMatch, StorageError> {
  const base = localFields(v, ["importedAt", "updatedAt"], "partida gravada");
  if (!base.ok) return base;
  const o = base.value;
  if (!isStr(o.id) || !isStr(o.externalId) || !isStr(o.contractsVersion) || !isInt(o.matchSchemaVersion)) {
    return fail("corrupt", "partida gravada: metadados invalidos");
  }
  const match = parse(Match, o.match, "partida gravada nao respeita o contrato Match");
  if (!match.ok) return match;
  if (match.value.id !== o.id || match.value.externalId !== o.externalId) {
    return fail("corrupt", "partida gravada: identidade divergente");
  }
  return ok({
    id: o.id,
    externalId: o.externalId,
    contractsVersion: o.contractsVersion,
    matchSchemaVersion: o.matchSchemaVersion,
    importedAt: o.importedAt as string,
    updatedAt: o.updatedAt as string,
    match: match.value,
  });
}

function parseListItem(v: unknown): Result<MatchListItem, StorageError> {
  const base = localFields(v, ["importedAt", "updatedAt"], "listagem");
  if (!base.ok) return base;
  const summary = parse(MatchSummary, v, "listagem");
  if (!summary.ok) return summary;
  const { externalId, result } = base.value;
  if (!isStr(externalId)) return fail("corrupt", "listagem: campo externalId invalido");
  const item: MatchListItem = {
    ...summary.value,
    externalId,
    importedAt: base.value.importedAt as string,
    updatedAt: base.value.updatedAt as string,
  };
  if (result !== undefined) {
    const parsed = parse(MatchResult, result, "listagem: placar");
    if (!parsed.ok) return parsed;
    item.result = parsed.value;
  }
  return ok(item);
}

export function parseStoredVideo(v: unknown): Result<StoredVideo, StorageError> {
  const base = localFields(v, ["localPath", "updatedAt"], "video gravado");
  if (!base.ok) return base;
  const video = parse(VideoReference, v, "video gravado");
  if (!video.ok) return video;
  return ok({ ...video.value, localPath: base.value.localPath as string, updatedAt: base.value.updatedAt as string });
}

export function parseStoredMarker(v: unknown): Result<StoredMarker, StorageError> {
  const base = localFields(v, ["updatedAt"], "marcacao gravada");
  if (!base.ok) return base;
  const marker = parse(VideoMarker, v, "marcacao gravada");
  if (!marker.ok) return marker;
  return ok({ ...marker.value, updatedAt: base.value.updatedAt as string });
}

function parseList<T>(v: unknown, item: (x: unknown) => Result<T, StorageError>): Result<T[], StorageError> {
  if (!Array.isArray(v)) return fail("corrupt", "lista invalida");
  const out: T[] = [];
  for (const x of v) {
    const r = item(x);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

function parseStatus(v: unknown): Result<StorageStatus, StorageError> {
  if (!isObj(v) || typeof v.available !== "boolean" || !isInt(v.supportedSchemaVersion)) {
    return fail("corrupt", "status do armazenamento invalido");
  }
  const status: StorageStatus = { available: v.available, supportedSchemaVersion: v.supportedSchemaVersion };
  if (isInt(v.schemaVersion)) status.schemaVersion = v.schemaVersion;
  const c = v.counts;
  if (isObj(c) && isInt(c.matches) && isInt(c.videos) && isInt(c.markers)) {
    status.counts = { matches: c.matches, videos: c.videos, markers: c.markers };
  }
  if (v.error !== undefined) status.error = toStorageError(v.error);
  return ok(status);
}

const OUTCOMES: readonly SaveMatchOutcome[] = ["inserted", "unchanged", "updated"];

type SaveInput = { match: Match; contractsVersion: string };

function saveInput(match: Match): Result<SaveInput, StorageError> {
  const valid = Match.safeParse(match);
  if (!valid.success) return fail("invalid_data", `partida invalida: ${describeIssues(valid.error.issues)}`);
  return ok({ match: valid.data, contractsVersion: CONTRACTS_VERSION });
}

function parseSaveResult(v: unknown): Result<{ id: string; outcome: SaveMatchOutcome }, StorageError> {
  return isObj(v) && isStr(v.id) && OUTCOMES.includes(v.outcome as SaveMatchOutcome)
    ? ok({ id: v.id, outcome: v.outcome as SaveMatchOutcome })
    : fail("corrupt", "resposta de gravacao invalida");
}

export function createLocalStore(invoke: Invoke): LocalStore {
  async function call<T>(command: string, args: Record<string, unknown>, decode: (v: unknown) => Result<T, StorageError>) {
    let raw: unknown;
    try {
      raw = await invoke(command, args);
    } catch (e) {
      return err(toStorageError(e));
    }
    return decode(raw);
  }

  return {
    status: () => call("storage_status", {}, parseStatus),

    async saveMatch(match) {
      const input = saveInput(match);
      if (!input.ok) return input;
      return call("match_save", { input: input.value }, parseSaveResult);
    },

    async saveMatches(matches) {
      const inputs: SaveInput[] = [];
      for (const [i, match] of matches.entries()) {
        const input = saveInput(match);
        if (!input.ok) return fail(input.error.code, `item ${i + 1}: ${input.error.message}`);
        inputs.push(input.value);
      }
      return call("match_save_batch", { inputs }, (v) =>
        Array.isArray(v) && v.length === inputs.length ? parseList(v, parseSaveResult) : fail("corrupt", "resposta de gravacao invalida"),
      );
    },

    getMatch: (id) => call("match_get", { id }, (v) => (v === null ? ok(null) : parseStoredMatch(v))),

    listMatches: (page = {}) =>
      call("match_list", { limit: page.limit ?? 50, offset: page.offset ?? 0 }, (v) => parseList(v, parseListItem)),

    attachVideo: (input) =>
      call("video_attach", { input: { matchId: input.matchId ?? null, ...withoutMatchId(input) } }, (v) => {
        if (!isObj(v) || typeof v.created !== "boolean") return fail("corrupt", "resposta de video invalida");
        const video = parseStoredVideo(v.video);
        return video.ok ? ok({ video: video.value, created: v.created }) : video;
      }),

    listVideos: (matchId) => call("video_list", { matchId }, (v) => parseList(v, parseStoredVideo)),

    addMarker: (input) => call("marker_add", { input: markerArgs(input) }, parseStoredMarker),

    listMarkers: (videoId) => call("marker_list", { videoId }, (v) => parseList(v, parseStoredMarker)),

    updateMarker: (input) => call("marker_update", { input: { id: input.id, ...markerFields(input) } }, parseStoredMarker),

    deleteMarker: (id) => call("marker_delete", { id }, () => ok(undefined)),
  };
}

function withoutMatchId({ localPath, durationMs, offsetMs }: AttachVideoInput) {
  return { localPath, durationMs, offsetMs };
}

function markerFields(input: Omit<MarkerInput, "videoId">) {
  return {
    timestampMs: input.timestampMs,
    label: input.label,
    description: input.description ?? null,
    roundNumber: input.roundNumber ?? null,
  };
}

function markerArgs(input: MarkerInput) {
  return { videoId: input.videoId, ...markerFields(input) };
}
