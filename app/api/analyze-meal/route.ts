import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { crossCheckAllergens, computeRiskLevel } from '../../lib/allergens';
import {
  MealModelSchema,
  MEAL_OUTPUT_JSON_SCHEMA,
  buildMealAnalysis,
  mergeStatedIngredients,
  applyCalorieSanity,
} from '../../lib/analysis';
import type { AnalyzedIngredient, Clarification, MealAnalysis } from '../../types';

export const runtime = 'nodejs';
export const maxDuration = 45;

// Model is configurable via env; default is a current, valid model id.
const MODEL = process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6';

// NOTE: ANTHROPIC_API_KEY is read server-side only (never shipped to the client);
// `.env*` is git-ignored. Do not expose it in any response.

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
    statedIngredients?: AnalyzedIngredient[]; // user-edited items to keep (re-run)
    clarifications?: Clarification[]; // already-answered questions (facts)
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const { mealName, description, photoDataUrl, knownAllergies = [], language = 'pt', statedIngredients = [], clarifications = [] } = body;
  if (!mealName?.trim() && !photoDataUrl) {
    return NextResponse.json({ error: 'bad_request', message: 'A meal name or a photo is required.' }, { status: 400 });
  }

  const client = new Anthropic();
  const langName = languageName(language);

  const system =
    `You are an INGREDIENT-EXTRACTION assistant for a food-allergy app. Your ONLY job is to extract ` +
    `ingredients (with amounts) and estimate nutrition. You do NOT decide allergen warnings — the app ` +
    `does that in code. Return STRICT JSON matching the schema.\n\n` +
    `First set "sourceType":\n` +
    `• "label" — a packaged-food label. READ the printed ingredient list verbatim (confidence "label"). ` +
    `Put "may contain traces of…" items in "traces" (not in ingredients). Use label nutrition if present ` +
    `and set "macrosAreEstimate": false.\n` +
    `• "plate" — a photo/description of prepared food. List ingredients you can see/infer, each with ` +
    `confidence "likely" (clearly present) or "uncertain" (plausible but unsure). Set "macrosAreEstimate": true.\n` +
    `• "text" — only text, no photo. Same as plate, from the name/description.\n\n` +
    `AMOUNTS: for each ingredient estimate a quantity — set "amount" (number) and "unit" ` +
    `(e.g. "eggs", "g", "ml", "tbsp", "tsp", "slice"). Respect any quantities the user wrote.\n` +
    `USER-STATED INGREDIENTS: ingredients the user explicitly wrote in the name/description get ` +
    `confidence "stated" (the HIGHEST confidence). When the user's text conflicts with what a photo ` +
    `suggests, the user's text wins.\n` +
    `COOKING FAT / SAUCE: if the dish is fried, sautéed, grilled with oil, dressed, or shows visible ` +
    `butter/oil/sauce, list the added fat or sauce as its OWN ingredient with an estimated amount — ` +
    `do not ignore it.\n` +
    `CALORIES: return "calorieRange" with integer "min" ≤ "estimate" ≤ "max", and a short "reason" when ` +
    `the band is wide (e.g. unknown amount of oil). Protein/carbs/fat are estimates.\n` +
    `COOKING FAT ABSORPTION: when a cooking fat is listed, set "absorbedFraction" (0..1) = the ` +
    `fraction of that fat that ends up IN THE FOOD (the rest stays in the pan). For pan-frying use ~0.5.\n` +
    `CLARIFYING QUESTION: if the amount of added fat, the portion size, the sauce type, or the cooking ` +
    `method is a MAJOR uncertainty, set "clarifyingQuestion" with a fixed "id" ` +
    `(added_fat_amount | portion_size | sauce_type | cooking_method), a short "text" in ${langName}, and ` +
    `2–4 quick-pick "options" (e.g. "~1 tsp", "~1 tbsp", "more"). Ask about ONE thing only; otherwise omit it.\n` +
    `"possibleHiddenAllergens": only allergens NOT already obvious from the listed ingredients.\n\n` +
    `Write all natural-language strings in ${langName}.`;

  const statedText = statedIngredients.length
    ? `The user has already CORRECTED these ingredients — treat them as authoritative ("stated"), keep ` +
      `them in your output, and only ADD information:\n` +
      statedIngredients
        .map((i) => `- ${i.name}${i.amount != null ? ` (${i.amount}${i.unit ? ' ' + i.unit : ''})` : ''}`)
        .join('\n') +
      '\n\n'
    : '';

  // Established facts from already-answered questions — never ask these again.
  const clarifyText = clarifications.length
    ? `ESTABLISHED FACTS (the user already answered these — treat as "stated", use them, and do NOT ask ` +
      `about these ids again): ${clarifications.map((c) => `${c.id}="${c.answer}"`).join('; ')}.\n` +
      `Already-asked question ids: ${clarifications.map((c) => c.id).join(', ')}.\n\n`
    : '';

  const content: Anthropic.ContentBlockParam[] = [];
  const img = photoDataUrl ? parseDataUrl(photoDataUrl) : null;
  if (img) content.push({ type: 'image', source: { type: 'base64', ...img } });
  content.push({
    type: 'text',
    text:
      `Meal name: ${mealName?.trim() || '(none)'}\n` +
      `Description: ${description?.trim() || '(none)'}\n` +
      statedText +
      clarifyText +
      `${img ? 'A photo is attached. Determine if it is a label or a plate.' : 'No photo; sourceType is "text".'}\n\n` +
      `Extract ingredients (with amounts) and estimate nutrition. Return only the JSON.`,
  });

  // Up to 2 attempts: parse + zod-validate; retry once on invalid output.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: MEAL_OUTPUT_JSON_SCHEMA } },
        messages: [{ role: 'user', content }],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) continue;
      let json: unknown;
      try {
        json = JSON.parse(textBlock.text);
      } catch {
        continue;
      }
      const parsed = MealModelSchema.safeParse(json);
      if (!parsed.success) continue;

      let analysis = buildMealAnalysis(parsed.data, knownAllergies, {
        answeredIds: clarifications.map((c) => c.id),
        priorRounds: clarifications.length,
      });
      // Edit-preserving re-run: keep the user's corrected ingredients, recompute allergens.
      if (statedIngredients.length) analysis = applyStated(analysis, statedIngredients, knownAllergies);
      return NextResponse.json(analysis);
    } catch (err) {
      return mapError(err); // API/auth/rate-limit/network — don't retry these here
    }
  }

  return NextResponse.json(
    { error: 'invalid_output', message: 'The analysis could not be understood. Please try again.' },
    { status: 502 }
  );
}

/** Merge the user's stated ingredients back in; recompute code-owned allergens + calorie sanity. */
function applyStated(analysis: MealAnalysis, stated: AnalyzedIngredient[], allergyIds: string[]): MealAnalysis {
  const ingredients = mergeStatedIngredients(analysis.ingredients ?? [], stated);
  const detectedAllergens = crossCheckAllergens(ingredients, allergyIds);
  return applyCalorieSanity({
    ...analysis,
    ingredients,
    detectedAllergens,
    riskLevel: computeRiskLevel(detectedAllergens),
    userEdited: true,
  });
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
