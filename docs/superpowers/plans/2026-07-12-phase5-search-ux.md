# Phase 5: Search UX — Implementation Plan

## Scope

| Task | Design Ref | Files | Description | Effort |
|------|-----------|-------|-------------|--------|
| 13 | 5.3 | search/page.tsx | Empty fallback chain when 0 results | Small |
| 14 | 5.1 | search/route.ts + search/page.tsx | Progressive batched results | Medium |
| – | 5.2 | – | Hot query cache (requires Redis, deferred) | Deferred |

## Task Details

### Task 13: Smart Empty Fallback (5.3)
When search returns 0 results, client-side fallback chain:
1. Original query → if empty, strip year pattern (e.g. "权力的游戏 2024" → "权力的游戏")
2. If still empty, strip subtype keywords (e.g. "动漫" removed)
3. If still empty, try fuzzy removing one character at a time from the end
4. Show a note to user: "未找到 'xxx' 的结果，已尝试模糊搜索"

Modify `src/app/search/page.tsx` `fetchSearchResults` function.

### Task 14: Progressive Results (5.1)
The current search API waits for ALL sources (up to 60s timeout). Change to:
1. Server: accept `?batch=N` and `?sources=key1,key2` params to allow sub-queries
2. Client: split sources into batches (~5 sources per batch), fetch sequentially
3. Show results as each batch arrives (append to existing results)
4. First batch renders within 2-3s instead of waiting for all 53 sources

### Deferred
Task 15 (5.2): Upstash/Redis cache. Infrastructure-dependent.
