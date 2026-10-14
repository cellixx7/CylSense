import type { MatchMetricValue } from "@cyl/contracts";

export type MetricUnit = MatchMetricValue["unit"];

/**
 * Por que uma metrica nao foi calculada. Nunca e "zero": ausente continua
 * ausente e a interface deve mostrar o motivo.
 */
export type UnavailableReason =
  /** A origem nao informa o campo (ex.: `headshotKills`, `damageDealt`, lados). */
  | "missing_data"
  /** Denominador zero (ex.: K/D sem mortes). */
  | "zero_denominator"
  /** Depende de todos os eventos e a cobertura e parcial. */
  | "partial_event_coverage"
  /** A partida nao tem rounds registrados. */
  | "no_rounds";

export type MetricValue =
  | {
      key: string;
      status: "available";
      value: number;
      unit: MetricUnit;
      /** Observacoes que sustentam o valor (denominador, rounds ou rounds determinaveis). */
      sampleSize: number;
      /** Presentes em razoes: permitem reagregar sem media de medias. */
      numerator?: number;
      denominator?: number;
    }
  | { key: string; status: "unavailable"; unit: MetricUnit; reason: UnavailableReason; detail: string };

export type AvailableMetric = Extract<MetricValue, { status: "available" }>;

export const count = (key: string, value: number, sampleSize: number): MetricValue => ({
  key,
  status: "available",
  value,
  unit: "count",
  sampleSize,
});

export const unavailable = (key: string, unit: MetricUnit, reason: UnavailableReason, detail: string): MetricValue => ({
  key,
  status: "unavailable",
  unit,
  reason,
  detail,
});

/**
 * Razao numerador/denominador. Denominador zero => indisponivel, nunca
 * Infinity/NaN. `sampleSize` = denominador, salvo quando informado.
 */
export function ratio(
  key: string,
  numerator: number,
  denominator: number,
  unit: Extract<MetricUnit, "ratio" | "per_round"> = "ratio",
  sampleSize = denominator,
): MetricValue {
  if (denominator === 0) return unavailable(key, unit, "zero_denominator", "denominador zero");
  return { key, status: "available", value: numerator / denominator, unit, sampleSize, numerator, denominator };
}

export const isAvailable = (m: MetricValue | undefined): m is AvailableMetric => m?.status === "available";

/** Comparacao numerica tolerante a arredondamento de ponto flutuante. */
export const sameValue = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
