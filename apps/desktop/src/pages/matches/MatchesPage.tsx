import { useState } from "react";
import type { ImportLimits } from "@/import/import-file";
import type { PickFile } from "@/import/picker";
import type { LocalStore } from "@/storage/local-store";
import { MatchDetail } from "./MatchDetail";
import { MatchHistory } from "./MatchHistory";
import { MatchImport } from "./MatchImport";

type View = { kind: "history" } | { kind: "import" } | { kind: "detail"; id: string };

/**
 * Secao Partidas (P0-04): historico local, importacao de arquivo e detalhe.
 * `store`/`pickFile` sao `null` fora do app Tauri (navegador, testes sem mocks).
 */
export function MatchesPage({
  store,
  pickFile,
  limits,
  onDataChanged,
}: {
  store: LocalStore | null;
  pickFile: PickFile | null;
  limits?: ImportLimits;
  onDataChanged?: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "history" });
  const history = () => setView({ kind: "history" });
  const open = (id: string) => setView({ kind: "detail", id });

  if (!store || !pickFile) {
    return (
      <section aria-labelledby="page-title" className="mx-auto max-w-2xl p-10">
        <h1 id="page-title" className="mb-4 text-2xl font-semibold tracking-tight">
          Partidas
        </h1>
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          O historico e a importacao funcionam somente no aplicativo desktop: as partidas ficam no banco local deste
          computador.
        </p>
      </section>
    );
  }

  switch (view.kind) {
    case "history":
      return <MatchHistory store={store} onImport={() => setView({ kind: "import" })} onOpen={open} />;
    case "import":
      return (
        <MatchImport
          store={store}
          pickFile={pickFile}
          {...(limits ? { limits } : {})}
          onImported={() => onDataChanged?.()}
          onBack={history}
          onOpen={open}
        />
      );
    case "detail":
      return <MatchDetail store={store} id={view.id} onBack={history} />;
  }
}
