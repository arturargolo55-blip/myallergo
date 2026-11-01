import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';

const INSIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    suspects: {
      type: 'array',
      description: 'Foods or allergens most likely responsible for the reactions, ranked most-likely first.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'The suspected food or allergen.' },
          likelihood: { type: 'string', enum: ['low', 'medium', 'high'] },
          evidence: { type: 'string', description: 'Short explanation of why this is suspected, citing the pattern seen.' },
          reactionCount: { type: 'integer', description: 'How many logged reactions this suspect appears to be linked to.' },
        },
        required: ['name', 'likelihood', 'evidence', 'reactionCount'],
      },
    },
    summary: { type: 'string', description: 'A short plain-language summary of the overall pattern.' },
    disclaimer: { type: 'string', description: 'A brief note that this is not medical advice.' },
  },
  required: ['suspects', 'summary', 'disclaimer'],
} as const;

// Trimmed log shape the client sends (no photos).
interface LeanLog {
  mealName: string;
  when: string;
  hasReaction: boolean;
  symptoms?: string[];
  intensity?: string;
  notes?: string;
  allergens?: string[];
  ingredients?: string[];
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'missing_key', message: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 }
    );
  }

  let body: { logs?: LeanLog[]; knownAllergies?: string[]; language?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const { logs = [], knownAllergies = [], language = 'pt' } = body;
  if (logs.length === 0) {
    return NextResponse.json({ error: 'bad_request', message: 'No logs to analyze.' }, { status: 400 });
  }

  const client = new Anthropic();
  const langName = language === 'en' ? 'English' : 'Portuguese (Brazil)';

  const system =
    `You are an assistant that helps a food-allergy patient spot patterns in their own data. ` +
    `You are given their meal/reaction history. Correlate which foods, ingredients, or allergens ` +
    `tend to precede allergic reactions, weighing how consistently each appears before reactions, ` +
    `the symptoms involved, and reaction intensity. Rank the most likely culprits. ` +
    `Be honest about uncertainty (small sample sizes, confounding meals). ` +
    `You are NOT a doctor; always include a short disclaimer that this is not medical advice and ` +
    `the user should consult an allergist for diagnosis. Write all natural-language text in ${langName}.`;

  const userText =
    `User's declared allergies: ${knownAllergies.length ? knownAllergies.join(', ') : '(none specified)'}\n\n` +
    `History (${logs.length} entries):\n` +
    JSON.stringify(logs, null, 2) +
    `\n\nIdentify the most likely cause(s) of the reactions.`;

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: INSIGHT_SCHEMA } },
      system,
      messages: [{ role: 'user', content: userText }],
    });

    const message = await stream.finalMessage();
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'no_output', message: 'No analysis produced.' }, { status: 502 });
    }

    const parsed = JSON.parse(textBlock.text);
    return NextResponse.json({ ...parsed, generatedAt: new Date().toISOString() });
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
