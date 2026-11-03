import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const runtime = 'nodejs';

// Model id from env (shared with analysis); default is a current, valid model.
const MODEL = process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6';

// NOTE: ANTHROPIC_API_KEY is read server-side only; never returned to the client.
// The chat is READ-ONLY: it has no tools and cannot modify any stored data.

const BodyZ = z.object({
  userContext: z.string().max(6000).default(''),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .max(10),
  language: z.enum(['pt', 'en']).default('pt'),
  kind: z.enum(['meal', 'reaction']).default('meal'),
});

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'missing_key', message: 'ANTHROPIC_API_KEY is not configured.' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = BodyZ.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid chat request.' }, { status: 400 });
  }

  const { userContext, messages, language, kind } = parsed.data;
  const turns = messages.filter((m) => m.content.trim());
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'bad_request', message: 'Expected a trailing user message.' }, { status: 400 });
  }

  const client = new Anthropic();
  const langName = language === 'en' ? 'English' : 'Portuguese (Brazil)';
  const itemWord = kind === 'reaction' ? 'reaction' : 'meal';

  const system =
    `You are a careful assistant inside a food-allergy tracking app. Answer the user's questions ` +
    `about their logged ${itemWord} using the context below. The app has already computed allergen ` +
    `matches in code; TREAT "detected allergens" AS THE SOURCE OF TRUTH and never claim to change ` +
    `any saved data (you cannot — you only answer in text).\n\n` +
    `=== CONTEXT ===\n${userContext}\n=== END CONTEXT ===\n\n` +
    `RULES:\n` +
    `- NEVER say or imply a food is "safe", "allergen-free", or "fine to eat". If nothing matched, ` +
    `say exactly: "No known allergen detected in the listed ingredients." (translated).\n` +
    `- Base your answer on the user's REGISTERED allergies and the code-computed detected allergens. ` +
    `Say explicitly which of THE USER'S allergies are matched and which are not.\n` +
    `- When you report an allergen from the user's profile as DETECTED, mark it with a ⚠️. ` +
    `NEVER use ✓, ✅, or any positive/reassuring symbol for an allergen — a detected allergen is a ` +
    `warning, not good news.\n` +
    `- For a plated or prepared dish (NOT a packaged label), whenever you say an allergen was not ` +
    `detected, add a brief reminder that a photo cannot reveal hidden ingredients, so the user should ` +
    `check the label or ask the cook.\n` +
    `- Do not mention allergens that are not in the user's profile unless the user asks or it is ` +
    `directly relevant as a caution.\n` +
    `- Never diagnose or give medical advice. When unsure, say so and recommend checking the ` +
    `product label or asking an allergist.\n` +
    `- If you think an allergen may be missing, only SUGGEST it in words (e.g. "this may also ` +
    `contain X — consider correcting the ingredients in the edit screen"). You cannot edit anything.\n` +
    `- Keep answers short, in ${langName}. Use short paragraphs or simple bullet lists. No tables. ` +
    `No headings like "Is it safe?". Do not output links or URLs.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system,
      messages: turns.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const reply = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    if (!reply.trim()) {
      return NextResponse.json({ error: 'server_error', message: 'Empty response.' }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'auth', message: 'Invalid API key.' }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'rate_limit', message: 'Rate limited, try again shortly.' }, { status: 429 });
    }
    const m = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: 'server_error', message: m }, { status: 500 });
  }
}
