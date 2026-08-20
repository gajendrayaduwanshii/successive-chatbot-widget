import { describe, expect, it } from "vitest";
import { buildSearchDocument } from "./search-index";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { alignedCta, documentContentType, selectAlignedSecondaryMatches } from "./response-alignment";
import type { SearchMatch } from "./search-retriever";

function match(title: string, slug: string, body: string, type = "page", score = 120, modified = "2026-01-01"): SearchMatch {
  const document = buildSearchDocument({
    id: Math.floor(Math.random() * 1_000_000), type, slug, modified,
    link: `https://successive.tech/${slug}/`, title: { rendered: title },
    content: { rendered: `<p>${body}</p>` },
  });
  return { document, score, matchedFields: ["title", "topic-profile"], selectedPassages: [body], confidence: "high" };
}

describe("user-visible response alignment", () => {
  it("keeps API educational secondary content and rejects neighboring Node.js content", () => {
    const understanding = buildDeterministicUnderstanding("What is an API?");
    const api = match("API Development Services", "api-development-services", "API development, integration, and management.");
    const node = match("Node.js Development Company", "nodejs-development-company", "Node.js applications use APIs.", "page", 150);
    const result = selectAlignedSecondaryMatches({ matches: [node, api], understanding });
    expect(result.primary?.document.title).toBe("API Development Services");
    expect(result.related).toHaveLength(0);
    expect(result.rejected).toContainEqual({ title: "Node.js Development Company", reason: "not independently same-topic" });
    expect(alignedCta(result.primary, understanding)).toBeUndefined();
  });

  it("enforces explicit content types and derives a CTA from the selected record", () => {
    const understanding = buildDeterministicUnderstanding("Show me AI blogs");
    const blog = match("Practical AI Adoption", "practical-ai-adoption", "AI adoption guidance.", "post");
    const service = match("AI Development Company", "ai-development-company", "AI development services.");
    const result = selectAlignedSecondaryMatches({ matches: [service, blog], understanding });
    expect(result.primary?.document.title).toBe("Practical AI Adoption");
    expect(documentContentType(result.primary!.document)).toBe("blog");
    expect(alignedCta(result.primary, understanding)).toContain("Read the full article");
  });

  it("distinguishes webinars from events and sorts latest records by date", () => {
    const understanding = buildDeterministicUnderstanding("Latest AI webinar");
    const older = match("AI Webinar 2025", "ai-webinar-2025", "AI webinar.", "webinar", 150, "2025-06-01");
    const newer = match("AI Webinar 2026", "ai-webinar-2026", "AI webinar.", "webinar", 110, "2026-06-01");
    const event = match("AI Summit", "ai-event", "AI event.", "event", 180, "2026-07-01");
    const result = selectAlignedSecondaryMatches({ matches: [event, older, newer], understanding });
    expect(result.primary?.document.title).toBe("AI Webinar 2026");
    expect(result.rejected.some((item) => item.title === "AI Summit")).toBe(true);
  });

  it("recognizes every newly separated deterministic content type", () => {
    expect(buildDeterministicUnderstanding("Healthcare whitepaper").requestedContentType).toBe("whitepaper");
    expect(buildDeterministicUnderstanding("Healthcare ebook").requestedContentType).toBe("ebook");
    expect(buildDeterministicUnderstanding("AI webinar").requestedContentType).toBe("webinar");
    expect(buildDeterministicUnderstanding("AI event").requestedContentType).toBe("event");
    expect(buildDeterministicUnderstanding("Latest press release").requestedContentType).toBe("press-release");
    expect(buildDeterministicUnderstanding("Kagen VOICE").requestedContentType).toBe("kagen-product");
  });
});
