#!/usr/bin/env python3
"""
OSM enterprise harvest via Photon (komoot) — bbox grid walk with adaptive
refinement. Replaces the dead exact-name Overpass queries when Overpass is
unreachable; output schema is identical to osint-enterprises.py
(public/data/enterprises.json).

Why Photon:
  - full-text search over OSM names (no exact-match limitation)
  - returns coordinates + osm_id + osm_key/osm_value + state + countrycode
  - no API key, no captcha; limit is capped at 50 per request
  - no server-side pagination -> we walk a grid of bboxes and subdivide
    any cell that returns exactly 50 hits (saturated)

Usage:
  python3 photon-enterprises.py            # full harvest (~15 min)
  python3 photon-enterprises.py --dry      # stats only, no file write
"""
import argparse
import json
import time
import random
import datetime
import urllib.request
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = REPO_ROOT / "public/data/enterprises.json"
PHOTON = "https://photon.komoot.io/api/"

# Keyword -> default type. Names are re-classified later by keywords anyway.
KEYWORDS = [
    ("птицефабрика", "poultry_farm"),
    ("птицеферма", "poultry_farm"),
    ("свиноводческий", "pig_farm"),
    ("свинокомплекс", "pig_farm"),
    ("мясокомбинат", "meat_plant"),
    ("молокозавод", "dairy"),
    ("скотокомплекс", "cattle_farm"),
    ("комбикормовый", "feed_mill"),
]

# Photon osm_key whitelist — objects that are actual enterprises/farm sites.
# 'place' (villages named "Птицефабрика"), 'shop' (retail), 'highway' (bus
# stops named after plants) etc. are excluded for precision.
ALLOWED_KEYS = {"landuse", "building", "man_made"}
# ruined/demolished buildings are not epidemiologically relevant
BAD_VALUES = {"collapsed", "ruins", "demolished", "no"}
# names that are retail or defunct, not working enterprises
BAD_NAME_SUBSTR = ["магазин", "маркет", "алкомаркет", "бывш", "бывш.",
                    "кафе", "ресторан", "столов", "закрыт"]

LIMIT = 50
MIN_CELL = 2.0  # stop subdividing below this size (degrees)


def photon_query(q, bbox, limit=LIMIT):
    """One Photon request. bbox = (minLon, minLat, maxLon, maxLat). Returns features list."""
    params = {
        "q": q,
        "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
        "limit": str(limit),
    }
    url = PHOTON + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "User-Agent": "VetKarta/1.0 (veterinary epidemiology dashboard; data refresh)",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8")).get("features", [])


def is_russia(props, lon, lat):
    """countrycode filter + Crimea box (OSM/photon may code it UA)."""
    if props.get("countrycode") == "RU":
        return True
    # Crimea + adjacent Kherson belt — epidemiologically relevant, RU-facing map
    if 44.3 <= lat <= 46.3 and 32.5 <= lon <= 36.7:
        return True
    return False


def categorize(name, default_type):
    n = name.lower()
    if "свин" in n: return "pig_farm"
    if "птиц" in n: return "poultry_farm"
    if "мяс" in n: return "meat_plant"
    if "убой" in n or "бойн" in n: return "slaughterhouse"
    if "комбикорм" in n: return "feed_mill"
    if "молок" in n or "молоч" in n or "сыродель" in n or "маслодель" in n: return "dairy"
    if "крс" in n or "скот" in n or "животновод" in n or "племзавод" in n or "племсовхоз" in n: return "cattle_farm"
    return default_type


def harvest_keyword(kw, ent_type, cells, results, stats):
    """Query all cells for one keyword; subdivide saturated cells."""
    queue = list(cells)
    while queue:
        bbox = queue.pop(0)
        try:
            feats = photon_query(kw, bbox)
        except Exception as e:
            print(f"    ! cell {bbox} failed: {e}")
            try:
                time.sleep(2)
                feats = photon_query(kw, bbox)
            except Exception:
                continue

        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        if len(feats) >= LIMIT and w > MIN_CELL and h > MIN_CELL:
            # saturated -> subdivide into 4
            mid_lon = (bbox[0] + bbox[2]) / 2
            mid_lat = (bbox[1] + bbox[3]) / 2
            queue.extend([
                (bbox[0], bbox[1], mid_lon, mid_lat),
                (mid_lon, bbox[1], bbox[2], mid_lat),
                (bbox[0], mid_lat, mid_lon, bbox[3]),
                (mid_lon, mid_lat, bbox[2], bbox[3]),
            ])
            stats["subdivided"] += 1
            time.sleep(0.3 + random.random() * 0.3)
            continue

        for f in feats:
            props = f.get("properties", {})
            geom = f.get("geometry", {})
            coords = geom.get("coordinates") or []
            if len(coords) != 2:
                continue
            lon, lat = float(coords[0]), float(coords[1])
            key = props.get("osm_key") or ""
            val = props.get("osm_value") or ""
            stats["kv"][(key, val)] = stats["kv"].get((key, val), 0) + 1
            if key not in ALLOWED_KEYS or val in BAD_VALUES:
                stats["skipped_key"] += 1
                continue
            if not is_russia(props, lon, lat):
                stats["skipped_country"] += 1
                continue
            name = props.get("name") or ""
            if not name or len(name) < 3:
                continue
            nl = name.lower()
            if any(bad in nl for bad in BAD_NAME_SUBSTR):
                stats["skipped_name"] += 1
                continue
            osm_type = props.get("osm_type") or "N"
            osm_id = props.get("osm_id")
            if not osm_id:
                continue
            ent_id = f"osm-{osm_id}"
            if ent_id in results:
                continue
            results[ent_id] = {
                "id": ent_id,
                "name": name.strip()[:200],
                "type": categorize(name, ent_type),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "region": props.get("state") or props.get("county") or "",
                "osm": f"{osm_type}{osm_id}",
            }
            stats["kept"] += 1
        time.sleep(0.15 + random.random() * 0.25)


