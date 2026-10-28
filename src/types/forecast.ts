/**
 * Types for the TimesFM regional forecast (vetflu-forecast worker).
 *
 * Source JSON: https://shray77.github.io/vetflu-forecast/data/forecast_regions.json
 * — прогноз сглаженной заболеваемости (+4 недели) по федеральным округам РФ,
 * считается воркером vetflu-forecast (TimesFM 2.5, кэш модели в Actions).
 */

export interface ForecastSeries {
  /** "ЦФО:Wildlife" (округ × группа) или "any:Wildlife" (вся Россия). */
  key: string;
  label: string;
  district: string;
  group: string;
  n_events: number;
  history: {
    weeks: string[];
    smooth: number[];
    raw: number[];
  };
  forecast: {
    weeks: string[];
    /** Точечный прогноз (сглаженный счёт событий/нед). */
    point: number[];
    q10: number[];
    q90: number[];
  };
}

export interface ForecastDistrict {
  code: string;
  label: string;
  lat: number | null;
  lon: number | null;
  n_events: number;
}

export interface ForecastVerdict {
  skill?: number;
  status?: "value" | "parity" | "no_value";
  best_baseline?: string;
  text?: string;
}

export interface RegionsForecast {
  generated_at: string;
  git_sha: string;
  model: { repo: string; revision: string; max_context?: number; license?: string };
  horizon_weeks: number;
  smoothing: { window_weeks: number; method: string };
  data_source: string;
  districts: ForecastDistrict[];
  verdict?: ForecastVerdict | null;
  series: ForecastSeries[];
}

/** Один округ после агрегации серий (для слоя карты). */
export interface DistrictForecastRow {
  code: string;
  label: string;
  lat: number;
  lon: number;
  /** Суммарный точечный прогноз на 4-ю неделю (сглаженные события/нед). */
  value: number;
  /** Последнее фактическое сглаженное значение (тот же масштаб). */
  last: number;
  /** Коридор q10–q90 на 4-ю неделю (сумма по группам). */
  q10: number;
  q90: number;
  /** Отношение value/last: >1.25 рост, <0.75 спад, иначе стабильно. */
  trend: "up" | "flat" | "down";
  /** Круг радиуса для MapLibre (px, уже посчитан). */
  radius: number;
  color: string;
  /** Число агрегированных серий (групп). */
  nSeries: number;
  /** Суммарно событий в истории серий (для подписи). */
  nEvents: number;
}
