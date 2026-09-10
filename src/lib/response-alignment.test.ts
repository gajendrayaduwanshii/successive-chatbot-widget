import { describe, expect, it } from "vitest";
import { buildSearchDocument } from "./search-index";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { alignedCta, anchorExactSubjectMatches, compositionEvidence, ctaAnchorTitle, ctaCategoryFor, ctaTemplateCount, documentContentType, enrichAnswerWithValidatedInlineLinks, ensureRequestedRoleFraming, ensureSubstantialTopicHeading, hasCanonicalBodyLink, hasMeaningfulInlineDestination, isAnswerAlignedWithMatch, selectAlignedSecondaryMatches, selectFacetAlignedMatches, shouldAppendFinalCta, supportsEvidenceDrivenDepth } from "./response-alignment";
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
  it("distinguishes a canonical heading link from a body-prose link for CTA presentation", () => {
    const url = "https://successive.tech/delivery-engineering/";
    expect(hasCanonicalBodyLink(`## [Delivery Engineering](${url})\n\nGrounded delivery overview.`, url)).toBe(false);
    expect(hasCanonicalBodyLink(`## Delivery Engineering\n\nLearn through [Delivery Engineering](${url}).`, url)).toBe(true);
    expect(shouldAppendFinalCta(true, true)).toBe(true);
    expect(shouldAppendFinalCta(true, false)).toBe(true);
    expect(shouldAppendFinalCta(false, true)).toBe(false);
  });

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

  it("permits a definition CTA only for an already direct-identity validated destination", () => {
    const understanding = buildDeterministicUnderstanding("What is an API?");
    const api = match("API Development Company", "api-development", "An API is an application programming interface.");
    api.document.role = "service";
    api.matchedFields = ["near-exact-title"];
    expect(alignedCta(api, understanding)).toContain("[API Development Company]");

    const specialized = match("BigCommerce API Integration", "bigcommerce-api", "An API is an application programming interface.");
    specialized.document.role = "service";
    specialized.matchedFields = ["embedded-direct-subject-authority"];
    expect(alignedCta(specialized, understanding)).toBeUndefined();
  });

  it("enforces explicit content types and derives a CTA from the selected record", () => {
    const understanding = buildDeterministicUnderstanding("Show me AI blogs");
    const blog = match("Practical AI Adoption", "practical-ai-adoption", "AI adoption guidance.", "post");
    const service = match("AI Development Company", "ai-development-company", "AI development services.");
    const result = selectAlignedSecondaryMatches({ matches: [service, blog], understanding });
    expect(result.primary?.document.title).toBe("Practical AI Adoption");
    expect(documentContentType(result.primary!.document)).toBe("blog");
    expect(alignedCta(result.primary, understanding)).toContain("[full article]");
  });

  it("keeps explicit role framing conversational when descriptive prose omits its label", () => {
    const service = match("Cloud Operations", "cloud-operations", "Improve governed delivery.");
    service.document.role = "service";
    expect(ensureRequestedRoleFraming("Improve governed delivery.", service, "service"))
      .toBe("Improve governed delivery.");
    expect(ensureRequestedRoleFraming("Improve governed delivery.", service, "industry"))
      .toBe("Improve governed delivery.");
    expect(alignedCta(service, buildDeterministicUnderstanding("What cloud services do you offer?")))
      .toContain("Explore [Cloud Operations]");
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

  it("anchors a focused subject to direct document authority over embedded body overlap", () => {
    const understanding = buildDeterministicUnderstanding("Legacy modernization");
    const direct = match(
      "Application Modernization Services for Legacy Systems", "application-modernization-services",
      "Modernize legacy systems through staged application modernization.", "page", 200,
    );
    direct.matchedFields = ["exact-embedded-entity", "embedded-direct-subject-authority"];
    const incidental = match(
      "Enterprise Spatial Intelligence", "enterprise-spatial-intelligence",
      "Legacy modernization can support a spatial operating model.", "page", 300,
    );
    incidental.matchedFields = ["exact-embedded-entity"];
    const result = selectAlignedSecondaryMatches({ matches: [incidental, direct], understanding });
    expect(result.primary?.document.title).toBe("Application Modernization Services for Legacy Systems");
    expect(result.rejected).toContainEqual({
      title: "Enterprise Spatial Intelligence", reason: "not independently same-topic",
    });
  });

  it.each([
    ["Kubernetes Consulting Services", "service"],
    ["Workflow Automation Accelerator", "accelerator"],
    ["Retail Commerce Transformation", "case_study"],
    ["Modernization Delivery Guide", "post"],
    ["Healthcare Solutions", "industry"],
    ["Cloud Alliance", "partners"],
  ])("links an already-visible validated %s title inline", (title, type) => {
    const current = match(title, title.toLowerCase().replace(/\W+/g, "-"), `${title} supports published delivery.`, type);
    const answer = `Successive provides ${title} for enterprise teams.`;
    expect(enrichAnswerWithValidatedInlineLinks(answer, [current]))
      .toContain(`[${title}](${current.document.url})`);
  });

  it("does not invent an inline link when the title is absent or external", () => {
    const current = match("Cloud Operations", "cloud-operations", "Cloud operations.");
    expect(enrichAnswerWithValidatedInlineLinks("Improve governed delivery.", [current]))
      .toBe("Improve governed delivery.");
    current.document.url = "https://example.test/cloud-operations/";
    expect(enrichAnswerWithValidatedInlineLinks("Cloud Operations improves delivery.", [current]))
      .toBe("Cloud Operations improves delivery.");
  });

  it("rejects a root-collapsed contextual destination unless the record is the intentional homepage", () => {
    const current = match("Sample Data Service", "sample-data-service", "Published process evidence.");
    current.document.url = "https://successive.tech//";
    expect(hasMeaningfulInlineDestination(current.document)).toBe(false);
    expect(enrichAnswerWithValidatedInlineLinks("Sample Data Service supports governed delivery.", [current]))
      .not.toContain("successive.tech//");
    current.document.slug = "home";
    expect(hasMeaningfulInlineDestination(current.document)).toBe(true);
  });

  it("uses a meaningful canonical service phrase for a CTA instead of a marketing lead-in", () => {
    expect(ctaAnchorTitle("Transform Business with AI Strategy Consulting"))
      .toBe("AI Strategy Consulting");
    expect(ctaAnchorTitle("Cloud Consulting Services Driving Business Transformation"))
      .toBe("Cloud Consulting Services");
    expect(ctaAnchorTitle("Commerce Platform"))
      .toBe("Commerce Platform");
    expect(ctaAnchorTitle("**React Engineering**"))
      .toBe("React Engineering");
  });

  it.each([
    ["Service Consulting", "page", "service", "service"],
    ["Kubernetes Engineering", "page", "technology", "technology"],
    ["AI Strategy Consulting", "page", "service", "ai-strategy"],
    ["Delivery Accelerator", "accelerators", "accelerator", "product"],
    ["Cloud Cost Optimization eBook", "page", "resource", "resource"],
    ["Cloud Computing Guide", "post", "blog", "blog"],
    ["Retail Transformation", "case_study", "case_study", "case-study"],
    ["Retail Solutions", "industries", "industry", "industry"],
  ] as const)("keeps CTA variation inside the %s category", (title, type, role, category) => {
    const current = match(title, title.toLowerCase().replace(/\W+/g, "-"), "Published supporting content.", type);
    current.document.role = role;
    const understanding = buildDeterministicUnderstanding(`Tell me about ${title}`);
    expect(ctaCategoryFor(current, understanding)).toBe(category);
    expect(ctaTemplateCount(category)).toBeGreaterThan(1);
    const cta = alignedCta(current, understanding)!;
    const expectedAnchor = category === "resource" ? "full resource" : category === "blog" ? "full article" :
      category === "case-study" ? "full case study" : ctaAnchorTitle(title);
    expect(cta).toContain(`[${expectedAnchor}](${current.document.url})`);
  });

  it("varies a service CTA sentence while preserving its anchor and URL", () => {
    const current = match("Platform Consulting", "platform-consulting", "Published supporting content.");
    current.document.role = "service";
    const understanding = buildDeterministicUnderstanding("Tell me about Platform Consulting");
    const first = alignedCta(current, understanding)!;
    const second = alignedCta(current, understanding)!;
    expect(first).not.toBe(second);
    [first, second].forEach((cta) => expect(cta).toContain(`[Platform Consulting](${current.document.url})`));
  });

  it.each([
    ["Service Delivery", "page", "service"],
    ["Technology Delivery", "page", "technology"],
    ["Product Delivery", "page", "product"],
    ["Workflow Accelerator", "accelerators", "accelerator"],
    ["Retail Solutions", "industries", "industry"],
  ] as const)("selects unique same-subject composition evidence for a substantial %s", (title, type, role) => {
    const current = match(title, title.toLowerCase().replace(/\W+/g, "-"),
      "First supported detail delivers governed implementation.", type);
    current.document.role = role;
    if (role === "product") current.document.productLike = true;
    current.document.descriptions = [
      "First supported detail delivers governed implementation.",
      "A distinct supported capability improves operational visibility and delivery confidence.",
    ];
    current.document.textSegments = [
      ...current.document.descriptions,
      "A second distinct supported detail helps teams apply the capability in enterprise workflows.",
    ];
    const understanding = buildDeterministicUnderstanding(`Tell me about ${title}`);
    expect(supportsEvidenceDrivenDepth(current, understanding)).toBe(true);
    expect(compositionEvidence(current)).toEqual([
      "First supported detail delivers governed implementation.",
      "A distinct supported capability improves operational visibility and delivery confidence.",
      "A second distinct supported detail helps teams apply the capability in enterprise workflows.",
    ]);
  });

  it("keeps person and narrow factual categories out of evidence-driven expansion", () => {
    const person = match("Leadership", "leadership", "A concise leadership fact.");
    person.document.role = "company";
    const fact = match("Office Locations", "office-locations", "A concise location fact.");
    expect(supportsEvidenceDrivenDepth(person, buildDeterministicUnderstanding("Who is the CEO?"))).toBe(false);
    expect(supportsEvidenceDrivenDepth(fact, buildDeterministicUnderstanding("Office locations"))).toBe(false);
  });

  it("adds a concise heading for a substantial subject but not a narrow fact", () => {
    const service = match("Cloud Delivery Services", "cloud-delivery", "Grounded service detail.");
    service.document.role = "service";
    const substantial = buildDeterministicUnderstanding("Tell me about cloud delivery");
    expect(ensureSubstantialTopicHeading("Grounded service detail.", service, substantial))
      .toBe("## Cloud Delivery Services\n\nGrounded service detail.");
    const fact = match("Office Locations", "office-locations", "A concise location fact.");
    expect(ensureSubstantialTopicHeading("A concise location fact.", fact, buildDeterministicUnderstanding("Office locations")))
      .toBe("A concise location fact.");
  });

  it("keeps structured-card composition inside the selected section boundary", () => {
    const section = match("Bounded Capability", "home", "The card's directly associated description supports the capability.");
    section.matchedFields = ["exact-structured-section"];
    section.document.descriptions = ["Unrelated text from another Home-page card must not be used."];
    section.document.textSegments = [...section.document.descriptions];
    expect(compositionEvidence(section)).toEqual([
      "The card's directly associated description supports the capability.",
    ]);
  });

  it("uses a carried local unit for embedded cards even without the legacy marker", () => {
    const section = match("Capability Alpha", "home", "Alpha provides governed delivery workflows.");
    section.document.descriptions = ["Unrelated cloud cost content must not be used."];
    section.document.textSegments = [...section.document.descriptions];
    section.matchedFields = ["exact-embedded-entity"];
    section.localEvidence = {
      groupPath: "capabilities[0]",
      heading: "Capability Alpha",
      passages: ["Capability Alpha", "Alpha provides governed delivery workflows."],
    };
    expect(compositionEvidence(section).join(" ")).toContain("governed delivery");
    expect(compositionEvidence(section).join(" ")).not.toContain("cloud cost");
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
