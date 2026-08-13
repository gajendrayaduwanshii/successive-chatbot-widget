import { describe, expect, it } from "vitest";
import { buildSearchDocument, buildSearchIndex } from "./search-index";
import { detectIntent } from "./intent-detector";
import {
  cardEligibility,
  isBroadAiServicesQuery,
  rankSearchDocument,
} from "./search-retriever";
import {
  applyStructuralBroadQueryRules,
  buildDeterministicUnderstanding,
  buildRetrievalQuery,
  queryUnderstandingSchema,
  isDeterministicallyOffTopic,
  shouldUseSemanticUnderstanding,
} from "./query-understanding";
import { QUERY_QUALITY_CASES } from "./query-quality-cases";

const document = (title: string, slug: string, body: string, headings: string[] = []) =>
  buildSearchDocument({
    id: Math.floor(Math.random() * 1_000_000),
    type: "page",
    slug,
    link: `https://successive.tech/${slug}/`,
    title: { rendered: title },
    content: { rendered: `<p>${body}</p>` },
    acf: { sections: headings.map((heading) => ({ heading })) },
  });

describe("generic query understanding", () => {
  it("treats terse AI prompts as broad AI service discovery", () => {
    expect(isBroadAiServicesQuery("what about ai")).toBe(true);
    expect(isBroadAiServicesQuery("AI")).toBe(true);
    expect(isBroadAiServicesQuery("AI services")).toBe(true);
  });

  it("skips semantic interpretation for ordinary lookups", () => {
    expect(
      shouldUseSemanticUnderstanding(
        buildDeterministicUnderstanding("What AI services do you offer?"),
        [],
      ),
    ).toBe(false);
    expect(
      shouldUseSemanticUnderstanding(
        buildDeterministicUnderstanding("Which service is best for us?"),
        [],
      ),
    ).toBe(true);
    expect(
      shouldUseSemanticUnderstanding(
        buildDeterministicUnderstanding("What about this?"),
        [{ role: "user", content: "Tell me about cloud services" }],
      ),
    ).toBe(true);
  });

  it("routes broad service discovery structurally without preserving noise as a topic", () => {
    const result = applyStructuralBroadQueryRules(
      buildDeterministicUnderstanding("What services do you provide?"),
      "What services do you provide?",
    );
    expect(result).toMatchObject({ requestedContentType: "service", topics: [], isBroadQuery: true });
  });
  it("keeps intent and topic as separate dimensions", () => {
    expect(buildDeterministicUnderstanding("AI")).toMatchObject({
      intent: "explore",
      topics: ["ai"],
      requestedContentType: null,
    });
    expect(buildDeterministicUnderstanding("AI case studies")).toMatchObject({
      intent: "evidence",
      requestedContentType: "case-study",
    });
  });

  it("does not infer a hard content type from an ordinary detail query", () => {
    expect(buildDeterministicUnderstanding("Tell me about FinOps").requestedContentType)
      .toBeNull();
    expect(buildDeterministicUnderstanding("Tell me about Successive Digital").requestedContentType)
      .toBeNull();
  });

  it("keeps pure company discovery separate from company phrasing with a subject", () => {
    expect(detectIntent("Tell me about Successive Digital.")).toBe("about");
    expect(detectIntent("What does Successive do with geospatial data?")).not.toBe("about");
  });

  it("deterministically rejects live sports-result questions but not sports software", () => {
    expect(isDeterministicallyOffTopic("Who won the football match?")).toBe(true);
    expect(isDeterministicallyOffTopic("Can you build software for a football academy?")).toBe(false);
  });

  it("validates a semantic business-problem plan without treating hints as facts", () => {
    const parsed = queryUnderstandingSchema.parse({
      normalizedQuery: "our old application is difficult to maintain",
      intent: "solve_problem",
      topics: ["legacy applications"],
      businessProblem: "An aging application is difficult to maintain",
      requestedContentType: "service",
      requestedAction: "find a relevant approach",
      entities: [],
      constraints: [],
      retrievalConcepts: ["application modernization", "legacy modernization", "application engineering"],
      isBroadQuery: false,
      isFollowUp: false,
      confidence: 0.91,
    });
    expect(buildRetrievalQuery(parsed)).toContain("application modernization");
    expect(parsed.businessProblem).toContain("difficult to maintain");
  });

  it("ships a broad, reusable quality dataset", () => {
    expect(QUERY_QUALITY_CASES.length).toBeGreaterThanOrEqual(14);
    expect(QUERY_QUALITY_CASES.some((item) => item.expectedIntent === "off_topic")).toBe(true);
    expect(QUERY_QUALITY_CASES.some((item) => item.conversationHistory || item.expectedIntent === "follow_up")).toBe(true);
  });
});

describe("canonical website normalization", () => {
  it("treats encoded ampersands and punctuation variants as the same identity", () => {
    const encoded = document(
      "GIS &#038; GeoAI Consulting Services",
      "gis-geoai-consulting-services",
      "Location intelligence and geospatial consulting.",
    );
    const match = rankSearchDocument(encoded, "GIS & GeoAI Consulting Services");
    expect(encoded.normalizedTitle).toBe("gis and geoai consulting services");
    expect(match.matchedFields).toContain("exact-title");
    expect(match.confidence).toBe("high");
  });

  it("normalizes smart quotes and dash variants consistently", () => {
    const smart = document(
      "Beyond Lift‑and‑Shift: What’s Next",
      "beyond-lift-and-shift-whats-next",
      "A cloud modernization article.",
    );
    expect(smart.normalizedTitle).toBe("beyond lift and shift what s next");
    expect(rankSearchDocument(smart, "Beyond Lift-and-Shift: What's Next").matchedFields)
      .toContain("exact-title");
  });
});

