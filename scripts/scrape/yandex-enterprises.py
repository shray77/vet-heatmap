#!/usr/bin/env python3
"""
OSINT: Agricultural enterprises in Russia via Yandex.Maps.

Yandex.Maps has far better coverage of Russian businesses than OSM —
many small/medium farms, meat plants, and feed mills are listed in
Yandex Business but not tagged in OSM at all.

v3 (2026-10 rewrite) — fixes for the old broken parser:
  OLD PROBLEMS                          NEW SOLUTION
  ─────────────────────────────────────────────────────────────────
  95% entries had no coords (geocoder   coords parsed from the org page
    needs API key now → 403)              URL (?ll=lon,lat — the map
                                           centers on the org)
  dup rows: same farm from 2 cities     dedup by org_id AND by
    (hash included city; python hash()   (name+address); stable md5 ids
    is salted → ids churned in git)
  retail shops leaked in ("Магазин      rubric blacklist + name/rubric
    мяса" tagged as meat_plant)           based typing
  only ~9/30 cities per CI run (540s     faster searches + day-seeded
    wasn't enough for 150 searches)       city rotation + upsert-merge
                                           (data accumulates across runs)

Search strategy: top-30 agri cities × 5 categories, city order rotates
daily so every city gets covered across the 4 CI runs per day.

Output: public/data/enterprises-yandex.json (merged in frontend with
enterprises.json at runtime).

USAGE:
  python3 scripts/scrape/yandex-enterprises.py                 # scrape
  python3 scripts/scrape/yandex-enterprises.py --cities 5      # quick test
  python3 scripts/scrape/yandex-enterprises.py --repair        # geocode +
                                                                clean existing
                                                                data (no scraping)
"""
import argparse
import hashlib
import json
import re
import time
import datetime
import random
import urllib.request
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = REPO_ROOT / "public/data/enterprises-yandex.json"

CITIES = [
    ("Москва", 55.7558, 37.6173),
    ("Санкт-Петербург", 59.9386, 30.3141),
    ("Новосибирск", 55.0084, 82.9357),
    ("Екатеринбург", 56.8389, 60.6057),
    ("Казань", 55.8304, 49.0661),
    ("Нижний Новгород", 56.2965, 43.9361),
    ("Челябинск", 55.1644, 61.4368),
    ("Красноярск", 56.0153, 92.8932),
    ("Самара", 53.2415, 50.2212),
    ("Уфа", 54.7388, 55.9721),
    ("Ростов-на-Дону", 47.2357, 39.7015),
    ("Краснодар", 45.0355, 38.9753),
    ("Омск", 54.9885, 73.3242),
    ("Воронеж", 51.6608, 39.2003),
    ("Пермь", 58.0105, 56.2500),
    ("Волгоград", 48.7080, 44.5133),
    ("Белгород", 50.5956, 36.5873),  # pig farming hub
    ("Тамбов", 52.7212, 41.4523),    # pig farming
    ("Курск", 51.7373, 36.1926),
    ("Липецк", 52.6088, 39.5994),
    ("Орёл", 52.9685, 36.0637),
    ("Тула", 54.1938, 37.6190),
    ("Рязань", 54.6269, 39.6916),
    ("Пенза", 53.1959, 45.0157),
    ("Саратов", 51.5336, 46.0343),
    ("Иркутск", 52.2978, 104.2964),
    ("Барнаул", 53.3468, 83.7768),
    ("Тюмень", 57.1522, 65.5272),
    ("Ставрополь", 45.0445, 41.9691),
    ("Владивосток", 43.1155, 131.8855),  # ASF risk, far east
]

CATEGORIES = [
    ("птицефабрика", "poultry_farm"),
    ("свиноводческий комплекс", "pig_farm"),
    ("мясокомбинат", "meat_plant"),
    ("скотокомплекс КРС", "cattle_farm"),
    ("комбикормовый завод", "feed_mill"),
]