def base_grid():
    """RU bbox grid. Chukotka beyond lon 180 skipped (no livestock)."""
    lon_edges = list(range(19, 181, 10))
    if lon_edges[-1] < 180:
        lon_edges.append(180)
    lat_edges = [41, 51, 61, 71, 82]
    cells = []
    for i in range(len(lon_edges) - 1):
        for j in range(len(lat_edges) - 1):
            cells.append((float(lon_edges[i]), float(lat_edges[j]),
                          float(lon_edges[i + 1]), float(lat_edges[j + 1])))
    return cells


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--resume", action="store_true", help="resume from checkpoint in /tmp")
    ap.add_argument("--keywords-per-run", type=int, default=0,
                    help="Rotate the keyword list by day-of-year and take N "
                         "keywords (0 = all). For CI: one keyword per run "
                         "fits the step timeout, full cycle in 8 runs.")
    args = ap.parse_args()

    print("=== Photon OSM enterprise harvest ===")
    cells = base_grid()

    keywords = KEYWORDS
    if args.keywords_per_run > 0:
        doy = datetime.date.today().timetuple().tm_yday
        k = args.keywords_per_run
        start = (doy * k) % len(KEYWORDS)
        rotated = KEYWORDS[start:] + KEYWORDS[:start]
        keywords = rotated[:k]
        print(f"rotation: day {doy}, running {k}/{len(KEYWORDS)} keywords: "
              f"{[kw for kw, _ in keywords]}")

    print(f"base grid: {len(cells)} cells, {len(keywords)} keywords\n")

    results = {}   # by id
    stats = {"kept": 0, "skipped_key": 0, "skipped_country": 0,
             "skipped_name": 0, "subdivided": 0, "kv": {}}

    CKPT = "/tmp/photon_results.json"
    done_kws = []
    if args.resume and Path(CKPT).exists():
        ck = json.loads(Path(CKPT).read_text())
        results = ck.get("results", {})
        done_kws = ck.get("done_kws", [])
        stats["kept"] = len(results)
        print(f"resumed: {len(results)} results, keywords done: {done_kws}\n")

    for kw, ent_type in keywords:
        if kw in done_kws:
            continue
        t0 = time.time()
        before = stats["kept"]
        harvest_keyword(kw, ent_type, cells, results, stats)
        print(f"  [{kw}] +{stats['kept'] - before} (total {stats['kept']}) "
              f"in {time.time() - t0:.0f}s", flush=True)
        done_kws.append(kw)
        Path(CKPT).write_text(json.dumps({"results": results, "done_kws": done_kws}, ensure_ascii=False))

    print(f"\nkept: {stats['kept']}, skipped(non-ent key): {stats['skipped_key']}, "
          f"skipped(country): {stats['skipped_country']}, subdivided cells: {stats['subdivided']}")
    print("top osm_key/value:", sorted(stats["kv"].items(),
                                        key=lambda x: -x[1])[:15])

    if args.dry:
        return

    # ---- merge with existing enterprises.json (upsert by id, keep curated) ----
    existing = {"updated": "", "sources": [], "total": 0, "enterprises": []}
    if OUTPUT_PATH.exists():
        try:
            existing = json.loads(OUTPUT_PATH.read_text())
        except Exception:
            pass
    old_curated = [e for e in existing.get("enterprises", [])
                   if str(e.get("id", "")).startswith("cur-")]
    old_osm = [e for e in existing.get("enterprises", [])
               if str(e.get("id", "")).startswith("osm-")]

    merged = {}
    for e in old_osm:              # baseline first (older but possibly wider)
        merged[e["id"]] = e
    for eid, e in results.items(): # fresh harvest wins
        merged[eid] = e

    # cross-dedup: same normalized name + ~1km coords
    def nd_key(e):
        return (e["name"].strip().lower(),
                round(float(e.get("lat") or 0), 2),
                round(float(e.get("lon") or 0), 2))
    seen_nd = set()
    deduped = []
    for e in merged.values():
        k = nd_key(e)
        if k in seen_nd:
            continue
        seen_nd.add(k)
        deduped.append(e)

    for c in old_curated:
        if c["name"].strip().lower() not in {e["name"].strip().lower() for e in deduped}:
            deduped.append(c)

    deduped.sort(key=lambda e: (e["type"], e["name"]))
    output = {
        "updated": time.strftime("%Y-%m-%d"),
        "sources": ["openstreetmap", "curated"],
        "total": len(deduped),
        "enterprises": deduped,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"\nwrote {len(deduped)} enterprises to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
