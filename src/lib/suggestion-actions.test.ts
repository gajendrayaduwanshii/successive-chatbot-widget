import { describe, expect, it } from "vitest";
import { buildCategoryNavigationActions, buildCollectionMemberActions, buildEvidenceBackedSuggestionActions, buildFollowUpQueryActions, buildGlobalRelatedContentActions, buildIndividualPageNavigationActions, classifySuggestionContext, hasSuggestionActionExecutor, noRelatedContentMessage, parseRelatedContentRequest, resolveEligibleActionDocuments, resolveSuggestionAction } from "./suggestion-actions";
import { buildSearchDocument, buildSearchIndex } from "./search-index";
import type { WordPressItem } from "@/types/wordpress";

describe("global suggestion action registry", () => {
  describe("validated authored internal links", () => {
    it("indexes a relative content link and permits its eligible capability page", () => {
      const source: WordPressItem = {
        id: 801, type: "post", slug: "public-health-response", link: "https://example.test/blog/public-health-response/",
        title: { rendered: "Public Health Technology Response" },
        content: { rendered: '<p>Read about <a href="/healthcare-platform-development/">healthcare delivery</a>.</p><img src="/wp-content/uploads/hero.png">' },
      };
      const destination: WordPressItem = {
        id: 802, type: "page", slug: "healthcare-platform-development", link: "https://example.test/healthcare-platform-development/",
        title: { rendered: "Healthcare Platform Development Company" },
        content: { rendered: "Published healthcare platform engineering information for organizations." },
      };
      const [article, capability] = buildSearchIndex([source, destination]);
      expect(article!.internalLinks).toEqual(["/healthcare-platform-development"]);
      expect(article!.relatedCapabilities).toContainEqual(expect.objectContaining({ documentId: capability!.id, evidence: ["internal-link"] }));
      expect(buildIndividualPageNavigationActions({ source: article!, corpus: [article!, capability!], userSubject: article!.title }))
        .toEqual([expect.objectContaining({ targetResourceId: `${capability!.type}:${capability!.id}` })]);
    });

    it("permits a direct linked topical service without requiring its full source title", () => {
      const source: WordPressItem = {
        id: 803, type: "page", slug: "cloud-advisory", link: "https://example.test/cloud-advisory/",
        title: { rendered: "Cloud Advisory for Enterprise Transformation" },
        content: { rendered: '<a href="/cloud-migration-services/">Cloud migration</a>' },
        acf: { service_type: "Service" },
      };
      const destination: WordPressItem = {
        id: 804, type: "page", slug: "cloud-migration-services", link: "https://example.test/cloud-migration-services/",
        title: { rendered: "Cloud Migration Services" }, content: { rendered: "Cloud migration planning and delivery." },
        acf: { service_type: "Service" },
      };
      const [advisory, migration] = buildSearchIndex([source, destination]);
      expect(buildIndividualPageNavigationActions({ source: advisory!, corpus: [advisory!, migration!], userSubject: advisory!.title }))
        .toEqual([expect.objectContaining({ targetResourceId: `${migration!.type}:${migration!.id}` })]);
    });
  });

  describe("structured related-content routing", () => {
    const doc = (id: number, title: string, role: "page" | "service" | "blog" | "resource" | "case_study") => {
      const type = role === "blog" ? "post" : role === "case_study" ? "case-study" : "page";
      const result = buildSearchDocument({ id, type, slug: title.toLowerCase().replace(/\W+/g, "-"),
        link: `https://example.test/${id}/`, title: { rendered: title },
        content: { rendered: `${title} provides workflow automation evidence.` } });
      result.role = role;
      return result;
    };

    it("parses related pages as a role rather than a subject", () => {
      expect(parseRelatedContentRequest("Explore related pages")?.requestedRoles).toEqual(["page"]);
    });

    it("recognizes a dependent related-content request with the natural show-me wrapper", () => {
      expect(parseRelatedContentRequest("Show me related articles")?.requestedRoles).toEqual(["blog", "editorial"]);
    });

    it("preserves the subject while restricting related services", () => {
      const source = doc(201, "Workflow Automation", "page");
      const service = doc(202, "Workflow Automation Service", "service");
      const article = doc(203, "Workflow Automation Guide", "blog");
      const actions = buildGlobalRelatedContentActions({ source, corpus: [source, service, article], userSubject: "workflow automation", limit: 10 });
      expect(actions.find((action) => action.targetContentType === "service"))
        .toMatchObject({ subject: "workflow automation", resultKeys: [`${service.type}:${service.id}`] });
    });

    it("requires article/resource role plus same-subject evidence", () => {
      expect(parseRelatedContentRequest("Read related articles")?.requestedRoles).toEqual(["blog", "editorial"]);
      expect(parseRelatedContentRequest("Show related resources")?.requestedRoles).toEqual(["resource", "whitepaper", "report"]);
    });

    it("filters a requested content type when its topic is different", () => {
      const source = doc(204, "Workflow Automation", "page");
      const unrelated = doc(205, "Retail Commerce Article", "blog");
      unrelated.descriptions = ["Retail storefront merchandising."];
      const action = { id: "related", intent: "CONTENT_DISCOVERY" as const, label: "Visible label",
        relation: "RELATED_TO_SOURCE" as const, subject: "workflow automation", sourceContext: `${source.type}:${source.id}`,
        targetContentType: "blog", resultKeys: [`${unrelated.type}:${unrelated.id}`] };
      expect(resolveEligibleActionDocuments(action, [source, unrelated])).toEqual([]);
    });

    it("rejects non-page content sharing only broad subject tokens", () => {
      const source = doc(260, "Atlas Engineering", "service");
      const adjacent = doc(261, "Geographic Projection Guide", "blog");
      adjacent.descriptions = ["Engineering geographic data for map projections."];
      const action = { id: "broad-related", intent: "CONTENT_DISCOVERY" as const, label: "Explore Geographic Projection Guide",
        relation: "RELATED_TO_SOURCE" as const, subject: "atlas engineering", sourceContext: `${source.type}:${source.id}`,
        targetContentType: "blog", resultKeys: [`${adjacent.type}:${adjacent.id}`] };
      expect(resolveEligibleActionDocuments(action, [source, adjacent])).toEqual([]);
    });

    it("retains candidate-owned multi-word subject evidence", () => {
      const source = doc(262, "Atlas Engineering", "service");
      const related = doc(263, "Governed Delivery Guide", "blog");
      related.descriptions = ["Atlas engineering practices for governed delivery."];
      const action = { id: "strong-related", intent: "CONTENT_DISCOVERY" as const, label: "Explore Governed Delivery Guide",
        relation: "RELATED_TO_SOURCE" as const, subject: "atlas engineering", sourceContext: `${source.type}:${source.id}`,
        targetContentType: "blog", resultKeys: [`${related.type}:${related.id}`] };
      expect(resolveEligibleActionDocuments(action, [source, related])).toEqual([related]);
    });

    it("rejects a navigation-heavy page that lacks direct subject evidence", () => {
      const source = doc(206, "Workflow Automation", "page");
      const index = doc(207, "Website Directory", "page");
      index.descriptions = ["Browse the website."];
      index.textSegments = ["Browse the website."];
      index.internalLinks = Array.from({ length: 14 }, (_, value) => `https://example.test/item-${value}/`);
      index.internalLinks.push(source.url);
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, index], userSubject: "workflow automation" }))
        .toEqual([]);
    });

    it("rejects an index-identity page even when its early copy lists the subject", () => {
      const source = doc(246, "Process Capability", "page");
      const index = doc(247, "Content Directory", "page");
      index.descriptions = ["Browse workflow automation and other topics."];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, index],
        userSubject: "workflow automation" })).toEqual([]);
    });

    it("retains a page with direct evidence for the distinguishing subject terms", () => {
      const source = doc(220, "Process Capability", "page");
      const related = doc(221, "Orchestration Operations", "page");
      related.descriptions = ["Workflow automation patterns for operating teams."];
      const action = buildGlobalRelatedContentActions({ source, corpus: [source, related],
        userSubject: "workflow automation" }).find((candidate) => candidate.targetContentType === "page");
      expect(action?.resultKeys).toEqual([`${related.type}:${related.id}`]);
      expect(resolveEligibleActionDocuments(action!, [source, related])).toEqual([related]);
    });

    it("filters an unrelated normal page independently", () => {
      const source = doc(222, "Process Capability", "page");
      const unrelated = doc(223, "Retail Operations", "page");
      unrelated.descriptions = ["Store merchandising and inventory planning."];
      unrelated.textSegments = ["Store merchandising and inventory planning."];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, unrelated],
        userSubject: "workflow automation" })).toEqual([]);
    });

    it("filters a page that shares only generic company boilerplate", () => {
      const source = doc(224, "Modern Platform Capability", "page");
      const boilerplate = doc(225, "Organization Overview", "page");
      boilerplate.descriptions = ["Our company provides application delivery, enterprise consulting, transformation strategy, and engineering services."];
      boilerplate.textSegments = [...boilerplate.descriptions];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, boilerplate],
        userSubject: "application engineering" })).toEqual([]);
    });

    it("filters a page supported only by a weak internal link", () => {
      const source = doc(226, "Process Capability", "page");
      const linked = doc(227, "Organization Directory", "page");
      linked.descriptions = ["Browse organization information."];
      linked.textSegments = ["Browse organization information."];
      source.internalLinks.push(linked.url);
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, linked],
        userSubject: "workflow automation" })).toEqual([]);
    });

    it("does not treat subject terms found only in full-page footer content as topical evidence", () => {
      const source = doc(232, "Process Capability", "page");
      const footerMatch = doc(233, "Organization Overview", "page");
      footerMatch.descriptions = ["Organization profile and locations."];
      footerMatch.textSegments = ["Organization profile.", "Explore workflow automation in the site footer."];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, footerMatch],
        userSubject: "workflow automation" })).toEqual([]);
    });

    it("does not treat subject terms found only in navigation or site-wide copy as topical evidence", () => {
      const source = doc(234, "Process Capability", "page");
      const navigationMatch = doc(235, "Organization Overview", "page");
      navigationMatch.descriptions = ["Organization profile and locations."];
      navigationMatch.textSegments = ["Navigation: Workflow", "Site links: Automation"];
      navigationMatch.internalLinks = ["https://example.test/a/", "https://example.test/b/"];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, navigationMatch],
        userSubject: "workflow automation" })).toEqual([]);
    });

    it("does not treat a late directory heading as a canonical page heading", () => {
      const source = doc(244, "Process Capability", "page");
      const directory = doc(245, "Organization Directory", "page");
      directory.headings = ["Organization", "Locations", "Browse Topics", "Workflow Automation"];
      directory.descriptions = ["Organization directory and topic links."];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, directory],
        userSubject: "workflow automation" })).toEqual([]);
    });

    it("retains canonical heading and primary-description evidence", () => {
      const source = doc(236, "Process Capability", "page");
      const headingMatch = doc(237, "Operations Guide", "page");
      headingMatch.headings = ["Workflow Automation Architecture"];
      headingMatch.descriptions = ["Operational guidance."];
      const descriptionMatch = doc(238, "Operations Blueprint", "page");
      descriptionMatch.headings = [];
      descriptionMatch.descriptions = ["A workflow automation blueprint for operating teams."];
      const action = buildGlobalRelatedContentActions({ source,
        corpus: [source, headingMatch, descriptionMatch], userSubject: "workflow automation" })
        .find((candidate) => candidate.targetContentType === "page");
      expect(new Set(action?.resultKeys)).toEqual(new Set([
        `${headingMatch.type}:${headingMatch.id}`, `${descriptionMatch.type}:${descriptionMatch.id}`,
      ]));
    });

    it("accepts a validated structural page relation without lexical fallback", () => {
      const source = doc(248, "Process Capability", "page");
      const related = doc(249, "Operational Blueprint", "page");
      related.descriptions = ["A focused operating blueprint."];
      source.relatedCapabilities = [{ documentId: related.id, score: 80, evidence: ["explicit-reference"] }];
      const action = buildGlobalRelatedContentActions({ source, corpus: [source, related],
        userSubject: "workflow automation" }).find((candidate) => candidate.targetContentType === "page");
      expect(action?.resultKeys).toEqual([`${related.type}:${related.id}`]);
      expect(resolveEligibleActionDocuments(action!, [source, related])).toEqual([related]);
    });

    it("requires a short acronym subject in title or a primary heading", () => {
      const source = doc(250, "Automation Capability", "page");
      const weak = doc(251, "Organization Overview", "page");
      weak.descriptions = ["The organization also provides AI consulting."];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, weak], userSubject: "AI" }))
        .toEqual([]);
    });

    it("rejects a multi-word subject when only one token is localized", () => {
      const source = doc(239, "Process Capability", "page");
      const partial = doc(240, "Workflow Operations", "page");
      partial.descriptions = ["Workflow guidance for operating teams."];
      partial.textSegments = [...partial.descriptions];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, partial],
        userSubject: "workflow automation" })).toEqual([]);
    });

    it("uses identical localized eligibility during generation and click-time validation", () => {
      const source = doc(241, "Process Capability", "page");
      const valid = doc(242, "Workflow Automation Blueprint", "page");
      const footerOnly = doc(243, "Organization Overview", "page");
      footerOnly.descriptions = ["Organization profile."];
      footerOnly.textSegments = ["Workflow automation footer link."];
      const corpus = [source, valid, footerOnly];
      const action = buildGlobalRelatedContentActions({ source, corpus, userSubject: "workflow automation" })
        .find((candidate) => candidate.targetContentType === "page");
      expect(action?.resultKeys).toEqual([`${valid.type}:${valid.id}`]);
      expect(resolveEligibleActionDocuments(action!, corpus)).toEqual([valid]);
    });

    it("keeps only the independently valid page from a mixed candidate set", () => {
      const source = doc(228, "Process Capability", "page");
      const valid = doc(229, "Workflow Automation Operations", "page");
      const unrelated = doc(230, "Retail Operations", "page");
      unrelated.descriptions = ["Store merchandising."];
      unrelated.textSegments = ["Store merchandising."];
      const broad = doc(231, "Organization Directory", "page");
      broad.descriptions = ["Browse company information and services."];
      broad.textSegments = ["Browse company information and services."];
      source.internalLinks.push(unrelated.url, broad.url);
      const action = buildGlobalRelatedContentActions({ source, corpus: [source, valid, unrelated, broad],
        userSubject: "workflow automation" }).find((candidate) => candidate.targetContentType === "page");
      expect(action?.resultKeys).toEqual([`${valid.type}:${valid.id}`]);
      expect(resolveEligibleActionDocuments(action!, [source, valid, unrelated, broad])).toEqual([valid]);
    });

    it("provides a safe role-specific empty response with no fallback results", () => {
      const action = { id: "empty-pages", intent: "CONTENT_DISCOVERY" as const,
        relation: "RELATED_TO_SOURCE" as const, targetContentType: "page" as const,
        resultKeys: ["page:999"] };
      expect(resolveEligibleActionDocuments(action, [])).toEqual([]);
      expect(noRelatedContentMessage(action)).toBe(
        "No clearly supported related pages were found for this topic in the available Successive content.",
      );
    });

    it("returns no executable action when no related content is valid", () => {
      const source = doc(208, "Workflow Automation", "page");
      const unrelated = doc(209, "Unrelated Operations", "service");
      unrelated.descriptions = ["Separate operating model."];
      expect(buildGlobalRelatedContentActions({ source, corpus: [source, unrelated], userSubject: "workflow automation" }))
        .toEqual([]);
    });

    it("does not interpret an explicit new subject as a related action", () => {
      expect(parseRelatedContentRequest("Tell me about a different engineering topic")).toBeNull();
    });

    it("leaves explicit careers requests to Careers routing", () => {
      expect(parseRelatedContentRequest("Show current job openings")).toBeNull();
    });

    it("retains multiple valid same-subject related items", () => {
      const source = doc(210, "Workflow Automation", "page");
      const first = doc(211, "Workflow Automation Patterns", "blog");
      const second = doc(212, "Workflow Automation Guide", "blog");
      const action = buildGlobalRelatedContentActions({ source, corpus: [source, first, second], userSubject: "workflow automation", limit: 10 })
        .find((candidate) => candidate.targetContentType === "blog");
      expect(action?.resultKeys).toEqual([`${first.type}:${first.id}`, `${second.type}:${second.id}`]);
      expect(resolveEligibleActionDocuments(action!, [source, first, second])).toEqual([first, second]);
    });

    it("preserves the existing normal follow-up executor", () => {
      const [action] = buildFollowUpQueryActions(["Tell me more"], 1, "Workflow Automation");
      expect(resolveSuggestionAction(action)).toBe("Tell me more related to Workflow Automation");
    });
  });
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

  it("keeps a person subject and does not suggest unrelated award pages from the evidence page", () => {
    const about = buildSearchDocument({ id: 70, type: "page", slug: "about-us", link: "https://example.test/about-us/",
      title: { rendered: "About Us" }, content: { rendered: "Leadership profile for Jordan Reed, managing director." },
      acf: { executive_management: [{ name: "Jordan Reed" }] } });
    const culture = buildSearchDocument({ id: 71, type: "page", slug: "our-culture", link: "https://example.test/our-culture/",
      title: { rendered: "Our Culture" }, content: { rendered: "Culture and values." } });
    const awards = buildSearchDocument({ id: 72, type: "page", slug: "awards", link: "https://example.test/awards/",
      title: { rendered: "Awards" }, content: { rendered: "Company awards and recognition." } });
    const gptw = buildSearchDocument({ id: 73, type: "award", slug: "great-places-to-work",
      link: "https://example.test/awards/great-places-to-work/",
      title: { rendered: "Great Places To Work" }, content: { rendered: "Workplace certification." } });
    const actions = buildIndividualPageNavigationActions({
      source: about, corpus: [about, culture, awards, gptw], userSubject: "Jordan Reed",
    });
    expect(actions.every((action) => action.subject === "Jordan Reed")).toBe(true);
    expect(actions.map((action) => action.label).join(" ")).toMatch(/culture/i);
    expect(actions.some((action) => /award|great places|deloitte|vega/i.test(action.label))).toBe(false);
  });

  it("requires local role evidence for leadership-answer navigation and permits fewer results", () => {
    const source = buildSearchDocument({ id: 74, type: "page", slug: "about-us", link: "https://example.test/about-us/",
      title: { rendered: "About Us" }, content: { rendered: "Company information." },
      acf: { executive_management: [{ name: "Jordan Reed", designation: "Founder & CEO" }] } });
    const ceoArticle = buildSearchDocument({ id: 75, type: "post", slug: "ceo-interview", link: "https://example.test/ceo-interview/",
      title: { rendered: "A Conversation with CEO Jordan Reed" }, content: { rendered: "Leadership interview." } });
    const sitemap = buildSearchDocument({ id: 76, type: "page", slug: "site-map", link: "https://example.test/site-map/",
      title: { rendered: "Site Map" }, content: { rendered: "Browse all company pages." } });
    const partner = buildSearchDocument({ id: 77, type: "post", slug: "cloud-partnership", link: "https://example.test/cloud-partnership/",
      title: { rendered: "Cloud Platform Partnership" }, content: { rendered: "A strategic technology partnership." } });
    source.internalLinks = [ceoArticle.url, sitemap.url, partner.url];

    const actions = buildIndividualPageNavigationActions({
      source, corpus: [source, ceoArticle, sitemap, partner], userSubject: "ceo", limit: 3,
      leadershipContext: { relation: "leadership", requestedRole: "ceo", resolvedPerson: "Jordan Reed" },
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.targetResourceId).toBe(`${ceoArticle.type}:${ceoArticle.id}`);
    expect(resolveEligibleActionDocuments(actions[0]!, [source, ceoArticle, sitemap, partner]))
      .toEqual([ceoArticle]);
  });

  it("keeps board suggestions locally board-related and rejects unrelated linked articles", () => {
    const source = buildSearchDocument({ id: 78, type: "page", slug: "about-us", link: "https://example.test/about-us/",
      title: { rendered: "About Us" }, content: { rendered: "Company information." } });
    const boardArticle = buildSearchDocument({ id: 79, type: "post", slug: "board-appointments", link: "https://example.test/board-appointments/",
      title: { rendered: "Industry Leaders Appointed to the Board" }, content: { rendered: "Board appointment announcement." } });
    const shipment = buildSearchDocument({ id: 791, type: "post", slug: "shipment-tracking", link: "https://example.test/shipment-tracking/",
      title: { rendered: "Automated Shipment Tracking Systems" }, content: { rendered: "Logistics automation guide." } });
    source.internalLinks = [boardArticle.url, shipment.url];

    const actions = buildIndividualPageNavigationActions({
      source, corpus: [source, boardArticle, shipment], userSubject: "board directors", limit: 3,
      leadershipContext: { relation: "board" },
    });
    expect(actions.map((action) => action.targetResourceId)).toEqual([`${boardArticle.type}:${boardArticle.id}`]);
  });

  it("does not fill executive-management suggestions with unrelated linked services", () => {
    const source = buildSearchDocument({ id: 792, type: "page", slug: "about-us", link: "https://example.test/about-us/",
      title: { rendered: "About Us" }, content: { rendered: "Company information." } });
    const cloud = buildSearchDocument({ id: 793, type: "page", slug: "cloud-resale", link: "https://example.test/cloud-resale/",
      title: { rendered: "Cloud Re-Sales" }, content: { rendered: "Managed cloud commercials and governance." } });
    cloud.role = "service";
    source.internalLinks = [cloud.url];
    expect(buildIndividualPageNavigationActions({
      source, corpus: [source, cloud], userSubject: "executive management", limit: 3,
      leadershipContext: { relation: "executives" },
    })).toEqual([]);
  });

  it.each([
    ["Jordan Reed", "Senior Manager BU Head (Frontend)", "Frontend Engineering", "frontend"],
    ["Priya Nair", "Head of Data Science", "Applied Data Science", "data science"],
  ])("uses dynamic published role/domain evidence for exact-person suggestions: %s", (person, role, relatedTitle, domain) => {
    const source = buildSearchDocument({ id: 800 + person.length, type: "page", slug: `about-${person.length}`,
      link: `https://example.test/about-${person.length}/`, title: { rendered: "About Us" },
      content: { rendered: "Published leadership profiles." } });
    const related = buildSearchDocument({ id: 820 + person.length, type: "post", slug: `related-${person.length}`,
      link: `https://example.test/related-${person.length}/`, title: { rendered: relatedTitle },
      content: { rendered: `A detailed article about ${domain}.` } });
    const unrelated = buildSearchDocument({ id: 840 + person.length, type: "post", slug: `unrelated-${person.length}`,
      link: `https://example.test/unrelated-${person.length}/`, title: { rendered: "Unrelated Operations Article" },
      content: { rendered: "A logistics operations article." } });
    // Simulate a site-wide/footer mention. It must not count as page-local evidence.
    unrelated.combinedText += ` ${person} ${role}`;
    unrelated.textSegments.push(`${person} ${role}`);
    source.internalLinks = [related.url, unrelated.url];

    const actions = buildIndividualPageNavigationActions({
      source, corpus: [source, related, unrelated], userSubject: person, limit: 3,
      leadershipContext: { relation: "leadership", resolvedPerson: person, publishedRole: role, teamRelation: "leadership team" },
    });
    expect(actions.map((action) => action.targetResourceId)).toEqual([`${related.type}:${related.id}`]);
    expect(actions[0]?.subject).toBe(person);
    expect(resolveEligibleActionDocuments(actions[0]!, [source, related, unrelated])).toEqual([related]);
  });

  it("does not suggest unrelated award pages from a capabilities page", () => {
    const capabilities = buildSearchDocument({ id: 80, type: "page", slug: "global-capabilities",
      link: "https://example.test/global-capabilities/", title: { rendered: "Global Capabilities" },
      content: { rendered: "Capability catalogue." }, acf: { capabilities_categories: [{ title: "AI" }] } });
    const about = buildSearchDocument({ id: 81, type: "page", slug: "about-us", link: "https://example.test/about-us/",
      title: { rendered: "About Us" }, content: { rendered: "Company overview." },
      acf: { executive_management: [{ name: "Team" }] } });
    const awards = buildSearchDocument({ id: 82, type: "page", slug: "awards", link: "https://example.test/awards/",
      title: { rendered: "Awards" }, content: { rendered: "Awards and recognition." } });
    const actions = buildIndividualPageNavigationActions({
      source: capabilities, corpus: [capabilities, about, awards], userSubject: "Global Capabilities",
    });
    expect(actions.some((action) => /award/i.test(action.label))).toBe(false);
    expect(actions.some((action) => action.targetResourceId === `${about.type}:${about.id}`)).toBe(true);
  });

  it("discovers same-context company navigation for culture without using a hardcoded page list", () => {
    const culture = buildSearchDocument({ id: 90, type: "page", slug: "our-culture", link: "https://example.test/our-culture/",
      title: { rendered: "Our Culture" }, content: { rendered: "Culture and values." } });
    const about = buildSearchDocument({ id: 91, type: "page", slug: "about-us", link: "https://example.test/about-us/",
      title: { rendered: "About Us" }, content: { rendered: "Company overview." },
      acf: { executive_management: [{ name: "Team" }] } });
    const careers = buildSearchDocument({ id: 92, type: "page", slug: "careers", link: "https://example.test/careers/",
      title: { rendered: "Careers" }, content: { rendered: "Career information." } });
    const awards = buildSearchDocument({ id: 93, type: "page", slug: "awards", link: "https://example.test/awards/",
      title: { rendered: "Awards" }, content: { rendered: "Awards and recognition." } });
    const actions = buildIndividualPageNavigationActions({
      source: culture, corpus: [culture, about, careers, awards], userSubject: "Our Culture",
    });
    expect(actions.map((action) => action.targetResourceId)).toEqual(expect.arrayContaining([
      `${about.type}:${about.id}`, `${careers.type}:${careers.id}`,
    ]));
    expect(actions.some((action) => /award/i.test(action.label))).toBe(false);
  });

  it("keeps partner-group navigation for a partners page", () => {
    const partners = buildSearchDocument({ id: 100, type: "page", slug: "partners", link: "https://example.test/partners/",
      title: { rendered: "Partners & Alliances" }, content: { rendered: "Partner ecosystem." },
      acf: { partnerships_repeater: [{ title: "Cloud Alliance" }] } });
    const aws = buildSearchDocument({ id: 101, type: "page", slug: "aws-partner", link: "https://example.test/partners/aws/",
      title: { rendered: "AWS Partnership" }, content: { rendered: "Amazon Web Services alliance." } });
    const awards = buildSearchDocument({ id: 102, type: "page", slug: "awards", link: "https://example.test/awards/",
      title: { rendered: "Awards" }, content: { rendered: "Awards and recognition." } });
    const actions = buildIndividualPageNavigationActions({
      source: partners, corpus: [partners, aws, awards], userSubject: "Partners & Alliances",
    });
    expect(actions.some((action) => action.targetResourceId === `${aws.type}:${aws.id}`)).toBe(true);
    expect(actions.some((action) => /award/i.test(action.label))).toBe(false);
  });

  it("allows award-group navigation from an award page", () => {
    const vega = buildSearchDocument({ id: 110, type: "award", slug: "vega-award", link: "https://example.test/awards/vega-award/",
      title: { rendered: "Vega Award" }, content: { rendered: "Award recognition." } });
    const awards = buildSearchDocument({ id: 111, type: "page", slug: "awards", link: "https://example.test/awards/",
      title: { rendered: "Awards" }, content: { rendered: "Awards and recognition." } });
    const about = buildSearchDocument({ id: 112, type: "page", slug: "about-us", link: "https://example.test/about-us/",
      title: { rendered: "About Us" }, content: { rendered: "Company overview." },
      acf: { executive_management: [{ name: "Team" }] } });
    const actions = buildIndividualPageNavigationActions({
      source: vega, corpus: [vega, awards, about], userSubject: "Vega Award",
    });
    expect(actions.some((action) => action.targetResourceId === `${awards.type}:${awards.id}`)).toBe(true);
    expect(actions.some((action) => action.targetResourceId === `${about.type}:${about.id}`)).toBe(false);
  });
});
