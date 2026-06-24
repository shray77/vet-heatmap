/**
 * Disease normalization: map free-form disease names from sources to
 * canonical DiseaseKey + standard labels.
 *
 * Sources use a wild variety of spellings — "АЧС", "Африканская чума свиней",
 * "African Swine Fever", "ASF", "HPAI H5N1", "Грипп птиц H5", etc.
 * This module collapses all aliases to a single canonical key.
 */

import type { DiseaseKey, DiseaseGroup } from "@/types/domain";

/** Mapping: any alias (RU/EN, abbreviations) -> canonical DiseaseKey. */
const DISEASE_ALIASES: Record<string, DiseaseKey> = {
  // ASF
  "африканская чума свиней": "asf",
  "ачс": "asf",
  "african swine fever": "asf",
  "asf": "asf",
  // CSF
  "классическая чума свиней": "csf",
  "классическая чума свиней (ксс)": "csf",
  "ксс": "csf",
  "classical swine fever": "csf",
  "csf": "csf",
  "hog cholera": "csf",
  // FMD
  "ящур": "fmd",
  "ящур типа o": "fmd",
  "ящур типа a": "fmd",
  "foot and mouth disease": "fmd",
  "foot and mouth disease (fmd) o": "fmd",
  "foot and mouth disease (fmd) a": "fmd",
  "fmd": "fmd",
  // Anthrax
  "сибирская язва": "anthrax",
  "anthrax": "anthrax",
  // Rabies
  "бешенство": "rabies",
  "rabies": "rabies",
  // HPAI
  "грипп птиц": "hpai",
  "грипп птиц h5n1": "hpai",
  "грипп птиц h5n8": "hpai",
  "грипп птиц hpai h5": "hpai",
  "высокопатогенный грипп птиц": "hpai",
  "avian influenza (hpai h5n1)": "hpai",
  "avian influenza (hpai h5n8)": "hpai",
  "avian influenza (hpai h5)": "hpai",
  "avian influenza": "hpai",
  "hpai": "hpai",
  // Newcastle
  "болезнь ньюкасла": "newcastle",
  "newcastle disease": "newcastle",
  // Bluetongue
  "блютунг": "bluetongue",
  "катаральная лихорадка овец": "bluetongue",
  "bluetongue (btv-8)": "bluetongue",
  "bluetongue (btv-4)": "bluetongue",
  "bluetongue (btv)": "bluetongue",
  "bluetongue": "bluetongue",
  // Brucellosis
  "бруцеллёз": "brucellosis",
  "бруцеллез": "brucellosis",
  "brucellosis (b. melitensis)": "brucellosis",
  "brucellosis (b. abortus)": "brucellosis",
  "brucellosis": "brucellosis",
  // Bovine TB
  "туберкулёз крупного рогатого скота": "btb",
  "туберкулез крс": "btb",
  "bovine tuberculosis": "btb",
  // PPR
  "чума мелких жвачных животных": "ppr",
  "чума мелких жвачных": "ppr",
  "peste des petits ruminants (ppr)": "ppr",
  "ppr": "ppr",
  // LSD
  "узелковый дерматит": "lsd",
  "узелковый дерматит крс": "lsd",
  "lumpy skin disease": "lsd",
  // WNV
  "лихорадка западного нила": "wnv",
  "западный нил": "wnv",
  "west nile virus": "wnv",
  // Leptospirosis
  "лептоспироз": "lepto",
  "leptospirosis": "lepto",
  // EIA
  "инфекционная анемия лошадей": "eia",
  "equine infectious anemia": "eia",
  // Leukosis
  "лейкоз крупного рогатого скота": "leukosis",
  "энзоотический лейкоз крс": "leukosis",
  "лейкоз крс": "leukosis",
  "enzootic bovine leukosis": "leukosis",
  // Varroosis (bees)
  "варроатоз пчёл": "varroosis",
  "варроатоз пчел": "varroosis",
  "варроатоз": "varroosis",
  "varroosis": "varroosis",
  // Nosemosis (bees)
  "нозематоз пчёл": "nosemosis",
  "нозематоз пчел": "nosemosis",
  "нозематоз": "nosemosis",
  "nosemosis": "nosemosis",
  // Trichinellosis
  "трихинеллёз": "trichinellosis",
  "трихинеллез": "trichinellosis",
  "trichinellosis": "trichinellosis",
  // Spring Viraemia of Carp
  "весенняя виремия карпов": "svc",
  "весенняя виремия карпов": "svc",
  "svc": "svc",
  // Avian salmonellosis
  "сальмонеллёз птицы": "avian_salmonellosis",
  "сальмонеллез птицы": "avian_salmonellosis",
  "сальмонеллёз": "avian_salmonellosis",
  "сальмонеллез": "avian_salmonellosis",
  "avian salmonellosis": "avian_salmonellosis",
};

