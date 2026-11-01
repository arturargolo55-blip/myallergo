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

export interface MealAnalysis {
  calories?: number;
  macros?: MealMacros;
  allergens: string[];
  ingredients?: string[];
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
} as const;
