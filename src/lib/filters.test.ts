import { describe, it, expect } from "vitest";
import { applyFilters, filtersToParams, paramsToFilters, DEFAULT_FILTERS, type FilterState } from "./filters";
import type { Outbreak, DiseaseKey, OutbreakStatus } from "@/types/domain";

function makeOutbreak(overrides: Partial<Outbreak> = {}): Outbreak {
  return {
    id: 1,
    disease_key: "asf" as DiseaseKey,
    disease: "АЧС",
    disease_group: "Swine",
    region: "Московская область",
    region_geo: "Moskovskaya",
    date: "2024-06-15",
    species: "Swine (domestic)",
    cases: 100,
    deaths: 50,
    status: "Ongoing" as OutbreakStatus,
    source: "fsvps",
    source_url: "",
    notes: "",
    ...overrides,
  };
}

// Helper to build FilterState with proper typing (avoid `never[]` inference)
function makeFilters(overrides: Partial<FilterState> = {}): FilterState {
  return {
    ...DEFAULT_FILTERS,
    ...overrides,
  };
}

describe("applyFilters", () => {
  const outbreaks = [
    makeOutbreak({ id: 1, disease_key: "asf", disease: "АЧС", region: "Москва", species: "Swine (domestic)", status: "Ongoing", date: "2024-06-15", federal_district: "ЦФО" }),
    makeOutbreak({ id: 2, disease_key: "hpai", disease: "Грипп птиц", region: "Краснодар", species: "Poultry", status: "Resolved", date: "2024-07-01", federal_district: "ЮФО" }),
    makeOutbreak({ id: 3, disease_key: "fmd", disease: "Ящур", region: "Воронеж", species: "Cattle", status: "Ongoing", date: "2023-01-01", federal_district: "ЦФО" }),
  ];

  it("returns all outbreaks when filters are empty", () => {
    const f = makeFilters({ diseases: [], species: [], statuses: [], federalDistricts: [], dateFrom: null, dateTo: null, query: "" });
    expect(applyFilters(outbreaks, f)).toHaveLength(3);
  });

  it("filters by disease", () => {
    const f = makeFilters({ diseases: ["asf" as DiseaseKey], species: [], statuses: [], federalDistricts: [], dateFrom: null, dateTo: null, query: "" });
    const result = applyFilters(outbreaks, f);
    expect(result).toHaveLength(1);
    expect(result[0].disease_key).toBe("asf");
  });

  it("filters by multiple diseases", () => {
    const f = makeFilters({ diseases: ["asf", "hpai"] as DiseaseKey[], species: [], statuses: [], federalDistricts: [], dateFrom: null, dateTo: null, query: "" });
    expect(applyFilters(outbreaks, f)).toHaveLength(2);
  });

  it("filters by status", () => {
    const f = makeFilters({ diseases: [], species: [], statuses: ["Ongoing"], federalDistricts: [], dateFrom: null, dateTo: null, query: "" });
    const result = applyFilters(outbreaks, f);
    expect(result).toHaveLength(2);
    expect(result.every((o) => o.status === "Ongoing")).toBe(true);
  });

  it("filters by federal district", () => {
    const f = makeFilters({ diseases: [], species: [], statuses: [], federalDistricts: ["ЦФО"], dateFrom: null, dateTo: null, query: "" });
    expect(applyFilters(outbreaks, f)).toHaveLength(2);
  });

  it("filters by date range", () => {
    const f = makeFilters({ diseases: [], species: [], statuses: [], federalDistricts: [], dateFrom: "2024-01-01", dateTo: "2024-12-31", query: "" });
    expect(applyFilters(outbreaks, f)).toHaveLength(2);
  });

  it("filters by search query (disease name)", () => {
    const f = makeFilters({ diseases: [], species: [], statuses: [], federalDistricts: [], dateFrom: null, dateTo: null, query: "ящур" });
    expect(applyFilters(outbreaks, f)).toHaveLength(1);
  });

  it("filters by search query (region)", () => {
    const f = makeFilters({ diseases: [], species: [], statuses: [], federalDistricts: [], dateFrom: null, dateTo: null, query: "краснодар" });
    expect(applyFilters(outbreaks, f)).toHaveLength(1);
  });

  it("combines multiple filters (AND logic)", () => {
    const f = makeFilters({ diseases: [], species: ["Swine (domestic)"], statuses: ["Ongoing"], federalDistricts: ["ЦФО"], dateFrom: null, dateTo: null, query: "" });
    expect(applyFilters(outbreaks, f)).toHaveLength(1);
  });

  it("returns empty array when nothing matches", () => {
    const f = makeFilters({ diseases: ["rabies" as DiseaseKey], species: [], statuses: [], federalDistricts: [], dateFrom: null, dateTo: null, query: "" });
    expect(applyFilters(outbreaks, f)).toHaveLength(0);
  });
});

describe("paramsToFilters: клампинг координат из URL (QA sw32, К1)", () => {
  it("клампит lat=999/lng=999 к земным диапазонам вместо краша MapLibre", () => {
    const f = paramsToFilters(new URLSearchParams("d=asf&lat=999&lng=999"));
    expect(f.mapLat).toBe(90);
    expect(f.mapLng).toBe(180);
  });

  it("клампит отрицательные выходы за диапазон", () => {
    const f = paramsToFilters(new URLSearchParams("lat=-120.5&lng=-200"));
    expect(f.mapLat).toBe(-90);
    expect(f.mapLng).toBe(-180);
  });

  it("валидные координаты проходят без изменений", () => {
    const f = paramsToFilters(new URLSearchParams("lat=55.7558&lng=37.6173&z=4.7"));
    expect(f.mapLat).toBe(55.7558);
    expect(f.mapLng).toBe(37.6173);
    expect(f.mapZoom).toBe(4.7);
  });

  it("мусорные значения отбрасываются (abc, пусто, Infinity)", () => {
    const f = paramsToFilters(new URLSearchParams("lat=abc&lng=&lat2=x"));
    expect(f.mapLat).toBeUndefined();
    expect(f.mapLng).toBeUndefined();
    expect(paramsToFilters(new URLSearchParams("lat=1e999")).mapLat).toBeUndefined();
  });

  it("граничные значения диапазона валидны", () => {
    const f = paramsToFilters(new URLSearchParams("lat=90&lng=-180"));
    expect(f.mapLat).toBe(90);
    expect(f.mapLng).toBe(-180);
  });
});

describe("filtersToParams / paramsToFilters", () => {
  it("round-trips empty filters", () => {
    const f = makeFilters({ diseases: [], species: [], statuses: [], federalDistricts: [], dateFrom: null, dateTo: null, query: "" });
    const params = filtersToParams(f);
    const restored = paramsToFilters(params);
    expect(restored.diseases).toEqual([]);
    expect(restored.query).toBe("");
  });

  it("round-trips populated filters", () => {
    const f = makeFilters({ diseases: ["asf", "hpai"] as DiseaseKey[], species: ["Poultry"], statuses: ["Ongoing"], federalDistricts: ["ЦФО"], dateFrom: "2024-01-01", dateTo: "2024-12-31", query: "тест" });
    const params = filtersToParams(f);
    const restored = paramsToFilters(params);
    expect(restored.diseases).toEqual(["asf", "hpai"]);
    expect(restored.species).toEqual(["Poultry"]);
    expect(restored.statuses).toEqual(["Ongoing"]);
    expect(restored.query).toBe("тест");
  });
});