# Retail/service rubrics that are NOT livestock enterprises.
DROP_RUBRICS = [
    "магазин", "кафе", "ресторан", "столов", "пекарн", "кулинар",
    "продукты питания", "фуд-корт", "деликатес", "гастроном",
    "супермаркет", "кофе", "бар,", "фастфуд",
]

JUNK_NAMES = {
    "фото", "обзор", "отзывы", "адрес", "особенности", "похожие места",
    "сайт", "телефон", "маршрут", "подробнее", "сохранить", "поделиться",
    "ещё", "еще", "открыто", "закрыто", "рейтинг",
    "как добраться", "подробнее об организации",
    "вы владелец этой организации?", "больше не работает",
    "часы работы", "средняя цена",
}
JUNK_SUBSTRINGS = [
    "отзыв", "как добраться", "вы владелец", "больше не работает",
    "подробнее об", "часы работы", "средняя цена",
    "особенности организации", "похожие организации",
    "оценок", "рейтинг", "график работы",
]


def is_in_russia(lat, lon):
    """Strict Russia filter — Yandex sometimes returns nearby foreign results."""
    if 42 <= lat <= 82 and 28 <= lon <= 180:
        return True
    if 54 <= lat <= 56 and 19 <= lon <= 23:  # Kaliningrad
        return True
    return False


def categorize(name, rubric, fallback_type):
    """Type by name + rubric keywords (rubric is a better signal than the
    search query that found the card)."""
    n = f"{name} {rubric}".lower()
    if "птиц" in n or "яйц" in n or "бройлер" in n:
        return "poultry_farm"
    if "свин" in n:
        return "pig_farm"
    if "комбикорм" in n or "кормов" in n:
        return "feed_mill"
    if "молок" in n or "молоч" in n or "сыродель" in n or "маслодель" in n:
        return "dairy"
    if "мяс" in n or "колбас" in n:
        return "meat_plant"
    if "скот" in n or "крс" in n or "животновод" in n:
        return "cattle_farm"
    if "убой" in n or "бойн" in n:
        return "slaughterhouse"
    return fallback_type


def is_retail(rubric):
    r = (rubric or "").lower()
    return any(d in r for d in DROP_RUBRICS)


def stable_id(name, address, org_id):
    if org_id:
        return f"yandex-{org_id}"
    h = hashlib.md5(f"{name}|{address}".encode("utf-8")).hexdigest()[:12]
    return f"yandex-{h}"


def norm_key(name, address):
    """Secondary dedup key: same name + same address = same business,
    even under different Yandex org ids / search hits."""
    n = re.sub(r"\s+", " ", (name or "").strip().lower())
    a = re.sub(r"\s+", " ", (address or "").strip().lower())
    return f"{n}|{a}"


