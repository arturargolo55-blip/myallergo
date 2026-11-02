import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { crossCheckAllergens, computeRiskLevel, type AllergenMatch } from '../../lib/allergens';

export const runtime = 'nodejs';
export const maxDuration = 45;

// Model is configurable via env; default is a current, valid model id.
const MODEL = process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6';

// NOTE: ANTHROPIC_API_KEY is read server-side only (never shipped to the client);
// `.env*` is git-ignored. Do not expose it in any response.

// ─── Strict model-output contract (zod is the source of truth) ─────────────────
const IngredientZ = z.object({
  name: z.string().min(1),
  confidence: z.enum(['label', 'likely', 'uncertain']),
});
const ModelOutputZ = z.object({
  sourceType: z.enum(['label', 'plate', 'text']),
  ingredients: z.array(IngredientZ),
  calories: z.number().nullish(),
  macros: z
    .object({ protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() })
    .nullish(),
  macrosAreEstimate: z.boolean(),
  traces: z.array(z.string()).default([]),
  possibleHiddenAllergens: z.array(z.string()).default([]),
  clarifyingQuestion: z.string().nullish(),
});
type ModelOutput = z.infer<typeof ModelOutputZ>;

// JSON schema handed to the model (kept in sync with the zod shape above).
const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sourceType: { type: 'string', enum: ['label', 'plate', 'text'] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          confidence: { type: 'string', enum: ['label', 'likely', 'uncertain'] },
        },
        required: ['name', 'confidence'],
      },
    },
    calories: { type: 'integer', description: 'kcal; null if unknown.' },
    macros: {
      type: 'object',
      additionalProperties: false,
      properties: { protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' } },
      required: ['protein_g', 'carbs_g', 'fat_g'],
    },
    macrosAreEstimate: { type: 'boolean' },
    traces: { type: 'array', items: { type: 'string' } },
    possibleHiddenAllergens: { type: 'array', items: { type: 'string' } },
    clarifyingQuestion: { type: 'string' },
  },
  required: ['sourceType', 'ingredients', 'macrosAreEstimate', 'traces', 'possibleHiddenAllergens'],
} as const;

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
function parseDataUrl(dataUrl: string): { media_type: MediaType; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { media_type: match[1] as MediaType, data: match[2] };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'missing_key', message: 'ANTHROPIC_API_KEY is not configured.' }, { status: 503 });
  }

  let body: {
    mealName?: string;
    description?: string;
    photoDataUrl?: string;
    knownAllergies?: string[]; // canonical IDs
    language?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const { mealName, description, photoDataUrl, knownAllergies = [], language = 'pt' } = body;
  if (!mealName?.trim() && !photoDataUrl) {
    return NextResponse.json({ error: 'bad_request', message: 'A meal name or a photo is required.' }, { status: 400 });
  }

  const client = new Anthropic();
  const langName = languageName(language);

  const system =
    `You are an INGREDIENT-EXTRACTION assistant for a food-allergy app. Your ONLY job is to ` +
    `extract ingredients and estimate nutrition. You do NOT decide allergen warnings — the app ` +
    `does that in code. Return STRICT JSON matching the schema.\n\n` +
    `First set "sourceType":\n` +
    `• "label" — a packaged-food label/ingredients list. READ the printed ingredient list verbatim ` +
    `(each item confidence "label"). Put "may contain traces of…" / "produced in a facility…" items ` +
    `in "traces" (do NOT put them in ingredients). Use label nutrition for macros if present and set ` +
    `"macrosAreEstimate": false.\n` +
    `• "plate" — a photo/description of prepared food. List the ingredients you can see/infer, each ` +
    `with confidence "likely" (clearly present) or "uncertain" (plausible but unsure, e.g. a sauce ` +
    `that may contain cream). Estimate calories/macros and set "macrosAreEstimate": true.\n` +
    `• "text" — only text, no photo. Same as plate, from the name/description.\n\n` +
    `Also return "possibleHiddenAllergens": short generic suggestions of allergens that commonly hide ` +
    `in dishes like this (these are SUGGESTIONS, not confirmations). If an "uncertain" ingredient could ` +
    `hide a common allergen, set "clarifyingQuestion" to ONE short question (in ${langName}) that would ` +
    `resolve it (e.g. "Does the sauce contain cheese or cream?"); otherwise omit it.\n\n` +
    `Write all natural-language strings (ingredient names, traces, question) in ${langName}.`;

  const content: Anthropic.ContentBlockParam[] = [];
  const img = photoDataUrl ? parseDataUrl(photoDataUrl) : null;
  if (img) content.push({ type: 'image', source: { type: 'base64', ...img } });
  content.push({
    type: 'text',
    text:
      `Meal name: ${mealName?.trim() || '(none)'}\n` +
      `Description: ${description?.trim() || '(none)'}\n` +
      `${img ? 'A photo is attached. Determine if it is a label or a plate.' : 'No photo; sourceType is "text".'}\n\n` +
      `Extract ingredients and estimate nutrition. Return only the JSON.`,
  });

  // Up to 2 attempts: parse + zod-validate; retry once on invalid output.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_JSON_SCHEMA } },
        messages: [{ role: 'user', content }],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) {
        lastErr = 'empty';
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(textBlock.text);
      } catch {
        lastErr = 'parse';
        continue;
      }
      const parsed = ModelOutputZ.safeParse(json);
      if (!parsed.success) {
        lastErr = parsed.error;
        continue;
      }
      return NextResponse.json(buildAnalysis(parsed.data, knownAllergies));
    } catch (err) {
      return mapError(err); // API/auth/rate-limit/network — don't retry these here
    }
  }

  return NextResponse.json(
    { error: 'invalid_output', message: 'The analysis could not be understood. Please try again.' },
    { status: 502 }
  );
}

