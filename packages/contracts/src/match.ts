import { z } from "zod";
import { DataOrigin, GameId, Id, IsoDateTime, SchemaVersion } from "./common";

/** Referencia a um jogador dentro de uma partida (estavel apenas nela). */
export const PlayerRef = z.string().min(1);

export const Team = z.enum(["red", "blue"]);
export type Team = z.infer<typeof Team>;

export const Side = z.enum(["attack", "defense"]);
export type Side = z.infer<typeof Side>;

/**
 * Contadores do participante. Campos opcionais = dado nao disponivel na
 * origem (nunca zero presumido). `headshotKills` conta abates por headshot,
 * nao acertos; `damageDealt` e o dano total causado, em pontos de vida.
 */
export const MatchParticipant = z.object({
  playerRef: PlayerRef,
  /** Preenchido somente quando o participante e uma conta vinculada do usuario. */
  gameAccountId: Id.optional(),
  displayName: z.string().min(1),
  team: Team,
  agent: z.string().min(1),
  kills: z.int().nonnegative(),
  deaths: z.int().nonnegative(),
  assists: z.int().nonnegative(),
  headshotKills: z.int().nonnegative().optional(),
  damageDealt: z.int().nonnegative().optional(),
});
export type MatchParticipant = z.infer<typeof MatchParticipant>;

export const MatchEventType = z.enum(["kill", "spike_plant", "spike_defuse"]);

export const MatchEvent = z.object({
  id: Id,
  roundNumber: z.int().positive(),
  type: MatchEventType,
  /** Milissegundos desde o inicio da partida. */
  timeMs: z.int().nonnegative(),
  actorRef: PlayerRef.optional(),
  targetRef: PlayerRef.optional(),
  /** Somente em `kill`. Ausente = nao informado. */
  headshot: z.boolean().optional(),
  /** Somente em `kill`: companheiros do autor que deram assistencia. */
  assistRefs: z.array(PlayerRef).optional(),
});
export type MatchEvent = z.infer<typeof MatchEvent>;

export const RoundWinCondition = z.enum(["elimination", "spike_detonated", "spike_defused", "time_expired"]);
export type RoundWinCondition = z.infer<typeof RoundWinCondition>;

export const Round = z.object({
  number: z.int().positive(),
  winningTeam: Team,
  /** Time no ataque; o outro defende. Ausente = lado nao informado. */
  attackingTeam: Team.optional(),
  winCondition: RoundWinCondition.optional(),
});
export type Round = z.infer<typeof Round>;

/**
 * `complete`: os eventos cobrem toda a partida (contadores devem bater com eles).
 * `partial`: subconjunto dos eventos (contadores >= eventos). Ausente = `partial`.
 */
export const EventCoverage = z.enum(["complete", "partial"]);
export type EventCoverage = z.infer<typeof EventCoverage>;

export const MatchResult = z.object({
  score: z.object({ red: z.int().nonnegative(), blue: z.int().nonnegative() }),
  winner: z.enum(["red", "blue", "draw"]),
});
export type MatchResult = z.infer<typeof MatchResult>;

export const otherTeam = (team: Team): Team => (team === "red" ? "blue" : "red");

/** Lado do time no round, ou `undefined` quando a origem nao informa. */
export function sideOf(round: Round, team: Team): Side | undefined {
  if (round.attackingTeam === undefined) return undefined;
  return round.attackingTeam === team ? "attack" : "defense";
}

type MatchShape = {
  durationSeconds: number;
  participants: MatchParticipant[];
  rounds: Round[];
  events: MatchEvent[];
  eventCoverage?: EventCoverage | undefined;
  result?: MatchResult | undefined;
};

