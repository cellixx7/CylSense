import { invoke, isTauri } from "@tauri-apps/api/core";
import { createLocalStore, type LocalStore } from "./local-store";

/** Repositorio local ligado aos comandos Rust, ou `null` fora do app Tauri (navegador, testes). */
export function nativeLocalStore(): LocalStore | null {
  return isTauri() ? createLocalStore((command, args) => invoke(command, args)) : null;
}
