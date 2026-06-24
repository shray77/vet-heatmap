/**
 * WAHIS (WOAH World Animal Health Information System) scraper — v1 STUB.
 *
 * Status:
 *   - WAHIS is an Angular SPA at https://wahis.woah.org/
 *   - Backend API at https://wahis.woah.org/api/v1.0/* requires a session
 *     token obtained by hitting the SPA root and reading cookies/headers.
 *   - Direct REST calls without the session token return BAD_REQUEST.
 *
 * v1 approach: do nothing (return empty). Curated data covers the gap.
 *
 * v2 TODO (see /scripts/scrape/TODO-wahis.md):
 *   1. Use Playwright headless browser
 *      - Navigate to https://wahis.woah.org/
 *      - Wait for the Angular app to boot
 *      - Intercept network calls to capture the session token / cookies
 *   2. Replay the captured token against the REST endpoints:
 *      GET /api/v1.0/events?country=RU&pageSize=500&pageNumber=1
 *   3. Map the response to our RawArticle shape.
 *
 * The endpoint contract (from public API inspection) returns:
 *   {
 *     "status": "OK",
 *     "data": [
 *       {
 *         "disease": {"nameEn": "African swine fever", ...},
 *         "region": "Russia",
 *         "department": "Tverskaya oblast",
 *         "startDate": "2025-03-15",
 *         "species": "Sus scrofa (domestic)",
 *         "cases": 45,
 *         "deaths": 45,
 *         "status": "RESOLVED",
 *         ...
 *       }
 *     ]
 *   }
 */

import type { Outbreak, RawArticle, SourceKey } from "../../../src/types/domain";

export async function scrapeWahis(): Promise<{
  source: SourceKey;
  raw: RawArticle[];
  outbreaks: Outbreak[];
  warning: string;
}> {
  console.log("[wahis] v1 stub — no work done. See TODO-wahis.md.");
  return {
    source: "wahis",
    raw: [],
    outbreaks: [],
    warning:
      "v1 stub: WAHIS requires Angular SPA session-token (Playwright). See TODO-wahis.md.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeWahis().then((r) => console.log(JSON.stringify(r, null, 2)));
}
