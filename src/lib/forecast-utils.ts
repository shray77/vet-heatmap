/**
 * Pure helpers for the TimesFM regional forecast layer (vet-heatmap).
 *
 * Всё здесь — чистые функции без MapLibre/React, чтобы покрыть юнит-тестами
 * (vitest) самую ошибкоопасную часть: агрегацию серий по округам с учётом
 * фильтра болезней и шкалу кружков.
 */
import type { DistrictForecastRow, ForecastDistrict, RegionsForecast } from "@/types/forecast";

/** Окно тренда: во сколько раз прогноз на 4-ю неделю должен отличаться от текущего уровня. */
const UP_RATIO = 1.25;
const DOWN_RATIO = 0.75;

const TREND_COLORS: Record<DistrictForecastRow["trend"], string> = {
  up: "#D32F2F",   // рост — как зона «защиты» на карте
  flat: "#F57C00", // стабильно — «наблюдение»
  down: "#1565C0", // спад — «ограничение»
};

export { TREND_COLORS };

export function trendOf(value: number, last: number): DistrictForecastRow["trend"] {
  if (last <= 1e-9) return value > 1e-9 ? "up" : "flat"; // нулевой уровень: рост/стабильно
  const ratio = value / last;
  if (ratio > UP_RATIO) return "up";
  if (ratio < DOWN_RATIO) return "down";
  return "flat";
}

export function trendColor(t: DistrictForecastRow["trend"]): string {
  return TREND_COLORS[t];
}

/** Радиус кружка (px): sqrt-шкала, чтобы редкие крупные вспышки не съедали мелкие. */
export function radiusFor(value: number, maxValue: number): number {
  const minR = 5;
  const maxR = 22;
  if (maxValue <= 0 || value <= 0) return minR;
  const ratio = Math.min(1, Math.sqrt(value / maxValue));
  return Math.round((minR + (maxR - minR) * ratio) * 10) / 10;
}

/**
 * Агрегация серий прогноза по округам.
 *
 * @param forecast  весь JSON воркера
 * @param groupFilter группы болезней, которые оставить (null/пусто = все)
 * @param radiusMax максимальный радиус, px (для тестов можно уменьшить)
 */
export function districtsForecast(
  forecast: RegionsForecast,
  groupFilter?: Set<string> | null,
  radiusMax = 22,
): DistrictForecastRow[] {
  const districtsByCode = new Map<string, ForecastDistrict>();
  for (const d of forecast.districts ?? []) districtsByCode.set(d.code, d);

  // сумма по группам внутри округа (серии — сглаженные счётчики, сложение корректно)
  const acc = new Map<
    string,
    { value: number; last: number; q10: number; q90: number; nSeries: number; nEvents: number }
  >();

  for (const s of forecast.series ?? []) {
    if (s.district === "any") continue; // национальные серии на карту не наносим
    if (groupFilter && groupFilter.size > 0 && !groupFilter.has(s.group)) continue;
    const a = acc.get(s.district) ?? { value: 0, last: 0, q10: 0, q90: 0, nSeries: 0, nEvents: 0 };
    const f = s.forecast;
    a.value += num(f.point[f.point.length - 1]);
    a.q10 += num(f.q10[f.q10.length - 1]);
    a.q90 += num(f.q90[f.q90.length - 1]);
    a.last += num(s.history.smooth[s.history.smooth.length - 1]);
    a.nSeries += 1;
    a.nEvents += s.n_events ?? 0;
    acc.set(s.district, a);
  }

  const maxValue = Math.max(0, ...Array.from(acc.values()).map((a) => a.value));

  const rows: DistrictForecastRow[] = [];
  for (const [code, a] of acc) {
    const d = districtsByCode.get(code);
    if (!d || d.lat == null || d.lon == null) continue; // без координат не наносим
    const trend = trendOf(a.value, a.last);
    rows.push({
      code,
      label: d.label,
      lat: d.lat,
      lon: d.lon,
      value: round3(a.value),
      last: round3(a.last),
      q10: round3(a.q10),
      q90: round3(a.q90),
      trend,
      radius: radiusFor(a.value, maxValue || 1),
      color: trendColor(trend),
      nSeries: a.nSeries,
      nEvents: a.nEvents,
    });
  }
  return rows.sort((x, y) => y.value - x.value);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
