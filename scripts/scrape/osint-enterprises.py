#!/usr/bin/env python3
"""
OSINT: Agricultural enterprises in Russia — Python version (Overpass).

v2 (2026-10 rewrite) — the old version searched EXACT names
(node["name"="Птицефабрика"]) which matched only generically-named
objects: 2 results total for all of Russia. This version uses
case-insensitive regex matching and upsert-merges into the committed
dataset so partial CI runs accumulate.

NOTE: scripts/scrape/photon-enterprises.py covers the same OSM data via
the Photon search API (keyless, no 50-per-request cap on our side… but
Photon caps at 50 hits per cell — hence the grid walk). Overpass here is
the fuller query (no result cap) but can be slow server-side; both
scripts write the same schema and compose via upsert-merge.

Output: public/data/enterprises.json (merged with curated baseline).
"""

import argparse
import datetime
import json
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = REPO_ROOT / "public/data/enterprises.json"

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

RUSSIA_AREA = 'area["ISO3166-1"="RU"]->.ru'

# (regex, type) — same keyword set as photon-enterprises.py
KEYWORDS = [
    ("птицефабрик|птицеводческ|птицекомбинат|птицесовхоз|птицеферм|птицеплем|птицекомплекс", "poultry_farm"),
    ("свиноводческ|свинокомплекс|свиноферм|свиноводств", "pig_farm"),
    ("мясокомбинат|мясоперерабат|мясозавод|мясоконсерв|мясоптицекомбинат", "meat_plant"),
    ("молокозавод|молкомбинат|молочноконсерв|сыродельн|маслодельн", "dairy"),
    ("скотокомплекс|молочнотоварн|животноводческ", "cattle_farm"),
    ("комбикормов", "feed_mill"),
]

BAD_NAME_SUBSTR = ["магазин", "маркет", "алкомаркет", "бывш", "кафе",
                    "ресторан", "столов", "закрыт"]


def query_overpass(query, label):
    """Try each Overpass mirror in sequence."""
    print(f"  [overpass] {label}...")
    for mirror in MIRRORS:
        short = mirror.split("//")[1].split("/")[0]
        try:
            data = urllib.parse.urlencode({"data": query}).encode("utf-8")
            req = urllib.request.Request(
                mirror,
                data=data,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "User-Agent": "VetKarta/1.0 (veterinary epidemiology dashboard)",
                },
            )
            with urllib.request.urlopen(req, timeout=110) as resp:
                body = resp.read().decode("utf-8")
                try:
                    parsed = json.loads(body)
                except json.JSONDecodeError:
                    print(f"    {short}: invalid JSON response, trying next…")
                    continue
                elements = parsed.get("elements", [])
                print(f"    ✓ {short}: {len(elements)} results")
                return elements
        except Exception as e:
            print(f"    {short}: {e}, trying next…")
            continue
    print(f"    ✗ {label}: all mirrors failed")
    return []


def categorize(name, fallback_type):
    n = name.lower()
    if "свин" in n: return "pig_farm"
    if "птиц" in n: return "poultry_farm"
    if "убой" in n or "бойн" in n: return "slaughterhouse"
    if "комбикорм" in n: return "feed_mill"
    if "молок" in n or "молоч" in n or "сыродель" in n or "маслодель" in n: return "dairy"
    if "мяс" in n: return "meat_plant"
    if "крс" in n or "скот" in n or "животновод" in n: return "cattle_farm"
    return fallback_type


def is_in_russia(lat, lon):
    """Strict Russia filter — excludes Moldova/Romania/Belarus."""
    if 42 <= lat <= 82 and 30 <= lon <= 180:
        return True
    if 54 <= lat <= 56 and 19 <= lon <= 23:  # Kaliningrad
        return True
    if 55 <= lat <= 58 and 28 <= lon <= 30:  # Pskov/Smolensk near Belarus
        return True
    if 44.3 <= lat <= 46.3 and 32.5 <= lon <= 36.7:  # Crimea
        return True
    return False


