import { describe, expect, it } from "vitest";
import { buildSearchDocument, buildSearchIndex, normalizeServiceSchemaType } from "./search-index";
import { detectIntent } from "./intent-detector";
import {
  cardEligibility,
  canonicalEquivalentSubjectStrength,
  definitionEvidencePassages,
  semanticSynthesisEvidencePassages,
  extractExplicitInformationalSubject,
  semanticInformationalSubject,
  isBroadAiServicesQuery,
  isExplicitRequestedRoleRelation,
  isRequestedContentTypeCompatible,
  matchExactIndexedTitle,
  matchValidatedRequestedRole,
  rankEmbeddedEntityEvidence,
  rankSearchDocument,
  selectSiblingEntityMatches,
} from "./search-retriever";
import {
  applyStructuralBroadQueryRules,
  buildDeterministicUnderstanding,
  buildRetrievalQuery,
  queryUnderstandingSchema,
  isDeterministicallyOffTopic,
  shouldUseOffTopicFallback,
  isExplicitListRequest,
  classifyFollowUpScope,
  isFacetOnlyFollowUp,
  resolveConversationUnderstanding,
  shouldUseSemanticUnderstanding,
} from "./query-understanding";
import { QUERY_QUALITY_CASES } from "./query-quality-cases";
import { extractQueryFacets, inferQueryRelation } from "./query-facets";

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

describe("capability wrapper normalization", () => {
  it("preserves the underlying capability subject without wrapper contamination", () => {
    const understanding = buildDeterministicUnderstanding("Do you support mobile development as well?");
    expect(understanding.topics).toEqual(["mobile", "development"]);
    expect(understanding.requestedContentType).toBe("service");
    expect(buildRetrievalQuery(understanding)).not.toMatch(/support|well/);
  });
});