/** Regras de consistencia entre placar, rounds, participantes e eventos. */
function checkMatchConsistency(match: MatchShape, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });

  // Participantes e times
  const byRef = new Map(match.participants.map((p) => [p.playerRef, p]));
  if (byRef.size !== match.participants.length) issue(["participants"], "playerRef duplicado");
  const teams = new Set(match.participants.map((p) => p.team));
  for (const key of ["headshotKills", "damageDealt"] as const) {
    const present = match.participants.filter((p) => p[key] !== undefined).length;
    if (present !== 0 && present !== match.participants.length) {
      issue(["participants"], `${key} deve estar em todos os participantes ou em nenhum`);
    }
  }
  match.participants.forEach((p, i) => {
    if (p.headshotKills !== undefined && p.headshotKills > p.kills) {
      issue(["participants", i, "headshotKills"], "headshotKills maior que kills");
    }
  });

  // Rounds: numeracao 1..n, vencedor e condicao de vitoria coerentes com os lados
  const rounds = new Map(match.rounds.map((r) => [r.number, r]));
  match.rounds.forEach((r, i) => {
    if (r.number !== i + 1) issue(["rounds", i, "number"], "rounds devem ser numerados 1..n em ordem");
    if (!teams.has(r.winningTeam)) issue(["rounds", i, "winningTeam"], "time vencedor sem participantes");
    const needsSides = r.winCondition !== undefined && r.winCondition !== "elimination";
    if (needsSides && r.attackingTeam === undefined) {
      issue(["rounds", i, "attackingTeam"], `${r.winCondition} exige attackingTeam`);
    } else if (r.attackingTeam !== undefined) {
      const expected =
        r.winCondition === "spike_detonated" ? r.attackingTeam
        : r.winCondition === "spike_defused" || r.winCondition === "time_expired" ? otherTeam(r.attackingTeam)
        : r.winningTeam;
      if (expected !== r.winningTeam) issue(["rounds", i, "winningTeam"], `vencedor incoerente com ${r.winCondition}`);
    }
  });

  // Placar
  if (match.result !== undefined) {
    const won = { red: 0, blue: 0 };
    for (const r of match.rounds) won[r.winningTeam]++;
    const { score, winner } = match.result;
    if (score.red !== won.red || score.blue !== won.blue) issue(["result", "score"], "placar diferente dos rounds");
    const expected = score.red === score.blue ? "draw" : score.red > score.blue ? "red" : "blue";
    if (winner !== expected) issue(["result", "winner"], "vencedor incoerente com o placar");
  }

  // Eventos: referencias, tempo e regras por tipo
  const durationMs = match.durationSeconds * 1000;
  const counted = new Map<string, { kills: number; deaths: number; assists: number; headshots: number }>();
  const count = (ref: string) => {
    let c = counted.get(ref);
    if (!c) counted.set(ref, (c = { kills: 0, deaths: 0, assists: 0, headshots: 0 }));
    return c;
  };
  const plantedRounds = new Set<number>();

  match.events.forEach((e, i) => {
    const at = (key: string) => ["events", i, key];
    const round = rounds.get(e.roundNumber);
    if (!round) issue(at("roundNumber"), "round inexistente");
    if (e.timeMs > durationMs) issue(at("timeMs"), "evento apos o fim da partida");
    for (const key of ["actorRef", "targetRef"] as const) {
      const ref = e[key];
      if (ref !== undefined && !byRef.has(ref)) issue(at(key), "participante inexistente");
    }
    const actor = e.actorRef === undefined ? undefined : byRef.get(e.actorRef);

    if (e.type !== "kill") {
      if (e.headshot !== undefined || e.assistRefs !== undefined) issue(at("type"), "headshot/assistRefs somente em kill");
      if (e.targetRef !== undefined) issue(at("targetRef"), `${e.type} nao tem alvo`);
      const side = e.type === "spike_plant" ? "attack" : "defense";
      if (round && actor && sideOf(round, actor.team) !== undefined && sideOf(round, actor.team) !== side) {
        issue(at("actorRef"), `${e.type} feito por quem nao esta ${side === "attack" ? "no ataque" : "na defesa"}`);
      }
      if (e.type === "spike_plant") plantedRounds.add(e.roundNumber);
      else if (!plantedRounds.has(e.roundNumber)) issue(at("type"), "defuse sem plant anterior no round");
      return;
    }

    if (e.targetRef === undefined) issue(at("targetRef"), "kill exige targetRef");
    else if (byRef.has(e.targetRef)) count(e.targetRef).deaths++;
    if (actor) {
      count(actor.playerRef).kills++;
      if (e.headshot === true) count(actor.playerRef).headshots++;
    }
    const assists = new Set(e.assistRefs ?? []);
    if (assists.size !== (e.assistRefs ?? []).length) issue(at("assistRefs"), "assistencia duplicada");
    for (const ref of assists) {
      const assister = byRef.get(ref);
      if (!assister) issue(at("assistRefs"), "participante inexistente");
      else if (ref === e.actorRef || ref === e.targetRef) issue(at("assistRefs"), "autor/alvo nao pode dar assistencia");
      else if (actor && assister.team !== actor.team) issue(at("assistRefs"), "assistencia de jogador de outro time");
      else count(ref).assists++;
    }
  });

  // Contadores x eventos: subconjunto (<=) ou cobertura completa (=)
  const complete = match.eventCoverage === "complete";
  match.participants.forEach((p, i) => {
    const c = counted.get(p.playerRef) ?? { kills: 0, deaths: 0, assists: 0, headshots: 0 };
    const pairs = [
      ["kills", p.kills, c.kills],
      ["deaths", p.deaths, c.deaths],
      ["assists", p.assists, c.assists],
      ...(p.headshotKills === undefined ? [] : [["headshotKills", p.headshotKills, c.headshots] as const]),
    ] as const;
    for (const [key, declared, fromEvents] of pairs) {
      if (fromEvents > declared) issue(["participants", i, key], `${key} menor que o total nos eventos`);
      else if (complete && fromEvents !== declared) issue(["participants", i, key], `${key} difere dos eventos (cobertura completa)`);
    }
  });
}

