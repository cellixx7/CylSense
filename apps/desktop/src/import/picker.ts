import { invoke, isTauri } from "@tauri-apps/api/core";
import { err, ok, type Result } from "@cyl/core";
import type { Invoke } from "@/storage/local-store";
import type { ImportError, ImportErrorCode, PickedFile } from "./import-file";

/** Abre o seletor de arquivo. `null` = o usuario cancelou. */
export type PickFile = (maxBytes: number) => Promise<Result<PickedFile | null, ImportError>>;

const NATIVE_CODES: readonly ImportErrorCode[] = [
  "unsupported_file",
  "too_large",
  "not_found",
  "permission_denied",
  "not_utf8",
  "read_failed",
];

const READ_FAILED: ImportError = { code: "read_failed", message: "nao foi possivel ler o arquivo" };

export function toImportFileError(e: unknown): ImportError {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const { code, message } = e as { code: unknown; message: unknown };
    if (NATIVE_CODES.includes(code as ImportErrorCode) && typeof message === "string") {
      return { code: code as ImportErrorCode, message };
    }
  }
  return READ_FAILED;
}

function parsePicked(v: unknown): Result<PickedFile | null, ImportError> {
  if (v === null) return ok(null);
  if (typeof v !== "object") return err(READ_FAILED);
  const { name, sizeBytes, content } = v as Record<string, unknown>;
  if (typeof name !== "string" || !Number.isSafeInteger(sizeBytes) || typeof content !== "string") return err(READ_FAILED);
  return ok({ name, sizeBytes: sizeBytes as number, content });
}

/** O dialogo e a leitura ficam no Rust (`import_pick_file`): nenhum caminho sai do front-end. */
export function createFilePicker(call: Invoke): PickFile {
  return async (maxBytes) => {
    try {
      return parsePicked(await call("import_pick_file", { maxBytes }));
    } catch (e) {
      return err(toImportFileError(e));
    }
  };
}

/** Seletor nativo, ou `null` fora do app Tauri (navegador, testes). */
export function nativeFilePicker(): PickFile | null {
  return isTauri() ? createFilePicker((command, args) => invoke(command, args)) : null;
}
