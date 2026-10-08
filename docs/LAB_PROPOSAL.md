# Lab Proposal: Giving AI Agents Memory with MongoDB & the Vercel AI SDK

**Working title:** Trailhead: Build an AI Agent That Remembers You
**Format:** Hands-on Jupyter notebook lab (Deno kernel, TypeScript)
**Duration:** 60–75 minutes (core), plus 15–30 minutes of optional stretch challenges
**Level:** Intermediate (familiar with TypeScript and basic LLM concepts; no MongoDB experience needed)
**Owner:** MongoDB Developer Relations
**Status:** Draft, ready for review

---

## 1. Summary

Developers building agents with the Vercel AI SDK quickly run into the same problem: **the agent forgets everything the moment `generate()` returns.** The AI SDK's [memory guide](https://ai-sdk.dev/docs/agents/memory) names three ways to fix that: provider-defined tools, memory providers, and custom tools. **MongoDB is listed as a memory provider** through the open-source package [`@mongodb-developer/vercel-ai-memory`](https://www.npmjs.com/package/@mongodb-developer/vercel-ai-memory).

In this lab, attendees build **Trailhead**, a personal outdoor-trip planning agent, using `ToolLoopAgent`. They see it fail to remember a user between two turns. Then they add MongoDB Atlas memory, first as LLM-driven tools (Mode A) and then with runtime hooks (Mode B, the production pattern). After that they work through all five memory tiers and the package's configuration options: retention, filtering, multi-tenancy, and swapping embedders.

The lab follows a **problem → feature** story. Each MongoDB capability appears only after attendees have hit the problem it solves.

## 2. Why this lab, why now

- **The AI SDK docs point to MongoDB.** Developers reading the memory docs need a hands-on path from "listed provider" to "working agent." This lab is that path.
- **Memory is the main gap in agent demos.** Most agent tutorials stop at tool calling. Persistent, structured memory is what makes an agent a product.
- **MongoDB does more than store vectors here.** The lab shows the document model (five tiers, each with its own schema and lifecycle), Atlas Vector Search with filters, TTL indexes for retention and forgetting, and ordinary queryability. You can open Atlas and look at what the agent "knows."
- **No lock-in.** The same code runs with any AI SDK chat model and any embedding model. The lab uses Gemini for chat and Voyage AI (via Vercel AI Gateway) for embeddings, and shows a one-line swap for both.

## 3. Target audience

| Persona | What they get |
|---|---|
| Full-stack / Next.js developers on the AI SDK | A drop-in memory layer for `ToolLoopAgent`, with a production pattern |
| AI engineers comparing memory options | A concrete comparison of the AI SDK's three approaches, plus MongoDB's tiered model |
| Existing MongoDB users | How Atlas Vector Search, TTL indexes and the document model combine into agent memory |

**Prerequisites for attendees:** a laptop with VS Code, Deno, a free MongoDB Atlas cluster (M0), a Google Gemini API key, and a Vercel AI Gateway API key.

## 4. Learning objectives

By the end of the lab, attendees can:

1. Explain why a stateless agent forgets context between `generate()` calls, and why swapping models doesn't fix it.
2. Compare the three AI SDK memory approaches (provider tools, memory providers, custom tools) and when each fits.
3. Add MongoDB memory to a `ToolLoopAgent` with `createMongoDBMemory()` and `tools: mongodbMemory({ userId, sessionId })`.
4. Implement **Mode B** session memory with `prepareCall` → `loadSession()` and `onFinish: mongodbMemory.onFinish()`, and explain why it beats LLM-controlled transcripts.
5. Use all five memory tiers (session, semantic, procedural, episodic, scratchpad) plus `memory_forget`, and inspect the resulting documents and indexes in Atlas.
6. Configure retention (`ttl`, `ttl+importance`, `dynamic`), retrieval filtering, multi-tenancy (`extraFilterFields`, custom collections, `disable`) and embedder swaps.

## 5. Lab outline

| Part | Title | Time | Problem shown | Feature introduced |
|---|---|---|---|---|
| 0 | Intro & setup | 5 min | — | Deno notebook, `.env`, import map |
| 1 | Build Trailhead (no memory) | 10 min | Agent forgets the user between turns; a different model doesn't help | `ToolLoopAgent`, custom `suggestTrail` tool, `isLoopFinished()`; the three memory approaches |
| 2 | Mode A: tool-driven memory | 15 min | Facts must survive across sessions | `createMongoDBMemory`, auto-created collections and Vector Search indexes, semantic save/search, cross-session recall |
| 2.6 | The catch | 3 min | The LLM sometimes skips saving the transcript | Motivates Mode B |
| 3 | Mode B: hook-driven session memory | 12 min | Transcripts must be reliable and exactly-once; the server restarts | `callOptionsSchema`, `prepareCall` + `loadSession()`, `onFinish()`, `hideToolCommands: ['session']` |
| 4 | Memory tiers | 15 min | "What have I done?", temporary notes, house style, updated facts, "forget that" | Episodic (with usage stats), scratchpad → promote, procedural, fact update and `keepHistory`, `memory_forget` + TTL |
| 5 | Configuration | 12 min | Unbounded growth, trivia in recall, multiple tenants, vendor lock-in | `retention` policies, `filtering.minImportance`, `topology` (collections, `disable`, `extraFilterFields`), embedder swap (Voyage → Gemini) |
| 6 | Wrap-up | 5 min | — | Problem → feature recap, stretch challenges, cleanup |

