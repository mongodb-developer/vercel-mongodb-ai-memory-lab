'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

type Memory = { name?: string; description: string; importance?: number; event_type?: string; stats?: { retrieval_ct?: number } }
type Memories = { facts: Memory[]; episodes: Memory[] }

// "What Trailhead remembers about you": the user's semantic and episodic tiers, read from MongoDB.
// `version` changes after every finished turn, which triggers a refresh.
export function MemoryPanel({ version }: { version: number }) {
  const [data, setData] = useState<Memories>({ facts: [], episodes: [] })

  useEffect(() => {
    let cancelled = false
    fetch('/api/memories', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Memories) => !cancelled && setData(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [version])

  return (
    <aside className="flex h-full flex-col gap-6 overflow-y-auto border-l bg-muted/20 p-5">
      <div>
        <h2 className="font-semibold">What Trailhead remembers about you</h2>
        <p className="text-xs text-muted-foreground">Live from MongoDB Atlas — refreshed after every reply.</p>
      </div>
      <Section title="Facts" hint="semantic_memory" items={data.facts} empty="Tell Trailhead where you live or what you can handle." />
      <Section title="Things you did" hint="episodic_memory" items={data.episodes} empty="Report a hike you did, with a rating." />
    </aside>
  )
}

function Section({ title, hint, items, empty }: { title: string; hint: string; items: Memory[]; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline justify-between text-sm font-medium">
        {title} <code className="text-[10px] font-normal text-muted-foreground">{hint}</code>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{empty}</p>
      ) : (
        items.map((m, i) => (
          <div key={i} className="rounded-md border bg-background p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {m.name && <span className="font-medium">{m.name}</span>}
              {m.event_type && <Badge variant="secondary">{m.event_type}</Badge>}
              {m.importance !== undefined && <Badge variant="outline">importance {m.importance}</Badge>}
              {!!m.stats?.retrieval_ct && <Badge variant="outline">recalled {m.stats.retrieval_ct}×</Badge>}
            </div>
            <p className="text-muted-foreground">{m.description}</p>
          </div>
        ))
      )}
    </section>
  )
}
