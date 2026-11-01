import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-4-6';
const MAX_TURNS = 20; // guard against oversized histories

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function parseDataUrl(dataUrl: string): { media_type: MediaType; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { media_type: match[1] as MediaType, data: match[2] };
}

const UPDATE_MEAL_TOOL: Anthropic.Tool = {
  name: 'update_meal_analysis',
  description:
    'Update the saved nutrition/allergen analysis for this meal. Call this ONLY when the user asks ' +
    'you to correct it, or when — having now seen the photo — you can give a clearly better estimate. ' +
    'Include only the fields that should change; omit the rest. After calling, briefly tell the user what changed.',
  input_schema: {
    type: 'object',
    properties: {
      calories: { type: 'integer', description: 'Updated total calories (kcal).' },
      macros: {
        type: 'object',
        properties: {
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
        },
        required: ['protein_g', 'carbs_g', 'fat_g'],
      },
      allergens: { type: 'array', items: { type: 'string' } },
      ingredients: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
  },
};

const UPDATE_REACTION_TOOL: Anthropic.Tool = {
  name: 'update_reaction_analysis',
  description:
    'Update the saved analysis for this allergic reaction. Call this ONLY when the user asks you to ' +
    'correct it or when you can give a clearly better assessment. Include only the fields that should ' +
    'change. After calling, briefly tell the user what changed.',
  input_schema: {
    type: 'object',
    properties: {
      assessment: { type: 'string' },
      possibleTriggers: { type: 'array', items: { type: 'string' } },
      urgency: { type: 'string', enum: ['routine', 'monitor', 'seek_care'] },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
  },
};

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'missing_key', message: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 }
    );
  }

  let body: {
    summary?: string;
    messages?: ChatMessage[];
    language?: string;
    photoDataUrl?: string;
    kind?: 'meal' | 'reaction';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const { summary = '', messages = [], language = 'pt', photoDataUrl, kind = 'meal' } = body;
  const turns = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
    .slice(-MAX_TURNS);
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'bad_request', message: 'Expected a trailing user message.' }, { status: 400 });
  }

  const client = new Anthropic();
  const langName = language === 'en' ? 'English' : 'Portuguese (Brazil)';
  const tool = kind === 'reaction' ? UPDATE_REACTION_TOOL : UPDATE_MEAL_TOOL;

  const system =
    `You are a helpful assistant inside a food-allergy tracking app. The user is asking follow-up ` +
    `questions about one specific logged item and its AI analysis. Use this context to answer:\n\n` +
    `${summary}\n\n` +
    `Answer concisely and conversationally. You may explain the estimates, help interpret the reaction, ` +
    `and suggest what to watch for. You can also UPDATE the saved analysis with the "${tool.name}" tool ` +
    `when the user asks you to correct it, or when — having seen the photo — you can give a clearly ` +
    `better estimate; include only the fields that change. You are NOT a doctor — for diagnosis or ` +
    `treatment decisions, remind the user to consult an allergist. If a photo of the logged item is ` +
    `included, use it when answering. Reply in ${langName}.`;

  // Attach the logged photo (if any) to the first user turn so the model can see it.
  const img = photoDataUrl ? parseDataUrl(photoDataUrl) : null;
  const apiMessages: Anthropic.MessageParam[] = turns.map((m) => ({ role: m.role, content: m.content }));
  if (img) {
    const firstUser = apiMessages.find((m) => m.role === 'user');
    if (firstUser) {
      firstUser.content = [
        { type: 'image', source: { type: 'base64', ...img } },
        { type: 'text', text: typeof firstUser.content === 'string' ? firstUser.content : '' },
      ];
    }
  }

  try {
    let response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system,
      tools: [tool],
      messages: apiMessages,
    });

    let update: Record<string, unknown> | null = null;

    // Single tool round-trip: if the model updates the analysis, capture it and
    // feed a result back so it can produce a final confirmation message.
    if (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find((b) => b.type === 'tool_use');
      if (toolUse && toolUse.type === 'tool_use') {
        update = toolUse.input as Record<string, unknown>;
        apiMessages.push({ role: 'assistant', content: response.content });
        apiMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Analysis updated.' }],
        });
        response = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          thinking: { type: 'adaptive' },
          system,
          tools: [tool],
          messages: apiMessages,
        });
      }
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    const reply = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    return NextResponse.json({
      reply,
      ...(update && kind === 'meal' ? { mealUpdate: update } : {}),
      ...(update && kind === 'reaction' ? { reactionUpdate: update } : {}),
    });
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
