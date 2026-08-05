const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(
      /&([a-z]+);/gi,
      (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity,
    );
}

export function htmlToText(value = ""): string {
  return decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(p|div|section|article|h[1-6]|li|br|tr)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converts WordPress HTML into clean paragraphs instead of one flattened blob.
 * Keeping these boundaries lets retrieval create overlapping chunks without
 * separating a heading from the paragraph that explains it.
 */
export function htmlToParagraphs(value = ""): string[] {
  const withBoundaries = decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<\/?(p|div|section|article|h[1-6]|li|br|tr|blockquote)[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ");
  return withBoundaries
    .split(/\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function extractUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s"'<>()[\]]+/gi) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:]$/, "")))];
}

export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return;
  }
}
