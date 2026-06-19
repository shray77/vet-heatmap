/**
 * Disease group color palette — single source of truth.
 * Used by: map markers, epi curve bars, filter chips, legend.
 */

import type { DiseaseGroup, DiseaseKey } from "@/types/domain";

export const GROUP_COLORS: Record<DiseaseGroup, string> = {
  Avian: "#D32F2F",         // red
  Swine: "#7B1FA2",         // purple
  Ruminant: "#1565C0",      // blue
  "Equine/Wildlife": "#F57C00", // amber
  Wildlife: "#2E7D32",      // dark green
  "Multi-species": "#5D4037", // brown
};

/** Specific color per disease (overrides group color when we want distinction). */
export const DISEASE_COLORS: Partial<Record<DiseaseKey, string>> = {
  asf: "#6A1B9A",        // ASF — deep purple (distinguish from CSF)
  csf: "#AD1457",        // CSF — magenta
  fmd: "#0D47A1",        // FMD — navy
  anthrax: "#3E2723",    // Anthrax — dark brown (soil-borne)
  rabies: "#1B5E20",     // Rabies — deep green
  hpai: "#C62828",       // HPAI — bright red
  newcastle: "#EF6C00",  // Newcastle — orange
  bluetongue: "#283593", // Bluetongue — indigo
  brucellosis: "#00838F", // Brucellosis — teal
  btb: "#4E342E",        // Bovine TB — brown
  ppr: "#4527A0",        // PPR — deep violet
  lsd: "#558B2F",        // LSD — olive green
  wnv: "#FF8F00",        // WNV — golden amber
  lepto: "#6D4C41",      // Lepto — brown
  eia: "#880E4F",        // EIA — dark magenta
  leukosis: "#37474F",   // Leukosis — blue-grey
  other: "#757575",
};

export function diseaseColor(key: DiseaseKey, group: DiseaseGroup): string {
  return DISEASE_COLORS[key] ?? GROUP_COLORS[group] ?? GROUP_COLORS["Multi-species"];
}
