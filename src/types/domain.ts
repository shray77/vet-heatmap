/**
 * Domain types for the veterinary heatmap project.
 *
 * These types are shared across:
 *   - the scraper pipeline (scripts/scrape/*)
 *   - the Next.js frontend (src/**)
 *   - the curated JSON dataset (public/data/*)
 *
 * Keep this file dependency-free so it can be imported anywhere.
 */

// ─── Outbreaks ─────────────────────────────────────────────────────────────

/** Canonical disease keys. Used as stable identifiers across sources. */
export type DiseaseKey =
  | "asf" // African Swine Fever
  | "csf" // Classical Swine Fever
  | "fmd" // Foot-and-Mouth Disease
  | "anthrax"
  | "rabies"
  | "hpai" // Highly Pathogenic Avian Influenza
  | "newcastle" // Newcastle Disease
  | "bluetongue"
  | "brucellosis"
  | "btb" // Bovine Tuberculosis
  | "ppr" // Peste des Petits Ruminants
  | "lsd" // Lumpy Skin Disease
  | "wnv" // West Nile Virus
  | "lepto" // Leptospirosis
  | "eia" // Equine Infectious Anemia
  | "leukosis" // Enzootic Bovine Leukosis
  | "varroosis" // Varroa mite (bees)
  | "nosemosis" // Nosema (bees)
  | "trichinellosis" // Trichinella
  | "svc" // Spring Viraemia of Carp
  | "avian_salmonellosis" // Avian salmonellosis
  | "other";

export type DiseaseGroup =
  | "Avian"
  | "Swine"
  | "Ruminant"
  | "Equine/Wildlife"
  | "Wildlife"
  | "Multi-species";

export type OutbreakStatus = "Ongoing" | "Resolved" | "Unknown";

export type SusceptibleSpecies =
  | "Cattle"
  | "Sheep"
  | "Goats"
  | "Sheep/Goats"
  | "Swine (domestic)"
  | "Wild boar"
  | "Poultry"
  | "Wild birds"
  | "Horse"
  | "Fox"
  | "Wolf"
  | "Raccoon dog"
  | "Fox/Wolf"
  | "Fox/Raccoon dog"
  | "Other";

/** Where this outbreak record came from. */
export type SourceKey = "fsvps" | "wahis" | "efsa" | "curated";

export interface Outbreak {
  /** Stable id (assigned by merge step). */
  id: number;
  /** Canonical disease key — links to DiseaseProfile. */
  disease_key: DiseaseKey;
  /** Human-readable disease label (RU + EN). */
  disease: string;
  /** Higher-level grouping for filtering/color. */
  disease_group: DiseaseGroup;
  /** Original region name in Russian (as written by source). */
  region: string;
  /** GeoJSON-matched region name (English transliteration). */
  region_geo: string;
  /** ISO date (YYYY-MM-DD) — start of outbreak per source. */
  date: string;
  /** Susceptible species (free-form). */
  species: string;
  /** Number of detected cases. */
  cases: number;
  /** Number of deaths. */
  deaths: number;
  /** Outbreak lifecycle status. */
  status: OutbreakStatus;
  /** Where the data came from. */
  source: SourceKey;
  /** Original source URL if known. */
  source_url?: string;
  /** Latitude (optional — point of farm/outbreak). */
  lat?: number;
  /** Longitude. */
  lon?: number;
  /** Free-text notes extracted from the source. */
  notes?: string;
}

export interface OutbreakDataset {
  /** ISO date when dataset was last refreshed. */
  updated: string;
  /** Which sources contributed. */
  sources: SourceKey[];
  /** Total record count. */
  total_outbreaks: number;
  /** The records. */
  outbreaks: Outbreak[];
}

// ─── Disease profiles ──────────────────────────────────────────────────────

export interface DiseaseProfile {
  disease_key: DiseaseKey;
  /** Russian name. */
  name_ru: string;
  /** English name. */
  name_en: string;
  /** Short name used in chips/legends. */
  short_ru: string;
  /** Higher-level grouping. */
  group: DiseaseGroup;
  /** Incubation period in days (min/max). */
  incubation_min: number;
  incubation_max: number;
  /** Basic reproduction number range (typical). */
  r0_min: number;
  r0_max: number;
  /** Routes of transmission (canonical strings). */
  transmission_routes: string[];
  /** Susceptible species list. */
  susceptible_species: SusceptibleSpecies[];
  /** Quarantine: protection zone radius in km (WOAH standard). */
  protection_zone_km: number;
  /** Quarantine: surveillance zone radius in km. */
  surveillance_zone_km: number;
  /** Quarantine: broader restriction zone radius in km. */
  restriction_zone_km: number;
  /** Minimum observation period in days after detection. */
  observation_days: number;
  /** Minimum restriction period in days. */
  restriction_days: number;
  /** Whether vaccine is available in RF. */
  vaccine_available: boolean;
  /** Whether disease is zoonotic (infects humans). */
  zoonotic: boolean;
  /** Key clinical signs (Russian). */
  clinical_signs: string[];
  /** Public-health / veterinary measures summary. */
  measures_summary: string;
  /** WOAH Terrestrial Code chapter reference. */
  woah_reference: string;
  /** Russian regulatory references. */
  rf_regulatory: string[];
}

// ─── Region metadata ───────────────────────────────────────────────────────

export interface RegionProperties {
  /** GeoJSON shapeName (English). */
  shapeName: string;
  /** Russian region name (canonical). */
  name_ru: string;
  /** ISO 3166-2:RU code (e.g. "RU-MOW"). */
  iso_code: string;
  /** Approximate human population (millions, 2024 est.). */
  population_mln: number;
  /** Pig density (head/km²). */
  pigs_per_km2: number;
  /** Cattle density (head/km²). */
  cattle_per_km2: number;
  /** Poultry density (head/km²). */
  poultry_per_km2: number;
  /** Federal district (OKrug). */
  federal_district: string;
}

// ─── Sources ───────────────────────────────────────────────────────────────

/** Raw article as scraped from a source (before normalization to Outbreak). */
export interface RawArticle {
  source: SourceKey;
  url: string;
  title: string;
  published_at: string; // ISO date
  body_text: string;
  /** Optional pre-extracted fields if the source exposes them. */
  detected_disease?: string;
  detected_region?: string;
  detected_species?: string;
  detected_cases?: number;
  detected_deaths?: number;
}
