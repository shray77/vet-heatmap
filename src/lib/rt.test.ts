import { describe, it, expect } from "vitest";
import { buildDailyCases, calculateRt, interpretRt } from "./rt";

const P = { serialInterval: 7, windowSize: 7, smooth: false };

describe("buildDailyCases", () => {
  it("группирует и суммирует вспышки по датам, заполняет пропуски нулями", () => {
    const series = buildDailyCases([
      { date: "2026-10-01", cases: 3 },
      { date: "2026-10-01", cases: 2 },
      { date: "2026-10-04", cases: 1 },
    ]);
    expect(series).toHaveLength(4);
    expect(series[0]).toEqual({ date: "2026-10-01", cases: 5 });
    expect(series[1].cases).toBe(0);
    expect(series[2].cases).toBe(0);
    expect(series[3]).toEqual({ date: "2026-10-04", cases: 1 });
  });

  it("пустой вход → пустой ряд", () => {
    expect(buildDailyCases([])).toEqual([]);
  });

  it("cases=NaN считается нулём (|| 0 гвард)", () => {
    const series = buildDailyCases([{ date: "2026-10-01", cases: undefined as unknown as number }]);
    expect(series[0].cases).toBe(0);
  });

  it("границы диапазона уважаются (startDate/endDate)", () => {
    const series = buildDailyCases(
      [
        { date: "2026-10-01", cases: 1 },
        { date: "2026-10-05", cases: 9 },
      ],
      "2026-10-03",
      "2026-10-05",
    );
    expect(series).toHaveLength(3);
    expect(series.every((d) => d.cases === 0 || d.date === "2026-10-05")).toBe(true);
  });
});

describe("calculateRt (Cori 2013, фиксированный SI)", () => {
  it("короткий ряд → пустой результат (нужно SI + окно)", () => {
    const short = Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, cases: 1 }));
    expect(calculateRt(short, P)).toEqual([]);
  });

  it("ровная экспонента без роста → Rt ≈ 1", () => {
    // 40 дней по 4 случая в день: windowCases == lambda → alpha/beta = (1+28)/(1+28) = 1
    const series = Array.from({ length: 40 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
      cases: 4,
    }));
    const rt = calculateRt(series, P);
    expect(rt.length).toBeGreaterThan(0);
    for (const p of rt) {
      // точность 2 знака после округления
      expect(Math.abs(p.rt - 1)).toBeLessThanOrEqual(0.02);
      expect(p.ciLower).toBeLessThanOrEqual(p.rt);
      expect(p.ciUpper).toBeGreaterThanOrEqual(p.rt);
    }
  });

  it("растущий ряд → Rt > 1, затухающий (до нуля) → Rt < 1 в активной фазе", () => {
    // рост ×1.5 каждые 2 дня
    const growing: { date: string; cases: number }[] = [];
    let c = 1;
    for (let i = 0; i < 60; i++) {
      growing.push({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), cases: c });
      if (i % 2 === 1) c = Math.round(c * 1.5);
    }
    const rtGrow = calculateRt(growing, P);
    const lastGrow = rtGrow[rtGrow.length - 1];
    expect(lastGrow.rt).toBeGreaterThan(1.1);

    // затухание: от 20 к нулю к 20-му дню; после нуля λ→0 и Rt уходит в prior (1),
    // поэтому рост/спад смотрим на ПОСЛЕДНЕЙ активной точке (cases > 0)
    const fading: { date: string; cases: number }[] = [];
    let f = 20;
    for (let i = 0; i < 60; i++) {
      fading.push({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), cases: f });
      f = Math.max(0, f - 1);
    }
    const rtFade = calculateRt(fading, P);
    const lastActive = [...rtFade].reverse().find((p) => p.cases > 0);
    expect(lastActive).toBeDefined();
    expect(lastActive!.rt).toBeLessThan(1);
  });

  it("нет прошлых случаев (λ=0) → prior mean 1 с широким CI; после скачка Rt взлетает и возвращается к 1", () => {
    // 30 дней нулей, затем 10/день 15 дней
    const series: { date: string; cases: number }[] = [];
    for (let i = 0; i < 30; i++)
      series.push({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), cases: 0 });
    for (let i = 30; i < 45; i++)
      series.push({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), cases: 10 });
    const rt = calculateRt(series, P);
    // точка на границе скачка: окно нулевое в прошлом → λ=0 ветка prior'а
    const firstRt = rt[0];
    expect(firstRt.rt).toBe(1);
    expect(firstRt.ciLower).toBeCloseTo(0.3);
    expect(firstRt.ciUpper).toBeCloseTo(3.0);
    // пик роста — в переходной зоне (окно свежих 10-к при малой λ)
    const peak = Math.max(...rt.map((p) => p.rt));
    expect(peak).toBeGreaterThan(1.5);
    // установившийся режим 10/день → Rt возвращается к 1 (равновесие)
    expect(rt[rt.length - 1].rt).toBeCloseTo(1, 1);
  });

  it("сглаживание (smooth) не меняет длину ряда и даты", () => {
    const series = Array.from({ length: 40 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
      cases: i % 7 === 0 ? 10 : 2,
    }));
    const raw = calculateRt(series, P);
    const smoothed = calculateRt(series, { ...P, smooth: true });
    expect(smoothed).toHaveLength(raw.length);
    expect(smoothed[0].date).toBe(raw[0].date);
  });
});

describe("interpretRt", () => {
  it("пять зон интерпретации с монотонными границами", () => {
    expect(interpretRt(0.5).label).toBe("Эпидемия затухает");
    expect(interpretRt(0.9).label).toBe("Стабильно снижается");
    expect(interpretRt(1.1).label).toBe("Стабильна");
    expect(interpretRt(1.3).label).toBe("Медленный рост");
    expect(interpretRt(2.0).label).toBe("Активный рост");
    // границы: 0.8/1.0/1.2/1.5 — верхние значения уходят в следующую зону
    expect(interpretRt(0.79).label).not.toBe(interpretRt(0.81).label);
    expect(interpretRt(1.49).label).not.toBe(interpretRt(1.51).label);
  });
});
