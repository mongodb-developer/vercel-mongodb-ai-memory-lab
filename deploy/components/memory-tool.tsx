'use client'

import type { ToolUIPart } from 'ai'
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool'

// What each memory command means, for the card header.
const COMMANDS: Record<string, { icon: string; label: string }> = {
  semantic_search: { icon: '🔎', label: 'Recall facts' },
  semantic_save: { icon: '💾', label: 'Remember a fact' },
  episodic_search: { icon: '🗂️', label: 'Recall events' },
  episodic_save: { icon: '📌', label: 'Remember an event' },
  procedural_search: { icon: '📘', label: 'Look up a procedure' },
  procedural_save: { icon: '✍️', label: 'Learn a procedure' },
  scratchpad_write: { icon: '📝', label: 'Take a note' },
  scratchpad_read: { icon: '📝', label: 'Read notes' },
  scratchpad_promote: { icon: '⬆️', label: 'Promote a note' },
  memory_forget: { icon: '🧹', label: 'Forget' },
}

type MemoryInput = { command?: string; query?: string; content?: string; name?: string; importance?: number; reason?: string }

function summary(input: MemoryInput) {
  const text = input.query ?? input.content ?? input.reason
  const detail = [input.name && `as “${input.name}”`, input.importance !== undefined && `importance ${input.importance}`].filter(Boolean).join(', ')
  return { text, detail }
}

// A memory tool call rendered as a collapsible AI Elements Tool card: which tier, what it searched or stored, and what came back.
export function MemoryTool({ part }: { part: ToolUIPart }) {
  const input = (part.input ?? {}) as MemoryInput
  const meta = COMMANDS[input.command ?? ''] ?? { icon: '🧠', label: input.command ?? 'memory' }
  const { text, detail } = summary(input)
  const output = part.state === 'output-available' ? (part.output as { output?: string } | undefined)?.output : undefined

  return (
    <Tool className="border-emerald-500/30 bg-emerald-500/5">
      <ToolHeader type={part.type} state={part.state} title={`${meta.icon} ${meta.label} · ${input.command ?? ''}`} />
      <ToolContent>
        {text && (
          <p className="text-sm">
            <span className="text-muted-foreground">{input.command?.endsWith('search') ? 'Query' : 'Content'}: </span>“{text}”
            {detail && <span className="text-muted-foreground"> ({detail})</span>}
          </p>
        )}
        {output && <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs">{output}</pre>}
        {part.state === 'output-error' && <p className="text-sm text-destructive">{part.errorText}</p>}
      </ToolContent>
    </Tool>
  )
}
