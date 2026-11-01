import { describe, it, expect } from "vitest";
import { isValidCustomPoint } from "./custom-data-import";

/** QA sw32 (Н2): мусорные координаты в импорте CSV/JSON должны
 *  отбрасываться на входе расчёта дистанций — как NaN, так и out-of-range. */
describe("isValidCustomPoint", () => {
  it("принимает корректные земные координаты", () => {
    expect(isValidCustomPoint({ lat: 55.75, lon: 37.61 })).toBe(true);
    expect(isValidCustomPoint({ lat: -90, lon: 180 })).toBe(true);
    expect(isValidCustomPoint({ lat: 90, lon: -180 })).toBe(true);
  });

  it("отбрасывает координаты вне земных диапазонов (lat=99999/lon=99999)", () => {
    expect(isValidCustomPoint({ lat: 99999, lon: 99999 })).toBe(false);
    expect(isValidCustomPoint({ lat: 91, lon: 37.61 })).toBe(false);
    expect(isValidCustomPoint({ lat: -90.5, lon: 0 })).toBe(false);
    expect(isValidCustomPoint({ lat: 55.75, lon: 181 })).toBe(false);
    expect(isValidCustomPoint({ lat: 55.75, lon: -180.1 })).toBe(false);
  });

  it("отбрасывает NaN/Infinity (строки «abc»/«def» в CSV)", () => {
    expect(isValidCustomPoint({ lat: NaN, lon: NaN })).toBe(false);
    expect(isValidCustomPoint({ lat: Infinity, lon: 37.61 })).toBe(false);
  });

  it("отбрасывает (0,0) — точка в океане, прежнее поведение", () => {
    expect(isValidCustomPoint({ lat: 0, lon: 0 })).toBe(false);
  });
});
