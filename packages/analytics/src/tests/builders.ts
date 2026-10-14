import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Match, SCHEMA_VERSION, type MatchEvent, type MatchParticipant, type RoundWinCondition, type Team } from "@cyl/contracts";
import { normalizeMatch } from "@cyl/core";
import { valorantSyntheticAdapter } from "@cyl/game-adapter-valorant";

/**
 * Partidas SINTETICAS para testes do motor (origin "synthetic"). Os
 * contadores sao derivados dos eventos, entao a cobertura completa e
 * coerente com o contrato `Match`.
 */

export const fixture = (name: string): Match => {
  const raw: unknown = JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../../fixtures/valorant/${name}`, import.meta.url)), "utf8"),
  );
  const r = normalizeMatch(valorantSyntheticAdapter, raw, { newId: () => `m-${name}` });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

export interface KillSpec {
  t: number;
  actor?: string;
  target: string;
  headshot?: boolean;
  assists?: string[];
}

export interface RoundSpec {
  winner: Team;
  attackers?: Team;
  winCondition?: RoundWinCondition;
  kills?: KillSpec[];
  plant?: { t: number; actor?: string };
  defuse?: { t: number; actor?: string };
}

export interface MatchSpec {
  id?: string;
  startedAt?: string;
  mode?: string;
  map?: string;
  coverage?: "complete" | "partial";
  headshots?: boolean;
  damage?: boolean;
  result?: boolean;
  rounds: RoundSpec[];
  /** Soma extra aos contadores (ex.: cobertura parcial com abates nao listados). */
  extra?: Record<string, Partial<Pick<MatchParticipant, "kills" | "deaths" | "assists">>>;
}

export const RED = ["p1", "p2", "p3", "p4", "p5"];
export const BLUE = ["p6", "p7", "p8", "p9", "p10"];

export function buildMatch(spec: MatchSpec): Match {
  const id = spec.id ?? "m1";
  const events: MatchEvent[] = [];
  spec.rounds.forEach((r, i) => {
    const n = i + 1;
    const raw: MatchEvent[] = [];
    for (const k of r.kills ?? []) {
      raw.push({
        id: "",
        roundNumber: n,
        type: "kill",
        timeMs: k.t,
        targetRef: k.target,
        ...(k.actor === undefined ? {} : { actorRef: k.actor }),
        ...(k.headshot === undefined ? {} : { headshot: k.headshot }),
        ...(k.assists === undefined ? {} : { assistRefs: k.assists }),
      });
    }
    if (r.plant) raw.push({ id: "", roundNumber: n, type: "spike_plant", timeMs: r.plant.t, ...(r.plant.actor ? { actorRef: r.plant.actor } : {}) });
    if (r.defuse) raw.push({ id: "", roundNumber: n, type: "spike_defuse", timeMs: r.defuse.t, ...(r.defuse.actor ? { actorRef: r.defuse.actor } : {}) });
    raw.sort((a, b) => a.timeMs - b.timeMs).forEach((e, j) => events.push({ ...e, id: `${id}:r${n}:e${j}` }));
  });

  const stat = new Map([...RED, ...BLUE].map((p) => [p, { kills: 0, deaths: 0, assists: 0, hs: 0 }]));
  for (const e of events) {
    if (e.type !== "kill") continue;
    if (e.actorRef) {
      stat.get(e.actorRef)!.kills++;
      if (e.headshot) stat.get(e.actorRef)!.hs++;
    }
    stat.get(e.targetRef!)!.deaths++;
    for (const a of e.assistRefs ?? []) stat.get(a)!.assists++;
  }
  const participants: MatchParticipant[] = [...RED, ...BLUE].map((ref) => {
    const s = stat.get(ref)!;
    const x = spec.extra?.[ref] ?? {};
    const kills = s.kills + (x.kills ?? 0);
    return {
      playerRef: ref,
      displayName: `Synth ${ref}`,
      team: RED.includes(ref) ? "red" : "blue",
      agent: "Sintetico",
      kills,
      deaths: s.deaths + (x.deaths ?? 0),
      assists: s.assists + (x.assists ?? 0),
      ...(spec.headshots === false ? {} : { headshotKills: s.hs }),
      ...(spec.damage === false ? {} : { damageDealt: kills * 150 + 40 }),
    };
  });

  const score = { red: 0, blue: 0 };
  for (const r of spec.rounds) score[r.winner]++;
  const candidate = {
    schemaVersion: SCHEMA_VERSION,
    id,
    game: "valorant",
    origin: "synthetic",
    externalId: `ext-${id}`,
    map: spec.map ?? "Ascent",
    mode: spec.mode ?? "competitive",
    startedAt: spec.startedAt ?? "2026-10-01T20:00:00.000Z",
    durationSeconds: 3600,
    participants,
    rounds: spec.rounds.map((r, i) => ({
      number: i + 1,
      winningTeam: r.winner,
      ...(r.attackers ? { attackingTeam: r.attackers } : {}),
      ...(r.winCondition ? { winCondition: r.winCondition } : {}),
    })),
    events,
    eventCoverage: spec.coverage ?? "complete",
    ...(spec.result === false
      ? {}
      : { result: { score, winner: score.red === score.blue ? "draw" : score.red > score.blue ? "red" : "blue" } }),
  };
  const parsed = Match.safeParse(candidate);
  if (!parsed.success) throw new Error(`builder gerou partida invalida: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  return parsed.data;
}

/** PRNG deterministico (mulberry32) para lotes sinteticos reproduziveis. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Partida aleatoria mas reproduzivel: `rounds` rodadas, lados trocando na
 * metade, de 1 a 6 abates por rodada com tempos distintos.
 */
export function randomMatch(seed: number, opts: { id?: string; startedAt?: string; rounds?: number } = {}): Match {
  const rnd = prng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const total = opts.rounds ?? 20;
  const rounds: RoundSpec[] = [];
  for (let i = 0; i < total; i++) {
    const alive = { red: [...RED], blue: [...BLUE] };
    const kills: KillSpec[] = [];
    const n = 1 + Math.floor(rnd() * 6);
    let t = 1000 * i * 120;
    for (let k = 0; k < n; k++) {
      const killerTeam: Team = rnd() < 0.5 ? "red" : "blue";
      const victimTeam: Team = killerTeam === "red" ? "blue" : "red";
      if (alive[killerTeam].length === 0 || alive[victimTeam].length === 0) break;
      const actor = pick(alive[killerTeam]);
      const target = pick(alive[victimTeam]);
      alive[victimTeam] = alive[victimTeam].filter((p) => p !== target);
      t += 1000 + Math.floor(rnd() * 5000);
      kills.push({ t, actor, target, headshot: rnd() < 0.3 });
    }
    rounds.push({ winner: rnd() < 0.5 ? "red" : "blue", attackers: i < total / 2 ? "red" : "blue", kills });
  }
  return buildMatch({
    id: opts.id ?? `rnd-${seed}`,
    startedAt: opts.startedAt ?? new Date(Date.UTC(2026, 8, 1) + seed * 3_600_000).toISOString(),
    rounds,
  });
}
