import { describe, it, expect } from "vitest";
import { diseaseColor, DISEASE_COLORS, GROUP_COLORS, readableInk } from "./colors";
import type { DiseaseKey, DiseaseGroup } from "@/types/domain";

describe("diseaseColor", () => {
  it("returns specific disease color when defined", () => {
    expect(diseaseColor("asf", "Swine")).toBe(DISEASE_COLORS.asf);
    expect(diseaseColor("hpai", "Avian")).toBe(DISEASE_COLORS.hpai);
  });

  it("falls back to group color when disease color not defined", () => {
    // Use a disease key that's not in DISEASE_COLORS. All 51 real diseases
    // have colors now, so use a fake key.
    const key = "__nonexistent_disease__" as DiseaseKey;
    expect(DISEASE_COLORS[key]).toBeUndefined(); // sanity check
    expect(diseaseColor(key, "Swine")).toBe(GROUP_COLORS.Swine);
  });

  it("falls back to multi-species group color when group is unknown", () => {
    // @ts-expect-error testing invalid group
    const result = diseaseColor("unknown" as DiseaseKey, "NonexistentGroup");
    expect(result).toBe(GROUP_COLORS["Multi-species"]);
  });

  it("all 6 groups have colors", () => {
    const groups: DiseaseGroup[] = ["Avian", "Swine", "Ruminant", "Equine/Wildlife", "Wildlife", "Multi-species"];
    for (const g of groups) {
      expect(GROUP_COLORS[g]).toBeDefined();
      expect(GROUP_COLORS[g]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("readableInk", () => {
  it("осветляет тёмные цвета для dark-темы до читаемой светимости", () => {
    const ink = readableInk("#3E2723", true); // Сиб. язва — был 1.5:1 на тёмной панели
    expect(ink).not.toBe("#3E2723");
    // светимость результата >= 0.3 → контраст на #0F1419 выше 4:1
    const r = parseInt(ink.slice(1, 3), 16), g = parseInt(ink.slice(3, 5), 16), b = parseInt(ink.slice(5, 7), 16);
    const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    expect(L).toBeGreaterThanOrEqual(0.3);
  });

  it("затемняет светлые цвета для light-темы до контраста ~4.5:1 на белом", () => {
    const ink = readableInk("#FBC02D", false); // Нозематоз — жёлтый на светлом
    expect(ink).not.toBe("#FBC02D");
    const r = parseInt(ink.slice(1, 3), 16), g = parseInt(ink.slice(3, 5), 16), b = parseInt(ink.slice(5, 7), 16);
    const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    // контраст на белом: (1.05)/(L+0.05) >= 4.5  <=>  L <= 0.183
    expect(L).toBeLessThanOrEqual(0.183);
  });

  it("уже читаемые цвета не меняет", () => {
    expect(readableInk("#FF8F00", true)).toBe("#FF8F00");  // светимость > 0.3
    expect(readableInk("#3E2723", false)).toBe("#3E2723"); // светимость < 0.18
  });
});
