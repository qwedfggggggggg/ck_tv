# Phase 3: Playback Reliability — Implementation Plan

## Scope

3 tasks, each in its own file(s). No shared state, can parallelize.

| Task | File | Description |
|------|------|-------------|
| 6 | `src/app/api/verify-url/route.ts` + `EpisodeSelector.tsx` | HEAD-check m3u8 before play, show green/red dot |
| 7 | `src/app/play/page.tsx` | HLS/Artplayer error → auto-try alternative source's same episode |
| 8 | `src/lib/downstream.ts` | `extractM3u8Urls()` multi-strategy: `$url`, bare `.m3u8`, text scan |

## Rationale

- **Task 6 (pre-check):** dead m3u8 links are common. Showing a status dot before click saves user frustration.
- **Task 7 (auto-fallback):** HLS.js errors (server timeout, 403, corrupted segments) happen mid-playback. Manual source switching is 4-5 clicks. Auto-fallback keeps watching seamless.
- **Task 8 (format detection):** Some sources use `$$url` or bare `https://...m3u8` without `$` prefix. Multi-strategy parser improves recall.

## Task Details

### Task 6: Pre-playback URL Check

**NEW** `src/app/api/verify-url/route.ts`:
- Edge Worker (no heavy deps)
- Parse `url` from searchParams
- `fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })`
- Return `{ alive: boolean, status: number }`
- Cache in a module-level Map with 60s TTL

**MODIFY** `src/components/EpisodeSelector.tsx`:
- After user clicks an episode, fire verify API call
- Simplify: hover-to-check or click-to-check approach
- Show a small colored dot next to episode number: 🔴(checking) 🟢(alive) 🔴(dead)
- Use `useEffect` with debounce to avoid excessive API calls

### Task 7: Auto Fallback on Playback Failure

**MODIFY** `src/app/play/page.tsx`:
- In Artplayer error handler, when error occurs:
  - Log the failed source URL
  - Check if `availableSources` has other sources with same episode index
  - Iterate: for each alternative source, check if `episodes[currentEpisodeIndex]` exists
  - If yes, switch player to that URL (`player.switch = newUrl`)
  - Show brief overlay "Trying alternative source..." (optional toast)
  - Track attempted sources to avoid infinite loops
- Fallback chain priority: different source > same source (if multi-quality)

### Task 8: m3u8 Format Detection

**MODIFY** `src/lib/downstream.ts`:
- Replace inline per-function regex with shared `extractM3u8Urls(text: string): string[]`
- Multi-strategy:
  1. Try `$https?://...m3u8` (current, most common)
  2. Try `https?://...m3u8` (bare URL, no `$`)
  3. Try any `https?://...\.(m3u8|ts|mp4)` in text
- Call from both `searchFromApi` and `getDetailFromApi`
- Keep dedup via `Set`

## Order

Dispatch all 3 in parallel since files are independent:
- Task 6 (verify-url route + EpisodeSelector)
- Task 7 (play page)
- Task 8 (downstream.ts)

Deploy single commit at end.
