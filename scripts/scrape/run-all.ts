#!/usr/bin/env bun
/**
 * run-all.ts — orchestrator for the scraper pipeline.
 *
 * Flow:
 *   1. Load curated outbreak dataset (always — fallback safety net)
 *   2. Try each scraper source in parallel:
 *        - fsvps (real, v1 indexes PDFs only)
 *        - wahis (stub)
 *        - efsa (stub)
 *   3. Merge + dedupe all outbreaks
 *   4. Write final OutbreakDataset to public/data/outbreaks.json
 *   5. Print a summary
 *
 * Usage:
 *   bun run scripts/scrape/run-all.ts
 *
 * Exit codes:
 *   0 — at least curated data is available, dataset written successfully
 *   1 — fatal error, no data produced
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Outbreak, SourceKey } from "../../src/types/domain";
import { loadCuratedOutbreaks } from "./sources/curated";
import { scrapeFsvps } from "./sources/fsvps";
import { scrapeWahis } from "./sources/wahis";
import { scrapeEfsa } from "./sources/efsa";
import { mergeOutbreaks, buildDataset } from "./merge";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "..", "public", "data", "outbreaks.json");

async function main() {
  console.log("=".repeat(70));
  console.log("  VetHeatmap scraper — run-all");
  console.log("=".repeat(70));
  console.log(`Started: ${new Date().toISOString()}\n`);

  // 1. Always load curated as baseline
  console.log("─".repeat(70));
  console.log("[1/4] Loading curated baseline…");
  const curated = await loadCuratedOutbreaks();
  console.log(`      ✓ ${curated.length} curated outbreaks loaded`);

  // 2. Run all scrapers in parallel
  console.log("\n" + "─".repeat(70));
  console.log("[2/4] Running scrapers in parallel…");

  const sources: { source: SourceKey; outbreaks: Outbreak[]; warning?: string }[] = [];

  // Curated always goes in
  sources.push({ source: "curated", outbreaks: curated });

  // Run external scrapers; if any fail, log warning and continue
  const results = await Promise.allSettled([
    scrapeFsvps({ lookbackDays: 30, maxReports: 10 }),
    scrapeWahis(),
    scrapeEfsa(),
  ]);

  const fsvpsResult = results[0];
  if (fsvpsResult.status === "fulfilled") {
    console.log(`      ✓ fsvps: ${fsvpsResult.value.reports.length} PDF reports indexed, ${fsvpsResult.value.outbreaks.length} outbreaks extracted`);
    sources.push({ source: "fsvps", outbreaks: fsvpsResult.value.outbreaks, warning: fsvpsResult.value.warning });
    if (fsvpsResult.value.warning) console.log(`        ⚠  ${fsvpsResult.value.warning}`);
  } else {
    console.log(`      ✗ fsvps FAILED: ${fsvpsResult.reason?.message ?? fsvpsResult.reason}`);
  }

  const wahisResult = results[1];
  if (wahisResult.status === "fulfilled") {
    console.log(`      ✓ wahis: ${wahisResult.value.outbreaks.length} outbreaks (stub)`);
    sources.push({ source: "wahis", outbreaks: wahisResult.value.outbreaks, warning: wahisResult.value.warning });
    if (wahisResult.value.warning) console.log(`        ⚠  ${wahisResult.value.warning}`);
  } else {
    console.log(`      ✗ wahis FAILED: ${wahisResult.reason?.message ?? wahisResult.reason}`);
  }

  const efsaResult = results[2];
  if (efsaResult.status === "fulfilled") {
    console.log(`      ✓ efsa: ${efsaResult.value.outbreaks.length} outbreaks (stub)`);
    sources.push({ source: "efsa", outbreaks: efsaResult.value.outbreaks, warning: efsaResult.value.warning });
    if (efsaResult.value.warning) console.log(`        ⚠  ${efsaResult.value.warning}`);
  } else {
    console.log(`      ✗ efsa FAILED: ${efsaResult.reason?.message ?? efsaResult.reason}`);
  }

  // 3. Merge + dedupe
  console.log("\n" + "─".repeat(70));
  console.log("[3/4] Merging + deduping…");
  const totalBefore = sources.reduce((s, x) => s + x.outbreaks.length, 0);
  const merged = mergeOutbreaks(sources.map((s) => ({ source: s.source, outbreaks: s.outbreaks })));
  console.log(`      ${totalBefore} → ${merged.length} (after dedupe)`);

  const contributingSources: SourceKey[] = sources
    .filter((s) => s.outbreaks.length > 0)
    .map((s) => s.source);

  // 4. Build dataset + write
  console.log("\n" + "─".repeat(70));
  console.log("[4/4] Writing final dataset…");
  const dataset = buildDataset(merged, contributingSources);

  await writeFile(OUT_PATH, JSON.stringify(dataset, null, 2), "utf-8");
  console.log(`      ✓ Written ${dataset.total_outbreaks} outbreaks to ${OUT_PATH}`);

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("  Summary");
  console.log("=".repeat(70));
  console.log(`Updated: ${dataset.updated}`);
  console.log(`Sources contributing: ${dataset.sources.join(", ")}`);
  console.log(`Total outbreaks: ${dataset.total_outbreaks}`);

  const byDisease: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const o of dataset.outbreaks) {
    byDisease[o.disease] = (byDisease[o.disease] ?? 0) + 1;
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    bySource[o.source] = (bySource[o.source] ?? 0) + 1;
  }
  console.log("\nBy disease:");
  for (const [d, n] of Object.entries(byDisease).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${d}`);
  }
  console.log("\nBy status:");
  for (const [s, n] of Object.entries(byStatus)) {
    console.log(`  ${n.toString().padStart(3)}  ${s}`);
  }
  console.log("\nBy source:");
  for (const [s, n] of Object.entries(bySource)) {
    console.log(`  ${n.toString().padStart(3)}  ${s}`);
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
