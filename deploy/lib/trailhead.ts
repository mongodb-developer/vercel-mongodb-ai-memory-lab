// Trailhead (Mode B) for the deployed app — the same agent as Part 3 of the notebook.
// Server-only: imported by the route handlers in app/api.
import 'server-only'
import { gateway, isLoopFinished, tool, ToolLoopAgent, type InferAgentUIMessage, type ModelMessage } from 'ai'
import { MongoClient } from 'mongodb'
import { z } from 'zod'
import { createMongoDBMemory } from '@mongodb-developer/vercel-ai-memory'

export const CHAT_MODEL = process.env.CHAT_MODEL ?? 'google/gemini-3.5-flash-lite'
export const EMBED_MODEL = 'voyage/voyage-4-lite'
export const DB_NAME = process.env.TRAILHEAD_DB ?? 'trailhead_prod'

function requireMongoUri() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set (the MongoDB Atlas integration injects it)')
  return uri
}

// Module scope → one memory instance (and MongoClient) per warm function instance, reused across requests.
let memory: ReturnType<typeof createMongoDBMemory> | undefined
export function getMemory() {
  return (memory ??= createMongoDBMemory({
    uri: requireMongoUri(),
    embedder: gateway.embeddingModel(EMBED_MODEL),
    topology: { dbName: DB_NAME, hideToolCommands: ['session'] },
  }))
}

// A plain driver client for the memory panel, which reads the tiers directly.
let client: MongoClient | undefined
export function getDb() {
  client ??= new MongoClient(requireMongoUri(), { appName: 'devrel-workshop-trailhead-memory-app' })
  return client.db(DB_NAME)
}

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
If you don't know where the user is or what they can handle, ask.

You have a persistent \`memory\` tool. The conversation history is already in your context — do not try to load or save it.
- Before answering, semantic_search for facts about the user relevant to their message.
- When the user tells you facts about themselves, save each with semantic_save (importance 7-9 for constraints like injuries).
- When the user reports something that happened (a hike they did, a rating), record it with episodic_save.
- If the user asks you to forget something, semantic_search for it and call memory_forget with the matching memory_type + id.
Never mention memory operations in your replies.`

type Scope = { userId: string; sessionId: string; prompt: string; history: ModelMessage[] }

// One request = one agent, scoped to this user + session (Mode B, closure mode — as in the notebook's chatB).
export function createTrailheadAgent({ userId, sessionId, prompt, history }: Scope) {
  const memory = getMemory()
  return new ToolLoopAgent({
    model: CHAT_MODEL,
    instructions: INSTRUCTIONS,
    tools: { suggestTrail, ...memory({ userId, sessionId }) },
    stopWhen: isLoopFinished(),
    // BEFORE: put the transcript restored from MongoDB in front of the new message.
    prepareCall: ({ prompt: incoming, ...settings }) => ({
      ...settings,
      prompt: [...history, ...(typeof incoming === 'string' ? [{ role: 'user' as const, content: incoming }] : incoming ?? [])],
    }),
    // AFTER: persist the user prompt and every assistant/tool message, exactly once.
    onEnd: memory.onFinish({ userId, sessionId, prompt }),
  })
}

export type TrailheadUIMessage = InferAgentUIMessage<ReturnType<typeof createTrailheadAgent>>
