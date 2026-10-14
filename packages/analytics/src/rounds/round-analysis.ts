import {
  matchDataAvailability,
  sideOf,
  type Match,
  type MatchEvent,
  type RoundWinCondition,
  type Side,
  type Team,
} from "@cyl/contracts";

/**
 * Primeiro abate do round. Exige cobertura completa: com eventos parciais o
 * primeiro abate observado pode nao ser o primeiro que aconteceu.
 */
export type RoundOpening =
  | { kind: "none" }
  /** Dois ou mais abates no menor `timeMs`: a ordem nao e determinavel. */
  | { kind: "ambiguous"; eventIds: string[] }
  | {
      kind: "kill";
      eventId: string;
      targetRef: string;
      actorRef?: string;
      playerDied: boolean;
      /** `undefined` quando o autor nao e informado. */
      playerKilled: boolean | undefined;
    };

/** Detalhe por eventos; existe somente com cobertura completa. */
export interface RoundEvents {
  /** Ids em ordem (timeMs, id). */
  eventIds: string[];
  playerKills: number;
  playerDeaths: number;
  playerAssists: number;
  /** Abates cujo alvo era adversario do jogador (inclui os do jogador). */
  teamKills: number;
  /** Abates cujo alvo era do time do jogador (inclui a morte do jogador). */
  teamDeaths: number;
  opening: RoundOpening;
  /** `undefined` quando nem lado nem autor do plant sao informados. */
  teamPlanted: boolean | undefined;
  spikePlanted: boolean;
  spikeDefused: boolean;
}

export interface RoundView {
  number: number;
  outcome: "won" | "lost";
  side?: Side;
  winCondition?: RoundWinCondition;
  events?: RoundEvents;
}

export interface RoundTally {
  rounds: number;
  playerKills: number;
  playerDeaths: number;
  playerAssists: number;
}

export interface OpeningSummary {
  /** Rounds em que a primeira morte e determinavel (sem abate ou abate unico no menor tempo). */
  firstDeathSample: number;
  /** Idem, exigindo tambem o autor do primeiro abate. */
  firstKillSample: number;
  ambiguousRounds: number;
  playerFirstKills: number;
  playerFirstDeaths: number;
  firstKillEventIds: string[];
  firstDeathEventIds: string[];
}

export interface SpikeSummary {
  /** Rounds em que o time do jogador plantou (com lado ou autor conhecidos). */
  teamPlantRounds: number;
  teamPlantRoundsWon: number;
  /** Rounds com plant em que nao foi possivel atribuir o time. */
  unattributedPlantRounds: number;
  playerPlants: number;
  playerDefuses: number;
}

export interface RoundAnalysis {
  matchId: string;
  playerRef: string;
  team: Team;
  eventDetail: "complete" | "partial";
  rounds: RoundView[];
  /** `null` quando algum round nao informa o lado. */
  bySide: Record<Side, { played: number; won: number }> | null;
  /** Os campos abaixo sao `null` com cobertura parcial de eventos. */
  wonVsLost: { won: RoundTally; lost: RoundTally } | null;
  /** Indice = abates do jogador no round; o ultimo indice agrega 5 ou mais. */
  playerKillsDistribution: number[] | null;
  opening: OpeningSummary | null;
  spike: SpikeSummary | null;
  limitations: string[];
}

const byTimeThenId = (a: MatchEvent, b: MatchEvent) => a.timeMs - b.timeMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function openingOf(kills: MatchEvent[], playerRef: string): RoundOpening {
  const first = kills[0];
  if (!first) return { kind: "none" };
  const tied = kills.filter((e) => e.timeMs === first.timeMs);
  if (tied.length > 1) return { kind: "ambiguous", eventIds: tied.map((e) => e.id) };
  // `kill` sempre tem targetRef (regra do contrato Match).
  const targetRef = first.targetRef ?? "";
  return {
    kind: "kill",
    eventId: first.id,
    targetRef,
    ...(first.actorRef === undefined ? {} : { actorRef: first.actorRef }),
    playerDied: targetRef === playerRef,
    playerKilled: first.actorRef === undefined ? undefined : first.actorRef === playerRef,
  };
}

/**
 * Agregacoes por round e lado para um jogador. Usa somente o que a partida
 * informa: lados, condicao de vitoria e eventos completos sao opcionais, e
 * cada analise que depende deles fica `null` (com limitacao declarada).
 */
