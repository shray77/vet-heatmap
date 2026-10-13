import { describe, expect, it } from "vitest";
import { districtsForecast, radiusFor, trendOf, trendColor } from "./forecast-utils";
import type { RegionsForecast } from "@/types/forecast";

function fixture(): RegionsForecast {
  return {
    generated_at: "2026-10-13T14:14:57Z",
    git_sha: "41b34e7",
    model: { repo: "google/timesfm-2.5-200m-pytorch", revision: "1d952420fba8" },
    horizon_weeks: 4,
    smoothing: { window_weeks: 4, method: "trailing mean" },
    data_source: "test",
    districts: [
      { code: "ЦФО", label: "Центральный ФО", lat: 55.0, lon: 40.0, n_events: 100 },
      { code: "СФО", label: "Сибирский ФО", lat: 60.0, lon: 90.0, n_events: 50 },
      { code: "ДФО", label: "Дальневосточный ФО", lat: null, lon: null, n_events: 10 }, // без координат
    ],
    verdict: { status: "value", skill: 0.2, text: "test" },
    series: [
      {
        key: "ЦФО:Wildlife", label: "ЦФО — дикие", district: "ЦФО", group: "Wildlife",
        n_events: 60,
        history: { weeks: ["w1", "w2"], smooth: [4.0, 5.0], raw: [3, 6] },
        forecast: { weeks: ["f1", "f2", "f3", "f4"], point: [5.1, 5.4, 5.7, 7.0], q10: [1, 1, 1, 2], q90: [9, 9, 9, 11] },
      },
      {
        key: "ЦФО:Ruminant", label: "ЦФО — жвачные", district: "ЦФО", group: "Ruminant",
        n_events: 40,
        history: { weeks: ["w1", "w2"], smooth: [2.0, 2.0], raw: [2, 2] },
        forecast: { weeks: ["f1", "f2", "f3", "f4"], point: [2.0, 2.0, 2.0, 2.0], q10: [0, 0, 0, 0], q90: [4, 4, 4, 4] },
      },
      {
        key: "СФО:Wildlife", label: "СФО — дикие", district: "СФО", group: "Wildlife",
        n_events: 30,
        history: { weeks: ["w1", "w2"], smooth: [1.0, 0.9], raw: [1, 1] },
        forecast: { weeks: ["f1", "f2", "f3", "f4"], point: [0.6, 0.5, 0.4, 0.3], q10: [0, 0, 0, 0], q90: [2, 2, 2, 2] },
      },
      {
        key: "any:Wildlife", label: "Россия — дикие", district: "any", group: "Wildlife",
        n_events: 130,
        history: { weeks: ["w1", "w2"], smooth: [7.0, 7.9], raw: [6, 9] },
        forecast: { weeks: ["f1", "f2", "f3", "f4"], point: [8, 8, 8, 8], q10: [0, 0, 0, 0], q90: [0, 0, 0, 0] },
      },
    ],
  };
}

describe("trendOf", () => {
  it("рост при ratio > 1.25", () => {
    expect(trendOf(6.4, 5.0)).toBe("up");
  });
  it("спад при ratio < 0.75", () => {
    expect(trendOf(0.3, 0.9)).toBe("down");
  });
  it("стабильно в коридоре", () => {
    expect(trendOf(2.0, 2.0)).toBe("flat");
  });
  it("нулевое прошлое не делит на ноль", () => {
    expect(trendOf(1.0, 0)).toBe("up");
    expect(trendOf(0, 0)).toBe("flat");
  });
});

describe("radiusFor", () => {
  it("нулевое значение — минимальный радиус", () => {
    expect(radiusFor(0, 10)).toBe(5);
  });
  it("максимум соответствует maxR", () => {
    expect(radiusFor(10, 10)).toBe(22);
  });
  it("sqrt-шкала: половина значения даёт ~0.84 высоты (sqrt(0.5)≈0.707)", () => {
    const r = radiusFor(5, 10);
    expect(r).toBeGreaterThan(15);
    expect(r).toBeLessThan(20);
  });
});

describe("trendColor", () => {
  it("рост красный, спад синий", () => {
    expect(trendColor("up")).toBe("#D32F2F");
    expect(trendColor("down")).toBe("#1565C0");
  });
});

describe("districtsForecast", () => {
  it("суммирует группы внутри округа и агрегирует коридор", () => {
    const rows = districtsForecast(fixture());
    const cfo = rows.find((r) => r.code === "ЦФО")!;
    expect(cfo.value).toBeCloseTo(9.0, 3); // 7.0 + 2.0 (ratio 9/7 > 1.25 → рост)
    expect(cfo.last).toBeCloseTo(7.0, 3);  // 5.0 + 2.0
    expect(cfo.q10).toBe(2);
    expect(cfo.q90).toBe(15);              // 11 + 4
    expect(cfo.nSeries).toBe(2);
    expect(cfo.nEvents).toBe(100);
    expect(cfo.trend).toBe("up");
    expect(cfo.radius).toBe(22);           // максимум
  });

  it("национальные серии (district=any) не попадают на карту", () => {
    const rows = districtsForecast(fixture());
    expect(rows.find((r) => r.code === "any")).toBeUndefined();
    expect(rows).toHaveLength(2); // ЦФО + СФО (ДФО без координат отброшен)
  });

  it("фильтр по группам оставляет только выбранные", () => {
    const rows = districtsForecast(fixture(), new Set(["Ruminant"]));
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("ЦФО");
    expect(rows[0].value).toBeCloseTo(2.0, 3);
  });

  it("спад красится синим и получает радиус меньше максимума", () => {
    const rows = districtsForecast(fixture());
    const sfo = rows.find((r) => r.code === "СФО")!;
    expect(sfo.trend).toBe("down");
    expect(sfo.color).toBe("#1565C0");
    expect(sfo.radius).toBeLessThan(22);
  });
});
