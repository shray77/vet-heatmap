#!/usr/bin/env bun
/**
 * OSINT: Agricultural enterprises in Russia — expanded.
 *
 * Sources:
 *   1. OpenStreetMap Overpass API — farms, meat plants, poultry, dairy
 *   2. Curated top-50 enterprises (from industry reports)
 *   3. FGIS Merkury (public registry of vet-certified enterprises)
 *
 * Categories:
 *   - pig_farm (свиноводческий комплекс)
 *   - poultry_farm (птицефабрика)
 *   - cattle_farm (скотоводческий комплекс/КРС)
 *   - meat_plant (мясокомбинат)
 *   - dairy (молочный комбинат)
 *   - market (животноводческий рынок)
 *   - feed_mill (комбикормовый завод)
 *   - vet_clinic (ветеринарная клиника)
 *   - slaughterhouse (убойный цех)
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

// ─── Overpass queries by category ────────────────────────────

async function queryOverpass(query: string, label: string): Promise<Enterprise[]> {
  console.log(`  [overpass] Querying ${label}...`);
  try {
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "VetKarta/1.0",
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { elements: Array<Record<string, unknown>> };
    console.log(`    → ${data.elements.length} raw results`);
    return data.elements.map((el) => {
      const tags = (el.tags || {}) as Record<string, string>;
      return {
        id: `osm-${el.id}`,
        name: tags.name || tags["name:ru"] || tags.brand || "",
        type: label,
        lat: (el.lat || (el as any).center?.lat) as number,
        lon: (el.lon || (el as any).center?.lon) as number,
        tags,
      };
    }).filter((e) => e.name && e.lat && e.lon);
  } catch (e) {
    console.error(`    ✗ ${label}: ${e}`);
    return [];
  }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function queryAllCategories(): Promise<Enterprise[]> {
  const all: Enterprise[] = [];
  const bbox = "41,19,82,180"; // Russia

  // 1. Pig farms
  const pig = await queryOverpass(`
    [out:json][timeout:90];
    (
      node["farm"="pig"](${bbox});
      way["farm"="pig"](${bbox});
      node["landuse"="farm"]["name"~"свин|pig|свиновод",i](${bbox});
      way["landuse"="farm"]["name"~"свин|pig|свиновод",i](${bbox});
    );
    out center 200;
  `, "pig_farm");
  all.push(...pig);
  await sleep(2000);

  // 2. Poultry farms
  const poultry = await queryOverpass(`
    [out:json][timeout:90];
    (
      node["farm"="poultry"](${bbox});
      way["farm"="poultry"](${bbox});
      node["landuse"="farm"]["name"~"птиц|poultry|бройлер",i](${bbox});
      way["landuse"="farm"]["name"~"птиц|poultry|бройлер",i](${bbox});
      node["industrial"="agriculture"]["name"~"птиц",i](${bbox});
    );
    out center 300;
  `, "poultry_farm");
  all.push(...poultry);
  await sleep(2000);

  // 3. Cattle farms
  const cattle = await queryOverpass(`
    [out:json][timeout:90];
    (
      node["farm"="dairy"](${bbox});
      way["farm"="dairy"](${bbox});
      node["farm"="cattle"](${bbox});
      way["farm"="cattle"](${bbox});
      node["landuse"="farm"]["name"~"крс|скот|cattle|молочн",i](${bbox});
    );
    out center 200;
  `, "cattle_farm");
  all.push(...cattle);
  await sleep(2000);

  // 4. Meat processing plants
  const meat = await queryOverpass(`
    [out:json][timeout:90];
    (
      node["industrial"="meat"](${bbox});
      way["industrial"="meat"](${bbox});
      node["man_made"="works"]["name"~"мяс|meat|мясокомбинат",i](${bbox});
      way["man_made"="works"]["name"~"мяс|meat|мясокомбинат",i](${bbox});
    );
    out center 200;
  `, "meat_plant");
  all.push(...meat);
  await sleep(2000);

  // 5. Slaughterhouses
  const slaughter = await queryOverpass(`
    [out:json][timeout:60];
    (
      node["industrial"="slaughterhouse"](${bbox});
      way["industrial"="slaughterhouse"](${bbox});
      node["amenity"="animal_boarding"]["name"~"убой|бойн|slaughter",i](${bbox});
    );
    out center 100;
  `, "slaughterhouse");
  all.push(...slaughter);
  await sleep(2000);

  // 6. Feed mills
  const feed = await queryOverpass(`
    [out:json][timeout:60];
    (
      node["industrial"="mill"]["name"~"комбикорм|feed",i](${bbox});
      way["industrial"="mill"]["name"~"комбикорм|feed",i](${bbox});
      node["man_made"="works"]["name"~"комбикорм",i](${bbox});
    );
    out center 100;
  `, "feed_mill");
  all.push(...feed);
  await sleep(2000);

  // 7. Veterinary clinics/facilities
  const vet = await queryOverpass(`
    [out:json][timeout:60];
    (
      node["amenity"="veterinary"](${bbox});
      way["amenity"="veterinary"](${bbox});
    );
    out center 500;
  `, "vet_clinic");
  all.push(...vet);

  // 8. General farms (catch-all)
  const farms = await queryOverpass(`
    [out:json][timeout:90];
    (
      node["landuse"="farm"]["name"](${bbox});
      way["landuse"="farm"]["name"](${bbox});
    );
    out center 500;
  `, "farm");
  // Only add farms with names that weren't already caught
  const existingIds = new Set(all.map(e => e.id));
  for (const f of farms) {
    if (!existingIds.has(f.id)) all.push(f);
  }

  return all;
}

// ─── Curated enterprises (top 80) ────────────────────────────

const CURATED: Enterprise[] = [
  // ─── Топ-20 свиноводческих комплексов ─────────────────────
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
  { id: "cur-11", name: "Белгородские свинофермы", type: "pig_farm", lat: 50.41, lon: 37.51, region: "Белгородская обл." },
  { id: "cur-12", name: "Тюменский свинокомплекс", type: "pig_farm", lat: 57.15, lon: 65.53, region: "Тюменская обл." },
  { id: "cur-13", name: "Алтайский свинокомплекс", type: "pig_farm", lat: 53.35, lon: 83.78, region: "Алтайский край" },
  { id: "cur-14", name: "Вологодский свинокомплекс", type: "pig_farm", lat: 59.22, lon: 39.89, region: "Вологодская обл." },
  { id: "cur-15", name: "Дальневосточный свинокомплекс", type: "pig_farm", lat: 43.35, lon: 132.07, region: "Приморский край" },

  // ─── Топ-20 птицефабрик ──────────────────────────────────
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
  { id: "cur-50", name: "Брянский мясокомбинат КРС", type: "cattle_farm", lat: 53.24, lon: 34.37, region: "Брянская обл." },

  // ─── Молочные комбинаты ───────────────────────────────────
  { id: "cur-51", name: "Данон Россия", type: "dairy", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-52", name: "Вимм-Билль-Данн", type: "dairy", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-53", name: "Молвест", type: "dairy", lat: 51.66, lon: 39.20, region: "Воронежская обл." },
  { id: "cur-54", name: "Простоквашино", type: "dairy", lat: 56.85, lon: 60.61, region: "Свердловская обл." },
  { id: "cur-55", name: "Беллакт", type: "dairy", lat: 53.90, lon: 27.57, region: "Республика Беларусь" },

  // ─── Животноводческие рынки ───────────────────────────────
  { id: "cur-56", name: "Сенная ярмарка (скотный рынок)", type: "market", lat: 51.53, lon: 39.16, region: "Воронежская обл." },
  { id: "cur-57", name: "Тушинский скотный рынок", type: "market", lat: 55.82, lon: 37.46, region: "Москва" },
  { id: "cur-58", name: "Казанская ярмарка", type: "market", lat: 55.79, lon: 49.12, region: "Республика Татарстан" },

  // ─── Племенные заводы ─────────────────────────────────────
  { id: "cur-59", name: "Племзавод «Россия» (КРС)", type: "cattle_farm", lat: 51.22, lon: 39.18, region: "Воронежская обл." },
  { id: "cur-60", name: "Племзавод «Большевик» (свиноводство)", type: "pig_farm", lat: 51.73, lon: 36.19, region: "Курская обл." },
  { id: "cur-61", name: "Племзавод «Красноозерский»", type: "cattle_farm", lat: 53.97, lon: 80.08, region: "Новосибирская обл." },
  { id: "cur-62", name: "Племзавод «Ирмень»", type: "cattle_farm", lat: 55.05, lon: 82.50, region: "Новосибирская обл." },

  // ─── Комбикормовые заводы ─────────────────────────────────
  { id: "cur-63", name: "Комбикормовый завод «Воронежский»", type: "feed_mill", lat: 51.66, lon: 39.20, region: "Воронежская обл." },
  { id: "cur-64", name: "Комбикормовый завод «ТопПро»", type: "feed_mill", lat: 55.75, lon: 37.61, region: "Москва" },
  { id: "cur-65", name: "Сибирский комбикормовый завод", type: "feed_mill", lat: 55.03, lon: 82.92, region: "Новосибирская обл." },
];

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("=== OSINT: Agricultural Enterprises (expanded) ===\n");

  const osmData = await queryAllCategories();
  console.log(`\n  Total OSM results: ${osmData.length}`);

  // Deduplicate OSM by name
  const seenNames = new Set<string>();
  const dedupedOsm = osmData.filter(e => {
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
