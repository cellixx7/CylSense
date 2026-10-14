import { CheckCircle2, FileJson, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  commitImport,
  DEFAULT_IMPORT_LIMITS,
  planImport,
  SUPPORTED_FORMATS,
  type ImportError,
  type ImportLimits,
  type ImportPlan,
  type ImportReport,
} from "@/import/import-file";
import type { PickFile } from "@/import/picker";
import type { LocalStore } from "@/storage/local-store";
import { formatBytes, formatDateTime, OriginBadge, OUTCOME_LABEL, SyntheticNotice } from "./format";

type ImportState =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "preview"; plan: ImportPlan }
  | { step: "saving"; plan: ImportPlan }
  | { step: "done"; plan: ImportPlan; report: ImportReport }
  | { step: "failed"; error: ImportError; fileName?: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function MatchImport({
  store,
  pickFile,
  limits = DEFAULT_IMPORT_LIMITS,
  onImported,
  onBack,
  onOpen,
}: {
  store: LocalStore;
  pickFile: PickFile;
  limits?: ImportLimits;
  /** Chamado depois de uma gravacao bem-sucedida (atualiza historico e rodape). */
  onImported: () => void;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [state, setState] = useState<ImportState>({ step: "idle" });

  async function choose() {
    setState({ step: "reading" });
    const picked = await pickFile(limits.maxBytes);
    if (!picked.ok) return setState({ step: "failed", error: picked.error });
    if (picked.value === null) return setState({ step: "idle" });
    const plan = planImport(picked.value, { limits });
    setState(plan.ok ? { step: "preview", plan: plan.value } : { step: "failed", error: plan.error, fileName: picked.value.name });
  }

  async function confirm(plan: ImportPlan) {
    setState({ step: "saving", plan });
    const r = await commitImport(store, plan);
    if (!r.ok) return setState({ step: "failed", error: r.error, fileName: plan.fileName });
    setState({ step: "done", plan, report: r.value });
    onImported();
  }

  const busy = state.step === "reading" || state.step === "saving";

  return (
    <section aria-labelledby="page-title" aria-busy={busy} className="mx-auto max-w-3xl p-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Importar partida
        </h1>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Voltar ao historico
        </Button>
      </div>

      <div aria-live="polite" className="space-y-4">
        {state.step === "idle" && (
          <div className="space-y-4 rounded-lg border bg-card p-6 text-sm">
            <p>Escolha um arquivo JSON neste computador. Ele e validado antes de qualquer gravacao.</p>
            <div>
              <p className="font-medium">Formatos aceitos</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {SUPPORTED_FORMATS.map((f) => (
                  <li key={f.format}>
                    <code>{f.format}</code> v{f.version}: {f.description}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">
                Tamanho maximo: {formatBytes(limits.maxBytes)}. Nao sao aceitos arquivos da Riot nem de outros programas.
              </p>
            </div>
            <Button onClick={() => void choose()}>
              <FileJson className="size-4" aria-hidden="true" />
              Escolher arquivo JSON
            </Button>
          </div>
        )}

        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {state.step === "reading" ? "Lendo e validando o arquivo..." : "Gravando no banco local..."}
          </p>
        )}

        {state.step === "preview" && (
          <div className="space-y-4 rounded-lg border bg-card p-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
              <p className="font-medium">Arquivo valido: {plural(state.plan.matches.length, "partida pronta", "partidas prontas")} para importar.</p>
            </div>
            <PlanSummary plan={state.plan} />
            <div className="flex gap-2">
              <Button onClick={() => void confirm(state.plan)}>
                Importar {plural(state.plan.matches.length, "partida", "partidas")}
              </Button>
              <Button variant="outline" onClick={() => setState({ step: "idle" })}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {state.step === "done" && <ImportDone report={state.report} onOpen={onOpen} />}

        {state.step === "failed" && (
          <div role="alert" className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-6 text-sm">
            <p className="font-medium">{state.error.code === "storage" ? "Falha ao gravar no banco local" : "Arquivo recusado"}</p>
            {state.fileName && <p className="text-muted-foreground">Arquivo: {state.fileName}</p>}
            <p>{capitalize(state.error.message)}.</p>
            <p className="text-muted-foreground">Nenhuma partida foi gravada.</p>
          </div>
        )}

        {(state.step === "done" || state.step === "failed") && (
          <div className="flex gap-2">
            <Button onClick={onBack}>Voltar ao historico</Button>
            <Button variant="outline" onClick={() => void choose()}>
              {state.step === "done" ? "Importar outro arquivo" : "Escolher outro arquivo"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function PlanSummary({ plan }: { plan: ImportPlan }) {
  return (
    <>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Arquivo</dt>
        <dd>
          {plan.fileName} ({formatBytes(plan.sizeBytes)})
        </dd>
        <dt className="text-muted-foreground">Formato</dt>
        <dd>
          <code>{plan.format}</code>
        </dd>
        <dt className="text-muted-foreground">Origem</dt>
        <dd>
          <OriginBadge origin={plan.origin} />
        </dd>
      </dl>
      {plan.origin === "synthetic" && <SyntheticNotice />}
      <ul className="divide-y rounded-md border">
        {plan.matches.map((m) => (
          <li key={m.externalId} className="flex justify-between gap-4 px-3 py-2">
            <span>
              {m.map} · {m.mode} <span className="text-xs text-muted-foreground">({m.externalId})</span>
            </span>
            <span className="text-muted-foreground">
              {formatDateTime(m.startedAt)} · {plural(m.rounds.length, "rodada", "rodadas")}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ImportDone({ report, onOpen }: { report: ImportReport; onOpen: (id: string) => void }) {
  const { inserted, unchanged, updated } = report.counts;
  const nothingNew = inserted === 0 && updated === 0;
  return (
    <div role="status" className="space-y-3 rounded-lg border bg-card p-6 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
        {nothingNew ? "Nenhuma partida nova: o arquivo ja tinha sido importado." : "Importacao concluida."}
      </p>
      <p className="text-muted-foreground">
        {plural(inserted, "nova", "novas")} · {plural(unchanged, "ja importada", "ja importadas")} ·{" "}
        {plural(updated, "atualizada", "atualizadas")}
      </p>
      <ul className="divide-y rounded-md border">
        {report.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 px-3 py-2">
            <span>
              {item.map} <span className="text-xs text-muted-foreground">({item.externalId})</span> — {OUTCOME_LABEL[item.outcome]}
            </span>
            <Button variant="ghost" size="sm" onClick={() => onOpen(item.id)}>
              Abrir
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