/** Partida normalizada: formato canonico independente do jogo de origem. */
export const Match = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    game: GameId,
    origin: DataOrigin,
    /** Id no sistema de origem; usado para sincronizacao idempotente. */
    externalId: z.string().min(1),
    map: z.string().min(1),
    mode: z.string().min(1),
    startedAt: IsoDateTime,
    durationSeconds: z.int().positive(),
    participants: z.array(MatchParticipant).min(1),
    rounds: z.array(Round),
    events: z.array(MatchEvent),
    eventCoverage: EventCoverage.optional(),
    /** Placar final; ausente quando a origem nao informa. */
    result: MatchResult.optional(),
  })
  .superRefine(checkMatchConsistency);
export type Match = z.infer<typeof Match>;

/**
 * Quais analises os dados permitem. O motor de analytics (P0-05) deve
 * consultar isto em vez de tratar campo ausente como zero.
 */
export interface MatchDataAvailability {
  eventCoverage: EventCoverage;
  headshots: boolean;
  damage: boolean;
  sides: boolean;
  winConditions: boolean;
  result: boolean;
}

export function matchDataAvailability(match: Match): MatchDataAvailability {
  const all = <T>(items: T[], has: (item: T) => boolean) => items.length > 0 && items.every(has);
  return {
    eventCoverage: match.eventCoverage ?? "partial",
    headshots: all(match.participants, (p) => p.headshotKills !== undefined),
    damage: all(match.participants, (p) => p.damageDealt !== undefined),
    sides: all(match.rounds, (r) => r.attackingTeam !== undefined),
    winConditions: all(match.rounds, (r) => r.winCondition !== undefined),
    result: match.result !== undefined,
  };
}

/** Resumo para listagens (web e desktop). */
export const MatchSummary = z.object({
  id: Id,
  game: GameId,
  origin: DataOrigin,
  map: z.string(),
  mode: z.string(),
  startedAt: IsoDateTime,
  durationSeconds: z.int().positive(),
  roundsPlayed: z.int().nonnegative(),
});
export type MatchSummary = z.infer<typeof MatchSummary>;

export const MatchMetricValue = z.object({
  key: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(["count", "ratio", "percent", "per_round", "ms"]),
  /** Tamanho da amostra; metricas com amostra pequena devem ser sinalizadas na UI. */
  sampleSize: z.int().nonnegative(),
});
export type MatchMetricValue = z.infer<typeof MatchMetricValue>;

/** Metricas calculadas (deterministicas) para um jogador em uma partida. */
export const MatchMetrics = z.object({
  schemaVersion: SchemaVersion,
  matchId: Id,
  playerRef: PlayerRef,
  computedAt: IsoDateTime,
  /** Versao do motor que calculou, para reproducibilidade. */
  engineVersion: z.string().min(1),
  values: z.array(MatchMetricValue),
});
export type MatchMetrics = z.infer<typeof MatchMetrics>;
