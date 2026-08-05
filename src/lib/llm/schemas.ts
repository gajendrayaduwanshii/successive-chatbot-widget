import { z } from "zod";

export const cardSchema = z.object({
  type: z.enum(["product", "case-study", "blog", "event", "page"]),
  title: z.string().min(1).max(200),
  description: z.string().max(500),
  url: z.string().url(),
  image: z.string().url().optional(),
  badge: z.string().max(50).optional(),
});
export const assistantResponseSchema = z.object({
  answer: z.string().min(1).max(8000),
  cards: z.array(cardSchema).max(6).default([]),
  suggestions: z.array(z.string().min(2).max(160)).max(4).default([]),
  sources: z
    .array(
      z.object({ title: z.string().min(1).max(200), url: z.string().url() }),
    )
    .max(6)
    .default([]),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  insufficientContext: z.boolean().optional(),
});
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

export function normalizeAssistantResponse(value: unknown) {
  const input =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const cards = Array.isArray(input.cards)
    ? input.cards.flatMap((value) => {
        if (typeof value !== "object" || value === null) return [];
        const card = value as Record<string, unknown>;
        const normalized = {
          ...card,
          title: typeof card.title === "string" ? card.title.slice(0, 200) : "",
          description:
            typeof card.description === "string"
              ? card.description.slice(0, 500)
              : "",
          badge:
            typeof card.badge === "string"
              ? card.badge.slice(0, 50)
              : undefined,
        };
        const parsed = cardSchema.safeParse(normalized);
        if (parsed.success) return [parsed.data];

        // An invalid optional image must not discard an otherwise valid
        // WordPress result card.
        const withoutImage = cardSchema.safeParse({
          ...normalized,
          image: undefined,
        });
        return withoutImage.success ? [withoutImage.data] : [];
      })
    : [];
  const sources = Array.isArray(input.sources)
    ? input.sources.flatMap((value) => {
        if (typeof value !== "object" || value === null) return [];
        const source = value as Record<string, unknown>;
        const parsed = z
          .object({
            title: z.string().min(1).max(200),
            url: z.string().url(),
          })
          .safeParse({
            title:
              typeof source.title === "string"
                ? source.title.slice(0, 200)
                : "",
            url: source.url,
          });
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  return assistantResponseSchema.safeParse({
    ...input,
    answer: typeof input.answer === "string" ? input.answer.slice(0, 8000) : "",
    cards: cards.slice(0, 6),
    suggestions: Array.isArray(input.suggestions)
      ? input.suggestions
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.slice(0, 160))
          .filter((value) => value.trim().length >= 2)
          .slice(0, 4)
      : [],
    sources: sources.slice(0, 6),
  });
}

export function filterResponseUrls(
  response: AssistantResponse,
  allowed: Set<string>,
): AssistantResponse {
  const canonical = (url: string) => {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname.replace(/\/$/, "")}${u.search}`;
    } catch {
      return "";
    }
  };
  const valid = new Set([...allowed].map(canonical));
  return {
    ...response,
    cards: response.cards
      .filter((card) => valid.has(canonical(card.url)))
      .map((card) => ({
        ...card,
        image:
          card.image && valid.has(canonical(card.image))
            ? card.image
            : undefined,
      })),
    sources: response.sources.filter((source) =>
      valid.has(canonical(source.url)),
    ),
  };
}