/** Default human-readable labels (RU + EN) per canonical key. */
export const DISEASE_LABELS: Record<DiseaseKey, { ru: string; en: string; short_ru: string; group: DiseaseGroup }> = {
  asf: { ru: "Африканская чума свиней", en: "African Swine Fever", short_ru: "АЧС", group: "Swine" },
  csf: { ru: "Классическая чума свиней", en: "Classical Swine Fever", short_ru: "КЧС", group: "Swine" },
  fmd: { ru: "Ящур", en: "Foot and Mouth Disease", short_ru: "Ящур", group: "Ruminant" },
  anthrax: { ru: "Сибирская язва", en: "Anthrax", short_ru: "Сиб. язва", group: "Ruminant" },
  rabies: { ru: "Бешенство", en: "Rabies", short_ru: "Бешенство", group: "Wildlife" },
  hpai: { ru: "Грипп птиц", en: "Avian Influenza (HPAI)", short_ru: "Грипп птиц", group: "Avian" },
  newcastle: { ru: "Болезнь Ньюкасла", en: "Newcastle Disease", short_ru: "Ньюкасл", group: "Avian" },
  bluetongue: { ru: "Блютунг", en: "Bluetongue", short_ru: "Блютунг", group: "Ruminant" },
  brucellosis: { ru: "Бруцеллёз", en: "Brucellosis", short_ru: "Бруцеллёз", group: "Ruminant" },
  btb: { ru: "Туберкулёз КРС", en: "Bovine Tuberculosis", short_ru: "Туб. КРС", group: "Ruminant" },
  ppr: { ru: "Чума мелких жвачных", en: "PPR", short_ru: "ЧМЖ", group: "Ruminant" },
  lsd: { ru: "Узелковый дерматит", en: "Lumpy Skin Disease", short_ru: "УЗД", group: "Ruminant" },
  wnv: { ru: "Лихорадка Западного Нила", en: "West Nile Virus", short_ru: "ЛЗН", group: "Equine/Wildlife" },
  lepto: { ru: "Лептоспироз", en: "Leptospirosis", short_ru: "Лепто", group: "Multi-species" },
  eia: { ru: "Инфекционная анемия лошадей", en: "Equine Infectious Anemia", short_ru: "ИАЛ", group: "Equine/Wildlife" },
  leukosis: { ru: "Лейкоз КРС", en: "Enzootic Bovine Leukosis", short_ru: "Лейкоз", group: "Ruminant" },
  varroosis: { ru: "Варроатоз пчёл", en: "Varroosis", short_ru: "Варроатоз", group: "Multi-species" },
  nosemosis: { ru: "Нозематоз пчёл", en: "Nosemosis", short_ru: "Нозематоз", group: "Multi-species" },
  trichinellosis: { ru: "Трихинеллёз", en: "Trichinellosis", short_ru: "Трихин.", group: "Wildlife" },
  svc: { ru: "Весенняя виремия карпов", en: "Spring Viraemia of Carp", short_ru: "ВВК", group: "Wildlife" },
  avian_salmonellosis: { ru: "Сальмонеллёз птицы", en: "Avian Salmonellosis", short_ru: "Сальм.", group: "Avian" },
  other: { ru: "Прочее", en: "Other", short_ru: "Прочее", group: "Multi-species" },
};

/**
 * Normalize a free-form disease string to a canonical DiseaseKey.
 * Falls back to "other" if no match.
 */
export function normalizeDisease(raw: string): DiseaseKey {
  if (!raw) return "other";
  const lower = raw.trim().toLowerCase();
  if (DISEASE_ALIASES[lower]) return DISEASE_ALIASES[lower];

  // Substring match (e.g. "Avian Influenza (HPAI H5N1) — details" → "hpai")
  for (const [alias, key] of Object.entries(DISEASE_ALIASES)) {
    if (lower.includes(alias)) return key;
  }

  return "other";
}

/** Get standard labels for a disease key. */
export function getDiseaseLabels(key: DiseaseKey) {
  return DISEASE_LABELS[key] ?? DISEASE_LABELS.other;
}
