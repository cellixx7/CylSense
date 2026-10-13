import { Match, SCHEMA_VERSION, type MatchEvent, type MatchResult } from "@cyl/contracts";
import { parseWith, type GameAdapter, type MatchNormalizer } from "@cyl/core";
import { SyntheticValorantMatch } from "./synthetic-format";

const TEAM = { Red: "red", Blue: "blue" } as const;
const EVENT_TYPE = { kill: "kill", plant: "spike_plant", defuse: "spike_defuse" } as const;
const WIN_CONDITION = {
  elimination: "elimination",
  detonate: "spike_detonated",
  defuse: "spike_defused",
  time: "time_expired",
} as const;

/** Inclui a chave somente quando o valor existe: ausente continua ausente. */
const opt = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

function toResult(score: { Red: number; Blue: number }): MatchResult {
  const winner = score.Red === score.Blue ? "draw" : score.Red > score.Blue ? "red" : "blue";
  return { score: { red: score.Red, blue: score.Blue }, winner };
}

export const syntheticNormalizer: MatchNormalizer<SyntheticValorantMatch> = {
  parse(input) {
    return parseWith(SyntheticValorantMatch, input, "partida invalida");
  },

  normalize(raw, ctx) {
    const events: MatchEvent[] = raw.rounds.flatMap((round) =>
      round.events.map((e, i) => ({
        // Id derivado do externalId: reimportar a mesma partida gera os mesmos ids.
        id: `${raw.matchId}:r${round.number}:e${i}`,
        roundNumber: round.number,
        type: EVENT_TYPE[e.type],
        timeMs: e.t,
        ...opt("actorRef", e.actor),
        ...opt("targetRef", e.victim),
        ...opt("headshot", e.headshot),
        ...opt("assistRefs", e.assists),
      })),
    );

    const candidate = {
      schemaVersion: SCHEMA_VERSION,
      id: ctx.newId(),
      game: "valorant",
      origin: "synthetic",
      externalId: raw.matchId,
      map: raw.map,
      mode: raw.queue,
      startedAt: raw.startedAt,
      durationSeconds: raw.durationSeconds,
      participants: raw.players.map((p) => ({
        playerRef: p.ref,
        displayName: p.name,
        team: TEAM[p.team],
        agent: p.agent,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        ...opt("headshotKills", p.headshotKills),
        ...opt("damageDealt", p.damage),
      })),
      rounds: raw.rounds.map((r) => ({
        number: r.number,
        winningTeam: TEAM[r.winner],
        ...opt("attackingTeam", r.attackers && TEAM[r.attackers]),
        ...opt("winCondition", r.winCondition && WIN_CONDITION[r.winCondition]),
      })),
      events,
      ...opt("eventCoverage", raw.eventCoverage),
      ...opt("result", raw.score && toResult(raw.score)),
    };

    return parseWith(Match, candidate, "partida inconsistente");
  },
};

export const valorantSyntheticAdapter: GameAdapter<SyntheticValorantMatch> = {
  game: "valorant",
  normalizer: syntheticNormalizer,
};
