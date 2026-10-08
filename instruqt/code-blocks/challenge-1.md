CODE_BLOCK_1
===
```typescript
mongo.db('admin').command({ ping: 1 })
```

CODE_BLOCK_2
===
```typescript
labDb.listCollections().toArray()
```

CODE_BLOCK_3
===
```typescript
(await col.indexes()).filter((i) => 'expireAfterSeconds' in i)
```

CODE_BLOCK_4
===
```typescript
col.listSearchIndexes().toArray()
```

CODE_BLOCK_5
===
```typescript
labDb.collection('semantic_memory').find({ user_id: 'alice' }).toArray()
```

CODE_BLOCK_6
===
```typescript
{
  index: 'semantic_vector_index',
  path: 'embedding',
  queryVector,
  numCandidates: 50,
  limit: 3,
  filter: { user_id: { $eq: 'alice' }, is_latest: { $eq: true } },
}
```

CODE_BLOCK_7
===
```typescript
{ _id: 0, name: 1, description: 1, score: { $meta: 'vectorSearchScore' } }
```

CODE_BLOCK_8
===
```typescript
labDb.collection('session_memory').find({ session_id: 'alice-s1' }).sort({ seq: 1 })
```