def parse_yandex_results(page, city_name, category_query, ent_type):
    """Extract business cards from a Yandex.Maps search results page."""
    results = []

    cards = page.query_selector_all("li.search-snippet-view")
    if not cards:
        cards = page.query_selector_all("[data-testid='search-business-snippet-view']")

    seen_org_ids = set()

    for card in cards:
        try:
            title_links = card.query_selector_all("a[href*='/org/']")
            name_el = None
            href = ""
            org_id = ""
            for link in title_links:
                h = link.get_attribute("href") or ""
                if "/reviews/" in h or "/gallery/" in h or "/photos/" in h:
                    continue
                if "/maps/org/" not in h:
                    continue
                name_el = link
                href = h
                break

            if not name_el:
                continue

            name = name_el.inner_text().strip()
            if not name or len(name) < 3:
                continue

            m = re.search(r"/org/[^/]+/(\d+)", href)
            if m:
                org_id = m.group(1)
                if org_id in seen_org_ids:
                    continue
                seen_org_ids.add(org_id)

            name = name.split("\n")[0].strip()[:200]
            name_lower = name.lower()

            if name_lower in JUNK_NAMES:
                continue
            if any(junk in name_lower for junk in JUNK_SUBSTRINGS):
                continue
            if not re.search(r"[А-ЯЁа-яёA-Za-z]", name):
                continue
            if re.match(r"^\d+[,.]?\d*\s*(оценок|отзыв)", name_lower):
                continue

            # Skip closed businesses
            try:
                card_text = card.inner_text()[:600].lower()
                if "больше не работает" in card_text:
                    continue
            except Exception:
                pass

            # Address
            address = ""
            for addr_sel in [
                "[class*='address']",
                ".search-business-snippet-view__address",
                "[class*='business-snippet'] [class*='ink']",
            ]:
                try:
                    addr_el = card.query_selector(addr_sel)
                    if addr_el:
                        addr_text = addr_el.inner_text().strip()
                        first_line = addr_text.split("\n")[0].strip()
                        if (first_line and len(first_line) > 5
                                and first_line.lower() not in JUNK_NAMES
                                and (re.search(r"\d", first_line)
                                     or any(w in first_line.lower() for w in
                                            ["улица", "ул.", "проспект", "пр.", "шоссе", "ш.",
                                             "область", "край", "республика", "город", "г.",
                                             "поселок", "село", "деревня", "станция",
                                             "посёлок", "район"]))):
                            address = first_line[:300]
                            break
                except Exception:
                    continue

            # Rubric
            rubric = category_query
            try:
                rubric_el = card.query_selector("[class*='rubric'], [class*='category']")
                if rubric_el:
                    r = rubric_el.inner_text().strip().split("\n")[0].strip()[:100]
                    if r and r.lower() not in JUNK_NAMES and not any(j in r.lower() for j in JUNK_SUBSTRINGS):
                        rubric = r
            except Exception:
                pass

            if is_retail(rubric):
                continue

            GENERIC_NAMES = {
                "свиноводческий комплекс", "птицефабрика", "мясокомбинат",
                "скотокомплекс", "комбикормовый завод", "ферма",
            }
            display_name = name
            if name_lower in GENERIC_NAMES and address:
                addr_short = " ".join(address.split(",")[:2])[:50]
                display_name = f"{name} ({addr_short})"

            results.append({
                "id": stable_id(display_name, address, org_id),
                "name": display_name,
                "type": categorize(name, rubric, ent_type),
                "lat": None,
                "lon": None,
                "address": address,
                "city": city_name,
                "rubric": rubric,
                "source": "yandex",
                "org_href": href if href.startswith("http") else f"https://yandex.ru{href}",
            })
        except Exception:
            continue

    return results


def parse_org_page(page, city_name, category_query, ent_type):
    """Search sometimes redirects straight to a single org page (when the
    query has one confident match) — parse that instead of a result list."""
    results = []
    try:
        body_text = page.inner_text("body")[:3000]
        if "больше не работает" in body_text.lower():
            return results  # closed business

        name = ""
        h1 = page.query_selector("h1")
        if h1:
            name = h1.inner_text().strip().split("\n")[0][:200]
        if not name:
            return results

        m = re.search(r"/org/([^/]+)/(\d+)", page.url)
        if not m:
            return results
        org_id = m.group(2)

        address = ""
        try:
            addr_el = page.query_selector("[class*='address']")
            if addr_el:
                address = addr_el.inner_text().strip().split("\n")[0][:300]
        except Exception:
            pass

        rubric = category_query
        try:
            rub_el = page.query_selector("[class*='rubric']")
            if rub_el:
                r = rub_el.inner_text().strip().split("\n")[0][:100]
                if r and r.lower() not in JUNK_NAMES:
                    rubric = r
        except Exception:
            pass

        if is_retail(rubric):
            return results

        results.append({
            "id": stable_id(name, address, org_id),
            "name": name,
            "type": categorize(name, rubric, ent_type),
            "lat": None,
            "lon": None,
            "address": address,
            "city": city_name,
            "rubric": rubric,
            "source": "yandex",
            "org_href": f"https://yandex.ru/maps/org/{m.group(1)}/{org_id}/",
        })
    except Exception:
        pass
    return results


