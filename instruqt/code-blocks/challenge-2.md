CODE_BLOCK_5
===
```typescript
{ dbName: DB_NAME, hideToolCommands: ['session'] }
```

CODE_BLOCK_6
===
```typescript
mongodbMemoryB.loadSession({ userId, sessionId })
```

CODE_BLOCK_7
===
```typescript
experimental_context: { userId, sessionId, prompt },
```

CODE_BLOCK_8
===
```typescript
mongodbMemoryB.onFinish()
```

CODE_BLOCK_9
===
```typescript
store.scratchpadPromote(String(noteId), 'alice', 'preference', { importance: 6 })
```

CODE_BLOCK_10
===
```typescript
{ source: 'human_expert', importance: 9 }
```

CODE_BLOCK_11
===
```typescript
await store.forget('semantic', String(gymFact!._id))
```
