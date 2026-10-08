CODE_BLOCK_9
===
```typescript
{ $match: { session_id: 'bob-s1' } },
{ $group: { _id: '$role', turns: { $sum: 1 } } },
```

CODE_BLOCK_10
===
```typescript
labDb.collection('episodic_memory').find({ user_id: 'alice' }).sort({ importance: -1 })
```

CODE_BLOCK_11
===
```typescript
labDb.collection('semantic_memory').find({ user_id: 'alice' }).sort({ timestamp: 1 })
```

CODE_BLOCK_12
===
```typescript
labDb.collection('semantic_memory').find({ user_id: 'alice', expire_at: { $lte: new Date() } })
```
