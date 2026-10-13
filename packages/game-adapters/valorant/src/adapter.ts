import { Match, SCHEMA_VERSION, type MatchEvent } from "@cyl/contracts";
import { err, ok, providerError, type GameAdapter, type MatchNormalizer } from "@cyl/core";
import { SyntheticValorantMatch } from "./synthetic-format";

const TEAM = { Red: "red", Blue: "blue" } as const;
const EVENT_TYPE = { kill: "kill", plant: "spike_plant", defuse: "spike_defuse" } as const;

function describeIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join(".") || "(raiz)"}: ${i.message}`)
    .join("; ");
}

export const syntheticNormalizer: MatchNormalizer<SyntheticValorantMatch> = {
  parse(input) {
    const r = SyntheticValorantMatch.safeParse(input);
    return r.success ? ok(r.data) : err(providerError("invalid_data", `partida invalida: ${describeIssues(r.error)}`));
  },

  normalize(raw, ctx) {
    const events: MatchEvent[] = raw.rounds.flatMap((round) =>
      round.events.map((e, i) => ({
        // Id derivado do externalId: reimportar a mesma partida gera os mesmos ids.
        id: `${raw.matchId}:r${round.number}:e${i}`,
        roundNumber: round.number,
        type: EVENT_TYPE[e.type],
        timeMs: e.t,
        ...(e.actor === undefined ? {} : { actorRef: e.actor }),
        ...(e.victim === undefined ? {} : { targetRef: e.victim }),
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
      })),
      rounds: raw.rounds.map((r) => ({ number: r.number, winningTeam: TEAM[r.winner] })),
      events,
    };

    const r = Match.safeParse(candidate);
    return r.success ? ok(r.data) : err(providerError("invalid_data", `partida inconsistente: ${describeIssues(r.error)}`));
  },
};

export const valorantSyntheticAdapter: GameAdapter<SyntheticValorantMatch> = {
  game: "valorant",
  normalizer: syntheticNormalizer,
};
