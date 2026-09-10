function normalizedLine(value: string): string {
  return value
    .replace(/^#{1,3}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeRepeatedWordLinks(answer: string): string {
  return answer.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)((?:\s+\[[^\]]+\]\(\2\))+)/g,
    (whole, firstLabel: string, url: string) => {
      const labels = [...whole.matchAll(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g)]
        .map((match) => match[1]);
      return `[${labels.join(" ")}](${url})`;
    },
  );
}

/** Removes a retrieved SEO/page title when it is used as the answer opening. */
export function sanitizeGroundedAnswerOpening(
  answer: string,
  sourceTitles: string[],
): string {
  const merged = mergeRepeatedWordLinks(answer.trim());
  const firstBreak = merged.indexOf("\n");
  const firstLine = firstBreak < 0 ? merged : merged.slice(0, firstBreak);
  const titles = new Set(sourceTitles.map(normalizedLine));
  if (!titles.has(normalizedLine(firstLine))) return merged;
  return (firstBreak < 0 ? "" : merged.slice(firstBreak + 1)).trim();
}

/** Removes only immediately repeated word/compound-token spans introduced at composition joins. */
export function collapseAdjacentDuplicateTerms(answer: string): string {
  const repeatedSpan = /\b([a-z0-9]+(?:-[a-z0-9]+){0,3}(?:\s+[a-z0-9]+(?:-[a-z0-9]+){0,3}){0,3})\s+\1\b/gi;
  let cleaned = answer;
  for (let pass = 0; pass < 2; pass += 1) cleaned = cleaned.replace(repeatedSpan, "$1");
  return cleaned;
}

/**
 * Composer text is untrusted presentation. Keep only route-validated body
 * destinations, while preserving the readable label/sentence when a Markdown
 * wrapper is malformed, root-collapsed, duplicated, or invented.
 */
export function retainValidatedInlineLinks(answer: string, allowedUrls: Iterable<string>): string {
  const allowed = new Set([...allowedUrls].filter((value) => {
    try {
      const url = new URL(value);
      return Boolean(url.pathname.replace(/\/+$/, ""));
    } catch {
      return false;
    }
  }));
  const cleanMarkdown = (value: string) => value.replace(
    /\[([^\]]+)\]\(([^\s)]+)(?:\s+[^)]*)?\)/g,
    (whole, label: string, url: string) => allowed.has(url) ? `[${label}](${url})` : label,
  );
  // Re-run once to unwrap malformed nested Markdown left by a broken closing
  // delimiter, then remove any remaining raw non-allow-listed destination.
  const flattened = cleanMarkdown(cleanMarkdown(answer));
  return flattened.replace(/https?:\/\/[^\s)\]]+/g, (url) => allowed.has(url) ? url : "");
}
