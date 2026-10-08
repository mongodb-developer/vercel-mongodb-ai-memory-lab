'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type ToolUIPart } from 'ai'
import { useEffect, useState } from 'react'
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@/components/ai-elements/prompt-input'
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'
import { MemoryPanel } from '@/components/memory-panel'
import { MemoryTool } from '@/components/memory-tool'
import type { TrailheadUIMessage } from '@/lib/trailhead'

const STARTERS = [
  "Hi! I'm Alice, I live in Denver and I have bad knees — nothing steep please.",
  'Suggest a trail for me this weekend.',
  'I did the Bear Lake Loop yesterday — 8/10, a bit crowded.',
  'Please forget where I live.',
]

const newSessionId = () => `session-${crypto.randomUUID().slice(0, 8)}`

export default function Page() {
  // Generated after mount: a random id during render would differ between the server render and the browser.
  const [sessionId, setSessionId] = useState<string>()
  useEffect(() => setSessionId(newSessionId()), [])
  const [memoryVersion, setMemoryVersion] = useState(0)

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] md:grid-cols-[1fr_22rem]">
      <header className="col-span-full flex items-center justify-between gap-4 border-b px-5 py-3">
        <div>
          <h1 className="font-semibold">🥾 Trailhead</h1>
          <p className="text-xs text-muted-foreground">
            A Vercel AI SDK agent with memory in MongoDB Atlas · session <code>{sessionId ?? '…'}</code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSessionId(newSessionId())}>
          New session
        </Button>
      </header>

      {/* key: a new session remounts the chat with an empty transcript; MongoDB still knows the user. */}
      {sessionId ? <ChatPane key={sessionId} sessionId={sessionId} onTurn={() => setMemoryVersion((v) => v + 1)} /> : <main />}

      <MemoryPanel version={memoryVersion} />
    </div>
  )
}

function ChatPane({ sessionId, onTurn }: { sessionId: string; onTurn: () => void }) {
  const [input, setInput] = useState('')

  const { messages, sendMessage, status } = useChat<TrailheadUIMessage>({
    id: sessionId, // a new id starts a new chat — and a new session in MongoDB
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // Only send the newest message: the server restores the transcript from MongoDB (Mode B).
      prepareSendMessagesRequest: ({ messages, id }) => ({ body: { message: messages[messages.length - 1], id } }),
    }),
    onFinish: onTurn,
  })

  const send = (text: string) => {
    if (!text.trim() || status === 'streaming' || status === 'submitted') return
    sendMessage({ text })
    setInput('')
  }

  return (
      <main className="flex min-h-0 flex-col">
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl">
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <h2 className="text-lg font-semibold">Plan a hike with Trailhead</h2>
                <p className="text-sm text-muted-foreground">Tell it about yourself, then start a new session — it still remembers you.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <Button key={s} variant="secondary" size="sm" className="h-auto whitespace-normal text-left" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </ConversationEmptyState>
            ) : (
              messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      // The memory package returns its tools as a generic ToolSet, so 'tool-memory' isn't in the
                      // inferred part union — match it by name.
                      if ((part.type as string) === 'tool-memory') {
                        const toolPart = part as unknown as ToolUIPart
                        return <MemoryTool key={toolPart.toolCallId} part={toolPart} />
                      }
                      switch (part.type) {
                        case 'text':
                          return <MessageResponse key={i}>{part.text}</MessageResponse>
                        case 'tool-suggestTrail':
                          return (
                            <Tool key={part.toolCallId}>
                              <ToolHeader type={part.type} state={part.state} title={`🗺️ Trails near ${part.input?.city ?? '…'}`} />
                              <ToolContent>
                                {part.state === 'output-available' &&
                                  part.output.trails.map((t) => (
                                    <p key={t.name} className="text-sm">
                                      <span className="font-medium">{t.name}</span> — {t.miles} mi, {t.elevationGainFt} ft, {t.difficulty}
                                    </p>
                                  ))}
                              </ToolContent>
                            </Tool>
                          )
                        default:
                          return null
                      }
                    })}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mx-auto w-full max-w-3xl p-4">
          <PromptInput onSubmit={({ text }) => send(text)}>
            <PromptInputBody>
              <PromptInputTextarea value={input} onChange={(e) => setInput(e.currentTarget.value)} placeholder="Ask Trailhead for a hike…" />
            </PromptInputBody>
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={!input.trim()} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </main>
  )
}
