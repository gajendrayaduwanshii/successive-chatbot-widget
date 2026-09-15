import type { NormalizedContent } from "@/types/wordpress";

export const MAX_RELATED_CONTEXT_CHARS = 3000;

export interface CompactRelatedContext {
  id: number;
  type: string;
  title: string;
  excerpt: string;
  content: string;
  url: string;
  image?: string;
  modified?: string;
}

function clean(value: string, limit: number): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

/** Keeps ranked metadata intact while admitting only deduplicated useful text
 * that fits as a complete, valid JSON payload under the internal budget. */
export function compactRelatedContext(items: NormalizedContent[]): CompactRelatedContext[] {
  const output: CompactRelatedContext[] = [];
  const seenText = new Set<string>();
  for (const item of items) {
    const excerpt = clean(item.excerpt, 320);
    const contentCandidate = clean(item.plainText, 900);
    const contentKey = contentCandidate.toLowerCase();
    const base: CompactRelatedContext = {
      id: item.id, type: clean(item.type, 80), title: clean(item.title, 200),
      excerpt: seenText.has(excerpt.toLowerCase()) ? "" : excerpt,
      content: seenText.has(contentKey) ? "" : contentCandidate,
      url: item.url, image: item.image, modified: item.modified,
    };
    let candidate = base;
    while (JSON.stringify([...output, candidate]).length > MAX_RELATED_CONTEXT_CHARS && candidate.content.length)
      candidate = { ...candidate, content: candidate.content.slice(0, Math.max(0, candidate.content.length - 100)) };
    while (JSON.stringify([...output, candidate]).length > MAX_RELATED_CONTEXT_CHARS && candidate.excerpt.length)
      candidate = { ...candidate, excerpt: candidate.excerpt.slice(0, Math.max(0, candidate.excerpt.length - 80)) };
    if (JSON.stringify([...output, candidate]).length > MAX_RELATED_CONTEXT_CHARS) break;
    output.push(candidate);
    if (candidate.excerpt) seenText.add(candidate.excerpt.toLowerCase());
    if (candidate.content) seenText.add(candidate.content.toLowerCase());
  }
  return output;
}