# Curated list (62 enterprises) — kept as the always-available baseline.
CURATED = [
    {"id": "cur-1", "name": "Мираторг — свиноводство", "type": "pig_farm", "lat": 50.59, "lon": 36.58, "region": "Белгородская обл.", "capacity": "500000+ голов"},
    {"id": "cur-2", "name": "Русагро — свиноводство", "type": "pig_farm", "lat": 51.53, "lon": 39.16, "region": "Воронежская обл.", "capacity": "300000+ голов"},
    {"id": "cur-3", "name": "Черкизово — свиноводство", "type": "pig_farm", "lat": 55.75, "lon": 37.61, "region": "Московская обл.", "capacity": "250000+ голов"},
    {"id": "cur-4", "name": "Сибагро — свиноводство", "type": "pig_farm", "lat": 56.50, "lon": 84.97, "region": "Томская обл.", "capacity": "200000+ голов"},
    {"id": "cur-5", "name": "Агрохолдинг КРиМ", "type": "pig_farm", "lat": 55.02, "lon": 82.93, "region": "Новосибирская обл.", "capacity": "150000+ голов"},
    {"id": "cur-6", "name": "Великолукский свиноводческий комплекс", "type": "pig_farm", "lat": 56.34, "lon": 30.52, "region": "Псковская обл.", "capacity": "120000+ голов"},
    {"id": "cur-7", "name": "Омский бекон", "type": "pig_farm", "lat": 54.99, "lon": 73.37, "region": "Омская обл.", "capacity": "120000+ голов"},
    {"id": "cur-8", "name": "Краснодарский свинокомплекс", "type": "pig_farm", "lat": 45.04, "lon": 38.98, "region": "Краснодарский край", "capacity": "100000+ голов"},
    {"id": "cur-9", "name": "Тамбовские фермы", "type": "pig_farm", "lat": 52.72, "lon": 41.45, "region": "Тамбовская обл.", "capacity": "100000+ голов"},
    {"id": "cur-10", "name": "Курский свинокомплекс", "type": "pig_farm", "lat": 51.73, "lon": 36.19, "region": "Курская обл.", "capacity": "80000+ голов"},
    {"id": "cur-11", "name": "Тюменский свинокомплекс", "type": "pig_farm", "lat": 57.15, "lon": 65.53, "region": "Тюменская обл."},
    {"id": "cur-12", "name": "Алтайский свинокомплекс", "type": "pig_farm", "lat": 53.35, "lon": 83.78, "region": "Алтайский край"},
    {"id": "cur-13", "name": "Вологодский свинокомплекс", "type": "pig_farm", "lat": 59.22, "lon": 39.89, "region": "Вологодская обл."},
    {"id": "cur-14", "name": "Дальневосточный свинокомплекс", "type": "pig_farm", "lat": 43.35, "lon": 132.07, "region": "Приморский край"},
    {"id": "cur-15", "name": "Племзавод «Большевик» (свиноводство)", "type": "pig_farm", "lat": 51.73, "lon": 36.19, "region": "Курская обл."},
    {"id": "cur-16", "name": "Приосколье — птицеводство", "type": "poultry_farm", "lat": 50.41, "lon": 37.51, "region": "Белгородская обл.", "capacity": "млн+ голов"},
    {"id": "cur-17", "name": "БЕЛГРАНКОРМ — птицеводство", "type": "poultry_farm", "lat": 50.59, "lon": 36.58, "region": "Белгородская обл."},
    {"id": "cur-18", "name": "Уралбройлер", "type": "poultry_farm", "lat": 56.02, "lon": 60.58, "region": "Челябинская обл."},
    {"id": "cur-19", "name": "Линдовская птицефабрика", "type": "poultry_farm", "lat": 56.32, "lon": 43.98, "region": "Нижегородская обл."},
    {"id": "cur-20", "name": "Северная птицефабрика", "type": "poultry_farm", "lat": 59.94, "lon": 30.31, "region": "Ленинградская обл."},
    {"id": "cur-21", "name": "Роскар (птицеводство)", "type": "poultry_farm", "lat": 55.75, "lon": 37.61, "region": "Московская обл."},
    {"id": "cur-22", "name": "Васильевская птицефабрика", "type": "poultry_farm", "lat": 55.35, "lon": 49.12, "region": "Республика Татарстан"},
    {"id": "cur-23", "name": "Синявинская птицефабрика", "type": "poultry_farm", "lat": 59.72, "lon": 31.02, "region": "Ленинградская обл."},
    {"id": "cur-24", "name": "Боровская птицефабрика", "type": "poultry_farm", "lat": 57.05, "lon": 65.32, "region": "Тюменская обл."},
    {"id": "cur-25", "name": "Птицефабрика Челябинская", "type": "poultry_farm", "lat": 55.16, "lon": 61.40, "region": "Челябинская обл."},
    {"id": "cur-26", "name": "Молжаниновская птицефабрика", "type": "poultry_farm", "lat": 55.90, "lon": 37.40, "region": "Московская обл."},
    {"id": "cur-27", "name": "Марийская птицефабрика", "type": "poultry_farm", "lat": 56.64, "lon": 47.89, "region": "Республика Марий Эл"},
    {"id": "cur-28", "name": "Птицефабрика Свердловская", "type": "poultry_farm", "lat": 56.85, "lon": 60.61, "region": "Свердловская обл."},
    {"id": "cur-29", "name": "Омская птицефабрика", "type": "poultry_farm", "lat": 55.00, "lon": 73.40, "region": "Омская обл."},
    {"id": "cur-30", "name": "Красноярская птицефабрика", "type": "poultry_farm", "lat": 56.01, "lon": 92.85, "region": "Красноярский край"},
    {"id": "cur-31", "name": "Микоян", "type": "meat_plant", "lat": 55.73, "lon": 37.65, "region": "Москва"},
    {"id": "cur-32", "name": "Черкизово — мясопереработка", "type": "meat_plant", "lat": 55.79, "lon": 37.71, "region": "Москва"},
    {"id": "cur-33", "name": "Останкинский мясоперерабатывающий", "type": "meat_plant", "lat": 55.83, "lon": 37.60, "region": "Москва"},
    {"id": "cur-34", "name": "Великолукский мясокомбинат", "type": "meat_plant", "lat": 56.34, "lon": 30.52, "region": "Псковская обл."},
    {"id": "cur-35", "name": "Кампомос", "type": "meat_plant", "lat": 54.32, "lon": 48.40, "region": "Ульяновская обл."},
    {"id": "cur-36", "name": "Раменский мясокомбинат", "type": "meat_plant", "lat": 55.57, "lon": 38.22, "region": "Московская обл."},
    {"id": "cur-37", "name": "Самкамен", "type": "meat_plant", "lat": 53.20, "lon": 50.15, "region": "Самарская обл."},
    {"id": "cur-38", "name": "Таврия", "type": "meat_plant", "lat": 47.21, "lon": 39.71, "region": "Ростовская обл."},
    {"id": "cur-39", "name": "Омский мясокомбинат", "type": "meat_plant", "lat": 55.00, "lon": 73.40, "region": "Омская обл."},
    {"id": "cur-40", "name": "Новосибирский мясокомбинат", "type": "meat_plant", "lat": 55.03, "lon": 82.92, "region": "Новосибирская обл."},
    {"id": "cur-41", "name": "Екатеринбургский мясокомбинат", "type": "meat_plant", "lat": 56.84, "lon": 60.61, "region": "Свердловская обл."},
    {"id": "cur-42", "name": "Казанский мясокомбинат", "type": "meat_plant", "lat": 55.79, "lon": 49.12, "region": "Республика Татарстан"},
    {"id": "cur-43", "name": "Воронежский мясокомбинат", "type": "meat_plant", "lat": 51.66, "lon": 39.20, "region": "Воронежская обл."},
    {"id": "cur-44", "name": "Краснодарский мясокомбинат", "type": "meat_plant", "lat": 45.04, "lon": 38.98, "region": "Краснодарский край"},
    {"id": "cur-45", "name": "Иркутский мясокомбинат", "type": "meat_plant", "lat": 52.28, "lon": 104.28, "region": "Иркутская обл."},
    {"id": "cur-46", "name": "Мираторг — КРС (мясное скотоводство)", "type": "cattle_farm", "lat": 50.59, "lon": 36.58, "region": "Белгородская обл.", "capacity": "100000+ голов"},
    {"id": "cur-47", "name": "Заречное (КРС)", "type": "cattle_farm", "lat": 51.53, "lon": 39.16, "region": "Воронежская обл."},
    {"id": "cur-48", "name": "Агрокомплекс Кургансемена (КРС)", "type": "cattle_farm", "lat": 55.44, "lon": 65.34, "region": "Курганская обл."},
    {"id": "cur-49", "name": "Калужский КРС комплекс", "type": "cattle_farm", "lat": 54.51, "lon": 36.26, "region": "Калужская обл."},
    {"id": "cur-50", "name": "Племзавод «Россия» (КРС)", "type": "cattle_farm", "lat": 51.22, "lon": 39.18, "region": "Воронежская обл."},
    {"id": "cur-51", "name": "Племзавод «Красноозерский»", "type": "cattle_farm", "lat": 53.97, "lon": 80.08, "region": "Новосибирская обл."},
    {"id": "cur-52", "name": "Племзавод «Ирмень»", "type": "cattle_farm", "lat": 55.05, "lon": 82.50, "region": "Новосибирская обл."},
    {"id": "cur-53", "name": "Данон Россия", "type": "dairy", "lat": 55.75, "lon": 37.61, "region": "Москва"},
    {"id": "cur-54", "name": "Вимм-Билль-Данн", "type": "dairy", "lat": 55.75, "lon": 37.61, "region": "Москва"},
    {"id": "cur-55", "name": "Молвест", "type": "dairy", "lat": 51.66, "lon": 39.20, "region": "Воронежская обл."},
    {"id": "cur-56", "name": "Простоквашино", "type": "dairy", "lat": 56.85, "lon": 60.61, "region": "Свердловская обл."},
    {"id": "cur-57", "name": "Сенная ярмарка (скотный рынок)", "type": "market", "lat": 51.53, "lon": 39.16, "region": "Воронежская обл."},
    {"id": "cur-58", "name": "Тушинский скотный рынок", "type": "market", "lat": 55.82, "lon": 37.46, "region": "Москва"},
    {"id": "cur-59", "name": "Казанская ярмарка", "type": "market", "lat": 55.79, "lon": 49.12, "region": "Республика Татарстан"},
    {"id": "cur-60", "name": "Комбикормовый завод «Воронежский»", "type": "feed_mill", "lat": 51.66, "lon": 39.20, "region": "Воронежская обл."},
    {"id": "cur-61", "name": "Комбикормовый завод «ТопПро»", "type": "feed_mill", "lat": 55.75, "lon": 37.61, "region": "Москва"},
    {"id": "cur-62", "name": "Сибирский комбикормовый завод", "type": "feed_mill", "lat": 55.03, "lon": 82.92, "region": "Новосибирская обл."},
]


