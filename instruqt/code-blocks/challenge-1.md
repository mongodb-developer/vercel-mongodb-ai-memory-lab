CODE_BLOCK_1
===
```typescript
{
  uri: MONGODB_URI,
  embedder,
  topology: { dbName: DB_NAME },
}
```

CODE_BLOCK_2
===
```typescript
await mongodbMemory.connect()
```

CODE_BLOCK_3
===
```typescript
mongodbMemory({ userId: 'alice', sessionId: 'alice-s1' })
```

CODE_BLOCK_4
===
```typescript
...mongodbMemory({ userId, sessionId })
```

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

CODE_BLOCK_12
===
```typescript
{ mode: 'ttl+importance', ttlSeconds: 7 * 86_400, minImportance: 7 }
```

CODE_BLOCK_13
===
```typescript
minImportance: 4,
```

CODE_BLOCK_14
===
```typescript
{ semantic: ['tenant_id'], episodic: ['tenant_id'] }
```
