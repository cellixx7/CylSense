import { useEffect, useState } from "react";
import { nativeLocalStore } from "./native";
import type { StorageStatus } from "./local-store";

/** Uma execucao por carga da pagina (o StrictMode monta o efeito duas vezes). */
let seedOnce: Promise<void> | undefined;

export type StorageStatusView = { kind: "browser" } | { kind: "loading" } | { kind: "ready"; status: StorageStatus };

/** Estado do banco local para o rodape (diagnostico, nao e tela de dados). */
/** `refreshKey`: mudar o valor recarrega o status (ex.: depois de uma importacao). */
export function useStorageStatus(refreshKey = 0): StorageStatusView {
  const [view, setView] = useState<StorageStatusView>(() => (nativeLocalStore() ? { kind: "loading" } : { kind: "browser" }));

  useEffect(() => {
    const store = nativeLocalStore();
    if (!store) return;
    let alive = true;
    const load = async () => {
      if (import.meta.env.DEV && import.meta.env.VITE_CYL_DEV_SEED === "1") {
        seedOnce ??= import("./dev-seed")
          .then(({ seedSyntheticData }) => seedSyntheticData(store))
          .then((report) => console.info("[cyl-storage] semente sintetica", report))
          .catch((e: unknown) => console.error("[cyl-storage] falha na semente sintetica", e));
        await seedOnce;
      }
      const r = await store.status();
      if (alive) {
        setView({
          kind: "ready",
          status: r.ok ? r.value : { available: false, supportedSchemaVersion: 0, error: r.error },
        });
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return view;
}

export function describeStorage(view: StorageStatusView): string {
  switch (view.kind) {
    case "browser":
      return "banco local so no app";
    case "loading":
      return "banco ...";
    case "ready": {
      const { status } = view;
      if (!status.available) return "banco indisponivel";
      const n = status.counts?.matches ?? 0;
      return `banco v${status.schemaVersion ?? "?"} · ${n} ${n === 1 ? "partida" : "partidas"}`;
    }
  }
}
