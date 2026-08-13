import { normalizeContent } from "./content-normalizer";
import { detectIntent } from "./intent-detector";
import { rankContent } from "./relevance-score";
import { fetchAllPublishedContent } from "./successive-api";
import type { NormalizedContent } from "@/types/wordpress";

/**
 * @deprecated Compatibility helper for older callers/tests. `/api/chat` uses
 * the profile-aware index in `search-retriever.ts`; do not add ranking logic
 * here.
 */
export async function retrieveContent(query: string): Promise<{
  intent: ReturnType<typeof detectIntent>;
  items: NormalizedContent[];
}> {
  const intent = detectIntent(query);
  const unique = [
    ...new Map(
      (await fetchAllPublishedContent()).map((item) => [
        `${item.type ?? "item"}:${item.id || item.link}`,
        item,
      ]),
    ).values(),
  ];
  return {
    intent,
    items: rankContent(unique.map(normalizeContent), query, intent, 8),
  };
}
