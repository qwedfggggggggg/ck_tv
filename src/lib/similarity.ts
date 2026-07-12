export function trigramSimilarity(a: string, b: string): number {
  const trigramsA = new Set<string>();
  for (let i = 0; i < a.length - 2; i++) trigramsA.add(a.slice(i, i + 3));
  if (trigramsA.size === 0) return a === b ? 1 : 0;

  let matchCount = 0;
  for (let i = 0; i < b.length - 2; i++) {
    if (trigramsA.has(b.slice(i, i + 3))) matchCount++;
  }
  return matchCount / trigramsA.size;
}

export interface GroupOptions {
  threshold?: number;      // default 0.85
  requireSameYear?: boolean; // default true
  requireSameType?: boolean; // default true (movie=1ep vs tv=multi-ep)
}

export function groupSimilar<T extends { title: string; year?: string; episodes?: any[] }>(
  items: T[],
  options: GroupOptions = {}
): T[][] {
  const { threshold = 0.85, requireSameYear = true, requireSameType = true } = options;
  const groups: T[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const group: T[] = [items[i]];
    used.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (requireSameYear && items[i].year !== items[j].year) continue;
      if (requireSameType) {
        const typeI = (items[i].episodes?.length ?? 0) > 1 ? 'tv' : 'movie';
        const typeJ = (items[j].episodes?.length ?? 0) > 1 ? 'tv' : 'movie';
        if (typeI !== typeJ) continue;
      }
      const score = trigramSimilarity(
        items[i].title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ''),
        items[j].title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
      );
      if (score >= threshold) {
        group.push(items[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}
