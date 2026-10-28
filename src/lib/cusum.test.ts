import { describe, it, expect } from "vitest";
import { cusumDetect } from "./cusum";

/** Генератор вспышек: n вспышек в конкретный день. */
function at(date: string, n = 1): { date: string }[] {
  return Array.from({ length: n }, () => ({ date }));
}

/** Заполнить недели «фоном» — по n вспышек в каждый понедельник, начиная с start, на weeks недель. */
function background(startISO: string, weeks: number, n: number): { date: string }[] {
  const out: { date: string }[] = [];
  const start = new Date(startISO);
  // сдвиг до ближайшего понедельника
  const day = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - day);
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    out.push(...at(d.toISOString().slice(0, 10), n));
  }
  return out;
}

describe("cusumDetect", () => {
  it("пустой вход → пустой результат без сигнала и данных", () => {
    const r = cusumDetect([]);
    expect(r.weeks).toHaveLength(0);
    expect(r.signal).toBe(false);
    expect(r.signalSince).toBeNull();
    expect(r.enoughData).toBe(false);
    expect(r.sNow).toBe(0);
  });

  it("ровный фон → нет сигнала, S = 0 (артефакт старта данных затухает ~26 недель)", () => {
    // 40 недель ровного фона: артефакт «включения данных» (первые 2 недели
    // baseline пуст → всплеск S) полностью затухает внутри окна — детектор молчит
    const r = cusumDetect(background("2026-01-05", 40, 3));
    expect(r.signal).toBe(false);
    expect(r.signalSince).toBeNull();
    expect(r.sNow).toBe(0);
  });

  it("молодой фон (30 недель) ещё сигналит — задокументированный артефакт старта данных", () => {
    // первые 2 недели baseline пуст (задержка отчётности), S накапливает
    // стартовый всплеск и не успевает затухнуть — известное поведение,
    // в проде окно 52 недели и история длиннее
    const r = cusumDetect(background("2026-06-01", 30, 3));
    expect(r.signal).toBe(true);
    expect(r.sNow).toBeGreaterThan(0);
  });

  it("всплеск после ровного фона → сигнал (S ≥ h), signalSince внутри эпизода", () => {
    // 20 недель фона по 1 вспышке, затем 6 недель по 8 вспышек
    const data = [...background("2026-03-02", 20, 1), ...background("2026-08-03", 6, 8)];
    const r = cusumDetect(data);
    expect(r.signal).toBe(true);
    expect(r.signalSince).toMatch(/^\d{4}-W\d{2}$/);
    expect(r.sNow).toBeGreaterThanOrEqual(r.h);
  });

  it("мусорные даты игнорируются (NaN не роняет детектор)", () => {
    const data = [...background("2026-06-01", 15, 2), { date: "не-дата" }, { date: "" }];
    const r = cusumDetect(data);
    expect(Array.isArray(r.weeks)).toBe(true);
    expect(r.weeks.length).toBeGreaterThan(0);
  });

  it("окно срезано до windowWeeks, ключи — ISO-недели (YYYY-Www)", () => {
    const r = cusumDetect(background("2026-01-05", 70, 1), { windowWeeks: 26 });
    expect(r.weeks).toHaveLength(26);
    expect(r.weeks[0].week).toMatch(/^\d{4}-W\d{2}$/);
    expect(r.weeks[0].start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("пороги k/h конфигурируемы: строгий h=10 подавляет умеренный всплеск", () => {
    // фон 1/нед, короткий всплеск 5/нед на 2 недели: S ≈ 8.3 — мягкий ловит, строгий нет
    const data = [...background("2026-04-06", 20, 1), ...background("2026-09-07", 2, 5)];
    const soft = cusumDetect(data, { h: 4 });
    const strict = cusumDetect(data, { h: 10 });
    expect(soft.signal).toBe(true);
    expect(strict.signal).toBe(false);
  });

  it("σ не меньше √0.5 — пуассоновский гвард на пустом фоне", () => {
    // 15 недель нулей и одна неделя с 4 вспышками: σ=√0.5,
    // всплеск должен накопить заметный S
    const data = [...background("2026-05-04", 15, 0), ...at("2026-08-17", 4)];
    const r = cusumDetect(data);
    expect(r.sNow).toBeGreaterThan(0.5);
  });

  it("enoughData: честная семантика — 4+ недель данных или активный сигнал (s≥h); иначе false", () => {
    // Task 184 убрал «|| s > 0»: артефакт старта данных (s>0 на молодых
    // данных) больше не заявляет «достаточно данных»
    expect(cusumDetect(at("2026-10-05", 2)).enoughData).toBe(false);
    expect(cusumDetect([]).enoughData).toBe(false);
    // 5 недель фона — уже достаточно
    expect(cusumDetect(background("2026-09-01", 5, 2)).enoughData).toBe(true);
    // 2 недели фона + мощный всплеск до сигнала — s≥h тоже достаточно
    const spike = [...background("2026-09-28", 2, 1), ...background("2026-10-19", 2, 20)];
    const r = cusumDetect(spike);
    expect(r.enoughData).toBe(r.signal || r.weeks.filter((w) => w.n > 0).length >= 4);
  });
});
