# Deploy Trailhead to Vercel + MongoDB Atlas with one command

This folder is the notebook's **Mode B** agent (Part 3) as a Next.js chat app: AI SDK `useChat` with Vercel's AI Elements components, memory tool calls rendered as cards, and a side panel showing what the agent remembers (read live from MongoDB). The route handler is `app/api/chat/route.ts`; the agent lives in `lib/trailhead.ts`. It also provisions a **free MongoDB Atlas cluster through the Vercel Marketplace**, so the whole setup runs from the terminal:

```bash
./deploy/deploy.sh
# or: PROJECT=my-trailhead REGION=iad1 ./deploy/deploy.sh
```

You can also run it as the **last cell of the notebook** (Part 7). Set `DEPLOY_NOW = true` and run the cell. The CLI output streams into the cell, and the next cell calls the live API.

**From a notebook cell there's no terminal**, so the script adds `--non-interactive` to every Vercel command. Anything that would prompt stops with a hint instead of hanging. Do these two steps once in a real terminal first:

```bash
vercel login
vercel integration accept-terms mongodbatlas   # first Atlas Marketplace install on your team
```

Without the CLI installed, prefix both with `npx vercel@63.0.1` (the version `deploy.sh` pins).

## What the script runs

| Step | CLI command | Result |
|---|---|---|
| 1 | `vercel whoami` / `vercel login` | Checks that you're logged in |
| 2 | `vercel link --yes --project trailhead-memory-<your-vercel-username>` | Creates or links your Vercel project (set `PROJECT=` to choose another name) |
| 3 | `vercel integration add mongodbatlas --plan FREE -m clusterTier=FREE -m vercelRegion=iad1 -e production -e preview -e development` | Creates an Atlas account/org/project and an **M0 cluster**, connects it to the project, and injects **`MONGODB_URI`** |
| 4 | `vercel deploy --prod --yes --regions iad1` | Deploys the function in the same region as the cluster |

The script skips step 3 when the project already has `MONGODB_URI`, so you can run it again to redeploy.

**AI Gateway needs no key on Vercel.** Deployed functions authenticate with the project's OIDC token, so the chat model (`'google/gemini-3.5-flash-lite'`) and Voyage embeddings (`gateway.embeddingModel('voyage/voyage-4-lite')`) work without setting `AI_GATEWAY_API_KEY`.

## Why the Vercel CLI and not the Atlas CLI?

| | `vercel integration add mongodbatlas` | `atlas setup` + `vercel env add` |
|---|---|---|
| Accounts | Only Vercel (Atlas billing goes through Vercel) | Atlas account + Vercel account |
| Wiring `MONGODB_URI` | Automatic, for every environment | You build the URI (user/password) and push it yourself |
| Network access | Handled by the integration | You must open `0.0.0.0/0`, because Vercel functions have no fixed IPs |
| Best for | New projects and workshops | Reusing an existing Atlas org or cluster |

If you'd rather bring your own Atlas cluster, here's the Atlas CLI version:

```bash
atlas setup --clusterName trailhead --provider AWS --region US_EAST_1 --tier M0 \
  --username trailhead --password "$DB_PASS" --accessListIp 0.0.0.0/0 \
  --skipSampleData --connectWith skip --force
SRV=$(atlas clusters connectionStrings describe trailhead -o json | jq -r .standardSrv)
URI="${SRV/mongodb+srv:\/\//mongodb+srv://trailhead:$DB_PASS@}/?retryWrites=true&w=majority"
vercel env add MONGODB_URI production --value "$URI" --sensitive --yes
vercel deploy --prod --yes
```

## Requirements and troubleshooting

- **Vercel CLI 50 or newer** (the script uses `vercel` from your PATH, or `npx vercel@63.0.1`). Older versions such as 48.x don't have `--plan` / `-m` / `-e` on `integration add`, so they fall back to prompts.
- **First install on a team:** you may need to accept the Marketplace terms once with `vercel integration accept-terms mongodbatlas`. You can also accept them in the prompt.
- **One free cluster per Atlas project:** if the plan is rejected, give the resource a new name (`RESOURCE=… ./deploy/deploy.sh`) or reuse the existing resource with `vercel integration resource connect <name>`.
- **Empty recall right after the first deploy:** Vector Search indexes on a new cluster take about a minute to become `READY`.
- **Region:** see `vercel integration add mongodbatlas --help` for the valid `vercelRegion` values.

## Local development

Requires Node 22 or newer.

```bash
cd deploy && npm install
vercel env pull .env.local   # pulls MONGODB_URI (+ a short-lived VERCEL_OIDC_TOKEN for Gateway)
npm run dev                  # http://localhost:3000
```

Or point it at a local Atlas deployment: put `MONGODB_URI` and `AI_GATEWAY_API_KEY` in `.env.local` instead.

## How it's wired

| File | What it does |
|---|---|
| `lib/trailhead.ts` | The memory instance (one per warm function), `suggestTrail`, and `createTrailheadAgent()` — Mode B in closure mode: history from `loadSession()` via `prepareCall`, `onEnd: memory.onFinish({ userId, sessionId, prompt })` |
| `lib/user.ts` | The memory scope's `userId`: a server-set httpOnly cookie. Swap in your auth provider's user id in a real app — never take it from the request body |
| `app/api/chat/route.ts` | `POST` streams a turn with `createAgentUIStreamResponse`; the client sends only its newest message. `GET` is a health check |
| `app/api/memories/route.ts` | The current user's semantic and episodic memories, for the side panel |
| `app/page.tsx`, `components/memory-*.tsx` | The chat UI, memory tool cards and memory panel |

## Cleanup

```bash
vercel integration resource remove trailhead-memory-<your-vercel-username>-atlas   # deletes the Atlas resource
vercel project remove trailhead-memory-<your-vercel-username>
```
