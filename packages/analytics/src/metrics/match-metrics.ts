import {
  Match,
  matchDataAvailability,
  SCHEMA_VERSION,
  type DataOrigin,
  type GameId,
  type MatchDataAvailability,
  type MatchEvent,
  type MatchMetrics,
  type Team,
} from "@cyl/contracts";
import { describeIssues, err, ok, type Result } from "@cyl/core";
import { analyticsError, type AnalyticsError } from "../errors";
import { analyzeRounds, type RoundAnalysis } from "../rounds/round-analysis";
import { ANALYTICS_ENGINE_VERSION } from "../version";
import { METRIC_CATALOG, type MetricKey } from "./catalog";
import { count, isAvailable, ratio, unavailable, type MetricValue } from "./metric";

export type MatchOutcome = "win" | "loss" | "draw" | "unknown";

export interface MatchAnalysis {
  matchId: string;
  externalId: string;
  game: GameId;
  origin: DataOrigin;
  map: string;
  mode: string;
  startedAt: string;
  playerRef: string;
  displayName: string;
  agent: string;
  team: Team;
  /** Participantes da partida (todos os times). */
  participantCount: number;
  /** `unknown` quando a partida nao tem placar. */
  outcome: MatchOutcome;
  availability: MatchDataAvailability;
  /** Uma entrada por metrica do catalogo, na mesma ordem. */
  metrics: MetricValue[];
  /** Eventos observados por tipo (com cobertura parcial, sao um minimo). */
  observedEvents: Record<MatchEvent["type"], number>;
  rounds: RoundAnalysis;
  limitations: string[];
}

const PARTIAL = "depende de todos os eventos e a cobertura e parcial";

/**
 * Metricas de um jogador em uma partida. Valida a partida contra o contrato
 * e consulta `matchDataAvailability`: dado ausente vira metrica
 * indisponivel com motivo, nunca zero. Deterministico: mesma entrada, mesma
 * saida (nao le relogio nem aleatoriedade).
 */
export function analyzeMatch(input: Match, playerRef: string): Result<MatchAnalysis, AnalyticsError> {
  const parsed = Match.safeParse(input);
  if (!parsed.success) return err(analyticsError("invalid_match", `partida invalida: ${describeIssues(parsed.error.issues)}`));
  const match = parsed.data;
  const p = match.participants.find((x) => x.playerRef === playerRef);
  if (!p) return err(analyticsError("player_not_found", "jogador nao participa da partida"));

  const available = matchDataAvailability(match);
  const rounds = analyzeRounds(match, playerRef, p.team);
  const played = match.rounds.length;
  const won = rounds.rounds.filter((r) => r.outcome === "won").length;
  const complete = available.eventCoverage === "complete";

  const values: Record<MetricKey, MetricValue> = {
    rounds_played: played > 0 ? count("rounds_played", played, played) : unavailable("rounds_played", "count", "no_rounds", "partida sem rodadas"),
    kills: count("kills", p.kills, played),
    deaths: count("deaths", p.deaths, played),
    assists: count("assists", p.assists, played),
    kd_ratio: ratio("kd_ratio", p.kills, p.deaths),
    kda_ratio: ratio("kda_ratio", p.kills + p.assists, p.deaths),
    kills_per_round: perRound("kills_per_round", p.kills, played),
    deaths_per_round: perRound("deaths_per_round", p.deaths, played),
    headshot_kills:
      p.headshotKills === undefined
        ? unavailable("headshot_kills", "count", "missing_data", "abates com headshot nao informados")
        : count("headshot_kills", p.headshotKills, p.kills),
    headshot_kill_ratio:
      p.headshotKills === undefined
        ? unavailable("headshot_kill_ratio", "ratio", "missing_data", "abates com headshot nao informados")
        : ratio("headshot_kill_ratio", p.headshotKills, p.kills),
    damage_dealt:
      p.damageDealt === undefined
        ? unavailable("damage_dealt", "count", "missing_data", "dano nao informado")
        : count("damage_dealt", p.damageDealt, played),
    damage_per_round:
      p.damageDealt === undefined
        ? unavailable("damage_per_round", "per_round", "missing_data", "dano nao informado")
        : perRound("damage_per_round", p.damageDealt, played),
    rounds_won: played > 0 ? count("rounds_won", won, played) : unavailable("rounds_won", "count", "no_rounds", "partida sem rodadas"),
    round_win_ratio: perRoundRatio("round_win_ratio", won, played),
    ...sideMetrics("attack", rounds),
    ...sideMetrics("defense", rounds),
    first_kills: rounds.opening
      ? sampled("first_kills", rounds.opening.playerFirstKills, rounds.opening.firstKillSample)
      : unavailable("first_kills", "count", "partial_event_coverage", PARTIAL),
    first_deaths: rounds.opening
      ? sampled("first_deaths", rounds.opening.playerFirstDeaths, rounds.opening.firstDeathSample)
      : unavailable("first_deaths", "count", "partial_event_coverage", PARTIAL),
    spike_plants: rounds.spike
      ? count("spike_plants", rounds.spike.playerPlants, played)
      : unavailable("spike_plants", "count", "partial_event_coverage", PARTIAL),
    spike_defuses: rounds.spike
      ? count("spike_defuses", rounds.spike.playerDefuses, played)
      : unavailable("spike_defuses", "count", "partial_event_coverage", PARTIAL),
  };

  const observedEvents = { kill: 0, spike_plant: 0, spike_defuse: 0 };
  for (const e of match.events) observedEvents[e.type]++;

  return ok({
    matchId: match.id,
    externalId: match.externalId,
    game: match.game,
    origin: match.origin,
    map: match.map,
    mode: match.mode,
    startedAt: match.startedAt,
    playerRef,
    displayName: p.displayName,
    agent: p.agent,
    team: p.team,
    participantCount: match.participants.length,
    outcome: outcomeOf(match, p.team),
    availability: available,
    metrics: METRIC_CATALOG.map((d) => values[d.key]),
    observedEvents,
    rounds,
    limitations: matchLimitations(match, available, complete, rounds),
  });
}

