/**
 * CUSUM-надзор (cumulative sum control chart) для раннего обнаружения вспышек.
 *
 * Классическая схема эпиднадзора (RL-CUSUM, ср. Fricker 2013, EARS/C2):
 *   для каждой недели t: baseline μ_t — среднее число новых вспышек за
 *   предыдущие 8 недель того же среза, σ_t = √max(μ_t, 0.5) (приближение
 *   Пуассона), порог решения S_t = max(0, S_{t-1} + (n_t − μ_t − k·σ_t)/σ_t),
 *   k = 0.5 (allowance — допустимый «шум»), сигнал при S_t ≥ h, h = 4
 *   (≈4σ превышения накопленного отклонения → ложный сигнал редок).
 *
 * Скользящий baseline делает детектор устойчивым к сезонности: он всегда
 * сравнивает текущую неделю именно с недавней нормой, а не со среднегодовой.
 * Последние 2 недели исключаются из baseline (задержка отчётности).
 */

export interface CusumWeek {
  /** ISO-ключ недели YYYY-Www (как в эпи-кривой). */
  week: string;
  /** Дата понедельника недели (ISO). */
  start: string;
  /** Новые вспышки за неделю. */
  n: number;
  /** Baseline μ (среднее за предыдущие 8 недель). */
  mu: number;
  /** Накопленная статистика S. */
  s: number;
}

export interface CusumResult {
  weeks: CusumWeek[];
  /** Порог k (в σ). */
  k: number;
  /** Порог сигнала h (в σ). */
  h: number;
  /** Текущее S. */
  sNow: number;
  /** Активен ли сигнал прямо сейчас. */
  signal: boolean;
  /** Неделя (YYYY-Www), где текущий эпизод впервые пересёк порог. */
  signalSince: string | null;
  /** Хватает ли данных для суждения. */
  enoughData: boolean;
}

function isoWeekKey(d: Date): { key: string; monday: Date } {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (dt.getUTCDay() + 6) % 7; // 0 = понедельник
  dt.setUTCDate(dt.getUTCDate() - day);
  const onejan = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - onejan.getTime()) / 86400000 + onejan.getUTCDay() + 1) / 7);
  return {
    key: `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
    monday: dt,
  };
}

export function cusumDetect(
  outbreaks: { date: string }[],
  opts: { baselineWeeks?: number; k?: number; h?: number; windowWeeks?: number } = {},
): CusumResult {
  const base = opts.baselineWeeks ?? 8;
  const k = opts.k ?? 0.5;
  const h = opts.h ?? 4;
  const window = opts.windowWeeks ?? 52;

  if (!outbreaks.length) {
    return { weeks: [], k, h, sNow: 0, signal: false, signalSince: null, enoughData: false };
  }

  // Недельные корзины (UTC-недели, понедельник).
  const counts = new Map<string, number>();
  const mondays = new Map<string, Date>();
  let maxDate = new Date(0);
  for (const o of outbreaks) {
    const d = new Date(o.date);
    if (Number.isNaN(d.getTime())) continue;
    if (d > maxDate) maxDate = d;
    const { key, monday } = isoWeekKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    mondays.set(key, monday);
  }

  // Непрерывная последовательность последних `window` недель до maxDate.
  const sortedKeys = Array.from(counts.keys()).sort();
  const lastMonday = isoWeekKey(maxDate).monday;
  const weeks: CusumWeek[] = [];
  let s = 0;
  for (let i = window - 1; i >= 0; i--) {
    const monday = new Date(lastMonday);
    monday.setUTCDate(monday.getUTCDate() - 7 * i);
    const { key } = isoWeekKey(monday);
    const n = counts.get(key) ?? 0;

    // baseline: среднее за предыдущие `base` недель (без 2 последних отчётных —
    // фактически сдвигаем окно так, чтобы текущая и предыдущая не входили).
    let sum = 0;
    let cnt = 0;
    for (let j = 2; j < base + 2; j++) {
      const past = new Date(monday);
      past.setUTCDate(past.getUTCDate() - 7 * j);
      sum += counts.get(isoWeekKey(past).key) ?? 0;
      cnt++;
    }
    const mu = cnt ? sum / cnt : 0;
    const sigma = Math.sqrt(Math.max(mu, 0.5));
    s = Math.max(0, s + (n - mu - k * sigma) / sigma);

    weeks.push({ week: key, start: monday.toISOString().slice(0, 10), n, mu: +mu.toFixed(2), s: +s.toFixed(3) });
  }

  // Дата сигнала: идём с конца, пока S>0 — эпизод продолжается;
  // ищем первую неделю эпизода, где S≥h.
  let signalSince: string | null = null;
  let signal = false;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].s <= 0) break;
    if (weeks[i].s >= h) {
      signal = true;
      signalSince = weeks[i].week;
    }
  }

  const weeksWithData = weeks.filter((w) => w.n > 0).length;
  return {
    weeks,
    k,
    h,
    sNow: +s.toFixed(3),
    signal,
    signalSince,
    enoughData: weeksWithData >= 4 || s > 0,
  };
}
