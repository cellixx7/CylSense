import { metricDefinition, type MetricValue, type UnavailableReason } from "@cyl/analytics";
import type { Match } from "@cyl/contracts";
import { useId, useMemo, useState } from "react";
import { analyzeLoadedMatch } from "@/analytics/analytics-service";

/**
 * Previa tecnica do Analytics Engine (P0-05) no detalhe da partida: prova a
 * integracao com o motor local. O painel definitivo e o P0-06.
 */

const REASON_LABEL: Record<UnavailableReason, string> = {
  missing_data: "Nao informado",
  zero_denominator: "Indefinido (divisao por zero)",
  partial_event_coverage: "Requer cobertura completa de eventos",
  no_rounds: "Sem rodadas registradas",
};

const decimal = (digits: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const integer = decimal(0);
const twoDigits = decimal(2);
const oneDigit = decimal(1);

export function formatMetric(m: Extract<MetricValue, { status: "available" }>): string {
  if (m.unit === "count") return integer.format(m.value);
  if (m.key === "kd_ratio" || m.key === "kda_ratio") return twoDigits.format(m.value);
  if (m.unit === "ratio") return percent.format(m.value);
  return (m.key === "damage_per_round" ? oneDigit : twoDigits).format(m.value);
}

function detailOf(m: Extract<MetricValue, { status: "available" }>): string {
  if (m.numerator !== undefined && m.denominator !== undefined) {
    return `${integer.format(m.numerator)} / ${integer.format(m.denominator)}`;
  }
  return m.key === "first_kills" || m.key === "first_deaths" ? `${m.sampleSize} rodadas determinaveis` : "";
}

export function MatchAnalytics({ match }: { match: Match }) {
  const selectId = useId();
  const initial = match.participants.find((p) => p.gameAccountId !== undefined) ?? match.participants[0];
  const [playerRef, setPlayerRef] = useState(initial?.playerRef ?? "");
  const result = useMemo(() => analyzeLoadedMatch(match, playerRef), [match, playerRef]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Calculado no computador pelo motor local, a partir dos dados importados. Previa tecnica: o painel completo vem no proximo passo.
      </p>
      <label htmlFor={selectId} className="flex items-center gap-2 text-sm">
        Jogador
        <select
          id={selectId}
          value={playerRef}
          onChange={(e) => setPlayerRef(e.target.value)}
          className="rounded-md border bg-background px-2 py-1"
        >
          {match.participants.map((p) => (
            <option key={p.playerRef} value={p.playerRef}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>

      {!result.ok ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm">
          Nao foi possivel calcular as metricas: {result.error.message}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm" aria-label="Metricas calculadas">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Metrica
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Valor
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Base
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.value.metrics.map((m) => (
                  <tr key={m.key} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{metricDefinition(m.key)?.label ?? m.key}</td>
                    {m.status === "available" ? (
                      <>
                        <td className="px-3 py-1.5 tabular-nums">{formatMetric(m)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{detailOf(m)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-muted-foreground">{REASON_LABEL[m.reason]}</td>
                        <td className="px-3 py-1.5" />
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.value.limitations.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Limitacoes</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {result.value.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
