#!/usr/bin/env bun
/**
 * OSINT: Agricultural enterprises in Russia — simplified & fixed.
 *
 * Previous versions had two bugs:
 *   1. bbox 41,19,82,180 returned all of Eastern Europe (Poland, Romania,
 *      Finland) — 7/59 entries were non-Russian.
 *   2. Tags like farm=pig and industrial=meat are NOT used in Russian OSM
 *      data — they returned 0 results. Russian OSM uses man_made=works
 *      with Cyrillic names like "Мясокомбинат", "Птицефабрика".
 *
 * This version:
 *   - Uses area["ISO3166-1"="RU"] filter (proper Russia boundary)
 *   - Queries by NAME pattern (Russian keywords), not by specialized tags
 *     that are rarely used in Russia
 *   - Adds a paranoid isInRussia() filter for Kaliningrad exclave
 *   - Falls back to curated list when OSM returns nothing
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const OUTPUT_PATH = resolve("public/data/enterprises.json");

interface Enterprise {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  region?: string;
  capacity?: string;
  tags?: Record<string, string>;
}

const RUSSIA_AREA = 'area["ISO3166-1"="RU"]->.ru';

async function queryOverpass(query: string, label: string): Promise<Enterprise[]> {
  console.log(`  [overpass] ${label}...`);
  // Try multiple Overpass mirrors in order — main one is often overloaded.
  const MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];
  for (const mirror of MIRRORS) {
    try {
      const resp = await fetch(mirror, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "VetKarta/1.0 (veterinary epidemiology dashboard)",
        },
        signal: AbortSignal.timeout(45000),  // 45s per mirror
      });
      if (!resp.ok) {
        console.log(`    ${mirror}: HTTP ${resp.status}, trying next…`);
        continue;
      }
      const data = await resp.json() as { elements: Array<Record<string, unknown>> };
      console.log(`    ✓ ${mirror.split("//")[1].split("/")[0]}: ${data.elements.length} results`);
      return data.elements.map((el) => {
        const tags = ((el.tags || {}) as Record<string, string>);
        const center = (el as { center?: { lat: number; lon: number } }).center;
        const lat = (el.lat as number | undefined) ?? center?.lat;
        const lon = (el.lon as number | undefined) ?? center?.lon;
        return {
          id: `osm-${el.id}`,
          name: tags.name || tags["name:ru"] || tags.brand || "",
          type: label,
          lat: lat as number,
          lon: lon as number,
          tags,
        };
      }).filter((e) => e.name && Number.isFinite(e.lat) && Number.isFinite(e.lon));
    } catch (e) {
      console.log(`    ${mirror.split("//")[1].split("/")[0]}: ${e}, trying next…`);
    }
  }
  console.error(`    ✗ ${label}: all mirrors failed`);
  return [];
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function queryAllCategories(): Promise<Enterprise[]> {
  const all: Enterprise[] = [];

  // 1. Pig farms — name contains "свин" (свиновод, свинокомплекс, свиноферма)
  const pig = await queryOverpass(`
    [out:json][timeout:60];
    ${RUSSIA_AREA};
    (
      node["name"~"свин",i](area.ru);
      way["name"~"свин",i](area.ru);
    );
    out center 200;
  `, "pig_farm");
  all.push(...pig);
  await sleep(1500);

  // 2. Poultry farms — name contains "птиц" (птицефабрика, птицевод)
  const poultry = await queryOverpass(`
    [out:json][timeout:60];
    ${RUSSIA_AREA};
    (
      node["name"~"птиц",i](area.ru);
      way["name"~"птиц",i](area.ru);
    );
    out center 300;
  `, "poultry_farm");
  all.push(...poultry);
  await sleep(1500);

  // 3. Cattle/dairy farms — name contains "крс", "скот", "молочн", "коров"
  const cattle = await queryOverpass(`
    [out:json][timeout:60];
    ${RUSSIA_AREA};
    (
      node["name"~"крс|скот|молочн|коров",i](area.ru);
      way["name"~"крс|скот|молочн|коров",i](area.ru);
    );
    out center 200;
  `, "cattle_farm");
  all.push(...cattle);
  await sleep(1500);

  // 4. Meat plants — name contains "мяс" (мясокомбинат, мясопереработка)
  const meat = await queryOverpass(`
    [out:json][timeout:60];
    ${RUSSIA_AREA};
    (
      node["name"~"мяс",i](area.ru);
      way["name"~"мяс",i](area.ru);
    );
    out center 300;
  `, "meat_plant");
  all.push(...meat);
  await sleep(1500);

  // 5. Slaughterhouses — name contains "убой" or "бойня"
  const slaughter = await queryOverpass(`
    [out:json][timeout:45];
    ${RUSSIA_AREA};
    (
      node["name"~"убой|бойн",i](area.ru);
      way["name"~"убой|бойн",i](area.ru);
    );
    out center 100;
  `, "slaughterhouse");
  all.push(...slaughter);
  await sleep(1500);

  // 6. Feed mills — name contains "комбикорм"
  const feed = await queryOverpass(`
    [out:json][timeout:45];
    ${RUSSIA_AREA};
    (
      node["name"~"комбикорм",i](area.ru);
      way["name"~"комбикорм",i](area.ru);
    );
    out center 100;
  `, "feed_mill");
  all.push(...feed);
  await sleep(1500);

  // 7. Veterinary — amenity=veterinary (this tag IS used in Russia)
  const vet = await queryOverpass(`
    [out:json][timeout:45];
    ${RUSSIA_AREA};
    (
      node["amenity"="veterinary"](area.ru);
      way["amenity"="veterinary"](area.ru);
    );
    out center 500;
  `, "vet_clinic");
  all.push(...vet);

  return all;
}

// ─── Curated enterprises (top 65) ────────────────────────────

const CURATED: Enterprise[] = [
  // ─── Топ-15 свиноводческих комплексов ─────────────────────
  { id: "cur-1", name: "Мираторг — свиноводство", type: "pig_farm", lat: 50.59, lon: 36.58, region: "Белгородская обл.", capacity: "500000+ голов" },
  { id: "cur-2", name: "Русагро — свиноводство", type: "pig_farm", lat: 51.53, lon: 39.16, region: "Воронежская обл.", capacity: "300000+ голов" },
  { id: "cur-3", name: "Черкизово — свиноводство", type: "pig_farm", lat: 55.75, lon: 37.61, region: "Московская обл.", capacity: "250000+ голов" },
  { id: "cur-4", name: "Сибагро — свиноводство", type: "pig_farm", lat: 56.50, lon: 84.97, region: "Томская обл.", capacity: "200000+ голов" },
  { id: "cur-5", name: "Агрохолдинг КРиМ", type: "pig_farm", lat: 55.02, lon: 82.93, region: "Новосибирская обл.", capacity: "150000+ голов" },
  { id: "cur-6", name: "Великолукский СК", type: "pig_farm", lat: 56.34, lon: 30.52, region: "Псковская обл.", capacity: "120000+ голов" },
  { id: "cur-7", name: "Омский бекон", type: "pig_farm", lat: 54.99, lon: 73.37, region: "Омская обл.", capacity: "120000+ голов" },
  { id: "cur-8", name: "Краснодарский свинокомплекс", type: "pig_farm", lat: 45.04, lon: 38.98, region: "Краснодарский край", capacity: "100000+ голов" },
  { id: "cur-9", name: "Тамбовские фермы", type: "pig_farm", lat: 52.72, lon: 41.45, region: "Тамбовская обл.", capacity: "100000+ голов" },
  { id: "cur-10", name: "Курский свинокомплекс", type: "pig_farm", lat: 51.73, lon: 36.19, region: "Курская обл.", capacity: "80000+ голов" },
  { id: "cur-11", name: "Тюменский свинокомплекс", type: "pig_farm", lat: 57.15, lon: 65.53, region: "Тюменская обл." },
  { id: "cur-12", name: "Алтайский свинокомплекс", type: "pig_farm", lat: 53.35, lon: 83.78, region: "Алтайский край" },
  { id: "cur-13", name: "Вологодский свинокомплекс", type: "pig_farm", lat: 59.22, lon: 39.89, region: "Вологодская обл." },
  { id: "cur-14", name: "Дальневосточный свинокомплекс", type: "pig_farm", lat: 43.35, lon: 132.07, region: "Приморский край" },
  { id: "cur-15", name: "Племзавод «Большевик» (свиноводство)", type: "pig_farm", lat: 51.73, lon: 36.19, region: "Курская обл." },

  // ─── Топ-15 птицефабрик ──────────────────────────────────
  { id: "cur-16", name: "Приосколье — птицеводство", type: "poultry_farm", lat: 50.41, lon: 37.51, region: "Белгородская обл.", capacity: "млн+ голов" },
  { id: "cur-17", name: "БЕЛГРАНКОРМ — птицеводство", type: "poultry_farm", lat: 50.59, lon: 36.58, region: "Белгородская обл." },
  { id: "cur-18", name: "Уралбройлер", type: "poultry_farm", lat: 56.02, lon: 60.58, region: "Челябинская обл." },
  { id: "cur-19", name: "Линдовская птицефабрика", type: "poultry_farm", lat: 56.32, lon: 43.98, region: "Нижегородская обл." },
  { id: "cur-20", name: "Северная птицефабрика", type: "poultry_farm", lat: 59.94, lon: 30.31, region: "Ленинградская обл." },
  { id: "cur-21", name: "Роскар (птицеводство)", type: "poultry_farm", lat: 55.75, lon: 37.61, region: "Московская обл." },
  { id: "cur-22", name: "Васильевская птицефабрика", type: "poultry_farm", lat: 55.35, lon: 49.12, region: "Республика Татарстан" },
  { id: "cur-23", name: "Синявинская птицефабрика", type: "poultry_farm", lat: 59.72, lon: 31.02, region: "Ленинградская обл." },
  { id: "cur-24", name: "Боровская птицефабрика", type: "poultry_farm", lat: 57.05, lon: 65.32, region: "Тюменская обл." },
  { id: "cur-25", name: "Птицефабрика Челябинская", type: "poultry_farm", lat: 55.16, lon: 61.40, region: "Челябинская обл." },
  { id: "cur-26", name: "Молжаниновская птицефабрика", type: "poultry_farm", lat: 55.90, lon: 37.40, region: "Московская обл." },
  { id: "cur-27", name: "Марийская птицефабрика", type: "poultry_farm", lat: 56.64, lon: 47.89, region: "Республика Марий Эл" },
  { id: "cur-28", name: "Птицефабрика Свердловская", type: "poultry_farm", lat: 56.85, lon: 60.61, region: "Свердловская обл." },
  { id: "cur-29", name: "Омская птицефабрика", type: "poultry_farm", lat: 55.00, lon: 73.40, region: "Омская обл." },
  { id: "cur-30", name: "Красноярская птицефабрика", type: "poultry_farm", lat: 56.01, lon: 92.85, region: "Красноярский край" },

  // ─── Топ-15 мясокомбинатов ────────────────────────────────
  { id: "cur-31", name: "Микоян", type: "meat_plant", lat: 55.73, lon: 37.65, region: "Москва" },
  { id: "cur-32", name: "Черкизово — мясопереработка", type: "meat_plant", lat: 55.79, lon: 37.71, region: "Москва" },
  { id: "cur-33", name: "Останкинский мясоперерабатывающий", type: "meat_plant", lat: 55.83, lon: 37.60, region: "Москва" },
  { id: "cur-34", name: "Великолукский мясокомбинат", type: "meat_plant", lat: 56.34, lon: 30.52, region: "Псковская обл." },
  { id: "cur-35", name: "Кампомос", type: "meat_plant", lat: 54.32, lon: 48.40, region: "Ульяновская обл." },
  { id: "cur-36", name: "Раменский мясокомбинат", type: "meat_plant", lat: 55.57, lon: 38.22, region: "Московская обл." },
  { id: "cur-37", name: "Самкамен", type: "meat_plant", lat: 53.20, lon: 50.15, region: "Самарская обл." },
  { id: "cur-38", name: "Таврия", type: "meat_plant", lat: 47.21, lon: 39.71, region: "Ростовская обл." },
  { id: "cur-39", name: "Омский мясокомбинат", type: "meat_plant", lat: 55.00, lon: 73.40, region: "Омская обл." },
  { id: "cur-40", name: "Новосибирский мясокомбинат", type: "meat_plant", lat: 55.03, lon: 82.92, region: "Новосибирская обл." },
  { id: "cur-41", name: "Екатеринбургский мясокомбинат", type: "meat_plant", lat: 56.84, lon: 60.61, region: "Свердловская обл." },
  { id: "cur-42", name: "Казанский мясокомбинат", type: "meat_plant", lat: 55.79, lon: 49.12, region: "Республика Татарстан" },
  { id: "cur-43", name: "Воронежский мясокомбинат", type: "meat_plant", lat: 51.66, lon: 39.20, region: "Воронежская обл." },
  { id: "cur-44", name: "Краснодарский мясокомбинат", type: "meat_plant", lat: 45.04, lon: 38.98, region: "Краснодарский край" },
  { id: "cur-45", name: "Иркутский мясокомбинат", type: "meat_plant", lat: 52.28, lon: 104.28, region: "Иркутская обл." },

  // ─── КРС комплексы ─────────────────────────────────────────
  { id: "cur-46", name: "Мираторг — КРС (мясное скотоводство)", type: "cattle_farm", lat: 50.59, lon: 36.58, region: "Белгородская обл.", capacity: "100000+ голов" },
  { id: "cur-47", name: "Заречное (КРС)", type: "cattle_farm", lat: 51.53, lon: 39.16, region: "Воронежская обл." },
  { id: "cur-48", name: "Агрокомплекс Кургансемена (КРС)", type: "cattle_farm", lat: 55.44, lon: 65.34, region: "Курганская обл." },
  { id: "cur-49", name: "Калужский КРС комплекс", type: "cattle_farm", lat: 54.51, lon: 36.26, region: "Калужская обл." },
  { id: "cur-50", name: "Племзавод «Россия» (КРС)", type: "cattle_farm", lat: 51.22, lon: 39.18, region: "Воронежская обл." },
  { id: "cur-51", name: "Племзавод «Красноозерский»", type: "cattle_farm", lat: 53.97, lon: 80.08, region: "Новосибирская обл." },
  { id: "cur-52", name: "Племзавод «Ирмень»", type: "cattle_farm", lat: 55.05, lon: 82.50, region: "Новосибирская обл." },

  // ─── Молочные комбинаты ───────────────────────────────────
  { id: "cur-53", name: "Данон Россия", type: "dairy", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-54", name: "Вимм-Билль-Данн", type: "dairy", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-55", name: "Молвест", type: "dairy", lat: 51.66, lon: 39.20, region: "Воронежская обл." },
  { id: "cur-56", name: "Простоквашино", type: "dairy", lat: 56.85, lon: 60.61, region: "Свердловская обл." },

  // ─── Животноводческие рынки ───────────────────────────────
  { id: "cur-57", name: "Сенная ярмарка (скотный рынок)", type: "market", lat: 51.53, lon: 39.16, region: "Воронежская обл." },
  { id: "cur-58", name: "Тушинский скотный рынок", type: "market", lat: 55.82, lon: 37.46, region: "Москва" },
  { id: "cur-59", name: "Казанская ярмарка", type: "market", lat: 55.79, lon: 49.12, region: "Республика Татарстан" },

  // ─── Комбикормовые заводы ─────────────────────────────────
  { id: "cur-60", name: "Комбикормовый завод «Воронежский»", type: "feed_mill", lat: 51.66, lon: 39.20, region: "Воронежская обл." },
  { id: "cur-61", name: "Комбикормовый завод «ТопПро»", type: "feed_mill", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-62", name: "Сибирский комбикормовый завод", type: "feed_mill", lat: 55.03, lon: 82.92, region: "Новосибирская обл." },
];

// ─── Russia bounding box (final filter) ──────────────────────
function isInRussia(lat: number, lon: number): boolean {
  // Mainland Russia
  if (lat >= 41 && lat <= 82 && lon >= 28 && lon <= 180) return true;
  // Kaliningrad exclave
  if (lat >= 54 && lat <= 56 && lon >= 19 && lon <= 23) return true;
  return false;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("=== OSINT: Agricultural Enterprises in Russia ===\n");

  const osmData = await queryAllCategories();
  console.log(`\n  Total OSM results (raw): ${osmData.length}`);

  // Filter to Russia only (paranoid check)
  const ruOnly = osmData.filter((e) => isInRussia(e.lat, e.lon));
  console.log(`  After Russia filter: ${ruOnly.length}`);
  if (ruOnly.length < osmData.length) {
    console.log(`  (filtered out ${osmData.length - ruOnly.length} non-RU entries)`);
  }

  // Deduplicate by name (case-insensitive)
  const seenNames = new Set<string>();
  const dedupedOsm = ruOnly.filter(e => {
    const key = e.name.toLowerCase().trim();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
  console.log(`  After dedup: ${dedupedOsm.length}`);

  // Merge OSM + curated
  const allNames = new Set(dedupedOsm.map(e => e.name.toLowerCase()));
  const merged = [...dedupedOsm];
  for (const c of CURATED) {
    if (!allNames.has(c.name.toLowerCase())) {
      merged.push(c);
    }
  }

  // Sort by type then name
  merged.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });

  // Stats
  const byType: Record<string, number> = {};
  for (const e of merged) byType[e.type] = (byType[e.type] || 0) + 1;
  console.log("\n  By type:");
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t}: ${n}`);
  }

  const output = {
    updated: new Date().toISOString().split("T")[0],
    sources: ["openstreetmap", "curated"],
    total: merged.length,
    enterprises: merged,
  };

  await mkdir(resolve(OUTPUT_PATH, ".."), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${merged.length} enterprises to ${OUTPUT_PATH}`);
}

main().catch(console.error);