## 6. Technical stack

| Component | Choice | Notes |
|---|---|---|
| Runtime | **Deno** + Deno Jupyter kernel | TypeScript notebook, no `npm install`; imports resolved through `deno.json` |
| Agent framework | `ai` v6 (`ToolLoopAgent`) | Current AI SDK agent abstraction |
| Chat model | **Gemini 2.5 Flash** via `@ai-sdk/google` | Can also be routed through Gateway (for example `openai/gpt-4o-mini`) |
| Embeddings | **Voyage AI 4 Lite** (`voyage/voyage-4-lite`) via **Vercel AI Gateway** | MongoDB's embedding models; dimensions detected automatically |
| Memory | `@mongodb-developer/vercel-ai-memory` ^0.4.2 | Five tiers, single `memory` tool, hooks for Mode B |
| Database | MongoDB Atlas (M0 free tier works) | Collections, Vector Search and TTL indexes created automatically |

**Repository layout**

```
VercelLab/
├── vercel-mongodb-ai-memory-lab.ipynb   # the lab (generated)
├── scripts/cells.ts             # source of truth for notebook cells
├── scripts/build-notebook.ts    # cells.ts → .ipynb + scripts/lab.ts
├── scripts/lab.ts               # all code cells concatenated (type-check / headless run)
├── scripts/check.ts             # quick smoke test against Atlas + models
├── deno.json                    # import map + tasks
├── .env.example                 # MONGODB_URI, AI_GATEWAY_API_KEY, GEMINI_API_KEY
└── docs/                        # proposal + lab guide
```

## 7. Delivery formats

- **Instructor-led workshop** (conference, meetup, MongoDB.local): 75 minutes, with the instructor running the notebook and pausing at "problem" moments.
- **Self-paced**: the notebook stands on its own, with explanations in the markdown cells and the lab guide as a companion.
- **Content spin-offs**: a blog post ("Your AI SDK agent has amnesia: here's the fix"), a 10-minute video of Parts 1–3, and a Next.js sample app (stretch challenge 1).

## 8. Success metrics

- Completion rate of Part 3 (Mode B) of at least 80% in instructor-led sessions
- Post-lab survey: at least 4/5 on "I could add MongoDB memory to my own agent"
- npm download growth for `@mongodb-developer/vercel-ai-memory` after the lab is published
- Atlas sign-ups attributed to the lab link or UTM
- GitHub stars and forks on the lab repo; issues and PRs as a signal of engagement

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Free-tier rate limits** on Vercel AI Gateway chat models (seen during development) | Chat defaults to Gemini through `@ai-sdk/google` with the attendee's own key; Gateway is only used for embeddings. For workshops, provision Gateway credits or a shared key. |
| LLM non-determinism: Mode A outputs vary | The lab leans into this: Part 2.6 uses the variance to motivate Mode B. The markdown explains what "good" output looks like. |
| Vector index not ready right after creation | `connect()` is called explicitly early, the index status is printed, and the notebook tells attendees to wait a few seconds if it shows `PENDING`. |
| TTL deletion isn't immediate (~60 s sweep) | Explained in 4.5; attendees check `expire_at` instead of waiting for deletion. |
| Deno / Jupyter kernel setup friction | One command, `deno jupyter --install`, plus a checklist in the lab guide; the smoke test (`deno task smoke`) catches configuration problems before the lab starts. |
| Package API changes (pre-1.0) | Version pinned to `^0.4.2`; `deno task check` type-checks every notebook cell in CI. |

## 10. Open questions for reviewers

1. Should the default chat model stay on Gemini (direct key), or return to Gateway-only once workshop credits are provisioned? That would mean one key for everything.
2. Should we ship a companion Next.js app (streaming UI with `createAgentUIStreamResponse`) as part of the lab, or leave it as a stretch challenge?
3. Should we list the lab on the AI SDK docs page next to the MongoDB provider entry (a PR to `vercel/ai`)?
4. Should the notebook also be published as a Node.js / `tsx` variant for attendees who can't install Deno?

## 11. Timeline (proposed)

| Milestone | Target |
|---|---|
| Notebook, build tooling and type-check complete | Done |
| First full manual run of the notebook (Gemini + Voyage) | In progress |
| Internal dry run (2–3 DevRel engineers) | +1 week |
| Fixes, lab guide finalized, blog draft | +2 weeks |
| First external delivery (meetup / webinar) | +3–4 weeks |
| Public repo + blog + video | +4–5 weeks |
