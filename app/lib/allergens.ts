/**
 * Canonical, language-agnostic allergen module.
 *
 * The user's allergies are stored by stable ID (e.g. "milk"), never by translated
 * display text. Synonyms / hidden-ingredient terms are listed per language purely for
 * TEXT MATCHING (not for display — display names come from i18n `allergen.<id>`).
 *
 * Allergen WARNINGS are produced here in code (deterministic, auditable), not by the AI.
 */

export type SynonymLang = 'pt' | 'en' | 'es' | 'fr' | 'de';

export interface AllergenDef {
  id: string;
  emoji: string;
  /** EU-14 core allergen (vs. common extra). */
  eu14: boolean;
  /** Matching terms per language. Include common plurals are handled automatically. */
  synonyms: Record<SynonymLang, string[]>;
}

/** EU-14 + a few common extras. IDs are stable and must never be translated. */
export const ALLERGENS: AllergenDef[] = [
  {
    id: 'gluten',
    emoji: '🌾',
    eu14: true,
    synonyms: {
      en: ['gluten', 'wheat', 'barley', 'rye', 'malt', 'spelt', 'semolina', 'couscous', 'farro', 'durum', 'triticale', 'seitan', 'bulgur'],
      pt: ['gluten', 'trigo', 'cevada', 'centeio', 'malte', 'espelta', 'semola', 'cuscuz', 'seitan'],
      es: ['gluten', 'trigo', 'cebada', 'centeno', 'malta', 'espelta', 'semola', 'cuscus'],
      fr: ['gluten', 'ble', 'orge', 'seigle', 'malt', 'epeautre', 'semoule', 'couscous'],
      de: ['gluten', 'weizen', 'gerste', 'roggen', 'malz', 'dinkel', 'grieß', 'grie', 'couscous'],
    },
  },
  {
    id: 'crustaceans',
    emoji: '🦐',
    eu14: true,
    synonyms: {
      en: ['crustacean', 'shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'langoustine'],
      pt: ['crustaceo', 'camarao', 'caranguejo', 'lagosta', 'lagostim', 'siri'],
      es: ['crustaceo', 'gamba', 'camaron', 'cangrejo', 'langosta', 'langostino'],
      fr: ['crustace', 'crevette', 'crabe', 'homard', 'langoustine', 'ecrevisse'],
      de: ['krebstier', 'garnele', 'krabbe', 'hummer', 'languste', 'shrimp'],
    },
  },
  {
    id: 'egg',
    emoji: '🥚',
    eu14: true,
    synonyms: {
      en: ['egg', 'albumin', 'albumen', 'ovalbumin', 'mayonnaise', 'meringue', 'lysozyme', 'ovomucoid'],
      pt: ['ovo', 'clara de ovo', 'gema', 'albumina', 'maionese', 'merengue'],
      es: ['huevo', 'clara de huevo', 'yema', 'albumina', 'mayonesa', 'merengue'],
      fr: ['oeuf', 'blanc d oeuf', 'jaune d oeuf', 'albumine', 'mayonnaise', 'meringue'],
      de: ['ei', 'eiklar', 'eigelb', 'albumin', 'mayonnaise', 'baiser'],
    },
  },
  {
    id: 'fish',
    emoji: '🐟',
    eu14: true,
    synonyms: {
      en: ['fish', 'cod', 'tuna', 'salmon', 'anchovy', 'sardine', 'haddock', 'tilapia', 'hake', 'fish sauce', 'worcestershire'],
      pt: ['peixe', 'bacalhau', 'atum', 'salmao', 'anchova', 'sardinha', 'tilapia', 'merluza'],
      es: ['pescado', 'bacalao', 'atun', 'salmon', 'anchoa', 'sardina', 'merluza'],
      fr: ['poisson', 'morue', 'thon', 'saumon', 'anchois', 'sardine', 'cabillaud'],
      de: ['fisch', 'kabeljau', 'thunfisch', 'lachs', 'sardelle', 'sardine', 'anchovis'],
    },
  },
  {
    id: 'peanut',
    emoji: '🥜',
    eu14: true,
    synonyms: {
      en: ['peanut', 'groundnut', 'arachis', 'peanut butter', 'peanut oil'],
      pt: ['amendoim', 'pasta de amendoim', 'oleo de amendoim'],
      es: ['cacahuete', 'mani', 'crema de cacahuete'],
      fr: ['arachide', 'cacahuete', 'beurre de cacahuete'],
      de: ['erdnuss', 'erdnussbutter', 'erdnussol'],
    },
  },
  {
    id: 'soy',
    emoji: '🫘',
    eu14: true,
    synonyms: {
      en: ['soy', 'soya', 'soybean', 'soy lecithin', 'lecithin', 'soy protein', 'tofu', 'edamame', 'miso', 'shoyu', 'tempeh', 'tamari'],
      pt: ['soja', 'lecitina de soja', 'lecitina', 'proteina de soja', 'tofu', 'edamame', 'misso', 'shoyu'],
      es: ['soja', 'soya', 'lecitina de soja', 'lecitina', 'tofu', 'edamame', 'miso'],
      fr: ['soja', 'lecithine de soja', 'lecithine', 'tofu', 'edamame', 'miso'],
      de: ['soja', 'sojalecithin', 'lecithin', 'tofu', 'edamame', 'miso'],
    },
  },
  {
    id: 'milk',
    emoji: '🥛',
    eu14: true,
    synonyms: {
      en: ['milk', 'dairy', 'lactose', 'casein', 'caseinate', 'whey', 'lactalbumin', 'butter', 'cream', 'ghee', 'cheese', 'yogurt', 'yoghurt', 'curd', 'custard'],
      pt: ['leite', 'lacteo', 'lactose', 'caseina', 'caseinato', 'soro de leite', 'manteiga', 'creme de leite', 'nata', 'queijo', 'iogurte', 'requeijao'],
      es: ['leche', 'lacteo', 'lactosa', 'caseina', 'caseinato', 'suero de leche', 'mantequilla', 'nata', 'queso', 'yogur'],
      fr: ['lait', 'laitier', 'lactose', 'caseine', 'caseinate', 'lactoserum', 'beurre', 'creme', 'fromage', 'yaourt'],
      de: ['milch', 'laktose', 'kasein', 'kaseinat', 'molke', 'butter', 'sahne', 'rahm', 'kase', 'joghurt'],
    },
  },
  {
    id: 'tree_nuts',
    emoji: '🌰',
    eu14: true,
    synonyms: {
      en: ['tree nut', 'almond', 'hazelnut', 'walnut', 'cashew', 'pistachio', 'pecan', 'macadamia', 'brazil nut', 'pine nut', 'praline', 'marzipan', 'nutella'],
      pt: ['castanha', 'amendoa', 'avela', 'noz', 'caju', 'castanha de caju', 'castanha do para', 'pistache', 'pecã', 'pecan', 'macadamia', 'marzipan'],
      es: ['almendra', 'avellana', 'nuez', 'anacardo', 'pistacho', 'pacana', 'macadamia', 'marzipan'],
      fr: ['amande', 'noisette', 'noix', 'noix de cajou', 'pistache', 'noix de pecan', 'macadamia', 'praline'],
      de: ['mandel', 'haselnuss', 'walnuss', 'cashew', 'pistazie', 'pekannuss', 'macadamia', 'marzipan'],
    },
  },
  {
    id: 'celery',
    emoji: '🥬',
    eu14: true,
    synonyms: {
      en: ['celery', 'celeriac'],
      pt: ['aipo', 'salsao'],
      es: ['apio'],
      fr: ['celeri'],
      de: ['sellerie'],
    },
  },
  {
    id: 'mustard',
    emoji: '🌭',
    eu14: true,
    synonyms: {
      en: ['mustard'],
      pt: ['mostarda'],
      es: ['mostaza'],
      fr: ['moutarde'],
      de: ['senf'],
    },
  },
  {
    id: 'sesame',
    emoji: '⚪',
    eu14: true,
    synonyms: {
      en: ['sesame', 'tahini', 'benne'],
      pt: ['gergelim', 'sesamo', 'tahine', 'tahini'],
      es: ['sesamo', 'ajonjoli', 'tahini'],
      fr: ['sesame', 'tahini'],
      de: ['sesam', 'tahin'],
    },
  },
  {
    id: 'sulphites',
    emoji: '🍷',
    eu14: true,
    synonyms: {
      en: ['sulphite', 'sulfite', 'sulphur dioxide', 'sulfur dioxide', 'e220', 'e221', 'e222', 'e223', 'e224', 'e226', 'e227', 'e228'],
      pt: ['sulfito', 'dioxido de enxofre', 'metabissulfito'],
      es: ['sulfito', 'dioxido de azufre', 'metabisulfito'],
      fr: ['sulfite', 'dioxyde de soufre', 'anhydride sulfureux'],
      de: ['sulfit', 'schwefeldioxid'],
    },
  },
  {
    id: 'lupin',
    emoji: '🌸',
    eu14: true,
    synonyms: {
      en: ['lupin', 'lupine'],
      pt: ['tremoco', 'lupino'],
      es: ['altramuz', 'lupino'],
      fr: ['lupin'],
      de: ['lupine'],
    },
  },
  {
    id: 'molluscs',
    emoji: '🦑',
    eu14: true,
    synonyms: {
      en: ['mollusc', 'mollusk', 'oyster', 'mussel', 'clam', 'squid', 'calamari', 'octopus', 'snail', 'scallop'],
      pt: ['molusco', 'ostra', 'mexilhao', 'ameijoa', 'lula', 'polvo', 'caracol', 'vieira', 'marisco'],
      es: ['molusco', 'ostra', 'mejillon', 'almeja', 'calamar', 'pulpo', 'caracol', 'vieira', 'marisco'],
      fr: ['mollusque', 'huitre', 'moule', 'palourde', 'calmar', 'poulpe', 'escargot', 'coquille saint jacques'],
      de: ['weichtier', 'auster', 'muschel', 'tintenfisch', 'kalmar', 'oktopus', 'schnecke'],
    },
  },
  {
    id: 'corn',
    emoji: '🌽',
    eu14: false,
    synonyms: {
      en: ['corn', 'maize', 'cornstarch', 'corn syrup', 'polenta', 'hominy', 'maizena'],
      pt: ['milho', 'amido de milho', 'xarope de milho', 'polenta', 'fuba', 'maisena', 'maizena'],
      es: ['maiz', 'almidon de maiz', 'polenta', 'maicena'],
      fr: ['mais', 'amidon de mais', 'polenta', 'maizena'],
      de: ['mais', 'maisstarke', 'polenta', 'maizena'],
    },
  },
];

export const ALLERGEN_IDS = ALLERGENS.map((a) => a.id);
const ALLERGEN_BY_ID = new Map(ALLERGENS.map((a) => [a.id, a]));

export function getAllergen(id: string): AllergenDef | undefined {
  return ALLERGEN_BY_ID.get(id);
}

// ─── Normalization ────────────────────────────────────────────────────────────

/** lowercase, strip accents, turn separators into spaces, drop punctuation, collapse spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[-_/]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Matching ──────────────────────────────────────────────────────────────────

export type MatchStrength = 'match' | 'possible';

export interface AllergenMatch {
  allergenId: string;
  matchedTerm: string;
  ingredient: string;
  strength: MatchStrength;
}

export type IngredientInput = string | { name: string; confidence?: 'label' | 'likely' | 'uncertain' };

function ingredientName(i: IngredientInput): string {
  return typeof i === 'string' ? i : i.name;
}
function ingredientUncertain(i: IngredientInput): boolean {
  return typeof i !== 'string' && i.confidence === 'uncertain';
}

/** Whole-word / whole-phrase regex (plural-tolerant on the final token). Operates on normalized text. */
function termRegex(normTerm: string): RegExp {
  const escaped = normTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:es|s)?(?=\\s|$)`);
}

function singular(token: string): string {
  if (token.endsWith('es')) return token.slice(0, -2);
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

/**
 * Negated terms in a normalized ingredient string ("gluten free", "sem lactose",
 * "glutenfrei", "free of milk" …). Only the EXACT negated term is cancelled — never a
 * different term (so "lactose free milk" still matches `milk` via "milk").
 */
function negatedTerms(norm: string): Set<string> {
  const set = new Set<string>();
  const patterns = [
    /\b(?:sem|sin|sans|ohne|no|without|free of|free from|libre de|sans)\s+([a-z]+)/g,
    /\b([a-z]+)\s*free\b/g, // gluten free, dairy-free (hyphen already normalized to space)
    /\b([a-z]+)frei\b/g, // glutenfrei, laktosefrei
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm))) {
      if (m[1] && m[1] !== 'free' && m[1] !== 'of' && m[1] !== 'from') set.add(singular(m[1]));
    }
  }
  return set;
}

function isNegated(normSyn: string, negated: Set<string>): boolean {
  if (negated.size === 0) return false;
  // Compare the synonym's last token (plural-insensitive) against the negated set.
  const lastToken = normSyn.split(' ').pop() ?? normSyn;
  const s = singular(lastToken);
  for (const n of negated) {
    if (n === s || n === lastToken || singular(n) === s) return true;
  }
  return false;
}

// ─── Exceptions (known false positives) ────────────────────────────────────────
// `cancel`  → remove the match entirely (the trigger word clearly isn't the allergen).
// `downgrade` → keep as `possible` (the allergen word is literally present; stay cautious).

interface Exception {
  phrases: string[]; // normalized phrases that, when present in an ingredient, apply
  allergenId: string;
  viaTerms: string[]; // the trigger terms whose match this exception governs (normalized)
  mode: 'cancel' | 'downgrade';
}

const EXCEPTIONS: Exception[] = [
  {
    phrases: ['peanut butter', 'pasta de amendoim', 'crema de cacahuete', 'beurre de cacahuete', 'erdnussbutter'],
    allergenId: 'milk',
    viaTerms: ['butter', 'manteiga', 'mantequilla', 'beurre'],
    mode: 'cancel',
  },
  {
    phrases: ['shea butter', 'manteiga de karite', 'manteca de karite', 'beurre de karite', 'sheabutter'],
    allergenId: 'milk',
    viaTerms: ['butter', 'manteiga', 'manteca', 'beurre'],
    mode: 'cancel',
  },
  {
    phrases: ['cocoa butter', 'manteiga de cacau', 'manteca de cacao', 'beurre de cacao', 'kakaobutter'],
    allergenId: 'milk',
    viaTerms: ['butter', 'manteiga', 'manteca', 'beurre'],
    mode: 'downgrade',
  },
  {
    phrases: [
      'coconut milk', 'leite de coco', 'leche de coco', 'lait de coco', 'kokosmilch',
      'almond milk', 'leite de amendoa', 'leche de almendra', 'lait d amande', 'mandelmilch',
      'oat milk', 'leite de aveia', 'soy milk', 'leite de soja', 'leche de soja',
      'rice milk', 'leite de arroz', 'coconut cream', 'creme de coco',
    ],
    allergenId: 'milk',
    viaTerms: ['milk', 'leite', 'leche', 'lait', 'milch', 'cream', 'creme', 'nata'],
    mode: 'downgrade',
  },
  {
    phrases: ['nutmeg', 'noz moscada', 'nuez moscada', 'noix de muscade', 'muscade', 'muskatnuss'],
    allergenId: 'tree_nuts',
    viaTerms: ['noz', 'nuez', 'noix', 'nut'],
    mode: 'cancel',
  },
];

function findException(normIngredient: string, allergenId: string, matchedTerm: string): Exception | undefined {
  return EXCEPTIONS.find(
    (e) =>
      e.allergenId === allergenId &&
      e.viaTerms.includes(matchedTerm) &&
      e.phrases.some((p) => termRegex(p).test(normIngredient))
  );
}

/**
 * Cross-check a list of ingredients against the user's allergen IDs.
 * Deterministic, language-agnostic. Returns one entry per (allergen, ingredient) match.
 *
 * @param opts.baseStrength force all matches to a strength (used for `traces` → 'possible').
 */
export function crossCheckAllergens(
  ingredients: IngredientInput[],
  userAllergenIds: string[],
  opts: { baseStrength?: MatchStrength } = {}
): AllergenMatch[] {
  const ids = userAllergenIds.filter((id) => ALLERGEN_BY_ID.has(id));
  const matches: AllergenMatch[] = [];

  for (const ing of ingredients) {
    const rawName = ingredientName(ing);
    const norm = normalize(rawName);
    if (!norm) continue;
    const negated = negatedTerms(norm);
    const uncertain = ingredientUncertain(ing);

    for (const id of ids) {
      const def = ALLERGEN_BY_ID.get(id)!;
      const terms = Object.values(def.synonyms).flat().map(normalize);
      // Longest-first so "peanut butter" is considered before "butter".
      terms.sort((a, b) => b.length - a.length);

      for (const term of terms) {
        if (!termRegex(term).test(norm)) continue;
        if (isNegated(term, negated)) continue;

        const exc = findException(norm, id, term);
        if (exc?.mode === 'cancel') continue;

        let strength: MatchStrength = opts.baseStrength ?? 'match';
        if (uncertain) strength = 'possible';
        if (exc?.mode === 'downgrade') strength = 'possible';

        matches.push({ allergenId: id, matchedTerm: term, ingredient: rawName, strength });
        break; // one match per (allergen, ingredient) is enough
      }
    }
  }

  return dedupeMatches(matches);
}

/** Keep the strongest match per (allergenId, ingredient). */
function dedupeMatches(matches: AllergenMatch[]): AllergenMatch[] {
  const best = new Map<string, AllergenMatch>();
  for (const m of matches) {
    const key = `${m.allergenId}::${normalize(m.ingredient)}`;
    const prev = best.get(key);
    if (!prev || (prev.strength === 'possible' && m.strength === 'match')) best.set(key, m);
  }
  return [...best.values()];
}

export type RiskLevel = 'none_detected' | 'possible' | 'detected';

export function computeRiskLevel(matches: AllergenMatch[]): RiskLevel {
  if (matches.some((m) => m.strength === 'match')) return 'detected';
  if (matches.length > 0) return 'possible';
  return 'none_detected';
}

/** Unique allergen IDs present at `match` strength, for quick display. */
export function detectedAllergenIds(matches: AllergenMatch[]): string[] {
  return [...new Set(matches.map((m) => m.allergenId))];
}

// ─── Migration from old PT display-text allergies to IDs ────────────────────────

export const CUSTOM_PREFIX = 'custom:';

const MIGRATION_MAP: Record<string, string | string[]> = {
  'Leite / Lactose': 'milk',
  Ovos: 'egg',
  Amendoim: 'peanut',
  'Nozes e castanhas': 'tree_nuts',
  'Trigo / Glúten': 'gluten',
  Soja: 'soy',
  Peixe: 'fish',
  'Frutos do mar': ['crustaceans', 'molluscs'],
  Gergelim: 'sesame',
};

/**
 * Convert a stored `allergies` array (which may contain old PT labels, already-migrated
 * IDs, or custom text) into canonical IDs. Unknown free text is preserved as `custom:<text>`.
 */
export function migrateAllergies(old: string[]): string[] {
  const out = new Set<string>();
  for (const entry of old ?? []) {
    if (!entry) continue;
    if (ALLERGEN_BY_ID.has(entry) || entry.startsWith(CUSTOM_PREFIX)) {
      out.add(entry); // already an ID or already custom
      continue;
    }
    const mapped = MIGRATION_MAP[entry];
    if (mapped) {
      (Array.isArray(mapped) ? mapped : [mapped]).forEach((id) => out.add(id));
    } else {
      out.add(`${CUSTOM_PREFIX}${entry}`);
    }
  }
  return [...out];
}

/** True if any stored entry still needs migration (old PT label, i.e. not an ID/custom). */
export function needsMigration(allergies: string[]): boolean {
  return (allergies ?? []).some((a) => a && !ALLERGEN_BY_ID.has(a) && !a.startsWith(CUSTOM_PREFIX));
}
