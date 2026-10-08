# 🥾 Trailhead — Give an AI Agent Memory with MongoDB & the Vercel AI SDK

A hands-on lab: build **Trailhead**, a trip-planning agent on the [Vercel AI SDK](https://ai-sdk.dev) `ToolLoopAgent`,
watch it forget you, then give it five tiers of persistent memory with
[`@mongodb-developer/vercel-ai-memory`](https://www.npmjs.com/package/@mongodb-developer/vercel-ai-memory) on MongoDB
Atlas — and ship it to Vercel with a free Atlas cluster in one command.

You'll write the MongoDB side yourself: inspecting the collections, TTL and Vector Search indexes the memory provider
creates, a filtered `$vectorSearch`, transcript and episode queries, partial TTL retention and tenant filter fields.

## Layout

| Path | What it is |
|---|---|
| `labs/vercel-mongodb-ai-memory-lab.ipynb` | The lab: 14 `<CODE_BLOCK_n>` blanks to fill in |
| `solutions/vercel-mongodb-ai-memory-lab.ipynb` | The same notebook, completed |
| `deploy/` | The Mode B agent as a Vercel Function, plus `deploy.sh` (Vercel project + Atlas via Marketplace + deploy) |
| `scripts/cells.ts` | **Source of truth** for both notebooks |
| `instruqt/code-blocks/` | Generated answer sheets for the hosted (Instruqt) version |
| `instruqt/local-preview/` | Run the hosted lab's editor locally in Docker |

Both notebooks, `scripts/lab.ts` and the answer sheets are generated — edit `scripts/cells.ts`, then `deno task build`.
Wrap an answer in `/*▶*/ … /*◀*/` to make it a blank.

## Run it on your laptop

Requirements: [Deno](https://deno.com) 2.x, VS Code with the Jupyter extension, a local Atlas deployment
(`atlas deployments setup --type local`) or any Atlas cluster, and a Vercel AI Gateway key.

```bash
cp .env.example .env        # fill in MONGODB_URI and AI_GATEWAY_API_KEY
deno task kernel            # registers the Deno Jupyter kernel
code labs/vercel-mongodb-ai-memory-lab.ipynb
```

## Develop

```bash
deno task build    # regenerate notebooks, scripts/lab.ts and answer sheets
deno task check    # type-check the solution
deno task lab      # run the whole solution headless (needs MONGODB_URI + AI_GATEWAY_API_KEY)
```

`deno task build --track=<path>` also syncs the answer sheets into an Instruqt track's `assignment.md` files.

## Models

Chat: `google/gemini-3.5-flash-lite`; embeddings: Voyage AI `voyage/voyage-4-lite` — both through Vercel AI Gateway.
Use a Gateway key with paid credits: free-tier keys are limited to 5 requests per minute per model.
