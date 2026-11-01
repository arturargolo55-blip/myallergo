import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-4-6';
const MAX_TURNS = 20; // guard against oversized histories

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'missing_key', message: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 }
    );
  }

  let body: { summary?: string; messages?: ChatMessage[]; language?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const { summary = '', messages = [], language = 'pt' } = body;
  const turns = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
    .slice(-MAX_TURNS);
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'bad_request', message: 'Expected a trailing user message.' }, { status: 400 });
  }

  const client = new Anthropic();
  const langName = language === 'en' ? 'English' : 'Portuguese (Brazil)';

  const system =
    `You are a helpful assistant inside a food-allergy tracking app. The user is asking follow-up ` +
    `questions about one specific logged item and its AI analysis. Use this context to answer:\n\n` +
    `${summary}\n\n` +
    `Answer concisely and conversationally. You may explain the nutrition/allergen estimates, help ` +
    `interpret the reaction, and suggest what to watch for or discuss with a professional. You are NOT ` +
    `a doctor — for diagnosis or treatment decisions, remind the user to consult an allergist. If the ` +
    `question is unrelated to their food allergies or this log, gently steer back. Reply in ${langName}.`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system,
      output_config: { effort: 'low' },
      messages: turns.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const reply = textBlock && textBlock.type === 'text' ? textBlock.text : '';
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