describe("website-derived capability profiles", () => {
  it("derives problem and outcome terms from authoritative page descriptions", () => {
    const capability = document(
      "Performance Engineering Services",
      "performance-engineering-services",
      "We solve slow application performance under peak traffic and improve scalability, resilience, and release efficiency.",
      ["Performance and scalability engineering"],
    );
    expect(capability.capabilityProfile.problemTerms).toContain("slow");
    expect(capability.capabilityProfile.outcomeTerms).toContain("scalability");
  });

  it("derives structured dimensions from ACF field semantics", () => {
    const capability = buildSearchDocument({
      id: 77,
      type: "page",
      slug: "operations-capability",
      link: "https://successive.tech/operations-capability/",
      title: { rendered: "Operations Capability" },
      acf: {
        service_type: "Sub-service",
        challenge_description: "Teams struggle with fragmented manual workflows.",
        outcome_description: "Improve operational visibility and efficiency.",
        technology_platform: "Cloud integration platform",
        industry: "Travel and hospitality",
        solution_description: "Implement workflow automation and system integration.",
      },
    });
    expect(capability.capabilityProfile.problemTerms).toContain("fragmented");
    expect(capability.capabilityProfile.outcomeTerms).toContain("visibility");
    expect(capability.capabilityProfile.technologyTerms).toContain("cloud");
    expect(capability.capabilityProfile.industryTerms).toContain("travel");
    expect(capability.capabilityProfile.activityTerms).toContain("automation");
  });

  it("connects natural case-study challenges to website-derived services", () => {
    const index = buildSearchIndex([
      {
        id: 1, type: "page", slug: "workflow-automation", link: "https://successive.tech/workflow-automation/",
        title: { rendered: "Workflow Automation Services" },
        acf: { service_type: "Sub-service", solution_description: "Automate manual vendor reconciliation workflows and improve operational efficiency." },
      },
      {
        id: 2, type: "case_study", slug: "vendor-settlement", link: "https://successive.tech/case-study/vendor-settlement/",
        title: { rendered: "Vendor Settlement Transformation" },
        acf: { challenge_sub_heading: "Manual vendor reconciliation caused settlement delays and operational inefficiency.", solution_sub_heading_left: "Workflow automation streamlined settlement operations." },
      },
    ]);
    expect(index.find((item) => item.id === 2)?.relatedCapabilities[0]?.documentId)
      .toBe(1);
  });

  it("does not create a capability bridge from generic unigram overlap", () => {
    const index = buildSearchIndex([
      {
        id: 10, type: "page", slug: "generic-platform", link: "https://successive.tech/generic-platform/",
        title: { rendered: "Digital Platform Development Services" },
        acf: { service_type: "Sub-service", solution_description: "Improve business operations, platform performance, growth, and management." },
      },
      {
        id: 11, type: "case_study", slug: "unrelated-growth", link: "https://successive.tech/case-study/unrelated-growth/",
        title: { rendered: "Business Growth Transformation" },
        acf: { challenge_sub_heading: "Business operations and platform management limited growth and performance." },
      },
    ]);
    expect(index.find((item) => item.id === 11)?.relatedCapabilities).toEqual([]);
  });

  it("requires every explicit constraint before presenting a card", () => {
    const capability = document("AWS Cloud Services", "aws-cloud-services", "AWS cloud migration and cost optimization.");
    const understanding = queryUnderstandingSchema.parse({
      normalizedQuery: "aws healthcare cost control", intent: "recommendation", topics: ["cloud"],
      businessProblem: "Cloud costs are rising", desiredOutcomes: ["cost control"], domains: ["cloud"],
      technicalSignals: ["AWS"], industry: "healthcare", existingPlatform: "AWS",
      requestedContentType: "service", entities: ["AWS"], constraints: ["healthcare"], retrievalConcepts: ["finops"],
      isBroadQuery: false, isFollowUp: false, confidence: 0.9,
    });
    const match = rankSearchDocument(capability, "AWS cloud cost control", new Map(), understanding);
    match.score = 200;
    match.confidence = "high";
    match.scoreBreakdown = { ...match.scoreBreakdown!, topic: 1, problem: 0.5, outcome: 0.5, entity: 1, industry: 0, constraintsTotal: 5, constraintsSatisfied: 4, contradictions: 1 };
    expect(cardEligibility(match, understanding, 200)).toMatchObject({ accepted: false });
  });
});

describe("website-derived topic authority", () => {
  for (const topic of ["AI", "Cloud", "Healthcare", "Commerce", "Security", "Automation"]) {
    it(`ranks a document about ${topic} above an incidental mention`, () => {
      const authoritative = document(
        `${topic} Capabilities`,
        `${topic.toLowerCase()}-capabilities`,
        `${topic} strategy, engineering, implementation, and measurable business outcomes.`,
        [`Build with ${topic}`, `${topic} expertise`],
      );
      const incidental = document(
        "Unrelated Operating Model",
        "unrelated-operating-model",
        `This page is about an unrelated operating model. It briefly mentions ${topic}-enabled solutions in one sentence.`,
        ["Operating model"],
      );
      const strong = rankSearchDocument(authoritative, topic);
      const weak = rankSearchDocument(incidental, topic);
      expect(strong.score).toBeGreaterThan(weak.score);
      expect(weak.matchedFields).toContain("incidental-body-only");
      expect(strong.scoreBreakdown?.authorityCoverage).toBeGreaterThan(0);
    });
  }
});
