import { Loader2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LocalStore, MatchListItem, StorageError } from "@/storage/local-store";
import { describeResult, formatDateTime, GAME_LABEL, OriginBadge } from "./format";

type HistoryState = { kind: "loading" } | { kind: "error"; error: StorageError } | { kind: "ready"; items: MatchListItem[] };

export function MatchHistory({
  store,
  onImport,
  onOpen,
}: {
  store: LocalStore;
  onImport: () => void;
  onOpen: (id: string) => void;
}) {
  const [state, setState] = useState<HistoryState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const r = await store.listMatches({ limit: 200 });
    setState(r.ok ? { kind: "ready", items: r.value } : { kind: "error", error: r.error });
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-5xl p-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            Partidas
          </h1>
          <p className="text-sm text-muted-foreground">Historico salvo no banco local deste computador.</p>
        </div>
        <Button onClick={onImport}>
          <Upload className="size-4" aria-hidden="true" />
          Importar partida
        </Button>
      </div>

      {state.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Carregando partidas...
        </p>
      )}

      {state.kind === "error" && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm">
          <p className="font-medium">Nao foi possivel carregar o historico.</p>
          <p className="mt-1 text-muted-foreground">{state.error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {state.kind === "ready" && state.items.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm">
          <p className="font-medium">Nenhuma partida importada ainda.</p>
          <p className="mt-1 text-muted-foreground">
            Use <strong>Importar partida</strong> para adicionar um arquivo JSON compativel. Os dados ficam somente neste
            computador.
          </p>
        </div>
      )}

      {state.kind === "ready" && state.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Partidas importadas, mais recentes primeiro</caption>
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Partida</th>
                <th scope="col" className="px-4 py-2 font-medium">Jogo</th>
                <th scope="col" className="px-4 py-2 font-medium">Data</th>
                <th scope="col" className="px-4 py-2 font-medium">Resultado</th>
                <th scope="col" className="px-4 py-2 font-medium">Origem</th>
                <th scope="col" className="px-4 py-2 font-medium">Importada em</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => onOpen(m.id)}
                      className="rounded text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {m.map} · {m.mode}
                    </button>
                    <span className="block text-xs text-muted-foreground">{m.externalId}</span>
                  </td>
                  <td className="px-4 py-2">{GAME_LABEL[m.game] ?? m.game}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(m.startedAt)}</td>
                  <td className="px-4 py-2">{describeResult(m.result)}</td>
                  <td className="px-4 py-2">
                    <OriginBadge origin={m.origin} />
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDateTime(m.importedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
