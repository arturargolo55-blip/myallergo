import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-4-6';

const REACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    assessment: {
      type: 'string',
      description:
        'A short (2-3 sentence) plain-language read of how this reaction presents and what it suggests.',
    },
    possibleTriggers: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Most likely food(s)/allergens behind this reaction, inferred from the context and the user\'s known allergies. Empty if there is no food context to go on.',
    },
    urgency: {
      type: 'string',
      enum: ['routine', 'monitor', 'seek_care'],
      description:
        'seek_care if symptoms suggest a severe/anaphylactic reaction (trouble breathing, throat/tongue swelling, dizziness/fainting); monitor if moderate; routine if mild.',
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['assessment', 'possibleTriggers', 'urgency', 'confidence'],
} as const;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'missing_key', message: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 }
    );
  }

  let body: {
    context?: string;
    symptoms?: string[];
    intensity?: string;
    notes?: string;
    knownAllergies?: string[];
    language?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const { context, symptoms = [], intensity, notes, knownAllergies = [], language = 'pt' } = body;
  const client = new Anthropic();
  const langName = language === 'en' ? 'English' : 'Portuguese (Brazil)';

  const system =
    `You are an assistant analyzing a single logged allergic-reaction event in a food-allergy app. ` +
    `Given the reported symptoms, intensity, any food/context, and the user's known allergies, write a ` +
    `brief assessment of how the reaction presents and what it suggests, and infer the most likely ` +
    `food/allergen trigger(s). Set "urgency" to seek_care when the symptoms suggest a severe or ` +
    `anaphylactic reaction (difficulty breathing, throat or tongue swelling, dizziness/fainting), ` +
    `monitor for moderate reactions, routine for mild ones. Be careful and never downplay severe ` +
    `symptoms. This is informational only, not medical advice. Write all natural-language text in ${langName}.`;

  const userText =
    `Reaction context / what was eaten: ${context?.trim() || '(not specified)'}\n` +
    `Symptoms: ${symptoms.length ? symptoms.join(', ') : '(none recorded)'}\n` +
    `Reported intensity: ${intensity || '(not specified)'}\n` +
    `Notes: ${notes?.trim() || '(none)'}\n` +
    `User's known allergies: ${knownAllergies.length ? knownAllergies.join(', ') : '(none specified)'}\n\n` +
    `Analyze this reaction.`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REACTION_SCHEMA } },
      messages: [{ role: 'user', content: userText }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'no_output', message: 'No analysis produced.' }, { status: 502 });
    }

    const parsed = JSON.parse(textBlock.text);
    return NextResponse.json({ ...parsed, analyzedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'auth', message: 'Invalid API key.' }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'rate_limit', message: 'Rate limited, try again shortly.' }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: 'server_error', message }, { status: 500 });
  }
}