describe("standalone and follow-up canonical subject consistency", () => {
  const canonical = document(
    "Workflow Orchestration Services and Solutions",
    "workflow-orchestration-services",
    "Workflow orchestration coordinates business operations.",
  );

  it.each([
    "Tell me about Workflow Orchestration",
    "What about Workflow Orchestration?",
    "Explain Workflow Orchestration",
    "Workflow Orchestration",
    "Can you tell me about Workflow Orchestration?",
  ])("resolves the same canonical entity through informational wrapper: %s", (query) => {
    expect(matchExactIndexedTitle([canonical], query)?.document.id).toBe(canonical.id);
  });

  it("preserves the complete multi-word subject while removing only the wrapper", () => {
    expect(extractExplicitInformationalSubject(
      "Could you tell me about Workflow Orchestration?",
    )).toBe("workflow orchestration");
  });

  it("treats a leading commercial qualifier as a predicate rather than entity identity", () => {
    expect(extractExplicitInformationalSubject("free Sample Cloud Consulting services?"))
      .toBe("sample cloud consulting services");
  });

  it("does not require prior conversation state for a standalone subject", () => {
    const standalone = matchExactIndexedTitle([canonical], "Workflow Orchestration");
    expect(standalone).toMatchObject({ document: { id: canonical.id }, confidence: "high" });
  });

  it("keeps an explicit new subject when unrelated history exists", () => {
    const current = buildDeterministicUnderstanding("What about Workflow Orchestration?");
    const resolved = resolveConversationUnderstanding(current, [
      { role: "user", content: "Tell me about retail commerce" },
      { role: "assistant", content: "Published retail information." },
    ]).understanding;
    expect(resolved.topics).toEqual(["workflow", "orchestration"]);
    expect(classifyFollowUpScope(current, current.normalizedQuery)).toBe("SWITCH_TOPIC");
  });

  it("inherits a retained subject for a subjectless facet follow-up but not for an explicit replacement", () => {
    expect(isFacetOnlyFollowUp("What are the benefits?")).toBe(true);
    expect(isFacetOnlyFollowUp("What are the benefits of Workflow Orchestration?")).toBe(false);

    const inherited = resolveConversationUnderstanding(
      buildDeterministicUnderstanding("What are the benefits?"),
      [{ role: "user", content: "Tell me about Workflow Orchestration" }],
    ).understanding;
    expect(inherited.topics).toEqual(["workflow", "orchestration"]);

    const replacement = resolveConversationUnderstanding(
      buildDeterministicUnderstanding("What are the benefits of Cloud Cost Optimization?"),
      [{ role: "user", content: "Tell me about Workflow Orchestration" }],
    ).understanding;
    expect(replacement.topics).toContain("cloud");
    expect(replacement.topics).not.toContain("workflow");
  });

  it("does not manufacture a canonical match for genuine no-content wording", () => {
    expect(matchExactIndexedTitle([canonical], "Tell me about an unpublished orbital ledger"))
      .toBeUndefined();
  });

  it("preserves exact entity and exact capability controls", () => {
    const entity = document("Atlas Platform", "atlas-platform", "Atlas is a published platform.");
    expect(matchExactIndexedTitle([entity, canonical], "Atlas Platform")?.document.id).toBe(entity.id);
    expect(matchExactIndexedTitle([entity, canonical], "Workflow Orchestration")?.document.id).toBe(canonical.id);
  });

  it("keeps a canonical offering ahead of a same-subject resource unless an editorial role is requested", () => {
    const offering = document("Workflow Orchestration Services", "workflow-orchestration-services", "Published service evidence.");
    offering.role = "service";
    const ebook = document("Workflow Orchestration", "workflow-orchestration-ebook", "Published eBook evidence.");
    ebook.role = "resource";
    expect(matchExactIndexedTitle([ebook, offering], "Tell me about Workflow Orchestration.")?.document.id).toBe(offering.id);
    expect(matchExactIndexedTitle([offering, ebook], "Tell me about Workflow Orchestration eBook.", "ebook")?.document.id).toBe(ebook.id);
  });

  it("recovers one unambiguous indexed entity-token typo without using body text", () => {
    const awards = document("Awards and Recognitions", "awards", "Published award evidence.");
    awards.role = "awards";
    expect(matchExactIndexedTitle([awards], "awrad")?.matchedFields).toContain("indexed-entity-typo-recovery");
    const alternate = document("Award Platform", "award-platform", "Different published entity.");
    expect(matchExactIndexedTitle([awards, alternate], "awrad")).toBeUndefined();
  });

  it("normalizes a direct definition article before canonical identity lookup", () => {
    const api = document("API Development Company", "api-development", "An API is an application programming interface for software communication.");
    const shopping = document("Social Shopping Guide", "social-shopping", "An API appears incidentally in commerce guidance.");
    expect(matchExactIndexedTitle([shopping, api], "What is an API?")?.document.id).toBe(api.id);
  });

  it("requires semantic definition evidence instead of contextual failure copy", () => {
    const contextual = document("API Development Company", "api-development", "API is offline, so display popular items. API latency and API failure handling are monitored.");
    const definition = document("API Development Company", "api-development", "An API is an application programming interface that enables software systems to communicate.");
    expect(definitionEvidencePassages(contextual, "api")).toEqual([]);
    expect(definitionEvidencePassages(definition, "api")).toEqual([
      "An API is an application programming interface that enables software systems to communicate.",
    ]);
    expect(matchExactIndexedTitle([contextual], "What is an API?")).toBeUndefined();
    expect(matchExactIndexedTitle([definition], "What is an API?")?.selectedPassages).toEqual([
      "An API is an application programming interface that enables software systems to communicate.",
    ]);
  });

  it("admits direct subject-specific capability evidence without a dictionary definition", () => {
    const technology = document(
      "Nimbus UI Framework", "nimbus-ui-framework",
      "Nimbus UI Framework helps frontend teams build interactive application interfaces with reusable components.",
    );
    technology.role = "technology";
    expect(definitionEvidencePassages(technology, "Nimbus UI")).toEqual([]);
    expect(semanticSynthesisEvidencePassages(technology, "Nimbus UI")).toEqual([
      "Nimbus UI Framework helps frontend teams build interactive application interfaces with reusable components.",
    ]);
    const resolved = matchExactIndexedTitle([technology], "What is Nimbus UI?");
    expect(resolved?.matchedFields).toContain("semantic-subject-evidence");
    expect(resolved?.selectedPassages[0]).toMatch(/frontend teams/i);
  });

  it("recognizes a bounded technology qualifier in a canonical title without accepting body-only mentions", () => {
    const canonical = document(
      "Aurora JS Development Company", "aurora-js-development",
      "Aurora JS development helps teams build maintainable web applications.",
    );
    canonical.role = "technology";
    const incidental = document(
      "Unrelated Delivery Guide", "unrelated-delivery-guide",
      "This article briefly mentions Aurora while describing an unrelated delivery process.",
    );
    expect(matchExactIndexedTitle([canonical, incidental], "What is Aurora?")?.document.id).toBe(canonical.id);
    expect(matchExactIndexedTitle([incidental], "What is Aurora?")).toBeUndefined();
  });

  it("does not treat a vendor or locally-pronominal API as generic API", () => {
    const vendor = document(
      "BigCommerce API", "bigcommerce-api",
      "BigCommerce API is a commerce integration interface for storefront operations. This API helps manage shopper carts.",
    );
    const generic = document("API Overview", "api-overview", "An API is an application programming interface for software communication.");
    expect(definitionEvidencePassages(vendor, "api")).toEqual([]);
    expect(definitionEvidencePassages(vendor, "bigcommerce api")).toEqual([
      "BigCommerce API is a commerce integration interface for storefront operations.",
    ]);
    expect(definitionEvidencePassages(generic, "api")).toEqual([
      "An API is an application programming interface for software communication.",
    ]);
    expect(matchExactIndexedTitle([vendor], "What is an API?")).toBeUndefined();
  });

  it("keeps a canonically locked sub-service compatible through final alignment", () => {
    const subService = document("Workflow Orchestration Services", "workflow-orchestration-services", "Published capability.");
    subService.role = "service";
    subService.service_type = "Sub-service";
    expect(isRequestedContentTypeCompatible(subService, "sub-service")).toBe(true);
  });
});

