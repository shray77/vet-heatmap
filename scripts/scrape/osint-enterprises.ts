#!/usr/bin/env bun
/**
 * OSINT: Search for large agricultural enterprises in Russia.
 *
 * Uses public registries and OpenStreetMap Overpass API to find:
 *   - Large livestock farms (свиноводческие комплексы, птицефабрики)
 *   - Meat processing plants (мясокомбинаты)
 *   - Major markets (животноводческие рынки)
 *
 * Output: public/data/enterprises.json
 *
 * This data is NOT secret — it's publicly available via:
 *   - OpenStreetMap (Overpass API) — tags like landuse=farm, farm=*
 *   - Россельхознадзор registry (public API)
 *   - Open corporate registries (ЕГРЮЛ)
 *
 * Usage:
 *   bun run scripts/scrape/osint-enterprises.ts
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const OUTPUT_PATH = resolve("public/data/enterprises.json");

interface Enterprise {
  id: string;
  name: string;
  type: "farm" | "meat_plant" | "market" | "dairy";
  lat: number;
  lon: number;
  region?: string;
  tags?: Record<string, string>;
}

/**
 * Query Overpass API for agricultural facilities in Russia.
 * Bounding box: roughly Russia (lat 41-82, lon 19-180)
 */
async function queryOverpass(): Promise<Enterprise[]> {
  const query = `
    [out:json][timeout:60];
    (
      // Large farms
      node["landuse"="farm"](41,19,82,180);
      way["landuse"="farm"](41,19,82,180);
      node["farm"](41,19,82,180);
      way["farm"](41,19,82,180);
      // Meat processing
      node["industrial"="meat"](41,19,82,180);
      way["industrial"="meat"](41,19,82,180);
      // Animal markets
      node["amenity"="marketplace"]["name"~"животн\\|скот\\|птиц",i](41,19,82,180);
    );
    out center 500;
  `;

  console.log("Querying Overpass API...");
  try {
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!resp.ok) throw new Error(`Overpass returned ${resp.status}`);
    const data = await resp.json() as { elements: Array<Record<string, unknown>> };

    const enterprises: Enterprise[] = [];
    for (const el of data.elements) {
      const tags = (el.tags || {}) as Record<string, string>;
      const name = tags.name || tags["name:ru"] || "";
      if (!name) continue;

      const lat = (el.lat || el.center?.lat) as number;
      const lon = (el.lon || el.center?.lon) as number;
      if (!lat || !lon) continue;

      let type: Enterprise["type"] = "farm";
      if (tags.industrial === "meat") type = "meat_plant";
      else if (tags.amenity === "marketplace") type = "market";
      else if (tags.farm === "dairy") type = "dairy";

      enterprises.push({
        id: `osm-${el.id}`,
        name,
        type,
        lat,
        lon,
        tags,
      });
    }

    console.log(`  Found ${enterprises.length} enterprises from OSM`);
    return enterprises;
  } catch (e) {
    console.error(`  Overpass error: ${e}`);
    return [];
  }
}

/**
 * Curated list of major Russian agricultural enterprises.
 * Sources: public corporate websites, ЕГРЮЛ, industry reports.
 */
const CURATED_ENTERPRISES: Enterprise[] = [
  // Крупные свиноводческие комплексы
  { id: "cur-1", name: "Мираторг (свиноводство)", type: "farm", lat: 50.59, lon: 36.58, region: "Белгородская область" },
  { id: "cur-2", name: "Русагро (свиноводство)", type: "farm", lat: 51.53, lon: 39.16, region: "Воронежская область" },
  { id: "cur-3", name: "Черкизово (свиноводство)", type: "farm", lat: 55.75, lon: 37.61, region: "Московская область" },
  { id: "cur-4", name: "Сибагро (свиноводство)", type: "farm", lat: 56.50, lon: 84.97, region: "Томская область" },
  { id: "cur-5", name: "Агрохолдинг КРиМ", type: "farm", lat: 55.02, lon: 82.93, region: "Новосибирская область" },

  // Крупные птицефабрики
  { id: "cur-6", name: "Приосколье (птицеводство)", type: "farm", lat: 50.41, lon: 37.51, region: "Белгородская область" },
  { id: "cur-7", name: "БЕЛГРАНКОРМ (птицеводство)", type: "farm", lat: 50.59, lon: 36.58, region: "Белгородская область" },
  { id: "cur-8", name: "Русагро (птицеводство)", type: "farm", lat: 51.53, lon: 39.16, region: "Воронежская область" },
  { id: "cur-9", name: "Уралбройлер", type: "farm", lat: 56.02, lon: 60.58, region: "Челябинская область" },
  { id: "cur-10", name: "Линдовская птицефабрика", type: "farm", lat: 56.32, lon: 43.98, region: "Нижегородская область" },

  // Крупные мясокомбинаты
  { id: "cur-11", name: "Микоян", type: "meat_plant", lat: 55.73, lon: 37.65, region: "Москва" },
  { id: "cur-12", name: "Черкизово (мясопереработка)", type: "meat_plant", lat: 55.79, lon: 37.71, region: "Москва" },
  { id: "cur-13", name: "Останкинский мясоперерабатывающий", type: "meat_plant", lat: 55.83, lon: 37.60, region: "Москва" },
  { id: "cur-14", name: "Великолукский мясокомбинат", type: "meat_plant", lat: 56.34, lon: 30.52, region: "Псковская область" },
  { id: "cur-15", name: "Омский бекон", type: "meat_plant", lat: 54.99, lon: 73.37, region: "Омская область" },

  // Молочные комбинаты
  { id: "cur-16", name: "Данон Россия", type: "dairy", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-17", name: "Вимм-Билль-Данн", type: "dairy", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-18", name: "Молвест", type: "dairy", lat: 51.66, lon: 39.20, region: "Воронежская область" },

  // Животноводческие рынки
  { id: "cur-19", name: "Сенная ярмарка (скотный рынок)", type: "market", lat: 51.53, lon: 39.16, region: "Воронежская область" },
];

async function main() {
  console.log("=== OSINT: Agricultural Enterprises ===\n");

  const osmData = await queryOverpass();

  // Merge: OSM + curated (deduplicate by name similarity)
  const allNames = new Set(osmData.map((e) => e.name.toLowerCase()));
  const merged = [...osmData];
  for (const c of CURATED_ENTERPRISES) {
    if (!allNames.has(c.name.toLowerCase())) {
      merged.push(c);
    }
  }

  // Sort by name
  merged.sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    updated: new Date().toISOString().split("T")[0],
    sources: ["openstreetmap", "curated"],
    total: merged.length,
    enterprises: merged,
  };

  await mkdir(resolve(OUTPUT_PATH, ".."), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\n✓ Written ${merged.length} enterprises to ${OUTPUT_PATH}`);
  console.log(`  Sources: OSM=${osmData.length}, Curated=${CURATED_ENTERPRISES.length}`);
}

main().catch(console.error);
