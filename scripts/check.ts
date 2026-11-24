// Smoke test: exercises the same code paths the notebook cells use.
// Run:  deno task smoke
import '@std/dotenv/load'
import { ToolLoopAgent, isLoopFinished, tool, type LanguageModel } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createAzure } from '@ai-sdk/azure'
import { createVoyage } from 'voyage-ai-provider'
import { z } from 'zod'
import { MongoClient } from 'mongodb'
import { createMongoDBMemory } from '@mongodb-developer/vercel-ai-memory'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Set ${name} in .env`)
  return value
}

// Same provider switch as the notebook. Pick one with LLM_PROVIDER=google|aws|microsoft (default google).
const LLM_PROVIDER = (Deno.env.get('LLM_PROVIDER') ?? 'google') as 'google' | 'aws' | 'microsoft'
function chatModel(provider: typeof LLM_PROVIDER): LanguageModel {
  switch (provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey: requireEnv('GOOGLE_API_KEY') })('gemini-3.5-flash-lite')
    case 'aws':
      return createAmazonBedrock({
        region: 'us-west-2',
        accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
      })('global.anthropic.claude-sonnet-4-6')
    case 'microsoft':
      return createAzure({ resourceName: 'gai-326', apiKey: requireEnv('AZURE_OPENAI_API_KEY') })('gpt-5.1')
  }
}

const MONGODB_URI = requireEnv('MONGODB_URI')
const VOYAGE_API_KEY = requireEnv('VOYAGE_API_KEY')
const voyage = createVoyage({
  apiKey: VOYAGE_API_KEY,
  baseURL: VOYAGE_API_KEY.startsWith('al-') ? 'https://ai.mongodb.com/v1' : undefined,
})

const CHAT_MODEL = chatModel(LLM_PROVIDER)
const EMBED_MODEL = 'voyage-4-lite'
const DB_NAME = 'trailhead_smoke'

// ── 1. Custom tool ───────────────────────────────────────────────────────────
const suggestTrail = tool({
  description: 'Suggest hiking trails near a city, filtered by difficulty.',
  inputSchema: z.object({
    city: z.string(),
    difficulty: z.enum(['easy', 'moderate', 'hard']).optional(),
  }),
  execute: async ({ city, difficulty }) => {
    return {
      city,
      trails: [{ name: 'Bear Lake Loop', difficulty: 'easy', miles: 0.8 }].filter(
        (t) => !difficulty || t.difficulty === difficulty,
      ),
    }
  },
})

// ── 2. Agent without memory ──────────────────────────────────────────────────
const agentNoMemory = new ToolLoopAgent({
  model: CHAT_MODEL,
  instructions: 'You are Trailhead, a concise outdoor trip planner.',
  tools: { suggestTrail },
  stopWhen: isLoopFinished(),
})
const r0 = await agentNoMemory.generate({ prompt: 'Say hello in five words.' })
console.log('[no-memory]', r0.text, '| steps:', r0.steps.length)

// ── 3. Memory instance with Voyage AI embeddings ─────────────────────────────
const mongodbMemory = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder: voyage.embeddingModel(EMBED_MODEL),
  topology: { dbName: DB_NAME },
})
await mongodbMemory.connect()
const tools = mongodbMemory({ userId: 'alice', sessionId: 's1' })
console.log('[memory] tool keys:', Object.keys(tools))
console.log('[memory] config db:', mongodbMemory.config.dbName)

// ── 4. Direct store ops (no LLM) ─────────────────────────────────────────────
const id = await mongodbMemory.store.semanticSave('alice', 'Alice', 'Alice lives in Denver and loves hiking.', {
  importance: 8,
})
console.log('[store] semanticSave id:', String(id))
const hits = await mongodbMemory.store.semanticSearch('alice', 'where does she live?', 3)
console.log('[store] semanticSearch hits:', hits.length, hits.map((h) => h.description))

// ── 5. Mode A agent with memory ──────────────────────────────────────────────
const agentMemA = new ToolLoopAgent({
  model: CHAT_MODEL,
  instructions:
    'You are Trailhead. You have a `memory` tool. Use semantic_search to look up facts about the user before answering.',
  tools: { suggestTrail, ...tools },
  stopWhen: isLoopFinished(),
})
const r1 = await agentMemA.generate({ prompt: 'Where do I live? Answer in one sentence.' })
console.log('[modeA]', r1.text)
console.log(
  '[modeA] tool calls:',
  r1.steps.flatMap((s) => s.toolCalls.map((c) => `${c.toolName}(${JSON.stringify(c.input)})`)),
)

// ── 6. Mode B agent (hook-driven session) ────────────────────────────────────
const memB = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder: voyage.embeddingModel(EMBED_MODEL),
  topology: { dbName: DB_NAME, hideToolCommands: ['session'] },
})
const agentB = new ToolLoopAgent({
  model: CHAT_MODEL,
  instructions: 'You are Trailhead, a concise outdoor trip planner.',
  callOptionsSchema: z.object({ userId: z.string(), sessionId: z.string(), prompt: z.string() }),
  prepareCall: async ({ options, prompt: _p, messages: _m, ...settings }) => {
    const { userId, sessionId, prompt } = options
    const history = await memB.loadSession({ userId, sessionId })
    return {
      ...settings,
      tools: { suggestTrail, ...memB({ userId, sessionId }) },
      messages: [...history, { role: 'user', content: prompt }],
      experimental_context: { userId, sessionId, prompt },
    }
  },
  onFinish: memB.onFinish(),
  stopWhen: isLoopFinished(),
})
const scope = { userId: 'bob', sessionId: 'sB' }
await agentB.generate({ prompt: 'x', options: { ...scope, prompt: 'My name is Bob. Reply with OK only.' } })
const rB = await agentB.generate({ prompt: 'x', options: { ...scope, prompt: 'What is my name? One word.' } })
console.log('[modeB]', rB.text)
const sess = await memB.store.sessionRecent(scope.userId, scope.sessionId, 20)
console.log('[modeB] session docs:', sess.map((d) => `${d.seq}:${d.role}`))

// ── 7. Inspect Atlas + cleanup ───────────────────────────────────────────────
const client = new MongoClient(MONGODB_URI)
const db = client.db(DB_NAME)
console.log('[atlas] collections:', (await db.listCollections().toArray()).map((c) => c.name))
// deno-lint-ignore no-explicit-any
const vs = (await db.collection('semantic_memory').listSearchIndexes().toArray()) as any[]
console.log('[atlas] semantic vector index:', JSON.stringify(vs.map((i) => ({ name: i.name, status: i.status, dims: i.latestDefinition?.fields?.[0]?.numDimensions }))))
await db.dropDatabase()
await client.close()
await mongodbMemory.close()
await memB.close()
console.log('✅ smoke test passed')
