/**
 * FSVP (Rosselkhoznadzor) scraper.
 *
 * Strategy:
 *   1. Fetch /jepizooticheskaja-situacija/rossija/operativnye-informacionnye-soobshhenija/
 *      — this page links daily PDF situation reports (one per working day).
 *   2. Extract PDF URLs + their publication dates.
 *   3. (v1) Save the PDF index to /scripts/scrape/.cache/fsvps-pdfs.json
 *      so the merge step can include "last-fetched" metadata.
 *   4. (v2 TODO) Download + parse each PDF with pdfjs to extract outbreak records.
 *
 * For v1, this scraper produces a "source manifest" of available reports
 * and returns an empty outbreak list. The curated dataset is the actual
 * source of truth for v1, while the manifest proves the pipeline can
 * reach fsvps and is ready to consume real data once PDF parsing lands.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Outbreak, RawArticle, SourceKey } from "../../../src/types/domain";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = resolve(__dirname, "..", ".cache");
const FSVPS_URL =
  "https://fsvps.gov.ru/jepizooticheskaja-situacija/rossija/operativnye-informacionnye-soobshhenija/";

/** PDF report link with extracted date. */
export interface FsvpPdfReport {
  url: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Russian display date as it appeared on the page. */
  display: string;
  /** When we scraped this entry. */
  fetched_at: string;
}

const MONTHS_RU: Record<string, string> = {
  января: "01", февраля: "02", марта: "03", апреля: "04", мая: "05", июня: "06",
  июля: "07", августа: "08", сентября: "09", октября: "10", ноября: "11", декабря: "12",
};

/** Parse "19 июня 2026" -> "2026-06-19". */
function parseRuDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+([а-яА-Я]+)\s+(\d{4})/);
  if (!m) return null;
  const [, day, monRu, year] = m;
  const mon = MONTHS_RU[monRu.toLowerCase()];
  if (!mon) return null;
  return `${year}-${mon}-${day.padStart(2, "0")}`;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
      "Accept-Encoding": "gzip, deflate, br",
    },
  });
  if (!res.ok) {
    throw new Error(`[fsvps] HTTP ${res.status} on ${url}`);
  }
  return res.text();
}

/** Extract all PDF report links with publication dates from the operational-news page. */
function extractPdfReports(html: string): FsvpPdfReport[] {
  const reports: FsvpPdfReport[] = [];
  const seen = new Set<string>();

  // Match: href="...*.pdf" + nearby date "DD month YYYY"
  const re = /href="(https?:\/\/[^"]+\.pdf)"[^>]*>([^<]{0,200}?)<[^>]*>\s*(\d{1,2}\s+[а-яА-Я]+\s+\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, url, , dateRu] = m;
    if (seen.has(url)) continue;
    seen.add(url);

    const iso = parseRuDate(dateRu.trim());
    if (!iso) continue;
    reports.push({
      url,
      date: iso,
      display: dateRu.trim(),
      fetched_at: new Date().toISOString(),
    });
  }

  // Fallback: any *.pdf link in the page, with date inferred from URL filename
  const pdfRe = /href="(https?:\/\/fsvps\.gov\.ru\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"]+\.pdf)"/g;
  while ((m = pdfRe.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    // Try to parse date from filename: "19.06.2026г.pdf" or "01.06.2026.pdf"
    const fname = url.split("/").pop() || "";
    const d = fname.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/);
    if (d) {
      const [, day, mon, year] = d;
      const iso = `${year}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}`;
      reports.push({
        url,
        date: iso,
        display: fname,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  return reports.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Main scrape entrypoint.
 *
 * v1 behavior: fetch the page, extract PDF report index, save to cache,
 * return [] outbreaks (since PDF parsing is not yet implemented).
 *
 * v2 TODO: for each report PDF, download, extract text with pdfjs,
 * regex-extract {disease, region, species, cases, deaths, date} rows,
 * return as RawArticle[]. Stub shows the target shape.
 */
export async function scrapeFsvps(opts: { lookbackDays?: number } = {}): Promise<{
  source: SourceKey;
  reports: FsvpPdfReport[];
  raw: RawArticle[];
  outbreaks: Outbreak[];
  warning?: string;
}> {
  console.log("[fsvps] Fetching operational news page…");
  const html = await fetchHtml(FSVPS_URL);
  console.log(`[fsvps] HTML size: ${html.length.toLocaleString()} bytes`);

  const reports = extractPdfReports(html);
  console.log(`[fsvps] Found ${reports.length} PDF reports`);

  // Save manifest for v2 PDF-parsing pipeline + for the frontend "last fetched" indicator
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    resolve(CACHE_DIR, "fsvps-pdfs.json"),
    JSON.stringify({ fetched_at: new Date().toISOString(), url: FSVPS_URL, reports }, null, 2),
    "utf-8",
  );

  // Apply lookback window (default: last 365 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (opts.lookbackDays ?? 365));
  const recent = reports.filter((r) => new Date(r.date) >= cutoff);
  console.log(`[fsvps] ${recent.length} reports within last ${opts.lookbackDays ?? 365} days`);

  // ─── v2 placeholder ────────────────────────────────────────────────────
  // For each recent report, we would:
  //   1. Download the PDF
  //   2. Extract text with pdfjs-dist
  //   3. Regex-match outbreak rows (e.g. "АЧС, Тверская обл., свиньи, пало 12")
  //   4. Build RawArticle per row
  //
  // See /scripts/scrape/TODO-pdf-parsing.md for the planned approach.
  // ──────────────────────────────────────────────────────────────────────

  return {
    source: "fsvps",
    reports,
    raw: [],
    outbreaks: [],
    warning:
      "v1 stub: PDF parsing not yet implemented. Pipeline reaches fsvps.gov.ru and indexes daily reports, but outbreak extraction from PDFs is pending (see TODO-pdf-parsing.md). Curated dataset is used as fallback.",
  };
}

// ─── CLI entrypoint ────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeFsvps()
    .then((r) => {
      console.log("\n=== fsvps scrape result ===");
      console.log(`Source: ${r.source}`);
      console.log(`PDF reports found: ${r.reports.length}`);
      console.log(`Most recent 5 reports:`);
      for (const rep of r.reports.slice(0, 5)) {
        console.log(`  ${rep.date}  ${rep.url}`);
      }
      if (r.warning) console.log(`\n⚠️  ${r.warning}`);
    })
    .catch((e) => {
      console.error("[fsvps] FATAL:", e);
      process.exit(1);
    });
}
