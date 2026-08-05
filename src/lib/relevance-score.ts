import type { Intent } from "./intent-detector";
import type { NormalizedContent } from "@/types/wordpress";

const terms = (query: string) =>
  [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(
    (t) => t.length > 2,
  );
export function relevanceScore(
  item: NormalizedContent,
  query: string,
  intent: Intent,
): number {
  const queryTerms = terms(query);
  const title = item.title.toLowerCase();
  const excerpt = item.excerpt.toLowerCase();
  const content = item.plainText.toLowerCase();
  let score = queryTerms.reduce(
    (sum, term) =>
      sum +
      (title.includes(term) ? 6 : 0) +
      (excerpt.includes(term) ? 3 : 0) +
      (content.includes(term) ? 1 : 0),
    0,
  );
  if (title.includes(query.toLowerCase().trim())) score += 12;
  const expected: Partial<Record<Intent, string[]>> = {
    products: ["product"],
    product_detail: ["product", "page"],
    case_studies: ["case-studies", "case-study"],
    blogs: ["post"],
    resources: ["post", "page"],
    events: ["event"],
    contact: ["page"],
    about: ["page"],
  };
  if (expected[intent]?.includes(item.type)) score += 8;
  if (item.modified) {
    const age = Date.now() - new Date(item.modified).getTime();
    if (Number.isFinite(age))
      score += Math.max(0, 1 - age / (1000 * 60 * 60 * 24 * 365 * 5));
  }
  return score;
}

export function rankContent(
  items: NormalizedContent[],
  query: string,
  intent: Intent,
  max: number,
) {
  return items
    .map((item) => ({ ...item, score: relevanceScore(item, query, intent) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, max);
}
