import { matchDataAvailability, type Match, type Team } from "@cyl/contracts";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { LocalStore, StorageError, StoredMatch } from "@/storage/local-store";
import {
  describeResult,
  EVENT_LABEL,
  formatDateTime,
  formatDuration,
  GAME_LABEL,
  OriginBadge,
  SyntheticNotice,
  TEAM_LABEL,
  WIN_CONDITION_LABEL,
} from "./format";
import { MatchAnalytics } from "./MatchAnalytics";

type DetailState =
  | { kind: "loading" }
  | { kind: "error"; error: StorageError }
  | { kind: "missing" }
  | { kind: "ready"; stored: StoredMatch };

const NOT_INFORMED = "Nao informado";
const TEAMS: readonly Team[] = ["red", "blue"];

export function MatchDetail({ store, id, onBack }: { store: LocalStore; id: string; onBack: () => void }) {
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    void store.getMatch(id).then((r) => {
      if (!alive) return;
      if (!r.ok) setState({ kind: "error", error: r.error });
      else setState(r.value ? { kind: "ready", stored: r.value } : { kind: "missing" });
    });
    return () => {
      alive = false;
    };
  }, [store, id]);

  const title = state.kind === "ready" ? `${state.stored.match.map} · ${state.stored.match.mode}` : "Partida";

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-5xl space-y-6 p-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {state.kind === "ready" && <OriginBadge origin={state.stored.match.origin} />}
        </div>
        <Button variant="ghost" onClick={onBack}>
          Voltar ao historico
        </Button>
      </div>

      {state.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Carregando partida...
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm">
          Nao foi possivel abrir a partida: {state.error.message}
        </p>
      )}
      {state.kind === "missing" && (
        <p role="alert" className="rounded-lg border p-4 text-sm">
          Partida nao encontrada no banco local.
        </p>
      )}
      {state.kind === "ready" && <MatchBody stored={state.stored} />}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `sec-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="px-3 py-2 font-medium">
      {children}
    </th>
  );
}

const tableClass = "w-full text-left text-sm";
const wrapClass = "overflow-x-auto rounded-lg border bg-card";
const cell = "px-3 py-1.5";

function MatchBody({ stored }: { stored: StoredMatch }) {
  const m = stored.match;
  const available = matchDataAvailability(m);
  const names = new Map(m.participants.map((p) => [p.playerRef, p.displayName]));
  const nameOf = (ref: string | undefined) => (ref === undefined ? "—" : (names.get(ref) ?? ref));

  return (
    <>
      {m.origin === "synthetic" && <SyntheticNotice />}

      <Section title="Informacoes gerais">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 rounded-lg border bg-card p-4 text-sm">
          <Info label="Jogo">{GAME_LABEL[m.game] ?? m.game}</Info>
          <Info label="Mapa">{m.map}</Info>
          <Info label="Modo">{m.mode}</Info>
          <Info label="Inicio">{formatDateTime(m.startedAt)}</Info>
          <Info label="Duracao">{formatDuration(m.durationSeconds)}</Info>
          <Info label="Resultado">{describeResult(m.result)}</Info>
          <Info label="ID externo">{m.externalId}</Info>
          <Info label="Importada em">{formatDateTime(stored.importedAt)}</Info>
          {stored.updatedAt !== stored.importedAt && <Info label="Atualizada em">{formatDateTime(stored.updatedAt)}</Info>}
          <Info label="Contratos">{stored.contractsVersion}</Info>
        </dl>
      </Section>

      <Section title="Cobertura dos dados">
        <p className="text-sm">
          Eventos:{" "}
          <strong>{available.eventCoverage === "complete" ? "cobertura completa" : "cobertura parcial"}</strong>
          {available.eventCoverage === "partial" && (
            <span className="text-muted-foreground"> (os eventos sao um subconjunto da partida)</span>
          )}
        </p>
        <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
          <Availability label="Placar" value={available.result} />
          <Availability label="Lados (ataque/defesa)" value={available.sides} />
          <Availability label="Condicao de vitoria" value={available.winConditions} />
          <Availability label="Abates com headshot" value={available.headshots} />
          <Availability label="Dano" value={available.damage} />
        </ul>
      </Section>

      <Section title="Metricas calculadas">
        <MatchAnalytics match={m} />
      </Section>

      <Section title="Times e participantes">
        {TEAMS.map((team) => {
          const players = m.participants.filter((p) => p.team === team);
          if (players.length === 0) return null;
          return (
            <div key={team} className={wrapClass}>
              <table className={tableClass}>
                <caption className="px-3 pt-2 text-left text-sm font-medium">Time {TEAM_LABEL[team]}</caption>
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <Th>Jogador</Th>
                    <Th>Agente</Th>
                    <Th>Abates</Th>
                    <Th>Mortes</Th>
                    <Th>Assistencias</Th>
                    {available.headshots && <Th>Abates com headshot</Th>}
                    {available.damage && <Th>Dano</Th>}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.playerRef} className="border-b last:border-0">
                      <td className={cell}>{p.displayName}</td>
                      <td className={cell}>{p.agent}</td>
                      <td className={cell}>{p.kills}</td>
                      <td className={cell}>{p.deaths}</td>
                      <td className={cell}>{p.assists}</td>
                      {available.headshots && <td className={cell}>{p.headshotKills}</td>}
                      {available.damage && <td className={cell}>{p.damageDealt}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </Section>

      <Section title="Rodadas">
        {m.rounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rodadas nao informadas.</p>
        ) : (
          <div className={wrapClass}>
            <table className={tableClass}>
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <Th>Rodada</Th>
                  <Th>Vencedor</Th>
                  <Th>Time no ataque</Th>
                  <Th>Condicao de vitoria</Th>
                </tr>
              </thead>
              <tbody>
                {m.rounds.map((r) => (
                  <tr key={r.number} className="border-b last:border-0">
                    <td className={cell}>{r.number}</td>
                    <td className={cell}>{TEAM_LABEL[r.winningTeam]}</td>
                    <td className={cell}>{r.attackingTeam ? TEAM_LABEL[r.attackingTeam] : NOT_INFORMED}</td>
                    <td className={cell}>{r.winCondition ? WIN_CONDITION_LABEL[r.winCondition] : NOT_INFORMED}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Eventos">
        <EventList match={m} nameOf={nameOf} />
      </Section>
    </>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Availability({ label, value }: { label: string; value: boolean }) {
  return (
    <li>
      {label}: <span className={value ? "" : "text-muted-foreground"}>{value ? "disponivel" : "nao informado"}</span>
    </li>
  );
}

function EventList({ match, nameOf }: { match: Match; nameOf: (ref: string | undefined) => string }) {
  if (match.events.length === 0) return <p className="text-sm text-muted-foreground">Nenhum evento informado.</p>;
  const count = (type: keyof typeof EVENT_LABEL) => match.events.filter((e) => e.type === type).length;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {match.events.length} eventos: {count("kill")} abates, {count("spike_plant")} plants, {count("spike_defuse")} defuses.
      </p>
      <div className={wrapClass}>
        <table className={tableClass}>
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <Th>Rodada</Th>
              <Th>Tempo</Th>
              <Th>Tipo</Th>
              <Th>Autor</Th>
              <Th>Alvo</Th>
              <Th>Headshot</Th>
            </tr>
          </thead>
          <tbody>
            {match.events.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className={cell}>{e.roundNumber}</td>
                <td className={cell}>{formatDuration(e.timeMs / 1000)}</td>
                <td className={cell}>{EVENT_LABEL[e.type]}</td>
                <td className={cell}>{nameOf(e.actorRef)}</td>
                <td className={cell}>{nameOf(e.targetRef)}</td>
                <td className={cell}>{e.headshot === undefined ? "—" : e.headshot ? "Sim" : "Nao"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
