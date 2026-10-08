// Trailhead (Mode B) as a Vercel Function — same agent as Part 3 of the notebook.
//   POST /api/chat  { "userId": "bob", "sessionId": "s1", "prompt": "..." }
//   GET  /api/chat  → health check
import { ToolLoopAgent, gateway, isLoopFinished, tool, type ModelMessage } from 'ai'
import { z } from 'zod'
import { createRequire } from 'node:module'
import type * as MemoryModule from '@mongodb-developer/vercel-ai-memory'

// The package's ESM build (dist/index.js) has no "type": "module", and Vercel's runtime loads it with the
// CommonJS loader, which rejects `import`. Require its CommonJS build (dist/index.cjs) instead.
// Switch back to a plain import once the package declares "type": "module".
// Keep the `const require = createRequire(import.meta.url)` shape: Vercel's file tracer recognizes it and
// bundles the package and its dependencies; an inline call is invisible to it.
const require = createRequire(import.meta.url)
const { createMongoDBMemory } = require('@mongodb-developer/vercel-ai-memory') as typeof MemoryModule

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) throw new Error('MONGODB_URI is not set (the MongoDB Atlas integration injects it)')

// Chat and Voyage embeddings both go through AI Gateway — on Vercel it authenticates with OIDC automatically.
const CHAT_MODEL = process.env.CHAT_MODEL ?? 'google/gemini-3.5-flash-lite'
const DB_NAME = process.env.TRAILHEAD_DB ?? 'trailhead_prod'

// Module scope → one client per warm function instance, reused across requests.
const mongodbMemory = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder: gateway.embeddingModel('voyage/voyage-4-lite'),
  topology: { dbName: DB_NAME, hideToolCommands: ['session'] },
})

const TRAILS = [
  { name: 'Bear Lake Loop', city: 'Denver', difficulty: 'easy', miles: 0.8, elevationGainFt: 45 },
  { name: 'Emerald Lake Trail', city: 'Denver', difficulty: 'moderate', miles: 3.2, elevationGainFt: 700 },
  { name: 'Longs Peak Keyhole Route', city: 'Denver', difficulty: 'hard', miles: 14.5, elevationGainFt: 5100 },
  { name: 'Lands End Trail', city: 'San Francisco', difficulty: 'easy', miles: 3.4, elevationGainFt: 500 },
  { name: 'Dipsea Trail', city: 'San Francisco', difficulty: 'hard', miles: 7.4, elevationGainFt: 2200 },
  { name: 'Walden Pond Loop', city: 'Boston', difficulty: 'easy', miles: 1.7, elevationGainFt: 50 },
] as const

const suggestTrail = tool({
  description: 'Look up hiking trails near a city, optionally filtered by difficulty.',
  inputSchema: z.object({
    city: z.string(),
    difficulty: z.enum(['easy', 'moderate', 'hard']).optional(),
  }),
  execute: async ({ city, difficulty }) => {
    const trails = TRAILS.filter((t) => t.city.toLowerCase() === city.toLowerCase() && (!difficulty || t.difficulty === difficulty))
    return { city, count: trails.length, trails }
  },
})

const INSTRUCTIONS = `You are Trailhead, a friendly and concise personal outdoor-trip planner.
Use the suggestTrail tool to look up real trails. Keep answers under 120 words.
You have a persistent \`memory\` tool. The conversation history is already in your context.
- Before answering, semantic_search for facts about the user relevant to their message.
- Save facts the user tells you about themselves with semantic_save (importance 7-9 for constraints like injuries).
- Record things that happened (a hike they did, a rating) with episodic_save.
- If the user asks you to forget something, semantic_search for it and call memory_forget.
Never mention memory operations in your replies.`

const CallOptions = z.object({ userId: z.string().min(1), sessionId: z.string().min(1), prompt: z.string().min(1) })

const trailhead = new ToolLoopAgent({
  model: CHAT_MODEL,
  instructions: INSTRUCTIONS,
  callOptionsSchema: CallOptions,
  prepareCall: async ({ options, prompt: _p, messages: _m, ...settings }) => {
    const { userId, sessionId, prompt } = options
    const history: ModelMessage[] = await mongodbMemory.loadSession({ userId, sessionId })
    return {
      ...settings,
      tools: { suggestTrail, ...mongodbMemory({ userId, sessionId }) },
      messages: [...history, { role: 'user', content: prompt }],
      experimental_context: { userId, sessionId, prompt },
    }
  },
  onFinish: mongodbMemory.onFinish(),
  stopWhen: isLoopFinished(),
})

export function GET() {
  return Response.json({ ok: true, agent: 'trailhead', db: DB_NAME, chat: CHAT_MODEL })
}

export async function POST(req: Request) {
  const parsed = CallOptions.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const result = await trailhead.generate({ prompt: parsed.data.prompt, options: parsed.data })
  const toolCalls = result.steps.flatMap((s) => s.toolCalls.map((c) => ({ tool: c.toolName, input: c.input })))
  return Response.json({ text: result.text, toolCalls })
}
