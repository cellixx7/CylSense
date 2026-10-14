import type { MetricKey } from "../metrics/catalog";
import { metricOf, type MatchAnalysis } from "../metrics/match-metrics";
import { isAvailable, ratio, unavailable, type MetricUnit, type MetricValue } from "../metrics/metric";

/** Metrica agregada de varias partidas; `matchesUsed` = partidas que tinham o dado. */
export type SessionMetric = MetricValue & { matchesUsed: number };

export const SESSION_METRIC_KEYS = [
  "rounds_played",
  "kills",
  "deaths",
  "assists",
  "kd_ratio",
  "kda_ratio",
  "kills_per_round",
  "deaths_per_round",
  "headshot_kill_ratio",
  "damage_per_round",
  "round_win_ratio",
  "attack_round_win_ratio",
  "defense_round_win_ratio",
  "first_kill_ratio",
  "first_death_ratio",
] as const;
export type SessionMetricKey = (typeof SESSION_METRIC_KEYS)[number];

/** Valor de uma metrica de contagem, ou `undefined` se indisponivel. */
const val = (a: MatchAnalysis, key: MetricKey): number | undefined => {
  const m = metricOf(a, key);
  return isAvailable(m) ? m.value : undefined;
};
/** Amostra de uma metrica de contagem (ex.: rodadas determinaveis de first_kills). */
const sample = (a: MatchAnalysis, key: MetricKey): number | undefined => {
  const m = metricOf(a, key);
  return isAvailable(m) ? m.sampleSize : undefined;
};

type Part = (a: MatchAnalysis) => number | undefined;

function sum(key: SessionMetricKey, analyses: readonly MatchAnalysis[], part: Part): SessionMetric {
  let total = 0;
  let used = 0;
  for (const a of analyses) {
    const v = part(a);
    if (v === undefined) continue;
    total += v;
    used++;
  }
  if (used === 0) return { ...unavailable(key, "count", "missing_data", "nenhuma partida com o dado"), matchesUsed: 0 };
  return { key, status: "available", value: total, unit: "count", sampleSize: used, matchesUsed: used };
}

/**
 * Razao agregada: soma dos numeradores / soma dos denominadores, usando so
 * as partidas que tem os dois. Nunca e a media das razoes por partida.
 */
function pooled(
  key: SessionMetricKey,
  analyses: readonly MatchAnalysis[],
  numerator: Part,
  denominator: Part,
  unit: Extract<MetricUnit, "ratio" | "per_round"> = "ratio",
): SessionMetric {
  let num = 0;
  let den = 0;
  let used = 0;
  for (const a of analyses) {
    const n = numerator(a);
    const d = denominator(a);
    if (n === undefined || d === undefined) continue;
    num += n;
    den += d;
    used++;
  }
  if (used === 0) return { ...unavailable(key, unit, "missing_data", "nenhuma partida com o dado"), matchesUsed: 0 };
  return { ...ratio(key, num, den, unit), matchesUsed: used };
}

/** Rodadas registradas, so quando a partida tem rodadas. */
const rounds: Part = (a) => val(a, "rounds_played");
/** Contagem disponivel somente em partidas com rodadas (para razoes por rodada). */
const withRounds = (key: MetricKey): Part => (a) => (rounds(a) === undefined ? undefined : val(a, key));

/** Agrega as metricas de varias analises (mesmo jogador escolhido em cada partida). */
export function aggregate(analyses: readonly MatchAnalysis[]): SessionMetric[] {
  const all: Record<SessionMetricKey, SessionMetric> = {
    rounds_played: sum("rounds_played", analyses, rounds),
    kills: sum("kills", analyses, (a) => val(a, "kills")),
    deaths: sum("deaths", analyses, (a) => val(a, "deaths")),
    assists: sum("assists", analyses, (a) => val(a, "assists")),
    kd_ratio: pooled("kd_ratio", analyses, (a) => val(a, "kills"), (a) => val(a, "deaths")),
    kda_ratio: pooled(
      "kda_ratio",
      analyses,
      (a) => (val(a, "kills") ?? 0) + (val(a, "assists") ?? 0),
      (a) => val(a, "deaths"),
    ),
    kills_per_round: pooled("kills_per_round", analyses, withRounds("kills"), rounds, "per_round"),
    deaths_per_round: pooled("deaths_per_round", analyses, withRounds("deaths"), rounds, "per_round"),
    headshot_kill_ratio: pooled("headshot_kill_ratio", analyses, (a) => val(a, "headshot_kills"), (a) =>
      val(a, "headshot_kills") === undefined ? undefined : val(a, "kills"),
    ),
    damage_per_round: pooled("damage_per_round", analyses, withRounds("damage_dealt"), (a) =>
      val(a, "damage_dealt") === undefined ? undefined : rounds(a),
    "per_round"),
    round_win_ratio: pooled("round_win_ratio", analyses, (a) => val(a, "rounds_won"), rounds),
    attack_round_win_ratio: pooled("attack_round_win_ratio", analyses, (a) => val(a, "attack_rounds_won"), (a) =>
      val(a, "attack_rounds_played"),
    ),
    defense_round_win_ratio: pooled("defense_round_win_ratio", analyses, (a) => val(a, "defense_rounds_won"), (a) =>
      val(a, "defense_rounds_played"),
    ),
    first_kill_ratio: pooled("first_kill_ratio", analyses, (a) => val(a, "first_kills"), (a) => sample(a, "first_kills")),
    first_death_ratio: pooled("first_death_ratio", analyses, (a) => val(a, "first_deaths"), (a) => sample(a, "first_deaths")),
  };
  return SESSION_METRIC_KEYS.map((k) => all[k]);
}

export const sessionMetricOf = (metrics: readonly SessionMetric[], key: SessionMetricKey): SessionMetric =>
  metrics.find((m) => m.key === key)!;

export interface GroupComparison {
  a: { matchCount: number; metrics: SessionMetric[] };
  b: { matchCount: number; metrics: SessionMetric[] };
  /** Somente metricas disponiveis nos dois grupos; `difference` = b - a. */
  differences: { key: SessionMetricKey; a: number; b: number; difference: number }[];
  warnings: string[];
}

export const MIN_GROUP_MATCHES = 3;

/**
 * Compara dois grupos de partidas (ex.: inicio x fim da sessao, mapa A x B).
 * Descritivo: a diferenca nao indica causa nem significancia estatistica.
 */
export function compareGroups(a: readonly MatchAnalysis[], b: readonly MatchAnalysis[]): GroupComparison {
  const ma = aggregate(a);
  const mb = aggregate(b);
  const differences: GroupComparison["differences"] = [];
  for (const key of SESSION_METRIC_KEYS) {
    const x = sessionMetricOf(ma, key);
    const y = sessionMetricOf(mb, key);
    if (isAvailable(x) && isAvailable(y) && x.unit !== "count") {
      differences.push({ key, a: x.value, b: y.value, difference: y.value - x.value });
    }
  }
  const warnings: string[] = [];
  if (a.length < MIN_GROUP_MATCHES || b.length < MIN_GROUP_MATCHES) {
    warnings.push(`Grupo com menos de ${MIN_GROUP_MATCHES} partidas: diferencas podem ser variacao normal.`);
  }
  const modes = new Set([...a, ...b].map((x) => `${x.game}/${x.mode}`));
  if (modes.size > 1) warnings.push("Grupos com modos de jogo diferentes: comparacao mistura contextos.");
  return { a: { matchCount: a.length, metrics: ma }, b: { matchCount: b.length, metrics: mb }, differences, warnings };
}
