import { describe, expect, it } from "vitest";
import { buildCategoryNavigationActions, buildCollectionMemberActions, buildEvidenceBackedSuggestionActions, buildFollowUpQueryActions, buildGlobalRelatedContentActions, buildIndividualPageNavigationActions, classifySuggestionContext, hasSuggestionActionExecutor, resolveEligibleActionDocuments, resolveSuggestionAction } from "./suggestion-actions";
import { buildSearchDocument } from "./search-index";
import type { WordPressItem } from "@/types/wordpress";

describe("global suggestion action registry", () => {
  it("builds an executable next question instead of repeating a displayed evidence card", () => {
    const [action] = buildFollowUpQueryActions(["Show me a related case study"]);
    expect(action).toMatchObject({ label: "Show me a related case study", intent: "FOLLOW_UP_QUERY",
      query: "Show me a related case study" });
    expect(action?.resultKeys).toBeUndefined();
    expect(resolveSuggestionAction(action)).toBe("Show me a related case study");
  });

  it("carries the evidence topic when a short follow-up is executed", () => {
    const [action] = buildFollowUpQueryActions(
      ["Explore Successive industries"],
      3,
      "React.js Development Company",
    );
    expect(resolveSuggestionAction(action)).toBe(
      "Explore Successive industries related to React.js Development Company",
    );
  });

  it("canonicalizes a supporting-service follow-up instead of producing a malformed topic sentence", () => {
    const [action] = buildFollowUpQueryActions(
      ["Which Successive services support this capability?"],
      3,
      "React.js Development Company",
    );
    expect(resolveSuggestionAction(action)).toBe(
      "React.js Development Company Successive services",
    );
  });

  it.each([
    ["CUSTOMER_WORK_DISCOVERY", "Customer case studies"],
    ["PUBLIC_ORGANIZATION_OVERVIEW", "clients"],
    ["CONTENT_DISCOVERY", "Published Successive content"],
  ] as const)("has an executor for %s", (intent, expected) => {
    expect(hasSuggestionActionExecutor(intent)).toBe(true);
    expect(resolveSuggestionAction({ id: "fixture", label: "Completely unrelated display wording", intent }))
      .toBe(expected);
  });

  it("uses structured qualifiers without interpreting the display label", () => {
    expect(resolveSuggestionAction({
      id: "case-studies",
      label: "Anything visible to the visitor",
      intent: "CONTENT_DISCOVERY",
      contentType: "case-study",
    })).toBe("Case studies");
  });

  it("uses the same exact result identity for collection pre-flight and execution", () => {
    const item = (id: number, type: string, title: string): WordPressItem => ({ id, type, slug: title.toLowerCase().replace(/\s+/g, "-"),
      link: `https://example.test/${id}/`, title: { rendered: title }, content: { rendered: `${title} published detail.` } });
    const source = buildSearchDocument(item(1, "page", "Published Collection"));
    const member = buildSearchDocument(item(2, "case_study", "Verified Customer Outcome"));
    const [action] = buildCollectionMemberActions(source, [member]);
    expect(action?.resultKeys).toEqual([`${member.type}:${member.id}`]);
    expect(resolveEligibleActionDocuments(action!, [source, member])).toEqual([member]);
    expect(resolveEligibleActionDocuments(action!, [source])).toEqual([]);
  });

  it("suppresses a merely available but unrelated global document", () => {
    const source = buildSearchDocument({ id: 10, type: "page", slug: "source", link: "https://example.test/source/",
      title: { rendered: "Source Capability" }, content: { rendered: "Distinct source evidence." } });
    const unrelated = buildSearchDocument({ id: 11, type: "case_study", slug: "other", link: "https://example.test/other/",
      title: { rendered: "Unrelated Outcome" }, content: { rendered: "Completely separate evidence." } });
    expect(buildEvidenceBackedSuggestionActions({ source, acceptedRelated: [unrelated] })).toEqual([]);
  });

  it("discovers first, groups by actual role, and preserves user subject separately from source", () => {
    const source = buildSearchDocument({ id: 20, type: "page", slug: "company", link: "https://example.test/company/",
      title: { rendered: "Company Information" }, content: { rendered: "Leadership profile for Jordan Reed and digital strategy." },
      acf: { related: [{ title: "Digital Strategy Article", url: "https://example.test/article/" }] } });
    const article = buildSearchDocument({ id: 21, type: "post", slug: "article", link: "https://example.test/article/",
      title: { rendered: "Digital Strategy Article" }, content: { rendered: "Jordan Reed discusses digital strategy leadership." } });
    const unrelated = buildSearchDocument({ id: 22, type: "case_study", slug: "warehouse", link: "https://example.test/warehouse/",
      title: { rendered: "Warehouse Modernization" }, content: { rendered: "Warehouse logistics outcome." } });
    const actions = buildGlobalRelatedContentActions({ source, corpus: [source, article, unrelated], userSubject: "Jordan Reed" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ topic: "Jordan Reed", entity: "Jordan Reed", targetContentType: "blog" });
    expect(actions[0]?.resultKeys).toEqual([`${article.type}:${article.id}`]);
    expect(resolveEligibleActionDocuments(actions[0]!, [source, article, unrelated])).toEqual([article]);
  });

  it("routes an individual page to prevalidated target navigation without a broad content feed", () => {
    const source = buildSearchDocument({ id: 30, type: "page", slug: "company-overview", link: "https://example.test/company-overview/",
      title: { rendered: "Company Overview" }, content: { rendered: '<p>Company information.</p><a href="https://example.test/culture/">Culture</a>' } });
    source.internalLinks.push("https://example.test/culture/");
    const culture = buildSearchDocument({ id: 31, type: "page", slug: "culture", link: "https://example.test/culture/",
      title: { rendered: "Our Culture" }, content: { rendered: "Culture and values." } });
    const article = buildSearchDocument({ id: 32, type: "post", slug: "article", link: "https://example.test/article/",
      title: { rendered: "Company Article" }, content: { rendered: "Company information and culture commentary." } });
    const actions = buildIndividualPageNavigationActions({ source, corpus: [source, culture, article], userSubject: "Company Overview" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ label: "Explore Our Culture", contextType: "INDIVIDUAL_PAGE_CONTEXT",
      targetResourceId: `${culture.type}:${culture.id}`, targetUrl: culture.url, resultKeys: [`${culture.type}:${culture.id}`] });
    expect(actions[0]?.label).not.toMatch(/related (?:articles|case studies|services|accelerators)/i);
  });

  it("suppresses the immediately previous navigation target to prevent back-and-forth loops", () => {
    const first = buildSearchDocument({ id: 40, type: "page", slug: "first", link: "https://example.test/first/",
      title: { rendered: "First Page" }, content: { rendered: '<a href="https://example.test/second/">Second</a>' } });
    const second = buildSearchDocument({ id: 41, type: "page", slug: "second", link: "https://example.test/second/",
      title: { rendered: "Second Page" }, content: { rendered: '<a href="https://example.test/first/">First</a>' } });
    first.internalLinks.push("https://example.test/second/");
    second.internalLinks.push("https://example.test/first/");
    expect(buildIndividualPageNavigationActions({ source: second, corpus: [first, second],
      excludedResultKeys: [`${first.type}:${first.id}`] })).toEqual([]);
  });

  it("classifies topic, exact individual, listing, and missing-source contexts centrally", () => {
    const source = buildSearchDocument({ id: 50, type: "page", slug: "source", link: "https://example.test/source/",
      title: { rendered: "Source" }, content: { rendered: "Source content." } });
    expect(classifySuggestionContext({ source })).toBe("TOPIC_CONTEXT");
    expect(classifySuggestionContext({ source, exactResource: true })).toBe("INDIVIDUAL_PAGE_CONTEXT");
    expect(classifySuggestionContext({ source, categoryListing: true })).toBe("CATEGORY_LISTING_CONTEXT");
    expect(classifySuggestionContext({})).toBe("OTHER_CONTEXT");
  });

  it("uses retained WordPress hierarchy for parent, child, sibling, and collection navigation", () => {
    const make = (id: number, title: string, parent?: number) => buildSearchDocument({ id, type: "page",
      slug: title.toLowerCase(), link: `https://example.test/services/${id}/`, parent,
      title: { rendered: title }, content: { rendered: `${title} detail.` } });
    const parent = make(60, "Services");
    const source = make(61, "Cloud Service", 60);
    const sibling = make(62, "Data Service", 60);
    const child = make(63, "Cloud Assessment", 61);
    const corpus = [parent, source, sibling, child];
    const individual = buildIndividualPageNavigationActions({ source, corpus, limit: 5 });
    expect(individual.map((action) => action.relationType)).toEqual(expect.arrayContaining(["PARENT", "CHILD", "SIBLING"]));
    expect(individual.every((action) => action.contextType === "INDIVIDUAL_PAGE_CONTEXT" && action.resultKeys?.length === 1)).toBe(true);
    const category = buildCategoryNavigationActions({ source: parent, corpus, limit: 5 });
    expect(category.some((action) => action.targetResourceId === `${source.type}:${source.id}` && action.relationType === "CHILD")).toBe(true);
    expect(category.every((action) => action.contextType === "CATEGORY_LISTING_CONTEXT")).toBe(true);
  });
});
