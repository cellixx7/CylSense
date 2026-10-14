import {
  LOCAL_IMPORT_KIND,
  LocalImportEnvelope,
  SCHEMA_VERSION,
  type DataOrigin,
  type Match,
} from "@cyl/contracts";
import { describeIssues, err, ok, type Result } from "@cyl/core";
import { SYNTHETIC_FORMAT } from "@cyl/game-adapter-valorant";
import { normalizeSyntheticMatch } from "@/domain/synthetic";
import type { LocalStore, SaveMatchOutcome, StorageErrorCode } from "@/storage/local-store";

/**
 * Importacao de partidas a partir de um arquivo local (P0-04).
 *
 * Arquivo -> limites -> JSON -> formato reconhecido -> Zod/adaptador -> Match
 * validado -> `LocalStore.saveMatches` (lote atomico no SQLite). Nada e gravado
 * se qualquer etapa falhar. Ver docs/architecture/match-import.md.
 */

export interface ImportLimits {
  /** Tamanho maximo do arquivo, em bytes (o Rust aplica um teto de 20 MiB). */
  maxBytes: number;
  /** Maximo de partidas por arquivo (o Rust aceita ate 200 por lote). */
  maxMatches: number;
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = { maxBytes: 5 * 1024 * 1024, maxMatches: 200 };

/** Arquivo escolhido pelo usuario, ja lido como texto pelo lado nativo. */
export interface PickedFile {
  name: string;
  sizeBytes: number;
  content: string;
}

export type ImportErrorCode =
  // leitura do arquivo (lado nativo)
  | "unsupported_file"
  | "too_large"
  | "not_found"
  | "permission_denied"
  | "not_utf8"
  | "read_failed"
  // validacao do conteudo
  | "invalid_json"
  | "unsupported_format"
  | "incompatible_version"
  | "invalid_origin"
  | "invalid_data"
  | "duplicate_in_file"
  | "too_many_matches"
  // gravacao
  | "storage";

/** Erro seguro para a UI: nunca contem trechos do arquivo nem caminhos. */
export interface ImportError {
  code: ImportErrorCode;
  message: string;
  storageCode?: StorageErrorCode;
}

export type ImportFormat = typeof SYNTHETIC_FORMAT | typeof LOCAL_IMPORT_KIND;

export const SUPPORTED_FORMATS: readonly { format: ImportFormat; version: number; description: string }[] = [
  { format: SYNTHETIC_FORMAT, version: 1, description: "partida sintetica de VALORANT (fixtures do CYL Sense)" },
  { format: LOCAL_IMPORT_KIND, version: SCHEMA_VERSION, description: "pacote local do CYL Sense com partidas normalizadas" },
];

/** Resultado da validacao, exibido antes de confirmar a gravacao. */
export interface ImportPlan {
  fileName: string;
  sizeBytes: number;
  format: ImportFormat;
  origin: DataOrigin;
  matches: Match[];
}

export interface ImportReport {
  items: { id: string; externalId: string; map: string; startedAt: string; outcome: SaveMatchOutcome }[];
  counts: Record<SaveMatchOutcome, number>;
}

const fail = (code: ImportErrorCode, message: string) => err<ImportError>({ code, message });

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

const kib = (bytes: number) => Math.ceil(bytes / 1024);

function checkFile(file: PickedFile, limits: ImportLimits): Result<void, ImportError> {
  if (!/\.json$/i.test(file.name)) return fail("unsupported_file", "somente arquivos .json sao aceitos");
  if (file.sizeBytes > limits.maxBytes || utf8Length(file.content) > limits.maxBytes) {
    return fail("too_large", `arquivo maior que o limite de ${kib(limits.maxBytes)} KB`);
  }
  return ok(undefined);
}

function parseJson(content: string): Result<unknown, ImportError> {
  try {
    return ok(JSON.parse(content) as unknown);
  } catch {
    // A mensagem do JSON.parse pode citar trechos do arquivo: nao e repassada.
    return fail("invalid_json", "o arquivo nao contem JSON valido");
  }
}

function fromSynthetic(raw: Record<string, unknown>, newId: () => string): Result<Match[], ImportError> {
  if (raw.formatVersion !== 1) {
    return fail("incompatible_version", `versao do formato ${SYNTHETIC_FORMAT} nao suportada (aceita: 1)`);
  }
  const normalized = normalizeSyntheticMatch(raw, newId);
  return normalized.ok ? ok([normalized.value]) : fail("invalid_data", normalized.error.message);
}

function fromBundle(raw: Record<string, unknown>, newId: () => string): Result<Match[], ImportError> {
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return fail("incompatible_version", `schemaVersion do pacote nao suportado (aceito: ${SCHEMA_VERSION})`);
  }
  if (raw.origin === "riot_api") {
    return fail(
      "invalid_origin",
      "um arquivo local nao pode declarar origem riot_api: dados oficiais so chegam pela integracao autorizada",
    );
  }
  const parsed = LocalImportEnvelope.safeParse(raw);
  if (!parsed.success) return fail("invalid_data", `pacote invalido: ${describeIssues(parsed.error.issues)}`);
  const env = parsed.data;
  if (env.videos.length > 0 || env.markers.length > 0) {
    return fail("unsupported_format", "pacotes com videos ou marcacoes ainda nao sao importados");
  }
  // O id local e do banco de quem exportou: gera-se um novo para nao colidir.
  // A identidade da partida continua sendo (game, origin, externalId).
  return ok(env.matches.map((m) => ({ ...m, id: newId() })));
}