function perRound(key: string, value: number, played: number): MetricValue {
  return played > 0 ? ratio(key, value, played, "per_round") : unavailable(key, "per_round", "no_rounds", "partida sem rodadas");
}

function perRoundRatio(key: string, value: number, played: number): MetricValue {
  return played > 0 ? ratio(key, value, played) : unavailable(key, "ratio", "no_rounds", "partida sem rodadas");
}

/** Contagem cuja amostra sao rodadas determinaveis; amostra zero => indisponivel. */
function sampled(key: string, value: number, sample: number): MetricValue {
  return sample > 0
    ? count(key, value, sample)
    : unavailable(key, "count", "missing_data", "nenhuma rodada com ordem de abates determinavel");
}

type SideMetrics<S extends "attack" | "defense"> = Record<`${S}_${"rounds_played" | "rounds_won" | "round_win_ratio"}`, MetricValue>;

function sideMetrics<S extends "attack" | "defense">(side: S, rounds: RoundAnalysis): SideMetrics<S> {
  const k = (s: string) => `${side}_${s}`;
  if (!rounds.bySide) {
    const why = rounds.rounds.length === 0 ? "partida sem rodadas" : "lado nao informado em todas as rodadas";
    const reason = rounds.rounds.length === 0 ? "no_rounds" : "missing_data";
    return {
      [k("rounds_played")]: unavailable(k("rounds_played"), "count", reason, why),
      [k("rounds_won")]: unavailable(k("rounds_won"), "count", reason, why),
      [k("round_win_ratio")]: unavailable(k("round_win_ratio"), "ratio", reason, why),
    } as SideMetrics<S>;
  }
  const { played, won } = rounds.bySide[side];
  return {
    [k("rounds_played")]: count(k("rounds_played"), played, played),
    [k("rounds_won")]: count(k("rounds_won"), won, played),
    [k("round_win_ratio")]: ratio(k("round_win_ratio"), won, played),
  } as SideMetrics<S>;
}

function outcomeOf(match: Match, team: Team): MatchOutcome {
  if (!match.result) return "unknown";
  if (match.result.winner === "draw") return "draw";
  return match.result.winner === team ? "win" : "loss";
}

function matchLimitations(match: Match, a: MatchDataAvailability, complete: boolean, rounds: RoundAnalysis): string[] {
  const out: string[] = [];
  if (match.origin === "synthetic") out.push("Origem sintetica: os numeros nao descrevem uma partida real.");
  if (match.rounds.length > 0) out.push("Metricas por rodada assumem que o jogador participou de todas as rodadas registradas.");
  if (!a.result) out.push("Placar nao informado: resultado da partida desconhecido.");
  if (a.headshots) out.push("Headshot aqui e a fracao de abates com headshot, nao o HS% por disparos.");
  else out.push("Abates com headshot nao informados.");
  if (!a.damage) out.push("Dano nao informado.");
  if (!complete) out.push("Cobertura parcial de eventos: contagens de eventos sao um minimo observado.");
  return [...out, ...rounds.limitations];
}

/**
 * Converte para o contrato `MatchMetrics` (somente metricas disponiveis).
 * `computedAt` vem do chamador para manter o motor deterministico.
 */
export function toMatchMetrics(analysis: MatchAnalysis, computedAt: string): MatchMetrics {
  return {
    schemaVersion: SCHEMA_VERSION,
    matchId: analysis.matchId,
    playerRef: analysis.playerRef,
    computedAt,
    engineVersion: ANALYTICS_ENGINE_VERSION,
    values: analysis.metrics.filter(isAvailable).map(({ key, value, unit, sampleSize }) => ({ key, value, unit, sampleSize })),
  };
}

export const metricOf = (analysis: Pick<MatchAnalysis, "metrics">, key: MetricKey): MetricValue =>
  analysis.metrics.find((m) => m.key === key)!;
