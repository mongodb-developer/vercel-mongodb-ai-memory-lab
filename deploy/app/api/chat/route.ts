// POST /api/chat — streams one Trailhead turn to the chat UI.
// GET  /api/chat — health check (used by the lab's check script).
import { createAgentUIStreamResponse } from 'ai'
import { CHAT_MODEL, DB_NAME, createTrailheadAgent, getMemory, type TrailheadUIMessage } from '@/lib/trailhead'
import { getUserId } from '@/lib/user'

export const maxDuration = 60

export async function POST(req: Request) {
  // The client sends only its newest message; the transcript lives in MongoDB.
  const { message, id: sessionId } = (await req.json()) as { message: TrailheadUIMessage; id: string }
  const userId = (await getUserId({ create: true }))!
  const prompt = message.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')

  const history = await getMemory().loadSession({ userId, sessionId })
  const agent = createTrailheadAgent({ userId, sessionId, prompt, history })

  return createAgentUIStreamResponse({ agent, uiMessages: [message], abortSignal: req.signal })
}

export async function GET() {
  return Response.json({ ok: true, agent: 'trailhead', db: DB_NAME, chat: CHAT_MODEL })
}
