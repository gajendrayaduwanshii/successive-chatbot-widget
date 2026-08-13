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
