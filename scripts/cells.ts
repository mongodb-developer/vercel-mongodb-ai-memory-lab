// Notebook cells for vercel-mongodb-ai-memory-lab.ipynb — edit here, then `deno task build`.
//
// Lab blanks: wrap the answer in /*▶*/ … /*◀*/ inside a code cell. The build strips the markers for
// solutions/ and replaces each marked span with <CODE_BLOCK_n> (numbered top to bottom) for labs/.
// Keep blanks on MongoDB calls; leave AI SDK wiring filled in.
export type Cell = { type: 'markdown' | 'code'; source: string }
const md = (source: string): Cell => ({ type: 'markdown', source })
const code = (source: string): Cell => ({ type: 'code', source })

export const cells: Cell[] = [
  // ───────────────────────────────────────────────────────────────────────────
  md(`
# 🥾 Trailhead — Giving an AI Agent Memory with MongoDB & the Vercel AI SDK

In this lab you will **build an agent, watch it forget everything, then give it a brain.**

We'll build **Trailhead**, a personal outdoor-trip planning assistant, with the
[Vercel AI SDK](https://ai-sdk.dev) \`ToolLoopAgent\`. Then we'll add persistent, multi-tier
memory using [\`@mongodb-developer/vercel-ai-memory\`](https://www.npmjs.com/package/@mongodb-developer/vercel-ai-memory),
the MongoDB memory provider referenced in the
[AI SDK memory docs](https://ai-sdk.dev/docs/agents/memory#mongodb).

| | |
|---|---|
| **Runtime** | Deno (this notebook runs on the Deno Jupyter kernel) |
| **Agent framework** | \`ai\` v6 — \`ToolLoopAgent\`, \`isLoopFinished\` |
| **Models** | Chat: **Gemini 3.5 Flash Lite** — Embeddings: **Voyage AI 4 Lite** — both through **Vercel AI Gateway**, one string each to swap |
| **Memory** | MongoDB Atlas (a local Atlas deployment for the lab, Atlas in the cloud when you ship) — 5 memory tiers, Atlas Vector Search, TTL retention |

### What you'll learn
1. Why a stateless agent forgets you the moment \`generate()\` returns
2. The three approaches to agent memory in the AI SDK, and where MongoDB fits
3. **Mode A** — LLM-controlled memory tools (fast to prototype)
4. **Mode B** — runtime-controlled session memory via \`prepareCall\` / \`onFinish\` hooks (production)
5. The five memory tiers — session, semantic, procedural, episodic, scratchpad — and \`memory_forget\`
6. Retention policies, retrieval filtering, multi-tenancy, and swapping models/embedders with zero code churn

### Prerequisites
- **In the hosted lab:** nothing — a local Atlas deployment (with Atlas Vector Search) is running on this machine and \`MONGODB_URI\` / \`AI_GATEWAY_API_KEY\` are already set in \`/etc/lab-env\`.
- **On your laptop:** a local Atlas deployment (\`atlas deployments setup --type local\`) or any Atlas cluster, a Vercel AI Gateway API key, and a \`.env\` file (copy \`.env.example\`) with \`MONGODB_URI\` and \`AI_GATEWAY_API_KEY\`.
- **For Part 7:** a free [Vercel](https://vercel.com/signup) account.

The \`memory\` package creates every collection and Vector Search index for you.

> ⚠️ **Cost note:** every LLM turn and every \`*_save\` / \`*_search\` embedding goes through AI Gateway. The whole lab costs well under a dollar with the default models.
`),

  md(`
## Part 1 · Build Trailhead (no memory yet)

### 1.1 Setup

Deno resolves the \`npm:\` / \`jsr:\` imports through the \`deno.json\` import map in the lab folder — no \`npm install\` step.

This cell also opens a plain **MongoDB driver** connection. The memory package manages its own client; ours is for
looking at what it writes, which is most of what you'll do in this lab.
`),

  code(`
import { load } from '@std/dotenv'
import { ToolLoopAgent, embed, gateway, isLoopFinished, tool, type ModelMessage } from 'ai'
import { z } from 'zod'
import { MongoClient } from 'mongodb'
import { createMongoDBMemory } from '@mongodb-developer/vercel-ai-memory'

// Hosted lab: /etc/lab-env. Laptop: .env in the lab folder (the notebook sits one level down, in labs/).
// Variables that are already set always win.
for (const envPath of ['/etc/lab-env', '../.env', '.env']) await load({ envPath, export: true })

const MONGODB_URI = Deno.env.get('MONGODB_URI')
const AI_GATEWAY_API_KEY = Deno.env.get('AI_GATEWAY_API_KEY')
if (!MONGODB_URI || !AI_GATEWAY_API_KEY) throw new Error('Set MONGODB_URI and AI_GATEWAY_API_KEY (copy .env.example → .env)')

// ── Models ───────────────────────────────────────────────────────────────────
// Both go through Vercel AI Gateway: a model is just a 'provider/model' string.
const CHAT_MODEL = Deno.env.get('CHAT_MODEL') ?? 'google/gemini-3.5-flash-lite'
// Voyage AI 4 Lite — MongoDB's embedding models.
const EMBED_MODEL = 'voyage/voyage-4-lite'
const embedder = gateway.embeddingModel(EMBED_MODEL)

// Everything this lab writes goes into this database so cleanup is one call.
const DB_NAME = 'trailhead_lab'

// ── MongoDB ──────────────────────────────────────────────────────────────────
const mongo = new MongoClient(MONGODB_URI, { appName: 'devrel-workshop-trailhead-memory' })
const labDb = mongo.db(DB_NAME)
// Check the connection: run the \`ping\` command against the \`admin\` database.
await /*▶*/mongo.db('admin').command({ ping: 1 })/*◀*/

console.log('✅ MongoDB reachable — chat:', CHAT_MODEL, '| embeddings:', EMBED_MODEL, '| db:', DB_NAME)
`),

  md(`
### 1.2 A custom tool

Memory is going to arrive later as *just another tool*. To make that click, Trailhead first gets a
regular domain tool: a tiny in-memory trail catalog. In real life this would hit an API.
`),

  code(`
const TRAILS = [
  { name: 'Bear Lake Loop', city: 'Denver', difficulty: 'easy', miles: 0.8, elevationGainFt: 45, notes: 'Flat, paved sections; great for knees.' },
  { name: 'Emerald Lake Trail', city: 'Denver', difficulty: 'moderate', miles: 3.2, elevationGainFt: 700, notes: 'Three alpine lakes.' },
  { name: 'Longs Peak Keyhole Route', city: 'Denver', difficulty: 'hard', miles: 14.5, elevationGainFt: 5100, notes: 'Class 3 scramble. Alpine start.' },
  { name: 'Lands End Trail', city: 'San Francisco', difficulty: 'easy', miles: 3.4, elevationGainFt: 500, notes: 'Coastal views, well graded.' },
  { name: 'Dipsea Trail', city: 'San Francisco', difficulty: 'hard', miles: 7.4, elevationGainFt: 2200, notes: 'Famous stairs. Steep.' },
  { name: 'Walden Pond Loop', city: 'Boston', difficulty: 'easy', miles: 1.7, elevationGainFt: 50, notes: 'Flat lakeside loop.' },
] as const

const suggestTrail = tool({
  description: 'Look up hiking trails near a city, optionally filtered by difficulty.',
  inputSchema: z.object({
    city: z.string().describe('City to search near, e.g. "Denver"'),
    difficulty: z.enum(['easy', 'moderate', 'hard']).optional(),
  }),
  execute: async ({ city, difficulty }) => {
    const hits = TRAILS.filter((t) => t.city.toLowerCase() === city.toLowerCase() && (!difficulty || t.difficulty === difficulty))
    return { city, count: hits.length, trails: hits }
  },
})

console.log('✅ suggestTrail tool defined over', TRAILS.length, 'trails')
`),

  md(`
### 1.3 The agent + a \`chat()\` helper

\`ToolLoopAgent\` runs the model → tool → model loop until the model produces a final answer.
\`isLoopFinished()\` is the stop condition recommended for memory-enabled agents, since they may need
several read/write tool calls before answering.

The \`chat()\` helper prints the final text **and every tool call the agent made**, so you can see memory
operations happening under the hood for the rest of the lab.
`),

  code(`
const TRAILHEAD_INSTRUCTIONS = \`You are Trailhead, a friendly and concise personal outdoor-trip planner.
Use the suggestTrail tool to look up real trails. Keep answers under 120 words.
If you don't know where the user is or what they can handle, ask.\`

const trailhead = new ToolLoopAgent({
  model: CHAT_MODEL,
  instructions: TRAILHEAD_INSTRUCTIONS,
  tools: { suggestTrail },
  stopWhen: isLoopFinished(),
})

// deno-lint-ignore no-explicit-any
async function chat(agent: { generate: (o: any) => PromiseLike<any> }, prompt: string, extra: Record<string, unknown> = {}) {
  console.log(\`\\n👤 \${prompt}\`)
  const result = await agent.generate({ prompt, ...extra })
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      console.log(\`   🔧 \${call.toolName}(\${JSON.stringify(call.input)})\`)
    }
  }
  console.log(\`🤖 \${result.text}\`)
  return result
}

console.log('✅ Trailhead agent ready')
`),

  md(`
### 1.4 Meet Trailhead — and watch it forget you

Two prompts, two separate \`generate()\` calls. Exactly what a chat backend does on two HTTP requests.
`),

  code(`
await chat(trailhead, "Hi! I'm Alice, I live in Denver. I love hiking, but I have bad knees so nothing steep please.")
`),

  code(`
await chat(trailhead, 'Great — can you suggest a trail for me this weekend?')
`),

  md(`
😬 Trailhead has no idea who Alice is, where she lives, or about her knees.

**This isn't a model quality problem.** Each \`generate()\` starts with an empty context window; the model
only sees \`instructions\` + the current prompt. Prove it by swapping the model — one line:
`),

  code(`
const trailheadOtherModel = new ToolLoopAgent({
  model: 'openai/gpt-4o-mini',   // ← only this line changed: a different provider, same Gateway
  instructions: TRAILHEAD_INSTRUCTIONS,
  tools: { suggestTrail },
  stopWhen: isLoopFinished(),
})
await chat(trailheadOtherModel, 'Can you suggest a trail for me this weekend?')
`),

  md(`
### 1.5 Three ways to add memory

The [AI SDK memory guide](https://ai-sdk.dev/docs/agents/memory) lists three approaches:

| Approach | Effort | Flexibility | Lock-in |
|---|---|---|---|
| **Provider-defined tools** (e.g. Anthropic's \`memory_20250818\`) | Low | Medium | Yes — Claude only |
| **Memory providers** (Letta, **MongoDB**) | Low | Low–Medium | Depends on provider |
| **Custom tool** (you write storage + retrieval) | High | High | No |

We're taking the **memory provider** route with MongoDB because:

- it works with **any** chat model and **any** embedding model (we'll prove that later)
- memory is *structured*: five tiers with different lifetimes instead of one blob of text
- it's a real database you can query, index, and inspect — nothing is hidden inside a SaaS
- it plugs into \`ToolLoopAgent\` as a plain tools record: \`tools: mongodbMemory({ userId, sessionId })\`

<details><summary>The five memory tiers (click)</summary>

| Tier | What it holds | Lifetime (default) | Vector search |
|---|---|---|---|
| **Session** | the conversation transcript | 24 h | — |
| **Semantic** | facts about people/entities/preferences | forever | ✅ |
| **Procedural** | how-to knowledge, workflows | forever | ✅ |
| **Episodic** | events & outcomes ("did X on date Y") | 1 yr since last read | ✅ |
| **Scratchpad** | temporary working notes, promotable to episodic | 1 h | — |

Plus \`memory_forget\` for agent-driven deletion.
</details>
`),

  md(`
## Part 2 · Add memory — Mode A (tool-driven)

### 2.1 Create the memory instance

\`createMongoDBMemory()\` is called **once** (module/server level). It needs a connection string and any
AI SDK \`EmbeddingModel\` — here Voyage AI 4 Lite through Gateway. Vector dimensions are **probed automatically**
from the embedder, so there's nothing to configure.

Connection is lazy (first tool use), but we call \`.connect()\` explicitly so the collections and Atlas Vector
Search indexes get created now and we can look at them.
`),

  code(`
const mongodbMemory = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder,
  topology: { dbName: DB_NAME },
})

await mongodbMemory.connect()

// Calling the instance returns a tools record scoped to a user + session.
const aliceTools = mongodbMemory({ userId: 'alice', sessionId: 'alice-s1' })
console.log('tool keys:', Object.keys(aliceTools))
console.log('\\n── tool description the LLM sees ──\\n' + aliceTools.memory.description)
`),

  md(`
Notice there's a **single \`memory\` tool** with a \`command\` enum, not a dozen tools. That keeps the tool surface
small for the model and lets the package hide/disable commands per deployment.

### 2.2 Peek at what was created in Atlas

\`connect()\` bootstrapped a whole schema. Use the driver to list it: the collections, their **TTL indexes**
(regular indexes with \`expireAfterSeconds\`) and their **Atlas Vector Search indexes** (search indexes, listed separately).
`),

  code(`
async function describeDb() {
  // List every collection in \`labDb\` as an array.
  const cols = (await /*▶*/labDb.listCollections().toArray()/*◀*/).map((c) => c.name).sort()
  console.log('collections:', cols)
  for (const name of cols) {
    const col = labDb.collection(name)
    const count = await col.countDocuments()
    // Get the collection's indexes and keep only the TTL ones (they have an \`expireAfterSeconds\` field).
    const ttl = /*▶*/(await col.indexes()).filter((i) => 'expireAfterSeconds' in i)/*◀*/.map((i) => \`\${Object.keys(i.key)[0]}(\${i.expireAfterSeconds}s)\`)
    // List the collection's Atlas Search / Vector Search indexes as an array.
    // deno-lint-ignore no-explicit-any
    const vec = (await /*▶*/col.listSearchIndexes().toArray()/*◀*/) as any[]
    const vecInfo = vec.map((v) => \`\${v.name} [\${v.status}] dims=\${v.latestDefinition?.fields?.[0]?.numDimensions ?? '?'}\`)
    console.log(\`  \${name.padEnd(20)} docs=\${String(count).padEnd(3)} ttl=\${ttl.join(',').padEnd(40)} vector=\${vecInfo.join(', ') || '—'}\`)
  }
}
await describeDb()
`),

  md(`
Three collections have an Atlas Vector Search index (**semantic, procedural, episodic**) whose \`numDimensions\`
came from probing \`voyage-4-lite\`. Every collection has an \`expire_at\` TTL index (\`expireAfterSeconds: 0\`) that
powers \`memory_forget\` and dynamic retention, plus a per-tier TTL where the default policy is \`ttl\`.

> Vector indexes build asynchronously. If a status shows \`PENDING\`/\`BUILDING\`, give it a few seconds before the first search.

### 2.3 Rebuild Trailhead with memory

Same model, same \`suggestTrail\`, same personality — we just **spread the memory tools in** and tell the agent
how to use them. In Mode A the LLM decides when to read and write.
`),

  code(`
const MEMORY_INSTRUCTIONS = \`
You have a persistent \\\`memory\\\` tool.
- At the start of every reply, call session_recent to restore the conversation, then semantic_search for facts about the user relevant to their message.
- When the user tells you facts about themselves (name, location, preferences, constraints, health), save each with semantic_save (name = the entity, e.g. "Alice"; importance 7-9 for constraints like injuries).
- When the user reports something that happened (a hike they did, a rating), record it with episodic_save.
- Persist the conversation with session_append: once for the user's message, once for your final reply.
- If the user asks you to forget something, semantic_search for it and call memory_forget with the matching memory_type + id.
Never mention memory operations in your replies.\`

function buildTrailhead(userId: string, sessionId: string) {
  return new ToolLoopAgent({
    model: CHAT_MODEL,
    instructions: TRAILHEAD_INSTRUCTIONS + '\\n' + MEMORY_INSTRUCTIONS,
    tools: { suggestTrail, ...mongodbMemory({ userId, sessionId }) },
    stopWhen: isLoopFinished(),
  })
}

const trailheadA = buildTrailhead('alice', 'alice-s1')
console.log('✅ Trailhead (Mode A) ready — tools:', Object.keys({ suggestTrail, ...aliceTools }))
`),

  md(`
### 2.4 The exact same two prompts again
`),

  code(`
await chat(trailheadA, "Hi! I'm Alice, I live in Denver. I love hiking, but I have bad knees so nothing steep please.")
`),

  code(`
await chat(trailheadA, 'Great — can you suggest a trail for me this weekend?')
`),

  md(`
🎉 Trailhead remembered Alice, Denver, and the knees — and filtered for an easy trail.

Look at the 🔧 lines: \`semantic_save\` calls on turn 1, \`session_recent\` / \`semantic_search\` on turn 2.
Memory is *just tools*, and the database now has real documents. Let's look at one:
`),

  code(`
// Find every document in the \`semantic_memory\` collection whose \`user_id\` is 'alice'.
const semanticDocs = await /*▶*/labDb.collection('semantic_memory').find({ user_id: 'alice' }).toArray()/*◀*/
for (const d of semanticDocs) {
  console.log(\`• [\${d.name}] importance=\${d.importance} is_latest=\${d.is_latest} dims=\${d.embedding?.length}\`)
  console.log(\`    "\${d.description}"\`)
}
`),

  md(`
Each fact is one document with a \`description\`, an \`importance\` score the LLM assigned, and the Voyage embedding
used for \`$vectorSearch\`.

### 2.5 Recall across sessions

Session memory is scoped to a \`sessionId\`; **semantic memory is scoped to the user**. Start a brand-new session
(imagine Alice coming back next week) and ask something that requires long-term memory:
`),

  code(`
const trailheadA_nextWeek = buildTrailhead('alice', 'alice-s2')   // new session, same user
await chat(trailheadA_nextWeek, 'Remind me — what did I tell you about my knees?')
`),

  md(`
That answer came from **vector search**, not from a transcript: the new session has no history, yet the
\`semantic_search\` query "knees" matched the stored fact. Try a paraphrase like *"any joint issues I mentioned?"* —
it still lands because the match is on meaning, not keywords.

### 2.6 Under the hood: run the vector search yourself

\`semantic_search\` is one MongoDB aggregation. Write it yourself: embed the question with the **same** Voyage model,
then run a \`$vectorSearch\` stage against the \`semantic_vector_index\` the package created.

The \`filter\` is what keeps memory private: it uses the \`user_id\` and \`is_latest\` filter fields declared in the index, so
Alice can never retrieve Bob's facts, and superseded versions of a fact never come back.
`),

  code(`
const { embedding: queryVector } = await embed({ model: embedder, value: 'any joint problems I should plan around?' })

const pipeline = [
  {
    // $vectorSearch over semantic_memory: index 'semantic_vector_index', vectors in the 'embedding' field,
    // 50 candidates, top 3 results, and only Alice's current facts (user_id 'alice', is_latest true).
    $vectorSearch: /*▶*/{
      index: 'semantic_vector_index',
      path: 'embedding',
      queryVector,
      numCandidates: 50,
      limit: 3,
      filter: { user_id: { $eq: 'alice' }, is_latest: { $eq: true } },
    }/*◀*/,
  },
  // Keep name and description, drop _id, and add the similarity score from the search metadata.
  { $project: /*▶*/{ _id: 0, name: 1, description: 1, score: { $meta: 'vectorSearchScore' } }/*◀*/ },
]

for (const hit of await labDb.collection('semantic_memory').aggregate(pipeline).toArray()) {
  console.log(\`  \${hit.score.toFixed(3)}  [\${hit.name}] \${hit.description}\`)
}
`),

  md(`
The top hit is the knee fact even though the question never says "knee". That ranking is all the agent's
\`semantic_search\` command does before handing the documents to the model.

### 2.7 The catch with Mode A: the LLM is in charge

Our instructions told the model to \`session_append\` every user and assistant turn. Did it? The transcript lives in
\`session_memory\`, one document per turn, ordered by \`seq\`.
`),

  code(`
// Find the turns of session 'alice-s1' (field \`session_id\`) in \`session_memory\`, oldest first (sort by \`seq\` ascending).
const sessionTurns = await /*▶*/labDb.collection('session_memory').find({ session_id: 'alice-s1' }).sort({ seq: 1 })/*◀*/.toArray()
console.log(\`alice-s1 has \${sessionTurns.length} stored turn(s) for 2 user prompts + 2 replies (expected 4):\`)
for (const t of sessionTurns) console.log(\`  #\${t.seq} \${t.role.padEnd(9)} \${t.content.slice(0, 80)}\`)
`),

  md(`
Depending on the model's mood you'll see 4, 2, or even 0 turns. **Mode A is non-deterministic** — great for
prototypes and for the *selective* tiers (semantic/episodic/procedural *should* be curated by the LLM), but you
don't want your conversation transcript to depend on whether the model felt like calling a tool.

That's what Mode B fixes.
`),

  md(`
## Part 3 · Mode B — hook-driven session memory (production pattern)

Instead of asking the LLM to persist the transcript, the **runtime** does it on every turn using two
\`ToolLoopAgent\` hooks:

| Hook | Package method | What it does |
|---|---|---|
| \`prepareCall\` (pre) | \`mongodbMemory.loadSession({ userId, sessionId })\` | Reads prior turns from Mongo as \`ModelMessage[]\` and prepends them to \`messages\` |
| \`onFinish\` (post) | \`mongodbMemory.onFinish()\` | Persists the user prompt + every assistant/tool message, exactly once per generation |

Two details worth understanding:

- \`topology.hideToolCommands: ['session']\` removes \`session_append\`/\`session_recent\` from the tool the LLM sees,
  while keeping the collection live for the hooks. (\`disable\` would turn the tier off completely.)
- \`ToolLoopAgent\` only accepts \`onFinish\` at construction time, but the scope (\`userId\`, \`sessionId\`) is per-call.
  We pass it through \`experimental_context\` inside \`prepareCall\`, and \`onFinish()\` reads it back from the event.
`),

  code(`
const mongodbMemoryB = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder,
  topology: { dbName: DB_NAME, hideToolCommands: ['session'] },
})
await mongodbMemoryB.connect()

const MEMORY_INSTRUCTIONS_B = \`
You have a persistent \\\`memory\\\` tool. The conversation history is already in your context — do not try to load or save it.
- Before answering, semantic_search for facts about the user relevant to their message.
- When the user tells you facts about themselves, save each with semantic_save (importance 7-9 for constraints like injuries).
- When the user reports something that happened (a hike they did, a rating), record it with episodic_save.
- If the user asks you to forget something, semantic_search for it and call memory_forget with the matching memory_type + id.
Never mention memory operations in your replies.\`

const trailheadB = new ToolLoopAgent({
  model: CHAT_MODEL,
  instructions: TRAILHEAD_INSTRUCTIONS + '\\n' + MEMORY_INSTRUCTIONS_B,

  // Per-call options, validated by zod.
  callOptionsSchema: z.object({ userId: z.string(), sessionId: z.string(), prompt: z.string() }),

  // PRE: restore history, scope tools, stash scope for onFinish.
  // We drop the incoming prompt/messages because the AI SDK enforces prompt XOR messages.
  prepareCall: async ({ options, prompt: _p, messages: _m, ...settings }) => {
    const { userId, sessionId, prompt } = options
    const history: ModelMessage[] = await mongodbMemoryB.loadSession({ userId, sessionId })
    return {
      ...settings,
      tools: { suggestTrail, ...mongodbMemoryB({ userId, sessionId }) },
      messages: [...history, { role: 'user', content: prompt }],
      experimental_context: { userId, sessionId, prompt },
    }
  },

  // POST: write every turn exactly once.
  onFinish: mongodbMemoryB.onFinish(),
  stopWhen: isLoopFinished(),
})

// Small wrapper so chat() keeps working: the real prompt travels in options.
function chatB(userId: string, sessionId: string, prompt: string) {
  return chat(trailheadB, prompt, { options: { userId, sessionId, prompt } })
}
console.log('✅ Trailhead (Mode B) ready — session commands hidden from the LLM:', Object.keys(mongodbMemoryB({ userId: 'x', sessionId: 'y' })))
`),

  md(`
### 3.1 Three turns with a new user, Bob
`),

  code(`
await chatB('bob', 'bob-s1', "Hey, I'm Bob from San Francisco. I'm training for a trail marathon, so bring on the steep stuff.")
await chatB('bob', 'bob-s1', 'What would you suggest for Saturday?')
await chatB('bob', 'bob-s1', 'And which one did you mention first?')
`),

  md(`
That last question can only be answered from the transcript — and it worked without the LLM calling any session
command. Let's verify the transcript is complete and exactly-once:
`),

  code(`
// Count bob-s1's stored turns per role: $match on session_id 'bob-s1', then $group by $role with a $sum counter.
const turnsByRole = await labDb.collection('session_memory').aggregate([
  /*▶*/{ $match: { session_id: 'bob-s1' } },
  { $group: { _id: '$role', turns: { $sum: 1 } } },/*◀*/
]).toArray()
console.log('bob-s1 turns by role:', Object.fromEntries(turnsByRole.map((r) => [r._id, r.turns])))

const bobTurns = await mongodbMemoryB.store.sessionRecent('bob-s1', 50)
console.log(\`bob-s1: \${bobTurns.length} turns\`)
for (const t of bobTurns) console.log(\`  #\${String(t.seq).padStart(2)} \${t.role.padEnd(9)} \${t.tool_name ? '[' + t.tool_name + '] ' : ''}\${t.content.slice(0, 70).replace(/\\n/g, ' ')}\`)
`),

  md(`
Every user prompt, every assistant reply, **and every tool call/result** is there as an audit trail.
(\`loadSession()\` replays only user/assistant turns to the model; providers reject orphaned tool results.)

### 3.2 "Server restart"

In a real deployment the agent object lives in a serverless function that gets torn down. Simulate that: build a
fresh agent instance with the same hooks and continue Bob's session.
`),

  code(`
// Factory so we can build "fresh server instances" of the Mode B agent with extra instructions later.
function buildTrailheadB(extraInstructions = '') {
  return new ToolLoopAgent({
    model: CHAT_MODEL,
    instructions: TRAILHEAD_INSTRUCTIONS + '\\n' + MEMORY_INSTRUCTIONS_B + '\\n' + extraInstructions,
    callOptionsSchema: z.object({ userId: z.string(), sessionId: z.string(), prompt: z.string() }),
    prepareCall: async ({ options, prompt: _p, messages: _m, ...settings }) => ({
      ...settings,
      tools: { suggestTrail, ...mongodbMemoryB({ userId: options.userId, sessionId: options.sessionId }) },
      messages: [...(await mongodbMemoryB.loadSession(options)), { role: 'user', content: options.prompt }],
      experimental_context: options,
    }),
    onFinish: mongodbMemoryB.onFinish(),
    stopWhen: isLoopFinished(),
  })
}

const trailheadB_afterRestart = buildTrailheadB()
await chat(trailheadB_afterRestart, 'Sorry, I got disconnected. What were we talking about?', { options: { userId: 'bob', sessionId: 'bob-s1', prompt: 'Sorry, I got disconnected. What were we talking about?' } })
`),

  md(`
> 💡 **Which mode when?** Use **Mode B** for the session transcript in anything real. Leave semantic / procedural /
> episodic / scratchpad under LLM control — those tiers *should* be selective. The package is designed for exactly
> that split.

## Part 4 · Play with the memory tiers

From here on we use the Mode B agent (\`chatB\`) with Alice, in fresh sessions.

### 4.1 Episodic memory — things that happened
`),

  code(`
await chatB('alice', 'alice-s3', "Quick update: I did the Bear Lake Loop yesterday like you suggested. Knees were fine! I'd give it an 8/10 — a bit crowded though.")
`),

  code(`
await chatB('alice', 'alice-s4', 'Which trails have I already done, and how did I rate them?')   // yet another new session
`),

  code(`
// Find Alice's episodes in \`episodic_memory\`, most important first (sort by \`importance\` descending).
const episodes = await /*▶*/labDb.collection('episodic_memory').find({ user_id: 'alice' }).sort({ importance: -1 })/*◀*/.toArray()
for (const e of episodes) console.log(\`• event_type=\${e.event_type} importance=\${e.importance} retrievals=\${e.stats?.retrieval_ct}\\n    "\${e.description}"\`, e.context ? JSON.stringify(e.context) : '')
`),

  md(`
Note \`stats.retrieval_ct\` and \`stats.last_retrieved\` — the package tracks usage. Episodic memory's default
retention is *1 year since last retrieval*, so memories the agent keeps finding useful stay alive.
`),

  md(`
### 4.2 Scratchpad → promote

Scratchpad notes are per-session working memory with a 1-hour TTL. Anything worth keeping gets **promoted** into an
episodic memory (which gets embedded and becomes searchable). You can drive this from the LLM (\`scratchpad_write\` /
\`scratchpad_promote\`) or directly from code via the store — here we use the store so the flow is explicit.
`),

  code(`
const { store } = mongodbMemoryB

const noteId = await store.scratchpadWrite('alice', 'alice-s4', 'Alice mentioned Bear Lake was crowded — she may prefer quieter trails or early starts.')
console.log('scratchpad note:', String(noteId))
console.log('before promote:', (await store.scratchpadRead('alice-s4')).map((n) => ({ note: n.note.slice(0, 40) + '…', promoted: n.promoted })))

const { episodicId } = await store.scratchpadPromote(String(noteId), 'alice', 'preference', { importance: 6 })
console.log('promoted → episodic', String(episodicId))
console.log('after promote: ', (await store.scratchpadRead('alice-s4')).map((n) => ({ note: n.note.slice(0, 40) + '…', promoted: n.promoted })))
`),

  md(`
### 4.3 Procedural memory — teaching the agent *how*

Procedural memories are how-to knowledge. They're often **seeded by humans** (\`source: 'human_expert'\`) rather than
learned by the agent. Let's give Trailhead a house style for trip briefings and tell it to look for procedures
before recommending.
`),

  code(`
await store.proceduralSave(
  'alice',
  'Trip briefing format',
  \`When recommending a trail, always answer in this exact structure:
🥾 Trail: <name> — <miles> mi, <elevation gain> ft, <difficulty>
✅ Why it fits: <one line tied to what you know about the user>
⏰ Go early: <one practical tip>\`,
  { source: 'human_expert', importance: 9 },
)

const trailheadProc = buildTrailheadB('Before recommending any trail, call procedural_search with query "trip briefing format" and follow the procedure you find exactly.')
await chat(trailheadProc, 'Suggest something new for me next weekend.', { options: { userId: 'alice', sessionId: 'alice-s5', prompt: 'Suggest something new for me next weekend.' } })
`),

  md(`
The agent combined three tiers in one answer: **procedural** (the format), **semantic** (Denver, knees) and
**episodic** (already did Bear Lake → "something new").

### 4.4 Updating facts — upsert vs. version history

Alice's knees got better. In Mode B semantic saves are **upserts** keyed on \`(user_id, name)\` by default, so the
fact is updated in place. Watch the \`semantic_memory\` collection before and after:
`),

  code(`
const showAliceFacts = async (label: string) => {
  // Find Alice's facts in \`semantic_memory\` in the order they were written (sort by \`timestamp\` ascending).
  const docs = await /*▶*/labDb.collection('semantic_memory').find({ user_id: 'alice' }).sort({ timestamp: 1 })/*◀*/.toArray()
  console.log(\`\\n\${label} — \${docs.length} doc(s)\`)
  for (const d of docs) console.log(\`  [\${d.name}] latest=\${d.is_latest} imp=\${d.importance} "\${d.description.slice(0, 90)}"\`)
}
await showAliceFacts('BEFORE')
await chatB('alice', 'alice-s6', "Good news — physio worked, my knees are totally fine now. I'm up for moderate trails.")
await showAliceFacts('AFTER')
`),

  md(`
If you need an audit trail of how a fact evolved, set \`topology.keepHistory: true\`: every save then inserts a
**new** document and flips the previous one to \`is_latest: false\`. Searches only ever return \`is_latest: true\`
documents (the vector index is filtered on it), so history never pollutes recall.

### 4.5 Forgetting on request

\`memory_forget\` sets \`expire_at = now\` on the document. The \`expire_at\` TTL index (\`expireAfterSeconds: 0\`)
removes it on the next TTL sweep — MongoDB runs that roughly every 60 s.
`),

  code(`
await chatB('alice', 'alice-s7', "Please forget where I live — I'd rather not have my location stored.")

// Models sometimes pick the wrong id to forget, so also forget one fact from code, where the id is certain.
await store.semanticSave('alice', 'Alice gym', 'Alice has a gym membership at a Denver climbing gym.', { importance: 4 })
const gymFact = await labDb.collection('semantic_memory').findOne({ user_id: 'alice', name: 'Alice gym', is_latest: true })
await store.forget('semantic', String(gymFact!._id))

// Find Alice's facts that are scheduled for deletion: \`expire_at\` is set and already in the past ($lte now).
const forgotten = await /*▶*/labDb.collection('semantic_memory').find({ user_id: 'alice', expire_at: { $lte: new Date() } })/*◀*/.toArray()
console.log(\`\${forgotten.length} fact(s) waiting for the TTL monitor:\`)
for (const d of forgotten) console.log(\`  [\${d.name}] expire_at=\${d.expire_at.toISOString()}  "\${d.description.slice(0, 70)}"\`)
`),

  md(`
Those documents are still there — they're only **marked**. The TTL monitor deletes them on its next pass, within
about a minute. Run just the query again to watch them disappear.

Compare the agent's 🔧 lines with the code path: the agent has to *find* the right id with \`semantic_search\` before it can
forget, and a model can get that wrong (or rewrite the fact with \`semantic_save\` instead). \`store.forget()\` from
code is the reliable route for anything like a privacy request.

> ⚠️ The model chooses *which* memory to forget by searching first. If Alice's location and hiking preferences were
> saved as one combined fact, forgetting the location also drops the rest — a good argument for the
> "one fact per \`semantic_save\`" instruction we gave the agent.
`),

  md(`
## Part 5 · Configuration: retention, filtering, tenancy, portability

Everything so far used defaults. Production deployments usually tune three things. We'll use a **separate database**
for these experiments and drive the store directly (no LLM) so the effects are easy to see.

### 5.1 Retention policies

Each tier accepts a \`DecayPolicy\`:

| Mode | Meaning |
|---|---|
| \`none\` | never auto-expire (default for semantic & procedural) |
| \`ttl\` | classic TTL index on a date field |
| \`ttl+importance\` | TTL applies **only** to docs with \`importance < minImportance\` — important memories are immune |
| \`dynamic\` | you compute \`expire_at\` per document — e.g. a forgetting curve where importance and reads extend life |
`),

  code(`
const TUNED_DB = DB_NAME + '_tuned'

const tunedMemory = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder,
  topology: { dbName: TUNED_DB },
  retention: {
    // Low-importance facts expire after 7 days; importance ≥ 7 lives forever.
    // Use mode 'ttl+importance' — it becomes a TTL index with a partialFilterExpression on importance.
    semantic: /*▶*/{ mode: 'ttl+importance', ttlSeconds: 7 * 86_400, minImportance: 7 }/*◀*/,
    // Forgetting curve: lifetime doubles with each importance point, refreshed every time it's read.
    episodic: {
      mode: 'dynamic',
      refreshOnRead: true,
      computeExpireAt: ({ importance }) => new Date(Date.now() + Math.pow(2, importance) * 3600 * 1000),
    },
    session: { mode: 'ttl', ttlSeconds: 7 * 86_400 },   // keep transcripts a week instead of a day
  },
  filtering: {
    minImportance: 4,          // never surface trivia in search results
    numCandidatesMultiplier: 20, // better recall on $vectorSearch at slight cost
  },
  defaults: { searchLimit: 3 },
})
await tunedMemory.connect()

const t = tunedMemory.store
await t.semanticSave('carol', 'Carol', 'Carol is allergic to bee stings — carries an EpiPen.', { importance: 9 })
await t.semanticSave('carol', 'Carol snack', 'Carol likes trail mix with extra almonds.', { importance: 3 })
await t.episodicSave('carol', 'hike', 'Carol summited Mt. Bierstadt, felt strong.', { importance: 8 })
await t.episodicSave('carol', 'hike', 'Carol did a short walk around the block.', { importance: 2 })

const tunedDb = mongo.db(TUNED_DB)
console.log('semantic TTL indexes:', (await tunedDb.collection('semantic_memory').indexes()).filter((i) => 'expireAfterSeconds' in i).map((i) => ({ key: i.key, ttl: i.expireAfterSeconds, partial: i.partialFilterExpression })))
console.log('\\nepisodic expire_at (dynamic):')
for (const e of await tunedDb.collection('episodic_memory').find({}).toArray()) {
  const hrs = e.expire_at ? Math.round((e.expire_at.getTime() - Date.now()) / 3600e3) : null
  console.log(\`  imp=\${e.importance} → expires in ~\${hrs} h  "\${e.description.slice(0, 45)}"\`)
}
`),

  md(`
- The **semantic** TTL index has a \`partialFilterExpression: { importance: { $lt: 7 } }\` — the EpiPen fact is immune, the snack preference expires in a week.
- The **episodic** docs got individual \`expire_at\` values: 2⁸ = 256 h for the summit, 2² = 4 h for the walk.

### 5.2 Retrieval filtering

\`filtering.minImportance: 4\` means the low-importance snack fact is stored but **never returned** by search:
`),

  code(`
console.log('search "what does Carol eat on the trail?" →', (await t.semanticSearch('carol', 'what does Carol eat on the trail?')).map((d) => \`[imp \${d.importance}] \${d.description}\`))
console.log('search "medical conditions" →', (await t.semanticSearch('carol', 'medical conditions')).map((d) => \`[imp \${d.importance}] \${d.description}\`))
`),

  md(`
### 5.3 Multi-tenancy

Memory is always scoped by \`userId\`. For SaaS you often need another dimension (workspace, org). \`extraFilterFields\`
adds scalar fields to the Atlas Vector Search index as filters, and you can also rename collections / the database
per tenant. Combined with per-user scoping this gives you isolation without separate clusters.
`),

  code(`
const tenantMemory = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder,
  topology: {
    dbName: DB_NAME + '_tenants',
    collections: { semantic: 'facts', session: 'transcripts' },     // your naming
    vectorIndexNames: { semantic: 'facts_vs' },
    disable: ['scratchpad', 'procedural'],                          // tiers this product doesn't use
    // Add 'tenant_id' as an extra Vector Search filter field on the semantic and episodic tiers.
    extraFilterFields: /*▶*/{ semantic: ['tenant_id'], episodic: ['tenant_id'] }/*◀*/,
  },
})
await tenantMemory.connect()
console.log('tenant-scoped tool commands:\\n' + (tenantMemory({ userId: 'u1', sessionId: 's1' }).memory.description ?? '').split('Commands:')[1]?.split('Rules:')[0])

// deno-lint-ignore no-explicit-any
const idx = (await mongo.db(DB_NAME + '_tenants').collection('facts').listSearchIndexes().toArray()) as any[]
console.log('vector index fields:', JSON.stringify(idx[0]?.latestDefinition?.fields?.map((f: Record<string, unknown>) => f.path ? { type: f.type, path: f.path } : { type: f.type, dims: f.numDimensions })))
`),

  md(`
Disabled tiers vanish from the tool's command list **and** are skipped at bootstrap, so the agent can't even try
them. The \`tenant_id\` filter field is in the index definition, ready for you to attach on writes and filter on reads.

### 5.4 Swap the embedding model

The lab has been running on Voyage AI 4 Lite. Moving up to Voyage 4 Large is one line — the package probes the
model's dimensions at \`connect()\` and sizes the Vector Search index to match, so there's no index definition to edit
(both models default to 1024 dimensions; a model with a different size would get a different index automatically).
Keep **one embedding model per collection**: put a model switch in a fresh database (or fresh collection names) and
re-embed what you want to keep.
`),

  code(`
const voyageLargeMemory = createMongoDBMemory({
  uri: MONGODB_URI,
  embedder: gateway.embeddingModel('voyage/voyage-4-large'),   // ← the only line that changed
  topology: { dbName: DB_NAME + '_voyage_large' },
})
await voyageLargeMemory.connect()
await voyageLargeMemory.store.semanticSave('probe', 'Probe', 'Dimension probe fact.')

for (const [label, db] of [['voyage-4-lite', DB_NAME], ['voyage-4-large', DB_NAME + '_voyage_large']] as const) {
  const doc = await mongo.db(db).collection('semantic_memory').findOne({}, { projection: { embedding: 1 } })
  // deno-lint-ignore no-explicit-any
  const vi = (await mongo.db(db).collection('semantic_memory').listSearchIndexes().toArray()) as any[]
  console.log(\`\${label.padEnd(24)} stored dims=\${doc?.embedding?.length}  index dims=\${vi[0]?.latestDefinition?.fields?.[0]?.numDimensions}\`)
}
`),

  md(`
## Part 6 · Wrap-up

### Problem → feature

| What we hit | What fixed it |
|---|---|
| Agent forgets everything between \`generate()\` calls | \`createMongoDBMemory()\` + \`tools: mongodbMemory({ userId, sessionId })\` |
| Facts must survive across sessions | **Semantic** memory, scoped to the user, retrieved with Atlas Vector Search |
| LLM sometimes skipped saving the transcript | **Mode B**: \`prepareCall\` → \`loadSession()\`, \`onFinish: mongodbMemory.onFinish()\`, \`hideToolCommands: ['session']\` |
| "What have I done before?" | **Episodic** memory with usage stats |
| Temporary notes that might matter later | **Scratchpad** → \`scratchpadPromote\` |
| Teach the agent a house style | **Procedural** memory seeded by a human expert |
| "Forget that" | \`memory_forget\` → \`expire_at\` TTL |
| Storage grows forever / trivia pollutes recall | \`retention\` policies (\`ttl+importance\`, \`dynamic\`) + \`filtering.minImportance\` |
| Multiple orgs, one cluster | \`topology.extraFilterFields\`, custom collection names, \`disable\` |
| Vendor lock-in | Any chat model through **Vercel AI Gateway**, and any Voyage AI embedding model — one string to swap |

### Take it further

1. **Streaming UI** — port \`trailheadB\` into a Next.js route with \`createAgentUIStreamResponse({ agent, uiMessages })\` (see the package README).
2. **Tenant filter end-to-end** — write \`tenant_id\` on save and filter on search using \`extraFilterFields\`.
3. **Different chat model** — set \`CHAT_MODEL = 'openai/gpt-4o-mini'\` or \`'mistral/mistral-small'\` and re-run Part 3. Does memory behaviour change?
4. **Observability** — open the Vercel AI Gateway dashboard and look at the per-request logs for this lab: how many embedding calls did one Trailhead turn cost?
5. **Custom tool comparison** — read the AI SDK's [Build a Custom Memory Tool](https://ai-sdk.dev/cookbook/guides/custom-memory-tool) recipe and compare the effort with what you did here.

### Cleanup (optional)

Drops every database this lab created and closes connections. Skip this if you want to keep exploring the data —
Part 7 doesn't need it either way.
`),

  code(`
const CLEANUP_NOW: boolean = false   // ← flip to true to drop the lab databases
if (!CLEANUP_NOW) {
  console.log('⏭️  Skipped. Set CLEANUP_NOW = true to drop the lab databases.')
} else {
  for (const db of [DB_NAME, DB_NAME + '_tuned', DB_NAME + '_tenants', DB_NAME + '_voyage_large']) {
    await mongo.db(db).dropDatabase()
    console.log('dropped', db)
  }
}
await mongo.close()
await Promise.all([mongodbMemory, mongodbMemoryB, tunedMemory, tenantMemory, voyageLargeMemory].map((m) => m.close()))
console.log('✅ connections closed')
`),

  md(`
## Part 7 · Ship it — Vercel + MongoDB Atlas in one call

Everything so far ran against a local Atlas deployment. Now we'll put **the Mode B agent from Part 3**
behind a real HTTPS endpoint, \`POST /api/chat\`, backed by a **brand-new free Atlas cluster in the cloud that the Vercel CLI provisions for you**.
The code doesn't change — only \`MONGODB_URI\` does.

The next cell runs \`deploy/deploy.sh\`, which does:

| # | Command | What happens |
|---|---|---|
| 1 | \`vercel whoami\` | Checks that you're logged in |
| 2 | \`vercel link --yes --project trailhead-memory\` | Creates or links a Vercel project for \`deploy/\` |
| 3 | \`vercel integration add mongodbatlas --plan FREE -m clusterTier=FREE -m vercelRegion=iad1\` | Creates a free **M0** cluster through the Vercel Marketplace and injects **\`MONGODB_URI\`** into the project |
| 4 | \`vercel deploy --prod --yes\` | Builds and deploys \`deploy/api/chat.ts\` |

You don't need an AI Gateway key in production: Vercel Functions authenticate to the Gateway automatically, so the chat
model and the Voyage embeddings just work.

> **Do these once in the Terminal first.** A notebook cell has no keyboard, so the script runs in
> \`--non-interactive\` mode and **stops with a hint** instead of prompting:
> \`\`\`bash
> vercel login                                   # opens a sign-in link
> vercel integration accept-terms mongodbatlas   # first Atlas Marketplace install on your account
> \`\`\`
> On your laptop without the CLI installed, prefix both with \`npx\`.

Deploying is **off by default** so that *Run All* never creates cloud resources by accident. Set \`DEPLOY_NOW = true\` and run the cell.
It takes about 1–3 minutes, and the CLI output streams in below.
`),

  code(`
const DEPLOY_NOW: boolean = false   // ← flip to true to deploy
// Only if your Vercel login belongs to several teams: the team slug to deploy into (the script lists them).
const VERCEL_SCOPE = ''
let DEPLOY_URL = ''

if (!DEPLOY_NOW) {
  console.log('⏭️  Skipped. Set DEPLOY_NOW = true to deploy Trailhead to Vercel + Atlas.')
} else {
  // The notebook lives in labs/ or solutions/; deploy/ sits at the lab root next to them.
  const candidates = [\`\${Deno.cwd()}/deploy\`, \`\${Deno.cwd()}/../deploy\`]
  let deployDir = ''
  for (const dir of candidates) {
    try { await Deno.stat(\`\${dir}/deploy.sh\`); deployDir = dir; break } catch { /* try the next one */ }
  }
  if (!deployDir) throw new Error(\`deploy/deploy.sh not found from \${Deno.cwd()} — open the notebook from the lab folder\`)

  // stdin: 'null' → no TTY → the script adds --non-interactive to every vercel command (never hangs on a prompt).
  const child = new Deno.Command('bash', {
    args: [\`\${deployDir}/deploy.sh\`],
    stdin: 'null', stdout: 'piped', stderr: 'piped',
    env: { NO_COLOR: '1', VERCEL_SCOPE },
  }).spawn()

  // Stream both pipes line by line so progress shows up while the deploy runs.
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    let buffer = ''
    const decoder = new TextDecoder()
    const handle = (line: string) => {
      const m = line.match(/^DEPLOY_URL=(https:\\/\\/[^\\s"',]+)/)
      if (m) DEPLOY_URL = m[1]
      if (line.trim()) console.log(line)
    }
    for await (const bytes of stream) {
      const lines = (buffer + decoder.decode(bytes, { stream: true })).split(/\\r?\\n/)
      buffer = lines.pop() ?? ''
      lines.forEach(handle)
    }
    if (buffer) handle(buffer)
  }
  await Promise.all([pump(child.stdout), pump(child.stderr)])
  const { code } = await child.status
  if (code !== 0) throw new Error(\`deploy.sh exited with code \${code} — read the ✖ hint above\`)
  // Recorded for anything that checks the deployment afterwards (the hosted lab's check script reads it).
  await Deno.writeTextFile(\`\${deployDir}/.deploy-url\`, DEPLOY_URL + '\\n')
  console.log('\\n🚀 Live at', DEPLOY_URL)
}
`),

  md(`
### 7.1 Talk to the deployed agent

Same user, **two different sessions**. In session \`s2\` the transcript is empty, so any recall of the knee or Denver
comes from **semantic memory** in the new Atlas cluster, retrieved by the agent running on Vercel.

> On a brand-new cluster the Vector Search indexes take about a minute to become \`READY\`. If the second answer doesn't
> remember you, wait a moment and run this cell again.
`),

  code(`
async function askDeployed(userId: string, sessionId: string, prompt: string) {
  console.log(\`\\n👤 [\${sessionId}] \${prompt}\`)
  // The deployed function uses your own Vercel account's AI Gateway, which on the free tier allows a few
  // requests per minute per model. One agent turn makes several, so wait out a rate limit instead of failing.
  let res: Response
  for (let attempt = 1; ; attempt++) {
    res = await fetch(\`\${DEPLOY_URL}/api/chat\`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, sessionId, prompt }),
    })
    if (res.ok) break
    const body = await res.text()
    if (attempt < 3 && /rate limit/i.test(body)) {
      console.log('   ⏳ AI Gateway rate limit on your Vercel account — retrying in 60 s')
      await new Promise((r) => setTimeout(r, 60_000))
      continue
    }
    throw new Error(\`\${res.status} \${res.statusText}: \${body}\`)
  }
  const { text, toolCalls } = await res.json() as { text: string; toolCalls: { tool: string; input: unknown }[] }
  for (const c of toolCalls) console.log(\`   🔧 \${c.tool}\`, JSON.stringify(c.input))
  console.log(\`🥾 \${text}\`)
}

if (!DEPLOY_URL) {
  console.log('⏭️  No deployment yet — run the previous cell with DEPLOY_NOW = true.')
} else {
  const prodUser = 'prod-' + crypto.randomUUID().slice(0, 8)
  await askDeployed(prodUser, 's1', 'I have a bad left knee and I live in Denver. Suggest an easy hike.')
  await askDeployed(prodUser, 's2', 'Plan my Saturday hike.')
}
`),

  md(`
### 7.2 Tear it down

The cluster is free, but if you want to remove everything, run this in a terminal from the \`deploy/\` folder:

\`\`\`bash
vercel integration resource remove trailhead-memory-atlas --disconnect-all   # deletes the Atlas resource
vercel project remove trailhead-memory
\`\`\`

To call the API from anywhere else:

\`\`\`bash
curl -X POST <DEPLOY_URL>/api/chat -H 'content-type: application/json' \\\\
  -d '{"userId":"bob","sessionId":"s1","prompt":"Suggest a hike near Denver"}'
\`\`\`

🎉 **That's the lab.** You built a stateless agent, gave it five tiers of MongoDB memory, and shipped it to production.
`),
]
