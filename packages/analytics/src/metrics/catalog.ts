import type { MetricUnit } from "./metric";

export interface MetricDefinition {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Formula em texto, igual a de docs/analytics/metrics-catalog.md. */
  formula: string;
  /** Campos do contrato `Match` (ou condicoes) exigidos. */
  requires: string;
}

/**
 * Catalogo das metricas por jogador e partida, na ordem em que o motor as
 * devolve. Razoes usam `ratio` (0..1 ou maior): a interface formata como %.
 */
export const METRIC_CATALOG = [
  { key: "rounds_played", label: "Rodadas registradas", unit: "count", formula: "rounds.length", requires: "rounds" },
  { key: "kills", label: "Abates", unit: "count", formula: "participant.kills", requires: "participant.kills" },
  { key: "deaths", label: "Mortes", unit: "count", formula: "participant.deaths", requires: "participant.deaths" },
  { key: "assists", label: "Assistencias", unit: "count", formula: "participant.assists", requires: "participant.assists" },
  { key: "kd_ratio", label: "K/D", unit: "ratio", formula: "kills / deaths", requires: "deaths > 0" },
  { key: "kda_ratio", label: "KDA", unit: "ratio", formula: "(kills + assists) / deaths", requires: "deaths > 0" },
  { key: "kills_per_round", label: "Abates por rodada", unit: "per_round", formula: "kills / rounds_played", requires: "rounds_played > 0" },
  { key: "deaths_per_round", label: "Mortes por rodada", unit: "per_round", formula: "deaths / rounds_played", requires: "rounds_played > 0" },
  { key: "headshot_kills", label: "Abates com headshot", unit: "count", formula: "participant.headshotKills", requires: "headshotKills informado" },
  {
    key: "headshot_kill_ratio",
    label: "Abates com headshot / abates",
    unit: "ratio",
    formula: "headshotKills / kills (nao e o HS% por disparos)",
    requires: "headshotKills informado e kills > 0",
  },
  { key: "damage_dealt", label: "Dano causado", unit: "count", formula: "participant.damageDealt", requires: "damageDealt informado" },
  {
    key: "damage_per_round",
    label: "Dano por rodada",
    unit: "per_round",
    formula: "damageDealt / rounds_played",
    requires: "damageDealt informado e rounds_played > 0",
  },
  { key: "rounds_won", label: "Rodadas vencidas pelo time", unit: "count", formula: "rounds com winningTeam = time do jogador", requires: "rounds" },
  { key: "round_win_ratio", label: "Aproveitamento de rodadas", unit: "ratio", formula: "rounds_won / rounds_played", requires: "rounds_played > 0" },
  { key: "attack_rounds_played", label: "Rodadas no ataque", unit: "count", formula: "rounds com attackingTeam = time", requires: "lado em todas as rodadas" },
  { key: "attack_rounds_won", label: "Rodadas vencidas no ataque", unit: "count", formula: "rounds no ataque vencidas", requires: "lado em todas as rodadas" },
  {
    key: "attack_round_win_ratio",
    label: "Aproveitamento no ataque",
    unit: "ratio",
    formula: "attack_rounds_won / attack_rounds_played",
    requires: "lado em todas as rodadas e attack_rounds_played > 0",
  },
  { key: "defense_rounds_played", label: "Rodadas na defesa", unit: "count", formula: "rounds com attackingTeam != time", requires: "lado em todas as rodadas" },
  { key: "defense_rounds_won", label: "Rodadas vencidas na defesa", unit: "count", formula: "rounds na defesa vencidas", requires: "lado em todas as rodadas" },
  {
    key: "defense_round_win_ratio",
    label: "Aproveitamento na defesa",
    unit: "ratio",
    formula: "defense_rounds_won / defense_rounds_played",
    requires: "lado em todas as rodadas e defense_rounds_played > 0",
  },
  {
    key: "first_kills",
    label: "Primeiros abates da rodada",
    unit: "count",
    formula: "rodadas em que o jogador fez o abate de menor timeMs (amostra = rodadas determinaveis)",
    requires: "eventCoverage = complete",
  },
  {
    key: "first_deaths",
    label: "Primeiras mortes da rodada",
    unit: "count",
    formula: "rodadas em que o jogador foi o alvo do abate de menor timeMs (amostra = rodadas determinaveis)",
    requires: "eventCoverage = complete",
  },
  { key: "spike_plants", label: "Plants do jogador", unit: "count", formula: "eventos spike_plant com actorRef = jogador", requires: "eventCoverage = complete" },
  { key: "spike_defuses", label: "Defuses do jogador", unit: "count", formula: "eventos spike_defuse com actorRef = jogador", requires: "eventCoverage = complete" },
] as const satisfies readonly MetricDefinition[];

export type MetricKey = (typeof METRIC_CATALOG)[number]["key"];

const byKey = new Map<string, MetricDefinition>(METRIC_CATALOG.map((d) => [d.key, d]));
export const metricDefinition = (key: string): MetricDefinition | undefined => byKey.get(key);