def parse_elements(elements, default_type):
    """Convert Overpass elements to Enterprise dicts."""
    out = []
    for el in elements:
        tags = el.get("tags", {}) or {}
        center = el.get("center", {}) or {}
        lat = el.get("lat") or center.get("lat")
        lon = el.get("lon") or center.get("lon")
        name = tags.get("name") or tags.get("name:ru") or tags.get("brand", "")
        if not name or lat is None or lon is None:
            continue
        if any(b in name.lower() for b in BAD_NAME_SUBSTR):
            continue
        out.append({
            "id": f"osm-{el.get('id', '')}",
            "name": name.strip()[:200],
            "type": categorize(name, default_type),
            "lat": float(lat),
            "lon": float(lon),
            "region": tags.get("addr:region") or "",
        })
    return out


def merge_into_dataset(fresh, save=True):
    """Upsert fresh OSM entries into the committed enterprises.json
    (keeps curated + previously harvested entries — partial CI runs
    accumulate instead of resetting)."""
    existing = {"updated": "", "sources": [], "total": 0, "enterprises": []}
    if OUTPUT_PATH.exists():
        try:
            existing = json.loads(OUTPUT_PATH.read_text())
        except Exception:
            pass

    by_id = {}
    for e in existing.get("enterprises", []):
        by_id[e["id"]] = e
    for e in fresh:
        by_id[e["id"]] = e  # fresh wins

    # name-level cross-dedup: OSM entries (real coords) beat curated
    # placeholders (city centers) when the exact name matches
    ordered = sorted(by_id.values(),
                     key=lambda e: 1 if str(e.get("id", "")).startswith("cur-") else 0)
    seen_names = {}
    merged = []
    for e in ordered:
        k = re.sub(r"\s+", " ", e["name"].strip().lower())
        if k in seen_names:
            continue
        seen_names[k] = e
        merged.append(e)

    for c in CURATED:
        k = re.sub(r"\s+", " ", c["name"].strip().lower())
        if k not in seen_names:
            seen_names[k] = c
            merged.append(c)

    merged.sort(key=lambda e: (e["type"], e["name"]))
    output = {
        "updated": time.strftime("%Y-%m-%d"),
        "sources": ["openstreetmap", "curated"],
        "total": len(merged),
        "enterprises": merged,
    }
    if save:
        OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    return output


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keywords-per-run", type=int, default=2,
                    help="Rotate the keyword list by day-of-year and take N "
                         "keywords per run (Overpass regex queries are slow; "
                         "rotation covers the full list across CI runs).")
    args = ap.parse_args()

    print("=== OSINT: Agricultural Enterprises in Russia (Overpass, v2 regex) ===\n")

    keywords = KEYWORDS
    if args.keywords_per_run > 0 and args.keywords_per_run < len(KEYWORDS):
        doy = datetime.date.today().timetuple().tm_yday
        k = args.keywords_per_run
        start = (doy * k) % len(KEYWORDS)
        rotated = KEYWORDS[start:] + KEYWORDS[:start]
        keywords = rotated[:k]
        print(f"rotation: day {doy}, running {k}/{len(KEYWORDS)}: "
              f"{[rx[:24] for rx, _ in keywords]}\n")

    fresh = []
    for rx, ent_type in keywords:
        q = f"""
            [out:json][timeout:90];
            {RUSSIA_AREA};
            (
              node["name"~"{rx}",i](area.ru);
              way["name"~"{rx}",i](area.ru);
              relation["name"~"{rx}",i](area.ru);
            );
            out center 1500;
        """
        els = query_overpass(q, ent_type)
        parsed = parse_elements(els, ent_type)
        ru = [e for e in parsed if is_in_russia(e["lat"], e["lon"])]
        print(f"    → {len(parsed)} parsed, {len(ru)} in Russia")
        fresh.extend(ru)
        # partial save after each keyword
        merge_into_dataset(fresh)
        fresh = []
        time.sleep(3)

    out = merge_into_dataset([])
    print(f"\n✓ enterprises.json now: {out['total']} entries")


if __name__ == "__main__":
    main()
