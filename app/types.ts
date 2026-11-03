export type MealType =
  | 'cafe-da-manha'
  | 'lanche-da-manha'
  | 'almoco'
  | 'lanche-da-tarde'
  | 'jantar'
  | 'lanche-extra';

export interface MealTypeInfo {
  value: MealType;
  label: string;
  icon: string;
}

export const MEAL_TYPES: MealTypeInfo[] = [
  { value: 'cafe-da-manha', label: 'Café da manhã', icon: '☕' },
  { value: 'lanche-da-manha', label: 'Lanche da manhã', icon: '🍎' },
  { value: 'almoco', label: 'Almoço', icon: '🍽️' },
  { value: 'lanche-da-tarde', label: 'Lanche da tarde', icon: '🍊' },
  { value: 'jantar', label: 'Jantar', icon: '🌙' },
  { value: 'lanche-extra', label: 'Lanche extra', icon: '🍪' },
];

export interface UserProfile {
  name: string;
  allergies: string[];
  createdAt: string;
}

export type ReactionIntensity = 'leve' | 'moderada' | 'grave';

export const REACTION_INTENSITIES: { value: ReactionIntensity; label: string; emoji: string }[] = [
  { value: 'leve', label: 'Leve', emoji: '🟡' },
  { value: 'moderada', label: 'Moderada', emoji: '🟠' },
  { value: 'grave', label: 'Grave', emoji: '🔴' },
];

export type AnalysisStatus = 'pending' | 'done' | 'error';

export interface MealMacros {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Per-ingredient confidence: read off a label, inferred-likely, or a guess. */
export type IngredientConfidence = 'label' | 'likely' | 'uncertain';

export interface AnalyzedIngredient {
  name: string;
  confidence: IngredientConfidence;
}

/** A code-generated allergen hit (produced by lib/allergens.ts, NOT by the model). */
export interface AllergenMatch {
  allergenId: string;
  matchedTerm: string;
  ingredient: string;
  strength: 'match' | 'possible';
}

export type AnalysisSourceType = 'label' | 'plate' | 'text';
export type RiskLevel = 'none_detected' | 'possible' | 'detected';

export interface MealAnalysis {
  /** Whether the photo/input was a packaged-food label, a plate of food, or text only. */
  sourceType: AnalysisSourceType;
  ingredients?: AnalyzedIngredient[];
  calories?: number;
  macros?: MealMacros;
  /** Plate photos / text give estimates; labels give per-serving facts. */
  macrosAreEstimate: boolean;
  /** "may contain traces of…" statements (label mode), flagged separately. */
  traces?: string[];
  /** Generic model suggestions of allergens that MIGHT hide here — shown as suggestions only. */
  possibleHiddenAllergens?: string[];
  /** Model's clarifying question (user's language) when an uncertain ingredient could hide an allergen. */
  clarifyingQuestion?: string;
  /** Code-generated allergen warnings cross-checked against the user's allergy IDs. */
  detectedAllergens: AllergenMatch[];
  riskLevel: RiskLevel;
  /** True when the user corrected ingredients/allergens/macros before saving. */
  userEdited: boolean;
  analyzedAt: string;

  /** @deprecated v1 fields kept so older logs still render. */
  allergens?: string[];
  /** @deprecated v1 overall confidence. */
  confidence?: 'low' | 'medium' | 'high';
}

export type ReactionUrgency = 'routine' | 'monitor' | 'seek_care';

export interface ReactionAnalysis {
  assessment: string;
  possibleTriggers: string[];
  urgency: ReactionUrgency;
  confidence: 'low' | 'medium' | 'high';
  analyzedAt: string;
}

export interface MealLog {
  id: string;
  description: string;
  photoUrl?: string;
  symptoms: string[];
  hasReaction: boolean;
  mealName: string;
  mealType?: MealType;
  mealTime?: string;
  reactionIntensity?: ReactionIntensity;
  reactionNotes?: string;
  createdAt: string;
  analysis?: MealAnalysis;
  analysisStatus?: AnalysisStatus;
  reactionAnalysis?: ReactionAnalysis;
  reactionAnalysisStatus?: AnalysisStatus;
}

export type Likelihood = 'low' | 'medium' | 'high';

export interface PatternSuspect {
  name: string;
  likelihood: Likelihood;
  evidence: string;
  reactionCount: number;
}

export interface PatternInsight {
  suspects: PatternSuspect[];
  summary: string;
  disclaimer: string;
  generatedAt: string;
}

export const COMMON_ALLERGIES = [
  'Leite / Lactose',
  'Ovos',
  'Amendoim',
  'Nozes e castanhas',
  'Trigo / Glúten',
  'Soja',
  'Peixe',
  'Frutos do mar',
  'Gergelim',
];

export const COMMON_SYMPTOMS = [
  'Coceira na pele',
  'Urticária',
  'Inchaço',
  'Dificuldade para respirar',
  'Náusea',
  'Dor abdominal',
  'Diarreia',
  'Vômitos',
  'Tontura',
];

export const STORAGE_KEYS = {
  PROFILE: 'allergy-tracker-profile',
  LOGS: 'allergy-tracker-logs',
  AI_INSIGHTS: 'allergy-tracker-ai-insights',
  USAGE: 'allergy-tracker-ai-usage',
  CHAT_USAGE: 'allergy-tracker-ai-chat-usage',
  CHATS: 'allergy-tracker-chats',
} as const;
