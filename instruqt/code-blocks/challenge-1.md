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
[...history, { role: 'user', content: prompt }]
```

CODE_BLOCK_8
===
```typescript
mongodbMemoryB.onFinish({ userId, sessionId, prompt })
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

### Part 7 · Ship it: run these once in the Terminal

[button label="Open the Terminal"](tab-1)

1. Sign in to Vercel (open the link it prints, then come back):

```run
vercel login
```

2. Accept the MongoDB Atlas Marketplace terms (first Atlas install on your Vercel account):

```run
vercel integration accept-terms mongodbatlas
```

3. Back in the notebook, set `DEPLOY_NOW = true` in the Part 7 cell and run it. Or deploy from the Terminal instead
   (your `AI_GATEWAY_API_KEY` is copied to the Vercel project):

```run
cd /root/labs/vercel-mongodb-ai-memory-lab && ./deploy/deploy.sh
```
