import type { DataOrigin, MatchResult, RoundWinCondition, Team } from "@cyl/contracts";
import { cn } from "@/lib/utils";
import type { SaveMatchOutcome } from "@/storage/local-store";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d);
}

/** `mm:ss` (ou `h:mm:ss`) a partir de segundos. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`;
}

export const GAME_LABEL: Record<string, string> = { valorant: "VALORANT" };

export const TEAM_LABEL: Record<Team, string> = { red: "Vermelho", blue: "Azul" };

export const WIN_CONDITION_LABEL: Record<RoundWinCondition, string> = {
  elimination: "Eliminacao",
  spike_detonated: "Spike detonada",
  spike_defused: "Spike desarmada",
  time_expired: "Tempo esgotado",
};

export const EVENT_LABEL = { kill: "Abate", spike_plant: "Plant", spike_defuse: "Defuse" } as const;

export const OUTCOME_LABEL: Record<SaveMatchOutcome, string> = {
  inserted: "nova",
  unchanged: "ja importada",
  updated: "atualizada",
};

const ORIGIN_LABEL: Record<DataOrigin, string> = {
  synthetic: "Sintetico",
  user_import: "Arquivo do usuario",
  riot_api: "Riot API",
};

export function describeResult(result: MatchResult | undefined): string {
  if (!result) return "Nao informado";
  const score = `${TEAM_LABEL.red} ${result.score.red} x ${result.score.blue} ${TEAM_LABEL.blue}`;
  return result.winner === "draw" ? `${score} (empate)` : `${score} (vitoria ${TEAM_LABEL[result.winner].toLowerCase()})`;
}

/** Origem sempre visivel: dado sintetico nunca pode parecer real. */
export function OriginBadge({ origin }: { origin: DataOrigin }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        origin === "synthetic" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

export function SyntheticNotice() {
  return (
    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
      Dados sinteticos: gerados para teste e demonstracao. Nao representam uma partida real.
    </p>
  );
}
