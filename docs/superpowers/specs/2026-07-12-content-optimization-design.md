# Content-Side Optimization Design

## Overview

Systematic improvement of CKTV's content pipeline: from source health monitoring → search result quality → playback reliability → metadata richness → search UX. All phases share the goal of making video discovery and playback faster, more accurate, and more reliable.

## Phase 1: Source Health System

### 1.1 Auto Dead Source Degradation

**Current:** Binary dead/alive via `dead-source-cache.ts`. Sources are either skipped (if in dead set) or tried (if not). The set is populated only by `/api/health` which runs on-demand. Within a single worker instance the cache has 10-min TTL.

**Target:** Continuous scoring model. Each source accumulates a `reliability` score [0,1] updated on every search attempt.

**Architecture:**

```
search/route.ts
  → per source: searchFromApi() returns success|timeout|empty
  → SourceHealthTracker.record(key, result) updates score
  → search filter: skip sources where score < threshold (default 0.3)

SourceHealthTracker (dead-source-cache.ts)
  - Map<string, { score: number, attempts: number, lastChecked: number }>
  - record(key, success): score = score * 0.9 + (success ? 0.1 : -0.05), clamped [0,1]
  - getScore(key): returns score, with time-decay: score -= elapsedHours * 0.02 (min 0)
  - Only sources with score < 0.3 AND attempts >= 3 are skipped
```

**Cache persistence:** Module-level Map (best-effort on Cloudflare Workers). No external storage for Phase 1.

**Changes:**
- `src/lib/dead-source-cache.ts` — rewrite with scoring model, export `recordSearchResult` and `getReliabilityScore`
- `src/app/api/search/route.ts` — call `recordSearchResult` after each `Promise.allSettled`
- `src/app/api/health/route.ts` — seed scores from health results (dead=0, ok=0.9, slow=0.5)

### 1.2 Health Feedback Loop

**Current:** `/api/health` returns one-shot status. No history, no trends.

**Target:** Admin panel "Source Health" tab shows per-source status over time.

**Scope for Phase 1:** Enhanced health response with per-source details inline. Historical tracking deferred to later phase (requires persistent storage).

**Changes:**
- `src/app/api/health/route.ts` — improved error classification: distinguish timeout vs connection refused vs non-JSON response
- Admin panel health tab already exists (`HealthStatus` component) — add source count summary and status distribution chart (simple colored bars)

### 1.3 Source Warm-up (Deferred)

Deferred to post-Phase 1. Requires persistent storage for popular query tracking.

## Phase 2: Search Result Quality

### 2.1 Fuzzy Dedup

**Current:** `normalizeKey()` in `search/page.tsx` strips all non-word chars + lowercases. Exact match only. "黑客帝国" and "黑客帝国 1" are different groups.

**Target:** Similarity-based grouping. Use trigram similarity or Levenshtein distance (normalized). Group items where similarity > 0.85.

**Implementation:**
```typescript
// src/lib/similarity.ts
function trigramSimilarity(a: string, b: string): number
function groupSimilar(items: SearchResult[]): SearchResult[][]
```

**Changes:**
- `src/lib/similarity.ts` — new file with `trigramSimilarity` and `groupSimilar`
- `src/app/search/page.tsx` — replace `normalizeKey` group with `groupSimilar` in `useMemo`
- Keep year+type as secondary grouping keys (same year required for grouping)

### 2.2 Version Differentiation

**Current:** All sources for the same video are merged into one group card.

**Target:** Card shows one primary result. "Available from N sources" badge expands to show source list. User can pick which source's version to play.

**Changes:**
- `src/components/VideoCard.tsx` — add source selector dropdown/popover within card
- `src/app/search/page.tsx` — group data structure carries per-source variant info

### 2.3 Confidence Scoring

**Current:** Sort by: exact title match > source count > year desc > alpha.

**Target:** Weighted score per group:
- Source reliability score (from Phase 1) × 0.3
- Title match quality (exact=1.0, fuzzy>.85=0.7) × 0.25
- Year has valid value × 0.15
- Has poster image × 0.1
- Has episodes × 0.1
- Source count × 0.1

**Changes:**
- `src/app/search/page.tsx` — add `computeGroupScore()` function, sort by score desc

### 2.4 Pagination Dedup

**Current:** `downstream.ts` fetches N pages (default 5) per source. Results across pages are concatenated without dedup. Overlap is possible.

**Target:** Dedup within each source's multi-page results using `vod_id` as key.

**Changes:**
- `src/lib/downstream.ts` — in `searchFromApi()`, track seen `vod_id`s across pages, skip duplicates

## Phase 3: Playback Reliability

### 3.1 Pre-playback URL Check

**Current:** Episode URLs are displayed in `EpisodeSelector` without verification. Dead URLs only discovered when user clicks and HLS fails.

**Target:** When user selects an episode, HEAD-request the m3u8 URL in background. Show green/red indicator.

**Implementation:**
- `src/app/api/verify-url/route.ts` — Edge Worker, HEAD request with 5s timeout, returns `{ alive: boolean, status: number }`
- `src/components/EpisodeSelector.tsx` — call verify API on episode select, show status icon
- Cache verification results per URL for 60s (avoids repeated checks)

### 3.2 Auto Fallback on Playback Failure

**Current:** When HLS playback fails, error is logged. No auto-recovery.