/** Code-driven allergen cross-check + risk level (NOT the model's job). */
function buildAnalysis(m: ModelOutput, knownAllergies: string[]) {
  const ingredientMatches = crossCheckAllergens(m.ingredients, knownAllergies);
  const traceMatches = crossCheckAllergens(m.traces ?? [], knownAllergies, { baseStrength: 'possible' });
  const hiddenMatches = crossCheckAllergens(m.possibleHiddenAllergens ?? [], knownAllergies, { baseStrength: 'possible' });

  // Merge, keeping the strongest strength per allergen+ingredient.
  const all: AllergenMatch[] = [...ingredientMatches, ...traceMatches, ...hiddenMatches];
  const detectedAllergens = dedupe(all);

  return {
    sourceType: m.sourceType,
    ingredients: m.ingredients,
    calories: m.calories ?? undefined,
    macros: m.macros ?? undefined,
    macrosAreEstimate: m.macrosAreEstimate,
    traces: m.traces,
    possibleHiddenAllergens: m.possibleHiddenAllergens,
    clarifyingQuestion: m.clarifyingQuestion ?? undefined,
    detectedAllergens,
    riskLevel: computeRiskLevel(detectedAllergens),
    userEdited: false,
    analyzedAt: new Date().toISOString(),
  };
}

function dedupe(matches: AllergenMatch[]): AllergenMatch[] {
  const best = new Map<string, AllergenMatch>();
  for (const mm of matches) {
    const key = `${mm.allergenId}::${mm.ingredient.toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || (prev.strength === 'possible' && mm.strength === 'match')) best.set(key, mm);
  }
  return [...best.values()];
}

function languageName(language: string): string {
  switch (language) {
    case 'en':
      return 'English';
    case 'es':
      return 'Spanish';
    case 'fr':
      return 'French';
    case 'de':
      return 'German';
    default:
      return 'Portuguese (Brazil)';
  }
}

function mapError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: 'auth', message: 'Invalid API key.' }, { status: 401 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: 'rate_limit', message: 'Rate limited, try again shortly.' }, { status: 429 });
  }
  const message = err instanceof Error ? err.message : 'Unknown error.';
  return NextResponse.json({ error: 'server_error', message }, { status: 500 });
}
