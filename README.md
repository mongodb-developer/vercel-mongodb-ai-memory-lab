# 🥾 Trailhead — Give an AI Agent Memory with MongoDB & the Vercel AI SDK

A hands-on lab: build **Trailhead**, a trip-planning agent on the [Vercel AI SDK](https://ai-sdk.dev) `ToolLoopAgent`,
watch it forget you, then give it five tiers of persistent memory with
[`@mongodb-developer/vercel-ai-memory`](https://www.npmjs.com/package/@mongodb-developer/vercel-ai-memory) on MongoDB
Atlas — and ship it to Vercel with a free Atlas cluster in one command.

You'll set up and control the memory provider yourself: create and bootstrap it, scope its tools to a user and
session, wire the production session hooks (`loadSession()` / `onFinish()`), drive the store APIs, and tune
retention, filtering and multi-tenancy — then inspect what it writes with the MongoDB driver and `$vectorSearch`.

## Layout

| Path | What it is |
|---|---|
| `labs/vercel-mongodb-ai-memory-lab.ipynb` | The lab: 14 `<CODE_BLOCK_n>` blanks to fill in |
| `solutions/vercel-mongodb-ai-memory-lab.ipynb` | The same notebook, completed |
| `deploy/` | The Mode B agent as a Next.js chat app (AI SDK `useChat` + AI Elements, memory cards and panel), plus `deploy.sh` (your own Vercel project + Atlas via Marketplace + deploy) |
| `scripts/cells.ts` | **Source of truth** for both notebooks |
| `instruqt/code-blocks/` | Generated answer sheets for the hosted (Instruqt) version |
| `instruqt/local-preview/` | Run the hosted lab's editor locally in Docker |

Both notebooks, `scripts/lab.ts` and the answer sheets are generated — edit `scripts/cells.ts`, then `deno task build`.
Wrap an answer in `/*▶*/ … /*◀*/` to make it a blank.

## Run it on your laptop

Requirements: [Deno](https://deno.com) 2.x, VS Code with the Jupyter extension, a local Atlas deployment
(`atlas deployments setup --type local`) or any Atlas cluster, a Voyage AI key, and a key for one chat provider
(Google Gemini, Amazon Bedrock or Azure OpenAI).

```bash
cp .env.example .env        # fill in MONGODB_URI, VOYAGE_API_KEY and your provider's key
deno task kernel            # registers the Deno Jupyter kernel
code labs/vercel-mongodb-ai-memory-lab.ipynb
```

## Develop

```bash
deno task build    # regenerate notebooks, scripts/lab.ts and answer sheets
deno task check    # type-check the solution
deno task smoke    # quick end-to-end check (LLM_PROVIDER=google|aws|microsoft, default google)
deno task lab      # run the whole solution headless (needs the same .env as the notebook)
```

`deno task build --track=<path>` also syncs the answer sheets into an Instruqt track's `assignment.md` files.

## Models

AI SDK v7. The notebook's first code cell sets `LLM_PROVIDER`:

| `LLM_PROVIDER` | Package | Model | Keys |
|---|---|---|---|
| `google` (default) | `@ai-sdk/google` | `gemini-3.5-flash-lite` | `GOOGLE_API_KEY` |
| `aws` | `@ai-sdk/amazon-bedrock` | `global.anthropic.claude-sonnet-4-6` (us-west-2) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| `microsoft` | `@ai-sdk/azure` | deployment `gpt-5.1` on `gai-326` | `AZURE_OPENAI_API_KEY` |

Embeddings: `voyage-4-lite` through the [Voyage AI provider](https://ai-sdk.dev/providers/community-providers/voyage-ai).
An Atlas AI Model key (`al-…`) is sent to `https://ai.mongodb.com/v1`; a Voyage AI dashboard key to Voyage's own API.

In the hosted lab, all of these come from the workshop passkey (`lab-passkey`). The deployed app in `deploy/` uses
Vercel AI Gateway with OIDC instead, so no lab key is ever copied to Vercel.
