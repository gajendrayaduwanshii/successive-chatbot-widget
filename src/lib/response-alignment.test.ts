import { describe, expect, it } from "vitest";
import { buildSearchDocument } from "./search-index";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { alignedCta, anchorExactSubjectMatches, documentContentType, ensureRequestedRoleFraming, isAnswerAlignedWithMatch, selectAlignedSecondaryMatches, selectFacetAlignedMatches } from "./response-alignment";
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

  it("states an explicit validated role when descriptive prose omits its label", () => {
    const service = match("Cloud Operations", "cloud-operations", "Improve governed delivery.");
    service.document.role = "service";
    expect(ensureRequestedRoleFraming("Improve governed delivery.", service, "service"))
      .toContain("Related service: **Cloud Operations**");
    expect(ensureRequestedRoleFraming("Improve governed delivery.", service, "industry"))
      .toBe("Improve governed delivery.");
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

  it("accepts an exact embedded entity section without reclassifying mention-only pages", () => {
    const understanding = {
      ...buildDeterministicUnderstanding("What is Nimbus Build?"),
      requestedContentType: "product" as const,
      topics: ["nimbus", "build"],
    };
    const embedded = match(
      "Delivery Capabilities", "delivery-capabilities",
      "Nimbus Build is an enterprise platform that automates governed delivery.",
    );
    embedded.matchedFields = ["exact-embedded-entity", "requested-role-supporting-evidence"];
    const unrelatedPress = match(
      "Nimbus company update", "nimbus-company-update",
      "Nimbus announced a broader company initiative.", "press-release", 300,
    );
    const result = selectAlignedSecondaryMatches({ matches: [unrelatedPress, embedded], understanding });
    expect(result.primary?.document.title).toBe("Delivery Capabilities");
    expect(result.rejected.some(({ title }) => title === "Nimbus company update")).toBe(true);
  });

  it("does not let a body-only short acronym claim exact embedded identity", () => {
    const understanding = buildDeterministicUnderstanding("What is an API?");
    const incidental = match(
      "Student Experience Modernization", "student-experience-modernization",
      "The platform uses an API gateway for centralized routing.",
    );
    incidental.matchedFields = ["exact-embedded-entity"];
    const direct = match(
      "API Testing Guide", "api-testing-guide",
      "An API is an application programming interface for software communication.",
    );
    direct.matchedFields = ["exact-embedded-entity", "embedded-direct-subject-authority"];
    const result = selectAlignedSecondaryMatches({ matches: [incidental, direct], understanding });
    expect(result.primary?.document.title).toBe("API Testing Guide");
    expect(result.rejected).toContainEqual({
      title: "Student Experience Modernization", reason: "not independently same-topic",
    });
  });

  it("keeps prose aligned with the same identity used by its card and source", () => {
    const selected = match(
      "Canonical Architecture Guide", "canonical-architecture-guide",
      "The guide explains governed data architecture, platform standards, and scalable information models.",
    );
    expect(isAnswerAlignedWithMatch(
      "The guide explains governed data architecture and scalable information models.", selected,
    )).toBe(true);
    expect(isAnswerAlignedWithMatch(
      "Generative AI transforms customer engagement with conversational automation.", selected,
    )).toBe(false);
  });

  it("keeps a canonical sub-service aligned through answer, card, and source gates", () => {
    const plan = buildDeterministicUnderstanding("Tell me about a published capability");
    const canonical = match("Published Capability Services", "published-capability", "Published capability delivery details.");
    canonical.document.role = "service";
    canonical.document.service_type = "Sub-service";
    canonical.matchedFields = ["normalized-exact-title"];
    const facets = selectFacetAlignedMatches({ matches: [canonical], understandings: [plan] });
    const aligned = selectAlignedSecondaryMatches({ matches: facets, understanding: plan });
    expect(aligned.primary).toBe(canonical);
    expect(documentContentType(canonical.document)).toBe("sub-service");
    expect(alignedCta(canonical, plan)).toContain(canonical.document.url);
  });

  it("rejects prose citing a source different from the selected grounded result", () => {
    const selected = match("First Result", "first-result", "First Result documents secure platform delivery.");
    expect(isAnswerAlignedWithMatch(
      "See [Second Result](https://successive.tech/second-result/) for secure platform delivery.", selected,
    )).toBe(false);
  });

  it("does not treat broad taxonomy metadata as independent topic alignment", () => {
    const understanding = buildDeterministicUnderstanding("What are AI capabilities?");
    const ai = match("AI Development Services", "ai-development-services", "Artificial intelligence engineering and AI solutions.");
    ai.document.role = "service";
    const commerce = match("Commerce Development", "commerce-development", "Build scalable online storefronts.", "page", 200);
    commerce.document.topicProfile.metadataTerms.push("ai");
    const result = selectAlignedSecondaryMatches({ matches: [commerce, ai], understanding });
    expect(result.primary?.document.title).toBe("AI Development Services");
    expect(result.related).toEqual([]);
  });

  describe("final facet evidence gate", () => {
    const service = (title: string, slug: string, body: string, score = 120) => {
      const result = match(title, slug, body, "page", score);
      result.document.role = "service";
      return result;
    };

    it("filters an unrelated secondary even when the primary is relevant", () => {
      const plan = buildDeterministicUnderstanding("Tell me about data engineering");
      const primary = service("Data Engineering Services", "data-engineering", "Data engineering platforms and pipelines.");
      const unrelated = service("Commerce Operations", "commerce-operations", "Retail storefront operations.", 110);
      expect(selectFacetAlignedMatches({ matches: [primary, unrelated], understandings: [plan] }))
        .toEqual([primary]);
    });

    it("filters same-taxonomy evidence for the wrong topic", () => {
      const plan = buildDeterministicUnderstanding("What are automation capabilities?");
      const wrong = service("Cloud Cost Services", "cloud-cost", "Cloud spend governance and FinOps automation.");
      wrong.document.topicProfile.metadataTerms.push("automation");
      expect(selectFacetAlignedMatches({ matches: [wrong], understandings: [plan] })).toEqual([]);
    });

    it("requires both requested topic and requested content type", () => {
      const plan = buildDeterministicUnderstanding("Show healthcare case studies");
      const right = match("Healthcare Platform Transformation", "healthcare-platform", "Healthcare transformation outcomes.", "case-study");
      right.document.role = "case_study";
      const wrongType = service("Healthcare Engineering", "healthcare-engineering", "Healthcare transformation services.");
      const wrongTopic = match("Retail Platform Transformation", "retail-platform", "Retail transformation outcomes.", "case-study");
      wrongTopic.document.role = "case_study";
      expect(selectFacetAlignedMatches({ matches: [right, wrongType, wrongTopic], understandings: [plan] }))
        .toEqual([right]);
    });

    it("retains valid results belonging to separate requested facets", () => {
      const capability = buildDeterministicUnderstanding("Show analytics services");
      const evidence = buildDeterministicUnderstanding("Show logistics case studies");
      const analytics = service("Analytics Services", "analytics-services", "Analytics engineering and insights.");
      const logistics = match("Logistics Platform Transformation", "logistics-platform", "Logistics platform outcomes.", "case-study");
      logistics.document.role = "case_study";
      expect(selectFacetAlignedMatches({ matches: [analytics, logistics], understandings: [capability, evidence] }))
        .toEqual([analytics, logistics]);
    });

    it("retains multiple legitimate same-topic results", () => {
      const plan = buildDeterministicUnderstanding("Show analytics services");
      const first = service("Analytics Consulting", "analytics-consulting", "Analytics strategy and delivery.");
      const second = service("Analytics Engineering", "analytics-engineering", "Analytics platforms and pipelines.");
      expect(selectFacetAlignedMatches({ matches: [first, second], understandings: [plan] }))
        .toEqual([first, second]);
    });

    it("retains a valid exact entity and its supporting source", () => {
      const plan = buildDeterministicUnderstanding("What is Atlas Platform?");
      const exact = match("Atlas Platform", "atlas-platform", "Atlas Platform coordinates governed delivery.");
      exact.matchedFields = ["exact-title"];
      expect(selectFacetAlignedMatches({ matches: [exact], understandings: [plan] })).toEqual([exact]);
    });

    it("anchors an exact offering and suppresses adjacent same-topic records", () => {
      const plan = buildDeterministicUnderstanding("Tell me about Atlas Migration");
      const exact = service("Atlas Migration Services", "atlas-migration", "Atlas Migration moves governed workloads.", 150);
      exact.matchedFields = ["near-exact-title"];
      const adjacent = service("Atlas Cost Management", "atlas-cost-management", "Atlas cloud cost controls.", 180);
      const partner = match("Atlas Alliance Partner", "atlas-alliance", "An ecosystem partner for Atlas workloads.", "partners", 190);
      partner.document.role = "partner";
      expect(anchorExactSubjectMatches([partner, adjacent, exact], plan)).toEqual([exact]);
    });

    it("allows a directly bridged supporting case study after the exact offering", () => {
      const plan = buildDeterministicUnderstanding("Tell me about Orion Engineering");
      const exact = service("Orion Engineering", "orion-engineering", "Orion Engineering builds governed data systems.", 150);
      exact.matchedFields = ["exact-title"];
      const supporting = match("Modernizing Orion Workloads", "orion-workloads", "A directly related delivery outcome.", "case-study", 120);
      supporting.document.role = "case_study";
      supporting.matchedFields = ["case-study-capability-bridge"];
      const broad = service("Orion Operations", "orion-operations", "Adjacent operational services.", 170);
      expect(anchorExactSubjectMatches([broad, exact, supporting], plan)).toEqual([exact, supporting]);
    });

    it("prefers candidate identity fields for an explicit service family over body-only overlap", () => {
      const plan = buildDeterministicUnderstanding("Tell me about Nimbus services");
      const canonical = service("Nimbus Consulting Services", "nimbus-consulting", "Nimbus delivery services.", 130);
      const adjacent = service("Connected Device Development", "connected-device-development", "Device applications with Nimbus connectivity.", 190);
      expect(anchorExactSubjectMatches([adjacent, canonical], plan)).toEqual([canonical]);
    });

    it("does not over-filter an authoritative broad collection", () => {
      const plan = buildDeterministicUnderstanding("Show all services");
      const first = service("Experience Design", "experience-design", "Experience design services.");
      const second = service("Platform Engineering", "platform-engineering", "Platform engineering services.");
      expect(selectFacetAlignedMatches({ matches: [first, second], understandings: [plan], preserveBroadCollection: true }))
        .toEqual([first, second]);
    });
  });
});