export function analyzeRounds(match: Match, playerRef: string, team: Team): RoundAnalysis {
  const available = matchDataAvailability(match);
  const complete = available.eventCoverage === "complete";
  const teamOf = new Map(match.participants.map((p) => [p.playerRef, p.team]));
  const eventsByRound = new Map<number, MatchEvent[]>();
  if (complete) {
    for (const e of match.events) {
      const list = eventsByRound.get(e.roundNumber);
      if (list) list.push(e);
      else eventsByRound.set(e.roundNumber, [e]);
    }
  }

  const rounds: RoundView[] = match.rounds.map((r) => {
    const side = sideOf(r, team);
    const view: RoundView = { number: r.number, outcome: r.winningTeam === team ? "won" : "lost" };
    if (side !== undefined) view.side = side;
    if (r.winCondition !== undefined) view.winCondition = r.winCondition;
    if (!complete) return view;

    const events = [...(eventsByRound.get(r.number) ?? [])].sort(byTimeThenId);
    const kills = events.filter((e) => e.type === "kill");
    const plant = events.find((e) => e.type === "spike_plant");
    let teamPlanted: boolean | undefined;
    if (plant) {
      const plantTeam = plant.actorRef !== undefined ? teamOf.get(plant.actorRef) : r.attackingTeam;
      teamPlanted = plantTeam === undefined ? undefined : plantTeam === team;
    } else {
      teamPlanted = false;
    }
    view.events = {
      eventIds: events.map((e) => e.id),
      playerKills: kills.filter((e) => e.actorRef === playerRef).length,
      playerDeaths: kills.filter((e) => e.targetRef === playerRef).length,
      playerAssists: kills.filter((e) => e.assistRefs?.includes(playerRef)).length,
      teamKills: kills.filter((e) => e.targetRef !== undefined && teamOf.get(e.targetRef) !== team).length,
      teamDeaths: kills.filter((e) => e.targetRef !== undefined && teamOf.get(e.targetRef) === team).length,
      opening: openingOf(kills, playerRef),
      teamPlanted,
      spikePlanted: plant !== undefined,
      spikeDefused: events.some((e) => e.type === "spike_defuse"),
    };
    return view;
  });

  const limitations: string[] = [];
  let bySide: RoundAnalysis["bySide"] = null;
  if (available.sides) {
    bySide = { attack: { played: 0, won: 0 }, defense: { played: 0, won: 0 } };
    for (const r of rounds) {
      if (r.side === undefined) continue;
      bySide[r.side].played++;
      if (r.outcome === "won") bySide[r.side].won++;
    }
  } else if (rounds.length > 0) {
    limitations.push("Lado (ataque/defesa) nao informado em todas as rodadas: comparacao por lado nao calculada.");
  }

  if (!complete) {
    limitations.push(
      "Cobertura parcial de eventos: abates por rodada, primeiro abate/morte e spike nao foram calculados (evento ausente nao significa que nao aconteceu).",
    );
    return { matchId: match.id, playerRef, team, eventDetail: "partial", rounds, bySide, wonVsLost: null, playerKillsDistribution: null, opening: null, spike: null, limitations };
  }

  const tally = (): RoundTally => ({ rounds: 0, playerKills: 0, playerDeaths: 0, playerAssists: 0 });
  const wonVsLost = { won: tally(), lost: tally() };
  const distribution = [0, 0, 0, 0, 0, 0];
  const opening: OpeningSummary = {
    firstDeathSample: 0,
    firstKillSample: 0,
    ambiguousRounds: 0,
    playerFirstKills: 0,
    playerFirstDeaths: 0,
    firstKillEventIds: [],
    firstDeathEventIds: [],
  };
  const spike: SpikeSummary = { teamPlantRounds: 0, teamPlantRoundsWon: 0, unattributedPlantRounds: 0, playerPlants: 0, playerDefuses: 0 };
  let unknownOpeningActor = 0;

  for (const r of rounds) {
    const ev = r.events!;
    const t = wonVsLost[r.outcome];
    t.rounds++;
    t.playerKills += ev.playerKills;
    t.playerDeaths += ev.playerDeaths;
    t.playerAssists += ev.playerAssists;
    distribution[Math.min(ev.playerKills, 5)]!++;

    const o = ev.opening;
    if (o.kind === "ambiguous") opening.ambiguousRounds++;
    else {
      opening.firstDeathSample++;
      if (o.kind === "kill" && o.playerDied) {
        opening.playerFirstDeaths++;
        opening.firstDeathEventIds.push(o.eventId);
      }
      if (o.kind === "none" || o.playerKilled !== undefined) opening.firstKillSample++;
      else unknownOpeningActor++;
      if (o.kind === "kill" && o.playerKilled === true) {
        opening.playerFirstKills++;
        opening.firstKillEventIds.push(o.eventId);
      }
    }

    if (ev.teamPlanted === true) {
      spike.teamPlantRounds++;
      if (r.outcome === "won") spike.teamPlantRoundsWon++;
    } else if (ev.teamPlanted === undefined) spike.unattributedPlantRounds++;
  }
  for (const e of match.events) {
    if (e.actorRef !== playerRef) continue;
    if (e.type === "spike_plant") spike.playerPlants++;
    else if (e.type === "spike_defuse") spike.playerDefuses++;
  }

  if (opening.ambiguousRounds > 0) {
    limitations.push(`${opening.ambiguousRounds} rodada(s) com abates simultaneos no primeiro instante: excluidas da analise de abertura.`);
  }
  if (unknownOpeningActor > 0) {
    limitations.push(`${unknownOpeningActor} rodada(s) sem autor do primeiro abate: excluidas da contagem de primeiros abates.`);
  }
  if (spike.unattributedPlantRounds > 0) {
    limitations.push(`${spike.unattributedPlantRounds} rodada(s) com plant sem lado nem autor: nao atribuidas a nenhum time.`);
  }

  return {
    matchId: match.id,
    playerRef,
    team,
    eventDetail: "complete",
    rounds,
    bySide,
    wonVsLost,
    playerKillsDistribution: distribution,
    opening,
    spike,
    limitations,
  };
}
