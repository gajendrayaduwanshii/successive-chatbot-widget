import { describe, expect, it } from "vitest";
import type { WordPressItem } from "@/types/wordpress";
import { answerStructuredRequest, understandStructuredRequest } from "./structured-knowledge";
import { buildSearchDocument } from "./search-index";

const page = (id: number, slug: string, title: string, acf: Record<string, unknown>): WordPressItem => ({
  id, type: "page", slug, link: `https://example.test/${slug}/`,
  title: { rendered: title }, acf: acf as WordPressItem["acf"],
});

const corpus: WordPressItem[] = [
  page(99, "how-we-work", "How We Work", {
    core_values: [{ heading: "Delivery", description: "A delivery principle." }],
  }),
  page(1, "about-us", "About Us", {
    core_values: [{ heading: "Curiosity", description: "We keep learning." }],
    executive_management: [{ name: "Aarav Malhotra", desgnation: "Director of Engineering" }],
    certifications: [{ image: { url: "https://example.test/cert.png", alt: "Example Quality Standard" } }],
  }),
  page(2, "global-capabilities", "Global Capabilities", {
    capabilities_categories: [{ inner_title: "Application Engineering", short_description: "Build resilient digital products.", logo_repeater: [{ logo: { url: "https://example.test/runtime.svg", alt: "Example Runtime" } }] }],
  }),
  page(3, "partners", "Partners & Alliances", {
    partnerships_repeater: [{ acf_repeater: "Cloud Alliances", partnerships_logos: [{ logo: { url: "https://example.test/partner.svg", alt: "Example Cloud" } }] }],
  }),
];

describe("structured API knowledge", () => {
  it.each([
    ["What are your core values?", "values"],
    ["What is Global Capabilities?", "capabilities"],
    ["Any partnership?", "partners"],
    ["Who is Aarav Malhotraa in Successive?", "person"],
    ["Who is Aarav Malhotraa?", "person"],
    ["Aarav Malhotra", "person"],
  ] as const)("classifies %s", (query, attribute) => {
    expect(understandStructuredRequest(query)?.attribute).toBe(attribute);
  });

  it("returns a fuzzy-matched API team member with their designation", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Who is Aarav Malhotraa in Successive?")!);
    expect(result?.answer).toContain("Aarav Malhotra");
    expect(result?.answer).toContain("Director of Engineering");
    expect(result?.document.role).toBe("company");
  });

  it("returns the designation when the company name is omitted", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Who is Aarav Malhotra?")!);
    expect(result?.answer).toBe("**Aarav Malhotra** is listed as **Director of Engineering** in Successive’s executive management section.");
  });

  it("resolves a bare team-member name from the API record", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Aarav Malhotra")!);
    expect(result?.answer).toContain("Director of Engineering");
  });

  it("does not fabricate a record for an unmatched bare name", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Unknown Person")!);
    expect(result).toBeNull();
  });

  it("keeps structured facts within their canonical API pages", () => {
    const values = answerStructuredRequest(corpus, understandStructuredRequest("List core values")!);
    const technologies = answerStructuredRequest(corpus, understandStructuredRequest("Which technologies do you use?")!);
    const partners = answerStructuredRequest(corpus, understandStructuredRequest("Show any partnerships")!);
    expect([values?.answer, values?.document.slug]).toEqual([expect.stringContaining("Curiosity"), "about-us"]);
    expect([technologies?.answer, technologies?.document.slug]).toEqual([expect.stringContaining("Example Runtime"), "global-capabilities"]);
    expect([partners?.answer, partners?.document.slug]).toEqual([expect.stringContaining("Example Cloud"), "partners"]);
  });

  it("derives authority roles from ACF structure", () => {
    expect(corpus.map((item) => buildSearchDocument(item)).map(({ role }) => role)).toEqual(["company", "company", "global_capabilities", "partners"]);
  });
});