describe("structured capability sections and safe canonical equivalence", () => {
  it.each([
    ["AI-Native Product Engineering", "Design and ship production-grade products and platforms."],
    ["Autonomous Platform Delivery", "Design and ship reliable platforms with governed automation."],
    ["Data Intelligence Operations", "Turn governed enterprise data into decisions embedded in daily workflows."],
    ["Experience Commerce Systems", "Build connected customer journeys and scalable commerce operations."],
  ])("treats a bounded major section as evidence for %s", (subject, description) => {
    const home = buildSearchDocument({
      id: Math.floor(Math.random() * 1_000_000), type: "page", slug: "home", link: "https://successive.tech/",
      title: { rendered: "Home" }, content: { rendered: "" },
      acf: { services: [{ link: { title: subject, url: "https://successive.tech/capability/" }, description }] },
    });
    const query = `What is ${subject}?`;
    const matches = rankEmbeddedEntityEvidence([home], query, buildDeterministicUnderstanding(query), new Set());
    expect(matches[0]).toMatchObject({ document: { title: subject, url: "https://successive.tech/capability/" }, confidence: "high" });
    expect(matches[0]?.matchedFields).toContain("exact-structured-section");
    expect(matches[0]?.selectedPassages).toContain(description);
  });

  it("does not elevate an incidental body occurrence into a structured subject identity", () => {
    const incidental = buildSearchDocument({
      id: 72231, type: "page", slug: "company-story", link: "https://successive.tech/company-story/",
      title: { rendered: "Company Story" }, content: { rendered: "<p>An incidental phrase, Autonomous Platform Delivery, appeared in a customer quotation.</p>" },
    });
    const query = "What is Autonomous Platform Delivery?";
    const matches = rankEmbeddedEntityEvidence([incidental], query, buildDeterministicUnderstanding(query), new Set());
    expect(matches).toEqual([]);
  });

  it("accepts a bounded structured named platform but not a body-only mention", () => {
    const home = buildSearchDocument({
      id: 72230, type: "page", slug: "home", link: "https://successive.tech/",
      title: { rendered: "Home" }, content: { rendered: "" },
      acf: {
        kagen_card_heading: "Atlas Launch",
        hero_description: "Atlas Launch, our AI-native platform, helps enterprises plan, build, test, and launch.",
      },
    });
    const incidental = document("Company Story", "company-story", "Atlas Launch was mentioned during an event.");
    const query = "What is Atlas Launch?";
    const understanding = buildDeterministicUnderstanding(query);
    expect(understanding.answerMode).toMatch(/define|explain|details|summarize/);
    const matches = rankEmbeddedEntityEvidence([incidental, home], query, understanding, new Set());
    expect(matches.map((match) => match.document.title)).toEqual(["Home"]);
    expect(matches[0]?.matchedFields).toContain("embedded-direct-subject-authority");
  });

  it("accepts a title-level equivalent canonical subject but rejects an announcement with broad overlap", () => {
    const canonical = document("Machine Intelligence Strategy Consulting", "machine-intelligence-strategy", "Advisory services define an adoption roadmap and delivery approach.");
    const announcement = buildSearchDocument({
      id: 72232, type: "press-release", slug: "machine-intelligence-launch", link: "https://successive.tech/launch/",
      title: { rendered: "Machine Intelligence Adoption Launch" }, content: { rendered: "<p>A company announcement about a new launch.</p>" },
    });
    expect(canonicalEquivalentSubjectStrength(canonical, "Machine Intelligence Adoption Strategy")).toBeGreaterThanOrEqual(0.95);
    expect(canonicalEquivalentSubjectStrength(announcement, "Machine Intelligence Adoption Strategy")).toBe(0);
  });

  it("preserves an adoption-strategy subject when selecting an equivalent canonical service", () => {
    const consulting = document("Transform Business with AI Strategy Consulting", "ai-strategy-consulting", "AI strategy consulting defines a practical adoption roadmap.");
    expect(canonicalEquivalentSubjectStrength(consulting, "AI Adoption Strategy")).toBeGreaterThanOrEqual(0.95);
  });
});

describe("shared service-family source-schema normalization", () => {
  const typedDocument = (serviceType: string) => buildSearchDocument({
    id: Math.floor(Math.random() * 1_000_000), type: "page", slug: "published-capability",
    link: "https://successive.tech/published-capability/",
    title: { rendered: "Published Capability" },
    content: { rendered: "<p>A grounded published capability.</p>" },
    acf: { service_type: serviceType },
  });

  it.each([
    ["Service", "service"],
    ["Sub-service", "sub-service"],
    ["sub_service", "sub-service"],
    ["Expertise", "expertise"],
    ["Piller", "pillar"],
  ] as const)("normalizes source-schema alias %s to %s", (raw, expected) => {
    expect(normalizeServiceSchemaType(raw)).toBe(expected);
    expect(isRequestedContentTypeCompatible(typedDocument(raw), "service")).toBe(true);
  });

  it("keeps an explicit sub-service taxonomy request strict", () => {
    expect(isRequestedContentTypeCompatible(typedDocument("Sub-service"), "sub-service")).toBe(true);
    expect(isRequestedContentTypeCompatible(typedDocument("Expertise"), "sub-service")).toBe(false);
  });

  it.each([
    ["post", "blog"],
    ["case-study", "case_study"],
  ] as const)("rejects a %s candidate as explicit service evidence", (type, role) => {
    const candidate = document("Published Story", "published-story", "A published story.");
    candidate.type = type;
    candidate.role = role;
    expect(isRequestedContentTypeCompatible(candidate, "service")).toBe(false);
  });

  it("rejects a general navigation page as service evidence", () => {
    const navigation = document("Site Navigation", "site-navigation", "Browse pages and links.");
    navigation.role = "page";
    expect(isRequestedContentTypeCompatible(navigation, "service")).toBe(false);
  });
});