def fetch_org_coords(page, org_href, max_wait_ms=5000):
    """Open an org page; the Maps SPA centers on the org and the URL gets
    ?ll=<lon>,<lat>. Poll page.url until ll appears.
    NOTE: must be a CLEAN org URL (no query params) — a redirect-URL keeps
    the search ll (city center), not the org position."""
    try:
        clean = org_href.split("?")[0]
        page.goto(clean, wait_until="domcontentloaded", timeout=25000)
        deadline = time.time() + max_wait_ms / 1000
        while time.time() < deadline:
            url = page.url
            m = re.search(r"[?&]ll=([\d.]+)%2C([\d.]+)", url)
            if m:
                lon, lat = float(m.group(1)), float(m.group(2))
                if 20 <= lon <= 190 and 35 <= lat <= 85:
                    return lat, lon
                return None, None
            page.wait_for_timeout(400)
        return None, None
    except Exception:
        return None, None


# ── repair mode: geocode existing coord-less entries ──────────────────

def photon_geocode(address, city):
    try:
        params = urllib.parse.urlencode({"q": f"{address}, {city}", "limit": 1})
        req = urllib.request.Request(
            f"https://photon.komoot.io/api/?{params}",
            headers={"User-Agent": "VetKarta/1.0 (veterinary dashboard)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            feats = json.loads(resp.read().decode("utf-8")).get("features", [])
        for f in feats:
            props = f.get("properties", {})
            cc = props.get("countrycode")
            if cc == "RU" or cc is None:
                c = f.get("geometry", {}).get("coordinates") or []
                if len(c) == 2:
                    return float(c[1]), float(c[0])
    except Exception:
        pass
    return None, None


def nominatim_geocode(address, city):
    try:
        params = urllib.parse.urlencode({
            "q": f"{address}, {city}", "format": "json", "limit": 1,
            "countrycodes": "ru",
        })
        req = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/search?{params}",
            headers={"User-Agent": "VetKarta/1.0 (veterinary epidemiology dashboard)"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            items = json.loads(resp.read().decode("utf-8"))
        if items:
            return float(items[0]["lat"]), float(items[0]["lon"])
    except Exception:
        pass
    return None, None


def repair_mode():
    """Clean + geocode the committed dataset: drop retail, dedup, fill coords."""
    if not OUTPUT_PATH.exists():
        print("no enterprises-yandex.json to repair")
        return
    data = json.loads(OUTPUT_PATH.read_text())
    ents = data.get("enterprises", [])
    print(f"loaded {len(ents)} entries")

    # 1. drop retail
    kept = []
    dropped_retail = 0
    for e in ents:
        if is_retail(e.get("rubric", "")):
            dropped_retail += 1
            continue
        kept.append(e)
    print(f"retail dropped: {dropped_retail}")

    # 2. dedup by id, then by (name, address)
    by_id = {}
    for e in kept:
        old = by_id.get(e["id"])
        if old is None or (old.get("lat") is None and e.get("lat") is not None):
            by_id[e["id"]] = e
    seen = {}
    deduped = []
    for e in by_id.values():
        k = norm_key(e["name"], e.get("address", ""))
        prev = seen.get(k)
        if prev is None:
            seen[k] = e
            deduped.append(e)
        elif prev.get("lat") is None and e.get("lat") is not None:
            deduped.remove(prev)
            seen[k] = e
            deduped.append(e)
    print(f"after dedup: {len(deduped)} (removed {len(kept) - len(deduped)} dups)")

    # 3. re-type by name+rubric
    for e in deduped:
        e["type"] = categorize(e["name"], e.get("rubric", ""), e.get("type"))

    # 4. geocode missing coords
    missing = [e for e in deduped if e.get("lat") is None and e.get("address")]
    print(f"geocoding {len(missing)} coord-less entries (photon -> nominatim)…")
    fixed_photon = fixed_nom = failed = 0
    for i, e in enumerate(missing):
        lat, lon = photon_geocode(e["address"], e.get("city", ""))
        src = "photon"
        if lat is None:
            time.sleep(1.1)  # nominatim: strict 1 req/s
            lat, lon = nominatim_geocode(e["address"], e.get("city", ""))
            src = "nominatim"
        if lat is not None and is_in_russia(lat, lon):
            e["lat"], e["lon"] = round(lat, 6), round(lon, 6)
            if src == "photon":
                fixed_photon += 1
            else:
                fixed_nom += 1
        else:
            failed += 1
        if (i + 1) % 25 == 0:
            print(f"  …{i + 1}/{len(missing)} (photon {fixed_photon}, nom {fixed_nom}, fail {failed})")
        time.sleep(0.5)
    print(f"geocode done: photon {fixed_photon}, nominatim {fixed_nom}, failed {failed}")

    data["enterprises"] = deduped
    data["total"] = len(deduped)
    data["updated"] = time.strftime("%Y-%m-%d")
    OUTPUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    with_coords = sum(1 for e in deduped if e.get("lat") is not None)
    print(f"wrote {len(deduped)} entries ({with_coords} with coords) to {OUTPUT_PATH}")


# ── save/merge ──────────────────────────────────────────────────────────

def save_merged(new_results):
    """Upsert-merge new results into the committed file (accumulates across
    CI runs); prefer entries that already have coords."""
    existing = []
    if OUTPUT_PATH.exists():
        try:
            existing = json.loads(OUTPUT_PATH.read_text()).get("enterprises", [])
        except Exception:
            existing = []

    by_id = {}
    for e in existing:
        by_id[e["id"]] = e
    for r in new_results:
        old = by_id.get(r["id"])
        if old is None:
            by_id[r["id"]] = r
        elif old.get("lat") is None and r.get("lat") is not None:
            by_id[r["id"]] = r  # coord-bearing version wins
        else:
            # keep old coords, refresh metadata
            old.update({k: v for k, v in r.items() if k not in ("lat", "lon") or old.get(k) is None})

    # secondary dedup across different ids (same name+address)
    seen = {}
    merged = []
    for e in by_id.values():
        if is_retail(e.get("rubric", "")):
            continue
        k = norm_key(e["name"], e.get("address", ""))
        prev = seen.get(k)
        if prev is None:
            seen[k] = e
            merged.append(e)
        elif prev.get("lat") is None and e.get("lat") is not None:
            merged.remove(prev)
            seen[k] = e
            merged.append(e)

    merged.sort(key=lambda e: (e["type"], e["name"]))
    output = {
        "updated": time.strftime("%Y-%m-%d"),
        "sources": ["yandex"],
        "total": len(merged),
        "enterprises": merged,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    with_coords = sum(1 for e in merged if e.get("lat") is not None)
    print(f"    [save] {len(merged)} total ({with_coords} with coords)")


# ── main scrape ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cities", type=int, default=0, help="Limit to N cities (0 = all)")
    parser.add_argument("--categories", type=int, default=0, help="Limit to N categories (0 = all)")
    parser.add_argument("--headless", action="store_true", default=True)
    parser.add_argument("--no-headless", dest="headless", action="store_false")
    parser.add_argument("--scroll-pages", type=int, default=2)
    parser.add_argument("--org-budget", type=int, default=100,
                        help="max org-page visits per run for coords (accumulates across runs)")
    parser.add_argument("--repair", action="store_true",
                        help="no scraping: clean + geocode existing data")
    args = parser.parse_args()

    if args.repair:
        repair_mode()
        return

    cities = CITIES[:args.cities] if args.cities > 0 else list(CITIES)
    # Daily rotation: different cities first on different days, so the
    # CI timeout (which only fits part of the list) still covers everything
    # across the 4 runs per day.
    day_seed = int(datetime.date.today().strftime("%Y%m%d"))
    random.Random(day_seed).shuffle(cities)
    categories = CATEGORIES[:args.categories] if args.categories > 0 else CATEGORIES

    print(f"=== Yandex.Maps Enterprise Scraper v3 ===")
    print(f"  Cities: {len(cities)}, Categories: {len(categories)}")
    print(f"  Org-page coord budget: {args.org_budget}\n")

    from playwright.sync_api import sync_playwright

    all_results = []
    org_visits = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=args.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-infobars",
                "--window-size=1280,900",
                "--disable-extensions",
                "--disable-default-apps",
            ],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.126 Safari/537.36",
            locale="ru-RU",
            timezone_id="Europe/Moscow",
            extra_http_headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            },
        )
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en'] });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5].map(i => ({
                    name: 'Plugin ' + i,
                    filename: 'plugin' + i + '.so',
                    description: 'Plugin ' + i,
                })),
            });
            window.chrome = { runtime: {} };
        """)
        # Block images/fonts/stylesheets for speed
        context.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,css}",
                      lambda route: route.abort())

        page = context.new_page()
        page.set_default_timeout(20000)
        page.set_default_navigation_timeout(30000)

        for city_name, city_lat, city_lon in cities:
            for query, ent_type in categories:
                search_text = f"{query} {city_name}"
                print(f"\n  [{city_name}] {query}")

                try:
                    url = (
                        f"https://yandex.ru/maps/?text={urllib.parse.quote_plus(search_text)}"
                        f"&ll={city_lon}%2C{city_lat}&z=8"
                    )
                    page.goto(url, wait_until="domcontentloaded")

                    try:
                        page.wait_for_selector(
                            "[data-testid='search-business-snippet-view'], "
                            ".search-business-snippet-view, "
                            "a[href*='/org/'], "
                            "[class*='search-empty']",
                            timeout=10000,
                        )
                    except Exception:
                        print(f"    ✗ no results (timeout)")
                        continue

                    # Scroll to load more cards
                    results_panel = None
                    for sel in ["[class*='search-list']", "[class*='scroll']", ".sidebar"]:
                        try:
                            el = page.query_selector(sel)
                            if el:
                                results_panel = el
                                break
                        except Exception:
                            continue
                    if results_panel:
                        for _ in range(args.scroll_pages):
                            try:
                                results_panel.evaluate("el => el.scrollBy(0, 800)")
                                page.wait_for_timeout(1200)
                            except Exception:
                                break

                    if "/org/" in page.url:
                        # single confident match — Yandex redirected straight
                        # to the org page instead of a results list
                        hits = parse_org_page(page, city_name, query, ent_type)
                        print(f"    → redirected to single org page: {len(hits)} parsed")
                    else:
                        hits = parse_yandex_results(page, city_name, query, ent_type)
                        print(f"    → {len(hits)} parsed")

                    # Coords via org pages (budget-limited)
                    for h in hits:
                        if org_visits >= args.org_budget:
                            break
                        if h.get("org_href"):
                            org_visits += 1
                            lat, lon = fetch_org_coords(page, h["org_href"])
                            if lat is not None and is_in_russia(lat, lon):
                                h["lat"], h["lon"] = round(lat, 6), round(lon, 6)

                    with_coords = sum(1 for h in hits if h.get("lat") is not None)
                    print(f"    → {with_coords}/{len(hits)} with coords (org visits: {org_visits})")

                    all_results.extend(hits)
                    save_merged(all_results)

                    delay = 3 + (hash(search_text) % 3)  # 3-5s, varied
                    page.wait_for_timeout(delay * 1000)

                except Exception as e:
                    print(f"    ✗ error: {e}")
                    continue

        browser.close()

    print(f"\n=== FINAL ===")
    print(f"New results this run: {len(all_results)} (org-page visits: {org_visits})")
    by_type = {}
    for e in all_results:
        by_type[e["type"]] = by_type.get(e["type"], 0) + 1
    print("By type:")
    for t, n in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"  {t}: {n}")


if __name__ == "__main__":
    main()
