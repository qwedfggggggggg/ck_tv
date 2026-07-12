# Phase 4: Metadata Enrichment — Implementation Plan

## Scope

4 tasks across 2 files shared (types.ts, downstream.ts) + 3 files unique.

| Task | Design Ref | Files | Description |
|------|-----------|-------|-------------|
| 9 | 4.3 | downstream.ts + types.ts + VideoCard.tsx | Map `vod_remarks` → `SearchResult.remark`, show in VideoCard |
| 10 | 4.1 | types.ts + downstream.ts + play/page.tsx + EpisodeSelector.tsx | `episodes: string[]` → `{name,url}[]`, display names in selector |
| 11 | 4.2 | search/route.ts + types.ts | Post-search fire-and-forget douban_id enrichment via `/api/douban` |
| 12 | 4.4 | play/page.tsx + EpisodeSelector.tsx | Merge episodes from all sources, show source origin per episode |

## Execution Order

**Wave 1 (parallel):** Task 9 + Task 11
- 9 touches downstream.ts + types.ts + VideoCard.tsx
- 11 touches search/route.ts + types.ts
- Both additive to types.ts (new fields), no conflict

**Wave 2:** Task 10
- Changes episodes type - must be after 9 to avoid merge conflicts on types.ts
- Touches 4 files: types.ts, downstream.ts, play/page.tsx, EpisodeSelector.tsx

**Wave 3:** Task 12
- Depends on 10's new episode type
- play/page.tsx merge logic

## Implementation Details

### Task 9: Remark Display (4.3)
- types.ts: add `remark?: string` to `SearchResult`
- downstream.ts: in all 3 mapping locations (searchFromApi x2, getDetailFromApi), add `remark: item.vod_remarks`
- VideoCard.tsx: show remark in the info line (below year/type), small text, e.g. `{remark}` next to episodes count
- PlayPageClient: no change needed (remark flows through SearchResult)

### Task 10: Episode Name Preservation (4.1)
- types.ts: change `episodes: string[]` → `episodes: {name: string, url: string}[]`
- downstream.ts: update all 3 mapping locations, parse `name$url` → `{name, url}`
- play/page.tsx: update every `detail.episodes[episodeIndex]` → `detail.episodes[episodeIndex].url`, also `source.episodes[1]` → `source.episodes[1]?.url`, `episodeUrls={detail?.episodes}` still works (it's an array)
- EpisodeSelector.tsx: show `episodeUrls[episodeNumber]` name text if available, fallback to number
- search route: episodes pass through untouched

### Task 11: Douban Backfill (4.2)
- After search completes, for all results missing `douban_id`, spawn a fire-and-forget `/api/douban?q=title&year=year` lookup
- Since `search/route.ts` can't easily do async background processing in Workers, simpler approach:
  - In the search route after filtering, dedup by title, for each unique title without douban_id, fetch douban API
  - But this blocks the response. Alternative: add `douban_id` as optional post-search enrichment that doesn't block
  - **Simpler approach:** In `src/app/search/page.tsx`, after receiving search results, fire douban enrichment in a separate effect for results missing douban_id. This doesn't delay the search response.
- The douban route needs a lookup-by-title endpoint (doesn't exist yet - current route only browses by tag/top250)

### Task 12: Cross-Source Episode Merge (4.4)
- In play/page.tsx, when multiple sources are available for the same video:
  - If sources have the same episode structure (same `vod_id` or same episode count + name pattern), merge into one unified list
  - Each merged entry shows source origin
- EpisodeSelector: when showing merged episodes, tag each with source badge

## Risks
- Task 10 type change is breaking: old cached `SearchResult` objects (from API or localStorage) have `string[]` episodes. Code handles non-matching gracefully if we use optional chaining.
- Task 11 douban lookup could be slow. Must not block search response.
- Task 12 complexity: identifying "same video" across sources is heuristic-based.
