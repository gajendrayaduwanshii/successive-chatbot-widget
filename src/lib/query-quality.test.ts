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
  it("does not flatten a short explicit technology service query into the broad portfolio", () => {
    const understanding = buildDeterministicUnderstanding("Node.js + services");
    expect(understanding).toMatchObject({
      topics: ["node", "js"],
      requestedContentType: "service",
      targetScope: "portfolio",
    });
    expect(understanding.topics).not.toHaveLength(0);
  });

  it("keeps content-family words out of product and news topics", () => {
    expect(buildDeterministicUnderstanding("Kagen platform & products")).toMatchObject({
      topics: ["kagen"], requestedContentType: "kagen-product",
    });
    expect(buildDeterministicUnderstanding("Latest news")).toMatchObject({
      topics: [], requestedContentType: "news", temporalIntent: "latest",
    });
  });

  it("assigns partner identity to authoritative partner pages regardless of service taxonomy", () => {
    const partner = buildSearchDocument({
      id: 91, type: "page", slug: "example-cloud-partner",
      title: { rendered: "Example Cloud Consulting Partner" },
      link: "https://successive.tech/example-cloud-partner/",
      acf: { service_type: "Expertise", description: "Formal consulting partnership." },
    });
    expect(partner.role).toBe("partner");
  });

  it("derives product evidence from API launch and product metadata", () => {
    const launch = buildSearchDocument({
      id: 92, type: "press-release", slug: "company-launches-orbit-ai",
      title: { rendered: "Company Launches Orbit AI" },
      link: "https://successive.tech/press-release/company-launches-orbit-ai/",
      acf: { body_content: "Orbit AI is an enterprise automation platform." },
    });
    expect(launch.productLike).toBe(true);
  });
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

  it("keeps current-affairs, creative, and unrelated coding requests out of retrieval", () => {
    expect(isDeterministicallyOffTopic("Who is the Prime Minister?")).toBe(true);
    expect(isDeterministicallyOffTopic("Tell me a joke")).toBe(true);
    expect(isDeterministicallyOffTopic("Write Python sorting code")).toBe(true);
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

  it("uses grammatical content-type requests instead of noun presence", () => {
    expect(buildDeterministicUnderstanding("Our product search is poor").requestedContentType).toBeNull();
    expect(buildDeterministicUnderstanding("Which offering fits this problem?").requestedContentType).toBeNull();
    expect(buildDeterministicUnderstanding("Find a cloud cost article").requestedContentType).toBe("blog");
    expect(buildDeterministicUnderstanding("Show me a product").requestedContentType).toBe("product");
    expect(detectIntent("application security")).toBe("general");
  });

  it("extracts controlled problem families and desired outcomes", () => {
    expect(buildDeterministicUnderstanding("Our monolith is expensive to change")).toMatchObject({
      intent: "solve_problem",
      domains: expect.arrayContaining(["application modernization"]),
      retrievalConcepts: expect.arrayContaining(["legacy modernization"]),
      desiredOutcomes: expect.arrayContaining(["modernize"]),
    });
    expect(buildDeterministicUnderstanding("Editors wait for developers to publish content")).toMatchObject({
      domains: expect.arrayContaining(["content management"]),
      retrievalConcepts: expect.arrayContaining(["headless cms"]),
    });
    expect(buildDeterministicUnderstanding("Cloud spending has no clear owner")).toMatchObject({
      retrievalConcepts: expect.arrayContaining(["finops"]),
    });
    expect(buildDeterministicUnderstanding("Can you integrate security into CI/CD?")).toMatchObject({
      retrievalConcepts: expect.arrayContaining(["devsecops"]),
    });
  });

  it("recognizes negative premises and broad industry lists", () => {
    expect(buildDeterministicUnderstanding("You don't build AI systems, right?").containsPremise).toBe(true);
    const industries = applyStructuralBroadQueryRules(
      buildDeterministicUnderstanding("Industries focus"),
      "Industries focus",
    );
    expect(industries).toMatchObject({ requestedContentType: "industry", targetScope: "portfolio", topics: [] });
  });

  it("keeps pure company discovery separate from company phrasing with a subject", () => {
    expect(detectIntent("Tell me about Successive Digital.")).toBe("about");
    expect(detectIntent("What does Successive do with geospatial data?")).not.toBe("about");
  });

  it("extracts a named Successive team member as a company entity", () => {
    const understanding = buildDeterministicUnderstanding(
      "Who is Priya Mehta in Successive?",
    );

    expect(understanding.targetScope).toBe("company");
    expect(understanding.entities).toEqual(["priya mehta"]);
    expect(understanding.answerMode).toBe("define");
  });

  it("treats a team member listed in About content as authoritative", () => {
    const about = document(
      "About Us",
      "about-us",
      "Priya Mehta is Director of Engineering at Successive Digital.",
      ["Our Team"],
    );
    const understanding = buildDeterministicUnderstanding(
      "Who is Priya Mehta in Successive?",
    );
    const match = rankSearchDocument(
      about,
      "Who is Priya Mehta in Successive?",
      new Map(),
      understanding,
    );

    expect(match.matchedFields).toContain("exact-entity-content");
    expect(match.confidence).toBe("high");
    expect(match.selectedPassages[0]).toContain("Priya Mehta");
  });

  it("keeps every API-provided person name and designation in one passage", () => {
    const about = buildSearchDocument({
      id: 43,
      type: "page",
      slug: "about-us",
      link: "https://successive.tech/about-us/",
      title: { rendered: "About Us" },
      acf: {
        leadership_team: [{
          name: "Example Team Member",
          desgnation: "Engineering Practice Head",
        }],
      },
    });

    expect(about.textSegments).toContain(
      "Example Team Member — Engineering Practice Head",
    );
    expect(about.chunks.some((chunk) =>
      chunk.text.includes("Example Team Member — Engineering Practice Head"),
    )).toBe(true);

    const understanding = buildDeterministicUnderstanding(
      "Who is Example Team Membur in Successive?",
    );
    const match = rankSearchDocument(
      about,
      "Who is Example Team Membur in Successive?",
      new Map(),
      understanding,
    );
    expect(match.matchedFields).toContain("exact-entity-content");
    expect(match.selectedPassages[0]).toContain("Engineering Practice Head");
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

  it("prioritizes an exact API page title in a definition question", () => {
    const page = document(
      "Global Capabilities",
      "global-capabilities",
      "Published capability categories and technology details from this page.",
    );
    const match = rankSearchDocument(page, "What is Global Capabilities?");

    expect(match.matchedFields).toContain("exact-title");
    expect(match.confidence).toBe("high");
  });

  it("maps a company word-family query to its canonical API page", () => {
    const partners = document(
      "Partners & Alliances",
      "partners",
      "Published partner ecosystem information.",
    );
    const match = rankSearchDocument(partners, "Successive Partnerships");

    expect(match.matchedFields).toContain("canonical-page-identity");
    expect(match.score).toBeGreaterThan(150);

    for (const query of [
      "any partnership",
      "show partnerships",
      "do you have partners",
      "which alliances are available",
    ]) {
      expect(rankSearchDocument(partners, query).matchedFields)
        .toContain("canonical-page-identity");
    }
  });

  it("makes dynamic ACF section names searchable without page-specific logic", () => {
    const about = buildSearchDocument({
      id: 42,
      type: "page",
      slug: "about-us",
      link: "https://successive.tech/about-us/",
      title: { rendered: "About Us" },
      acf: {
        core_values: [
          { heading: "Integrity", "sub-heading": "We act with accountability." },
          { heading: "Agility", "sub-heading": "We adapt continuously." },
        ],
      },
    });
    const understanding = buildDeterministicUnderstanding("What are our core values?");
    const match = rankSearchDocument(
      about,
      "What are our core values?",
      new Map(),
      understanding,
    );

    expect(about.headings).toContain("core values");
    expect(understanding.targetScope).toBe("company");
    expect(match.selectedPassages[0]).toContain("Integrity");
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
