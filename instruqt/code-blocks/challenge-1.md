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