describe("multi-part query coverage", () => {
  it("represents a dependent related-content clause without instruction residue", () => {
    const facets = extractQueryFacets("Tell me about your cloud services and give me an example of a related case study.");
    expect(facets.map(({ subject, requestedContentType, dependent }) =>
      ({ subject, requestedContentType, dependent }))).toEqual([
      { subject: "cloud services", requestedContentType: "service", dependent: false },
      { subject: "cloud services", requestedContentType: "case-study", dependent: true },
    ]);
    expect(facets.flatMap(({ understanding }) => understanding.topics).join(" ")).not.toMatch(/example|give/);
  });

  it.each([
    ["Tell me about Atlas Engineering and show me related services.", true],
    ["Tell me about Atlas Engineering and give me a related case study.", true],
    ["Tell me about Widget Runtime and show me related articles.", true],
    ["Tell me about Workflow Automation. Give me an example.", true],
    ["Tell me about Atlas Engineering and then tell me about Orion Modernization.", false],
    ["Tell me about Atlas Engineering and show me Orion services.", false],
  ])("distinguishes dependent relation clauses from explicit subjects: %s", (query, secondDependent) => {
    const facets = extractQueryFacets(query);
    expect(facets).toHaveLength(2);
    expect(facets[1]?.dependent).toBe(secondDependent);
    if (secondDependent) expect(facets[1]?.subject).toBe(facets[0]?.subject);
    else expect(facets[1]?.subject).not.toBe(facets[0]?.subject);
  });
  it("keeps independently answerable clauses separate", () => {
    const facets = extractQueryFacets("Whos the founder and how long company is in business?");
    expect(facets.map(({ text }) => text)).toEqual([
      "Whos the founder",
      "how long company is in business",
    ]);
  });
  it("separates a capability request from a requested evidence type", () => {
    expect(extractQueryFacets("Show automation capabilities and a relevant case study"))
      .toHaveLength(2);
  });
  it.each([
    ["Who is the CEO and tell me about the company?", ["Who is the CEO", "tell me about the company"]],
    ["Who is the founder and what does Successive Digital do?", ["Who is the founder", "what does Successive Digital do"]],
    ["Who are the Board of Directors and what does the company do?", ["Who are the Board of Directors", "what does the company do"]],
    ["Show me the Executive Management team and tell me about Successive Digital.", ["Show me the Executive Management team", "tell me about Successive Digital."]],
    ["What is React and what does it cost to create a React project?", ["What is React", "what does it cost to create a React project"]],
    ["Tell me about Cloud Migration and how much would implementation cost?", ["Tell me about Cloud Migration", "how much would implementation cost"]],
    ["What AI services do you provide and how can I discuss a project?", ["What AI services do you provide", "how can I discuss a project"]],
    ["What industries does Successive work with and what services do you provide for healthcare?", ["What industries does Successive work with", "what services do you provide for healthcare"]],
    ["Who is the Founder and what AI services does Successive provide?", ["Who is the Founder", "what AI services does Successive provide"]],
    ["Tell me about React development. How much would that service cost?", ["Tell me about React development", "How much would that service cost"]],
    ["Tell me about Data Engineering. What about Application Modernization? How can I discuss that project?", ["Tell me about Data Engineering", "What about Application Modernization", "How can I discuss that project"]],
    ["Tell me about your cloud services and give me an example of a related case study.", ["Tell me about your cloud services", "give me an example of a related case study."]],
    ["Tell me about Data Engineering and show me related services. Then tell me how I can discuss that project with Successive.", ["Tell me about Data Engineering", "show me related services", "Then tell me how I can discuss that project with Successive."]],
  ])("preserves independently answerable intent clauses: %s", (query, expected) => {
    expect(extractQueryFacets(query).map(({ text }) => text)).toEqual(expected);
  });
});