/** Valida o arquivo e devolve as partidas prontas para gravar. Nao grava nada. */
export function planImport(
  file: PickedFile,
  options: { limits?: ImportLimits; newId?: () => string } = {},
): Result<ImportPlan, ImportError> {
  const limits = options.limits ?? DEFAULT_IMPORT_LIMITS;
  const newId = options.newId ?? (() => crypto.randomUUID());

  const checked = checkFile(file, limits);
  if (!checked.ok) return checked;
  const json = parseJson(file.content);
  if (!json.ok) return json;
  const raw = json.value;
  if (!isPlainObject(raw)) return fail("unsupported_format", "o arquivo nao e um objeto JSON de partida");

  let format: ImportFormat;
  let matches: Result<Match[], ImportError>;
  if (raw.format === SYNTHETIC_FORMAT) {
    format = SYNTHETIC_FORMAT;
    matches = fromSynthetic(raw, newId);
  } else if (raw.kind === LOCAL_IMPORT_KIND) {
    format = LOCAL_IMPORT_KIND;
    matches = fromBundle(raw, newId);
  } else {
    const accepted = SUPPORTED_FORMATS.map((f) => `${f.format} v${f.version}`).join(", ");
    return fail("unsupported_format", `formato nao reconhecido (aceitos: ${accepted})`);
  }
  if (!matches.ok) return matches;

  const list = matches.value;
  if (list.length === 0) return fail("invalid_data", "o arquivo nao contem partidas");
  if (list.length > limits.maxMatches) {
    return fail("too_many_matches", `o arquivo tem mais de ${limits.maxMatches} partidas`);
  }
  const identities = new Set(list.map((m) => `${m.game}\u0000${m.origin}\u0000${m.externalId}`));
  if (identities.size !== list.length) return fail("duplicate_in_file", "a mesma partida aparece mais de uma vez no arquivo");
  const origins = new Set(list.map((m) => m.origin));
  const [origin] = origins;
  if (origin === undefined || origins.size !== 1) return fail("invalid_origin", "partidas com origens diferentes no mesmo arquivo");
  if (origin === "riot_api") return fail("invalid_origin", "um arquivo local nao pode conter partidas com origem riot_api");

  return ok({ fileName: file.name, sizeBytes: file.sizeBytes, format, origin, matches: list });
}

/** Grava o plano validado. Lote atomico: ou todas as partidas, ou nenhuma. */
export async function commitImport(store: LocalStore, plan: ImportPlan): Promise<Result<ImportReport, ImportError>> {
  const saved = await store.saveMatches(plan.matches);
  if (!saved.ok) {
    return err({
      code: "storage",
      message: `nada foi gravado: ${saved.error.message}`,
      storageCode: saved.error.code,
    });
  }
  const counts: Record<SaveMatchOutcome, number> = { inserted: 0, unchanged: 0, updated: 0 };
  const items = plan.matches.map((m, i) => {
    const r = saved.value[i];
    if (!r) throw new Error("resposta de gravacao incompleta");
    counts[r.outcome]++;
    return { id: r.id, externalId: m.externalId, map: m.map, startedAt: m.startedAt, outcome: r.outcome };
  });
  return ok({ items, counts });
}
