// GET /api/memories — what Trailhead remembers about the current browser's user, read straight from MongoDB.
import { getDb } from '@/lib/trailhead'
import { getUserId } from '@/lib/user'

// Reading cookies() makes this route dynamic, so every request reads fresh memories.
export async function GET() {
  const userId = await getUserId({ create: false })
  if (!userId) return Response.json({ facts: [], episodes: [] })

  const db = getDb()
  // Current, not-yet-forgotten memories: memory_forget sets expire_at, and the TTL monitor deletes them shortly after.
  const alive = { $or: [{ expire_at: null }, { expire_at: { $gt: new Date() } }] }
  const projection = { _id: 0, name: 1, description: 1, importance: 1, timestamp: 1, event_type: 1, 'stats.retrieval_ct': 1 }

  const [facts, episodes] = await Promise.all([
    db.collection('semantic_memory').find({ user_id: userId, is_latest: true, ...alive }, { projection }).sort({ importance: -1, timestamp: -1 }).limit(20).toArray(),
    db.collection('episodic_memory').find({ user_id: userId, ...alive }, { projection }).sort({ timestamp: -1 }).limit(10).toArray(),
  ])
  return Response.json({ facts, episodes })
}
