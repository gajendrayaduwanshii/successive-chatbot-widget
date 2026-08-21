import { describe, expect, it } from "vitest";
import { compactRelatedContext, MAX_RELATED_CONTEXT_CHARS } from "./related-context";

describe("related evidence context budget", () => {
  it("keeps complete ranked records under 3000 characters without truncating JSON", () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1, type: "page", slug: `page-${index}`, title: `Ranked page ${index}`,
      excerpt: `<p>${"useful evidence ".repeat(80)}</p>`, plainText: `${"detailed evidence ".repeat(160)} ${index}`,
      url: `https://example.test/page-${index}/`, image: `https://example.test/image-${index}.jpg`,
      modified: "2026-08-21T00:00:00Z", acfText: "", extractedUrls: [],
    }));
    const compact = compactRelatedContext(items);
    const serialized = JSON.stringify(compact);
    expect(serialized.length).toBeLessThanOrEqual(MAX_RELATED_CONTEXT_CHARS);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(compact[0]).toMatchObject({ id: 1, type: "page", title: "Ranked page 0", url: "https://example.test/page-0/" });
    expect(serialized).not.toContain("<p>");
  });

  it("deduplicates repeated evidence while preserving document metadata", () => {
    const base = { type: "page", excerpt: "Same excerpt", plainText: "Same body", image: undefined,
      modified: undefined, acfText: "", extractedUrls: [] as string[] };
    const compact = compactRelatedContext([
      { ...base, id: 1, slug: "one", title: "One", url: "https://example.test/one" },
      { ...base, id: 2, slug: "two", title: "Two", url: "https://example.test/two" },
    ]);
    expect(compact).toHaveLength(2);
    expect(compact[1]).toMatchObject({ title: "Two", excerpt: "", content: "" });
  });
});
