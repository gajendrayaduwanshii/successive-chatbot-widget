import { normalizeContent } from "./content-normalizer";
import { detectIntent } from "./intent-detector";
import { rankContent } from "./relevance-score";
import { fetchAllPublishedContent } from "./successive-api";
import type { NormalizedContent } from "@/types/wordpress";

/** Retrieve and rank across every published Successive post, page and user. */
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