**Target:** Artplayer error handler checks if alternative sources have the same episode. If yes, switch transparently (with a brief "Trying alternative source..." overlay).

**Changes:**
- `src/app/play/page.tsx` — in player error handler, iterate over available `sourceEpisodes` entries, find alternative m3u8, call `player.switchUrl(newUrl)`
- Fallback chain: same source different quality > same source any episode > different source

### 3.3 m3u8 Format Detection

**Current:** Regex `\$(https?:\/\/[^"'\s]+?\.m3u8)` extracts URLs. Only matches `$`-prefixed m3u8 paths. Some sources use other separators (`#`, `$$`, no prefix).

**Target:** Multi-strategy parser:
1. Try `$url` pattern first (current, most common)
2. Fallback to `$url.m3u8` without the `$` prefix requirement
3. Fallback to bare m3u8 URL extraction from any text segment

**Changes:**
- `src/lib/downstream.ts` — replace single regex with multi-strategy `extractM3u8Urls(text: string)` in both `searchFromApi` and `getDetailFromApi`

## Phase 4: Metadata Enrichment

### 4.1 Episode Name Preservation

**Current:** `vod_play_url` format `第1集$url#第2集$url` — name part ("第1集") is parsed but discarded. Only URL is kept.

**Target:** Episode data structure becomes `{ name: string, url: string }[]`. EpisodeSelector displays names.

**Changes:**
- `src/lib/types.ts` — change `SearchResult.episodes` from `string[]` to `{ name: string, url: string }[]`
- `src/lib/downstream.ts` — parse `name$url` pairs
- `src/components/EpisodeSelector.tsx` — display episode names
- `src/app/play/page.tsx` — update player URL access

### 4.2 Douban ID Backfill

**Current:** `vod_douban_id` field exists in `SearchResult`. Many sources don't provide it.

**Target:** After search, for results missing douban_id, spawn background douban API lookup by title+year. Store result in group-level metadata.

**Changes:**
- `src/app/api/search/route.ts` — optional post-search enrichment step (fire-and-forget, does not delay response)
- `src/app/search/page.tsx` — accept enriched data when available

### 4.3 Remark Display

**Current:** `vod_remarks` (e.g. "更新至12集", "完结") is fetched from source but discarded in `searchFromApi`.

**Target:** Include `vod_remarks` in `SearchResult`. Display in `VideoCard` subtitle area.

**Changes:**
- `src/lib/downstream.ts` — add `vod_remarks` mapping
- `src/lib/types.ts` — add optional `remark: string` to `SearchResult`
- `src/components/VideoCard.tsx` — show remark in metadata row

### 4.4 Cross-Source Episode Merge

**Current:** Each source has its own episode list. User manually switches sources to find a working one.

**Target:** Merge episode lists from all sources for the same video into one unified list. When displaying, prefer URLs from most reliable source.

**Changes:**
- `src/app/play/page.tsx` — in source processing, merge episodes across all matches for the same video
- Display source origin per episode (to distinguish)

## Phase 5: Search UX

### 5.1 Progressive Results

**Current:** Search waits for all sources to return (or time out) before rendering.

**Target:** Show partial results as they arrive. First results within 1-2 seconds.

**Changes:**
- `src/app/api/search/route.ts` — cannot stream from Edge Worker easily. Alternative: client-side progressive fetch (split sources into batches, fetch sequentially, render each batch)
- `src/app/search/page.tsx` — batching logic

### 5.2 Hot Query Cache

**Current:** Only per-query in-memory cache (60s TTL). Cold for every new instance.

**Target:** Upstash/Redis cache for popular queries. TTL 5-10 min.

**Changes:**
- `src/app/api/search/route.ts` — optional Upstash integration (gated on `process.env.UPSTASH_REDIS_REST_URL`)
- `src/lib/config.ts` — add cache backend config

### 5.3 Smart Empty Fallback

**Current:** Search returns empty `{ results: [] }` with no fallback.

**Target:** Client-side empty state tries progressive fallbacks: strip year → strip subtype → fuzzy char-by-char.

**Changes:**
- `src/app/search/page.tsx` — fallback chain logic in `fetchSearchResults`

## Phase 6-7: Douban & Config

(Deferred until Phases 1-5 are stable.)

## File Change Summary

| File | Phase | Change |
|------|-------|--------|
| `src/lib/dead-source-cache.ts` | 1 | Scoring model, record/query API |
| `src/app/api/search/route.ts` | 1,2,4 | Record source results, post-search enrichment |
| `src/app/api/health/route.ts` | 1 | Error classification, seed scores |
| `src/lib/similarity.ts` | 2 | New: trigram similarity + grouping |
| `src/app/search/page.tsx` | 2,5 | Fuzzy group, confidence sort, progressive, empty fallback |
| `src/components/VideoCard.tsx` | 2,4 | Source selector, remark display |
| `src/app/api/verify-url/route.ts` | 3 | New: HEAD-check m3u8 URLs |
| `src/components/EpisodeSelector.tsx` | 3,4 | Status indicator, episode names |
| `src/app/play/page.tsx` | 3,4 | Auto fallback, episode name support |
| `src/lib/downstream.ts` | 2,3,4 | Format detection, pagination dedup, episode names, remark |
| `src/lib/types.ts` | 4 | Episode type change, remark field |
