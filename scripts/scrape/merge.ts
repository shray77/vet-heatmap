/**
 * Merge + dedupe outbreak records from multiple sources.
 *
 * Strategy:
 *   1. Collect all Outbreak[] arrays from sources (curated, fsvps, wahis, efsa).
 *   2. Sort by date ascending.
 *   3. Deduplicate by composite key:
 *        `${disease_key}|${region_geo}|${date_bucket}`
 *      where date_bucket floors the date to a 7-day window.
 *      Two outbreaks from different sources within the same week+region+disease
 *      are considered the same event.
 *   4. On conflict (same key, different fields):
 *        - Prefer source priority: fsvps > wahis > efsa > curated
 *          (real-world reports beat curated fallback)
 *        - Take max(cases), max(deaths) — different sources may report partial numbers
 *        - Take latest status (Ongoing wins over Resolved)
 *   5. Reassign sequential IDs.
 *   6. Return final OutbreakDataset.
 */

import type { Outbreak, OutbreakDataset, SourceKey } from "../../src/types/domain";

const SOURCE_PRIORITY: Record<SourceKey, number> = {
  fsvps: 4,   // most authoritative for RF, real-time
  wahis: 3,   // WOAH official
  efsa: 2,    // EU perspective (cross-border)
  curated: 1, // fallback
};

/** Floor a date to the start of its 7-day bucket (epoch days / 7). */
function dateBucket(isoDate: string): string {
  const d = new Date(isoDate);
  const epochDays = Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
  const bucketStart = Math.floor(epochDays / 7) * 7;
  return String(bucketStart);
}

function dedupeKey(o: Outbreak): string {
  return `${o.disease_key}|${o.region_geo || o.region}|${dateBucket(o.date)}`;
}

/** Merge two outbreak records that share a dedupe key. */
function mergePair(a: Outbreak, b: Outbreak): Outbreak {
  const winner = SOURCE_PRIORITY[a.source] >= SOURCE_PRIORITY[b.source] ? a : b;

  return {
    ...winner,
    // Take the maximums — different sources report partial data
    cases: Math.max(a.cases, b.cases),
    deaths: Math.max(a.deaths, b.deaths),
    // Prefer known geo coords
    lat: a.lat ?? b.lat,
    lon: a.lon ?? b.lon,
    // Ongoing beats Resolved (more recent info)
    status: a.status === "Ongoing" || b.status === "Ongoing" ? "Ongoing" : winner.status,
    // Combine notes
    notes: [a.notes, b.notes].filter(Boolean).join(" | ") || winner.notes,
    // Take the most recent date if sources disagree
    date: a.date > b.date ? a.date : b.date,
  };
}

export function mergeOutbreaks(allSources: { source: SourceKey; outbreaks: Outbreak[] }[]): Outbreak[] {
  // Flatten all outbreaks
  const all: Outbreak[] = allSources.flatMap((s) => s.outbreaks);

  // Group by dedupe key
  const grouped: Map<string, Outbreak[]> = new Map();
  for (const o of all) {
    const key = dedupeKey(o);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(o);
  }

  // Merge each group
  const merged: Outbreak[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      const reduced = group.reduce((acc, o) => mergePair(acc, o));
      merged.push(reduced);
    }
  }

  // Sort by date ascending, then reassign IDs
  merged.sort((a, b) => a.date.localeCompare(b.date));
  merged.forEach((o, i) => {
    o.id = i + 1;
  });

  return merged;
}

export function buildDataset(
  merged: Outbreak[],
  contributingSources: SourceKey[],
): OutbreakDataset {
  return {
    updated: new Date().toISOString().slice(0, 10),
    sources: contributingSources,
    total_outbreaks: merged.length,
    outbreaks: merged,
  };
}
