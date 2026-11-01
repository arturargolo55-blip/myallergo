import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-4-6';

// Guaranteed response shape (see app/types.ts → MealAnalysis, minus analyzedAt).
const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    calories: { type: 'integer', description: 'Estimated total calories (kcal) for the meal.' },
    macros: {
      type: 'object',
      additionalProperties: false,
      properties: {
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
      },
      required: ['protein_g', 'carbs_g', 'fat_g'],
    },
    allergens: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Common food allergens likely present (e.g. milk, eggs, peanuts, tree nuts, wheat/gluten, soy, fish, shellfish, sesame). Empty array if none.',
    },
    ingredients: {
      type: 'array',
      items: { type: 'string' },
      description: 'Best-guess list of the main ingredients in the meal.',
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['calories', 'macros', 'allergens', 'ingredients', 'confidence'],
} as const;

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function parseDataUrl(dataUrl: string): { media_type: MediaType; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { media_type: match[1] as MediaType, data: match[2] };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'missing_key', message: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 }
    );
  }

  let body: {
    mealName?: string;
    description?: string;
    photoDataUrl?: string;
    knownAllergies?: string[];
    language?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const { mealName, description, photoDataUrl, knownAllergies = [], language = 'pt' } = body;
  if (!mealName || !mealName.trim()) {
    return NextResponse.json({ error: 'bad_request', message: 'mealName is required.' }, { status: 400 });
  }

  const client = new Anthropic();

  const langName = language === 'en' ? 'English' : 'Portuguese (Brazil)';
  const system =
    `You are a nutrition-estimation assistant for a food-allergy tracking app. ` +
    `Given a meal (name, optional description, optional photo), estimate its calories and ` +
    `macronutrients and identify which common food allergens are likely present. ` +
    `Pay special attention to the user's known allergies and flag them when they could be present. ` +
    `Estimates are approximate — set "confidence" accordingly (use the photo when provided to improve it). ` +
    `Write any natural-language strings (ingredients, allergen names) in ${langName}.`;

  const content: Anthropic.ContentBlockParam[] = [];
  const img = photoDataUrl ? parseDataUrl(photoDataUrl) : null;
  if (img) {
    content.push({ type: 'image', source: { type: 'base64', ...img } });
  }
  content.push({
    type: 'text',
    text:
      `Meal name: ${mealName}\n` +
      `Description: ${description?.trim() || '(none)'}\n` +
      `User's known allergies: ${knownAllergies.length ? knownAllergies.join(', ') : '(none specified)'}\n\n` +
      `Analyze this meal.`,
  });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system,
      // Simple extraction — keep effort low so Sonnet answers fast.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
      messages: [{ role: 'user', content }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'no_output', message: 'No analysis produced.' }, { status: 502 });
    }

    const parsed = JSON.parse(textBlock.text);
    return NextResponse.json({ ...parsed, analyzedAt: new Date().toISOString() });
  } catch (err) {
    return mapError(err);
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