describe("generic query understanding", () => {
  it("keeps the required published blog title intact inside the used-for grammar", () => {
    const exact = buildSearchDocument({
      id: 12675, type: "post", slug: "evolving-technologies-making-way-to-deal-with-coronavirus-pandemic",
      link: "https://successive.tech/blog/evolving-technologies-making-way-to-deal-with-coronavirus-pandemic/",
      title: { rendered: "Evolving Technologies Making Way to Deal With Coronavirus Pandemic" },
      content: { rendered: "<p>Published first-party article evidence.</p>" },
    });
    const broadCatalogue = document("Global Capabilities", "global-capabilities", "Published technology catalogue.");
    const query = "What is Evolving Technologies Making Way to Deal With Coronavirus Pandemic used for?";
    expect(extractExplicitInformationalSubject(query)).toBe(exact.normalizedTitle);
    expect(matchExactIndexedTitle([broadCatalogue, exact], query)?.document.id).toBe(exact.id);
  });

  it.each([
    ["Understanding the Investment: The Cost to Develop a Robust Real Estate App", "post", "What is {title} used for?"],
    ["Cloud Cost Analysis: A Comprehensive Guide", "post", "Tell me about {title}."],
    ["Modern Application Development Services and Implementation", "page", "How does {title} work?"],
    ["Enterprise Delivery Team Earns a Technology Award", "award", "What does {title} do?"],
    ["Retail Platform Transformation for Faster Fulfilment", "case_study", "Summarize {title}"],
  ] as const)("locks an indexed title before intent words are interpreted: %s", (title, type, wrapper) => {
    const exact = buildSearchDocument({
      id: Math.floor(Math.random() * 1_000_000), type,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      link: `https://successive.tech/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/`,
      title: { rendered: title },
      content: { rendered: `<p>${title} has exact first-party descriptive evidence.</p>` },
    });
    const unrelated = document("Generic Development Services", "generic-development", "Generic commercial development services.");
    const match = matchExactIndexedTitle([unrelated, exact], wrapper.replace("{title}", title));
    expect(match?.document.id).toBe(exact.id);
    expect(match?.matchedFields).toContain("exact-title-lock");
  });

  it("preserves one punctuated canonical title across equivalent direct wrappers", () => {
    const title = "How Much Does Atlas Cost? [A 2026 Guide]: Plan (Carefully)";
    const exact = document(title, "atlas-cost-guide", `${title} has published evidence.`);
    for (const query of [
      `Tell me about ${title}.`, `What does ${title} do?`,
      `How does ${title} work?`, `What is ${title} used for?`, `What is ${title}?`,
    ]) expect(matchExactIndexedTitle([exact], query)?.document.id).toBe(exact.id);
  });

  it("locks a canonical title after an explicit topic-switch wrapper", () => {
    const exact = document("Payment Gateway Integration: A Complete Guide", "payment-gateway-guide", "Published evidence.");
    expect(matchExactIndexedTitle(
      [exact],
      `Switch topics: tell me about ${exact.title}.`,
    )?.document.id).toBe(exact.id);
  });

  it("locks a corpus-owned title through one bounded typo without weakening identity", () => {
    const exact = document("Status Codes in API Testing", "status-codes-api-testing", "Published evidence.");
    expect(matchExactIndexedTitle([exact], "pls tell abt Staus Codes in API Testing?")?.document.id)
      .toBe(exact.id);
  });

  it("abstains from ambiguous corpus typo correction", () => {
    const first = document("Cloud Store Guide", "cloud-store-guide", "Published evidence.");
    const second = document("Cloud Score Guide", "cloud-score-guide", "Published evidence.");
    expect(matchExactIndexedTitle([first, second], "Tell me about Cloud Sore Guide."))
      .toBeUndefined();
  });

  it("does not lock weak partial title similarity", () => {
    const exact = document("Enterprise Cloud Implementation Cost Guide", "cloud-cost-guide", "Published evidence.");
    expect(matchExactIndexedTitle([exact], "Tell me about cloud implementation."))
      .toBeUndefined();
  });

  it("locks published titles containing safeguard-like role and roadmap words", () => {
    const roleArticle = document("The Role of Observability in Reliable Delivery", "role-observability", "Published article.");
    const roadmapArticle = document("Enterprise Platform Guide: From Roadmap to Growth", "platform-roadmap", "Published roadmap article.");
    expect(matchExactIndexedTitle([roleArticle], `What is ${roleArticle.title} used for?`)?.document.id)
      .toBe(roleArticle.id);
    expect(matchExactIndexedTitle([roadmapArticle], `Tell me about ${roadmapArticle.title}.`)?.document.id)
      .toBe(roadmapArticle.id);
    expect(matchExactIndexedTitle([roleArticle], "Show current engineering roles."))
      .toBeUndefined();
  });

  it("keeps an authoritative exact title even when its vocabulary looks off-topic", () => {
    const exact = document(
      "Business Lessons from a Championship Match", "business-lessons-championship-match",
      "First-party editorial evidence connects teamwork and strategy to business.",
    );
    const query = `Tell me about ${exact.title}.`;
    const lock = matchExactIndexedTitle([exact], query);
    const semanticOffTopic = { ...buildDeterministicUnderstanding(query), intent: "off_topic" as const, isOffTopic: true };
    expect(lock?.document.id).toBe(exact.id);
    expect(shouldUseOffTopicFallback(query, semanticOffTopic, Boolean(lock))).toBe(false);
    expect(shouldUseOffTopicFallback(query, semanticOffTopic, false)).toBe(true);
  });

  it("retains explicit short article topics for evidence-constrained retrieval", () => {
    expect(buildDeterministicUnderstanding("Show articles about teamwork.")).toMatchObject({
      requestedContentType: "blog", topics: ["teamwork"],
    });
    expect(buildDeterministicUnderstanding("Show articles about confidential.")).toMatchObject({
      requestedContentType: "blog", topics: ["confidential"],
    });
  });

  it("preserves outgoing structured links as role edges in a full corpus", () => {
    const base = {
      id: 1, type: "post", slug: "operating-model-guide",
      link: "https://successive.tech/blog/operating-model-guide/",
      title: { rendered: "Operating Model Guide" }, content: { rendered: "<p>A published guide.</p>" },
      acf: { related_items: [{ url: "https://successive.tech/cloud-delivery/" }, { url: "https://successive.tech/platform-delivery/" }, { url: "https://successive.tech/industries/energy/" }] },
    };
    const service = {
      id: 2, type: "page", slug: "cloud-delivery", link: "https://successive.tech/cloud-delivery/",
      title: { rendered: "Cloud Delivery Services" }, content: { rendered: "<p>Cloud delivery services.</p>" },
      acf: { service_type: "Service" },
    };
    const industry = {
      id: 3, type: "industries", slug: "energy", link: "https://successive.tech/industries/energy/",
      title: { rendered: "Energy" }, content: { rendered: "<p>Energy industry.</p>" }, acf: {},
    };
    const secondService = {
      id: 4, type: "page", slug: "platform-delivery", link: "https://successive.tech/platform-delivery/",
      title: { rendered: "Platform Delivery Services" }, content: { rendered: "<p>Platform delivery services.</p>" },
      acf: { service_type: "Service" },
    };
    const semanticAlternative = {
      id: 5, type: "page", slug: "operating-model-consulting", link: "https://successive.tech/operating-model-consulting/",
      title: { rendered: "Operating Model Consulting Services" }, content: { rendered: "<p>Operating model guide consulting services.</p>" },
      acf: { service_type: "Service" },
    };
    const filler = Array.from({ length: 246 }, (_, index) => ({
      id: index + 10, type: "page", slug: `unrelated-${index}`,
      link: `https://successive.tech/unrelated-${index}/`, title: { rendered: `Unrelated Page ${index}` },
      content: { rendered: "<p>Generic unrelated content.</p>" }, acf: {},
    }));
    const index = buildSearchIndex([base, service, industry, secondService, semanticAlternative, ...filler]);
    expect(matchValidatedRequestedRole(index, "Show services related to Operating Model Guide.", "service").map(x => x.document.id).sort())
      .toEqual([service.id, secondService.id].sort());
    expect(matchValidatedRequestedRole(index, "Show industries related to Operating Model Guide.", "industry")[0]?.document.id)
      .toBe(industry.id);
  });

  it("does not turn a role-relationship request into an exact-title lookup", () => {
    const article = document("A Guide to Emerging Operations", "emerging-operations", "Published article.");
    expect(matchExactIndexedTitle(
      [article],
      "Show case studies related to A Guide to Emerging Operations.",
    )).toBeUndefined();
  });

  it("recognizes an explicit role relation even when its long subject contains a pronoun", () => {
    expect(isExplicitRequestedRoleRelation(
      "Show services related to What is Customer Experience in Business and Why It Matters in the Digital Era.",
    )).toBe(true);
    expect(isExplicitRequestedRoleRelation("What does it do?")).toBe(false);
  });

  it("selects only role-compatible exact or explicitly related records", () => {
    const service = { ...document("Nova Operations Services", "nova-operations-services", "Nova delivery offering."), role: "service" as const };
    const article = document("Nova Operations Guide", "nova-operations-guide", "An editorial guide.");
    const caseStudy = { ...document("Nova Customer Outcome", "nova-customer-outcome", "Customer outcome."), role: "case_study" as const, type: "case_study" };
    const linkedArticle = { ...article, relatedCapabilities: [{
      documentId: caseStudy.id, score: 0.9, evidence: ["internal-link" as const],
    }] };
    expect(matchValidatedRequestedRole(
      [service, linkedArticle, caseStudy],
      "Show services related to Nova Operations Services.",
      "service",
    )).toEqual([]);
    expect(matchValidatedRequestedRole(
      [service, linkedArticle, caseStudy],
      "Show case studies related to Nova Operations Guide.",
      "case-study",
    )[0]?.document.id).toBe(caseStudy.id);
    expect(matchValidatedRequestedRole(
      [service, article, caseStudy],
      "Show case studies related to Nova Operations Guide.",
      "case-study",
    )).toEqual([]);
  });

  it("keeps the explicit related-content subject separate from its requested role", () => {
    const subject = { ...document("Experience Design Services", "experience-design-services", "Published Experience Design service."), role: "service" as const };
    const first = { ...document("Improving Experience Design", "improving-experience-design", "Published article."), role: "blog" as const, type: "post" };
    const second = { ...document("Experience Design Research", "experience-design-research", "Published article."), role: "blog" as const, type: "post" };
    const weak = { ...document("Cloud Experience Delivery Guide", "cloud-experience-delivery", "Published article."), role: "blog" as const, type: "post" };
    const devops = { ...document("DevOps Automation", "devops-automation", "Published article."), role: "blog" as const, type: "post" };
    const query = "Show me articles related to Experience Design.";
    expect(extractExplicitInformationalSubject(query)).toBe("experience design");
    expect(buildDeterministicUnderstanding(query).requestedContentType).toBe("blog");
    expect(matchValidatedRequestedRole([subject, first, second, weak, devops], query, "blog")
      .map(({ document }) => document.title)).toEqual(["Improving Experience Design", "Experience Design Research"]);
  });

  it("fails closed when a related-content role has no strong subject relation", () => {
    const subject = { ...document("Sample Capability", "sample-capability", "Published capability."), role: "service" as const };
    const unrelated = { ...document("Cloud Infrastructure Guide", "cloud-infrastructure-guide", "Published article."), role: "blog" as const, type: "post" };
    expect(matchValidatedRequestedRole([subject, unrelated], "Show me articles related to Sample Capability.", "blog")).toEqual([]);
  });

  it.each([
    ["Atlas Flow", "product", "Atlas Flow is an AI platform that automates governed delivery."],
    ["Nova Migration", "service", "Nova Migration is a service that helps teams modernize applications."],
    ["Orbit Studio", "technology", "Orbit Studio is a technology offering for building digital experiences."],
    ["Summit Alliance", "partner", "Summit Alliance is a partner program for joint cloud delivery."],
    ["Rapid Mapper", "accelerator", "Rapid Mapper is an accelerator that automates geospatial analysis."],
    ["Care Pathway", "industry", "Care Pathway is a healthcare solution designed for patient workflows."],
  ] as const)("uses embedded first-party descriptions for unseen %s entities", (entity, requestedType, description) => {
    const authoritative = document("Capabilities", "capabilities", description, [entity]);
    const parent = buildSearchDocument({
      id: Math.floor(Math.random() * 1_000_000), type: "press-release", slug: "parent-announcement",
      link: "https://successive.tech/parent-announcement/", title: { rendered: `${entity.split(" ")[0]} announcement` },
      content: { rendered: `<p>${entity.split(" ")[0]} is part of a broader company initiative.</p>` },
    });
    const understanding = {
      ...buildDeterministicUnderstanding(`What is ${entity}?`),
      requestedContentType: requestedType,
      topics: entity.toLowerCase().split(" "),
    } as ReturnType<typeof buildDeterministicUnderstanding>;
    const matches = rankEmbeddedEntityEvidence(
      [parent, authoritative], `What is ${entity}?`, understanding, new Set(),
    );
    expect(matches[0]?.document.title).toBe("Capabilities");
    expect(matches[0]?.matchedFields).toContain("exact-embedded-entity");
    expect(matches[0]?.selectedPassages.join(" ")).toContain(entity);
    expect(matches.some((match) => match.document.id === parent.id)).toBe(false);
  });

  it("keeps exact embedded entity representation ahead of exact mention-only press content", () => {
    const direct = document(
      "Delivery Capabilities", "delivery-capabilities",
      "Nimbus Build is an AI-native platform that helps teams plan, test, and launch software.",
      ["Nimbus Build"],
    );
    const press = buildSearchDocument({
      id: 991, type: "press-release", slug: "nimbus-company-launch", link: "https://successive.tech/nimbus-company-launch/",
      title: { rendered: "Nimbus company launch" }, content: { rendered: "Nimbus Build is mentioned in the company announcement." },
    });
    const understanding = {
      ...buildDeterministicUnderstanding("What is Nimbus Build?"),
      requestedContentType: "product" as const,
      topics: ["nimbus", "build"],
    };
    const matches = rankEmbeddedEntityEvidence([press, direct], "What is Nimbus Build?", understanding, new Set());
    expect(matches.map((match) => match.document.title)).toEqual(["Delivery Capabilities"]);
  });

  it("uses authoritative embedded evidence for an explanatory direct lookup", () => {
    const authoritative = document(
      "Security Capabilities", "security-capabilities",
      "Adaptive Defense is a security solution that detects and contains threats.",
      ["Adaptive Defense"],
    );
    const query = "Tell me about Adaptive Defense.";
    const matches = rankEmbeddedEntityEvidence(
      [authoritative], query, buildDeterministicUnderstanding(query), new Set(),
    );
    expect(matches[0]?.matchedFields).toContain("exact-embedded-entity");
  });

  it("does not promote article-prefixed short body mentions to embedded identity", () => {
    const incidental = document(
      "Student Experience Modernization", "student-experience-modernization",
      "API access is provided through an API gateway, API-first workflows, and API-led integrations.",
    );
    const dedicated = document(
      "API Testing Guide", "api-testing-guide",
      "An API is an application programming interface used by software systems to communicate.",
    );
    const query = "What is an API?";
    const matches = rankEmbeddedEntityEvidence(
      [incidental, dedicated], query, buildDeterministicUnderstanding(query), new Set(),
    );
    expect(extractExplicitInformationalSubject(query)).toBe("an api");
    expect(semanticInformationalSubject("an api")).toBe("api");
    expect(matches.map(({ document }) => document.title)).toEqual(["API Testing Guide"]);
    expect(matches[0]?.matchedFields).toContain("embedded-direct-subject-authority");
  });

  it("uses one role-aware sibling source for list and single-other product resolution", () => {
    const makeMatch = (
      title: string,
      type: string,
      role: ReturnType<typeof document>["role"],
      score: number,
      matchedFields = ["content-token-overlap"],
    ) => {
      const built = buildSearchDocument({
        id: Math.floor(Math.random() * 1_000_000), type, slug: title.toLowerCase().replace(/\W+/g, "-"),
        link: `https://successive.tech/${title.toLowerCase().replace(/\W+/g, "-")}/`,
        title: { rendered: title }, content: { rendered: `<p>${title} is an enterprise product platform.</p>` },
      });
      return {
        document: { ...built, role, productLike: role === "product" || type === "media-coverage" },
        score, matchedFields, selectedPassages: [`${title} is an enterprise product platform.`], confidence: "high" as const,
      };
    };
    const current = makeMatch("Atlas Build", "page", "product", 240);
    const directSibling = makeMatch("Atlas Voice", "page", "product", 180);
    const embeddedSibling = makeMatch("Platform Capabilities", "page", "page", 210, ["exact-embedded-entity"]);
    const mediaMention = makeMatch("Atlas Voice Wins an Award", "media-coverage", "media", 320);
    const understanding = {
      ...buildDeterministicUnderstanding("What other Atlas products are there?"),
      requestedContentType: "product" as const,
      topics: ["atlas"],
    };
    const args = {
      candidates: [mediaMention, current, embeddedSibling, directSibling], understanding,
      previouslyPresented: `${current.document.title} ${current.document.url}`,
    };
    const list = selectSiblingEntityMatches({ ...args, limit: 8 });
    const single = selectSiblingEntityMatches({ ...args, limit: 1 });
    expect(list.map(({ document }) => document.title)).toEqual([
      "Atlas Voice", "Platform Capabilities", "Atlas Voice Wins an Award",
    ]);
    expect(single[0]?.document.id).toBe(list[0]?.document.id);
    expect(list.some(({ document }) => document.id === current.document.id)).toBe(false);
  });

  it("keeps both sides of a contextual comparison", () => {
    const resolved = resolveConversationUnderstanding(
      buildDeterministicUnderstanding("Is it better than native development?"),
      [{ role: "user", content: "What is Flutter?" }],
    ).understanding;
    expect(resolved.topics).toEqual(expect.arrayContaining(["flutter", "native", "development"]));
  });

  it("distinguishes replacement corrections from additive refinements", () => {
    const replaced = resolveConversationUnderstanding(buildDeterministicUnderstanding("I mean cloud security, actually."), [
      { role: "user", content: "What is cloud computing?" },
    ]).understanding;
    expect(replaced.topics).toContain("security");
    expect(replaced.topics).not.toContain("computing");
    const additive = resolveConversationUnderstanding(buildDeterministicUnderstanding("Do you mean data engineering too?"), [
      { role: "user", content: "Do you do data science?" },
    ]).understanding;
    expect(additive.topics).toEqual(expect.arrayContaining(["data", "science", "engineering"]));
  });

  it("treats Kagen as a product-family subject and broad industry wording as a portfolio", () => {
    expect(buildDeterministicUnderstanding("Tell me about Kagen").requestedContentType).toBe("kagen-product");
    expect(applyStructuralBroadQueryRules(buildDeterministicUnderstanding("What industries do you serve?"), "What industries do you serve?"))
      .toMatchObject({ requestedContentType: "industry", targetScope: "portfolio", topics: [] });
    expect(applyStructuralBroadQueryRules(buildDeterministicUnderstanding("Which sectors do you work in?"), "Which sectors do you work in?"))
      .toMatchObject({ requestedContentType: "industry", targetScope: "portfolio", topics: [] });
  });

  it("derives product identity from structured product/platform metadata", () => {
    const product = buildSearchDocument({
      id: 88, type: "page", slug: "home", link: "https://successive.tech/",
      title: { rendered: "Home" }, acf: {
        hero_description: "Kagen ADD, our AI-native platform, helps enterprises plan, build, test, and launch.",
      },
    });
    expect(product.productLike).toBe(false);
    expect(product.combinedText).toMatch(/Kagen ADD/i);
  });
  it("drops stale topics for broad collections and preserves only dependent refinements", () => {
    const resolve = (previous: string, current: string) =>
      resolveConversationUnderstanding(buildDeterministicUnderstanding(current), [
        { role: "user" as const, content: previous },
      ]).understanding;
    const broadPairs = [
      ["IT jobs at Successive", "current openings"], ["AI services", "show all services"],
      ["healthcare case studies", "show all case studies"], ["cloud blogs", "latest articles"],
      ["AWS partnership", "show all partners"], ["Pune office", "where are your offices"],
      ["Kagen Voice", "what products do you have"], ["AI services", "show all case studies"],
    ];
    for (const [previous, current] of broadPairs) {
      const parsed = buildDeterministicUnderstanding(current!);
      expect(classifyFollowUpScope(parsed, current!)).toBe("BROADEN_SCOPE");
      const result = resolve(previous!, current!);
      const oldTopics = buildDeterministicUnderstanding(previous!).topics;
      expect(result.topics.some((topic) => oldTopics.includes(topic))).toBe(false);
    }
    expect(resolve("current openings", "Pune only")).toMatchObject({ requestedContentType: "career", topics: ["pune"] });
    expect(resolve("Pune jobs", "any more?")).toMatchObject({ requestedContentType: "career", topics: ["pune"] });
    expect(resolve("AI services", "which ones help retail?")).toMatchObject({ requestedContentType: "service", topics: expect.arrayContaining(["ai", "retail"]) });
    expect(resolve("healthcare case studies", "any AI ones?")).toMatchObject({ requestedContentType: "case-study", topics: expect.arrayContaining(["healthcare", "ai"]) });
    expect(resolve("AI services", "any case studies?")).toMatchObject({ requestedContentType: "case-study", topics: ["ai"] });
    expect(resolve("AI services", "show related case studies")).toMatchObject({ requestedContentType: "case-study", topics: ["ai"] });
    expect(resolve("DevSecOps", "related articles")).toMatchObject({ requestedContentType: "blog", topics: ["devsecops"] });
    expect(resolve("Healthcare", "related services")).toMatchObject({ requestedContentType: "service", topics: ["healthcare"] });
    const switched = resolve("current openings", "what AI services do you offer?");
    expect(switched.topics).toContain("ai");
    expect(switched.requestedContentType).not.toBe("career");
  });
  it("extracts independent facets and their requested relations", () => {
    const facets = extractQueryFacets(
      "What is React, does Successive use it, and do you have a case study?",
    );
    expect(facets.map((facet) => facet.relation)).toEqual([
      "DEFINES", "USES", "HAS_CASE_STUDY",
    ]);
    expect(inferQueryRelation("How do you secure delivery pipelines?")).toBe("SECURES");
    expect(inferQueryRelation("Are you formally allied with Acme?")).toBe("PARTNER_OF");
  });

  it("does not split ordinary compound service names into fake facets", () => {
    expect(extractQueryFacets("Tell me about data and analytics services")).toHaveLength(1);
  });

  it("recognizes publication and upcoming freshness grammar independently of topic", () => {
    expect(buildDeterministicUnderstanding("most recently published case study")).toMatchObject({
      temporalIntent: "latest", requestedContentType: "case-study",
    });
    expect(buildDeterministicUnderstanding("show upcoming webinars")).toMatchObject({
      temporalIntent: "upcoming", requestedContentType: "webinar",
    });
    expect(buildDeterministicUnderstanding("newest press announcement")).toMatchObject({
      temporalIntent: "latest", requestedContentType: "press-release",
    });
  });
  it("distinguishes overview questions from explicit catalogue requests across dynamic subjects", () => {
    const subjects = [...new Set(
      QUERY_QUALITY_CASES.flatMap(({ expectedTopic }) => expectedTopic ? [expectedTopic] : []),
    )];
    expect(subjects.length).toBeGreaterThan(3);
    for (const subject of subjects) {
      expect(isExplicitListRequest(`What about ${subject} services?`)).toBe(false);
      expect(isExplicitListRequest(`Tell me about ${subject}`)).toBe(false);
      expect(isExplicitListRequest(`List ${subject} offerings`)).toBe(true);
      expect(isExplicitListRequest(`Show me all ${subject} offerings`)).toBe(true);
      expect(isExplicitListRequest(`How many ${subject} items are published?`)).toBe(true);
    }
  });

  it("does not turn detail, factual, or unsupported-style questions into catalogue requests", () => {
    const questions = [
      "Explain the selected capability in detail",
      "Where is the company headquarters?",
      "Does the company support this technology?",
      "Tell me about an unknown subject",
    ];
    for (const question of questions) expect(isExplicitListRequest(question)).toBe(false);
  });

  it("recognizes natural complete-portfolio questions without treating overviews as lists", () => {
    expect(isExplicitListRequest("What industries do you serve?")).toBe(true);
    expect(isExplicitListRequest("Which technologies are available?")).toBe(true);
    expect(isExplicitListRequest("Tell me about retail services")).toBe(false);
    expect(isExplicitListRequest("Explore Successive industries")).toBe(true);
    expect(isExplicitListRequest("What products are available?")).toBe(true);
    expect(isExplicitListRequest("Show available accelerators.")).toBe(true);
    expect(applyStructuralBroadQueryRules(
      buildDeterministicUnderstanding("Explore Successive industries"),
      "Explore Successive industries",
    )).toMatchObject({
      requestedContentType: "industry",
      topics: [],
      targetScope: "portfolio",
      isBroadQuery: true,
    });
  });

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

  it("uses normalized semantic roles for page-backed partner compatibility without widening role boundaries", () => {
    const partnerPage = document("Alliance Directory", "alliance-directory", "Published partner ecosystem.");
    partnerPage.role = "partners";
    expect(isRequestedContentTypeCompatible(partnerPage, "partner")).toBe(true);

    for (const role of ["service", "blog", "case_study", "company", "industry"] as const) {
      const unrelated = document(`Unrelated ${role}`, `unrelated-${role}`, "Published content.");
      unrelated.role = role;
      expect(isRequestedContentTypeCompatible(unrelated, "partner")).toBe(false);
    }
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
