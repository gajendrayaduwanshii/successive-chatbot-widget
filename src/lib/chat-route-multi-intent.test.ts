import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { WordPressItem } from "@/types/wordpress";
import { extractQueryFacets } from "./query-facets";
import { resolveExactIndexedTitle } from "./search-retriever";

const fixtures = vi.hoisted(() => {
  const offering = (id: number, title: string, slug: string): WordPressItem => ({
    id, type: "page", slug, link: `https://example.test/${slug}/`,
    parent: 100,
    title: { rendered: title },
    content: { rendered: `<p>${title} helps enterprises modernize systems through assessment, engineering, implementation, and managed delivery.</p>` },
    acf: { services_repeater: [{ heading: title, description: `${title} consulting and implementation capability.` }] },
  });
  const contact: WordPressItem = {
    id: 990, type: "page", slug: "contact", link: "https://example.test/contact/",
    title: { rendered: "Contact Us" }, content: { rendered: "Contact the team to discuss project requirements." },
  };
  const about: WordPressItem = {
    id: 991, type: "page", slug: "about-us", link: "https://example.test/about-us/",
    title: { rendered: "About Us" }, content: { rendered: "A published digital transformation company overview." },
    acf: { executive_management: [{ name: "Published Executive", designation: "Founder & CEO" }] },
  };
  const navigation: WordPressItem = {
    id: 992, type: "page", slug: "content-directory", parent: 100,
    link: "https://example.test/content-directory/", title: { rendered: "Content Directory" },
    content: { rendered: "Browse all pages and navigation links." },
  };
  const cloudCase: WordPressItem = {
    id: 993, type: "case-study", slug: "atlas-cloud-migration-story",
    link: "https://example.test/case-studies/atlas-cloud-migration-story/",
    title: { rendered: "Atlas Cloud Migration Story" },
    content: { rendered: "A cloud services case study covering cloud migration and modernization outcomes." },
  };
  const adjacentTechnology: WordPressItem = {
    id: 994, type: "page", slug: "connected-device-app-development", parent: 100,
    link: "https://example.test/connected-device-app-development/",
    title: { rendered: "Connected Device App Development" },
    content: { rendered: "Application development for connected devices with optional cloud connectivity." },
  };
  const dataGuide: WordPressItem = {
    id: 995, type: "post", slug: "governed-data-engineering-guide", parent: 100,
    link: "https://example.test/insights/governed-data-engineering-guide/",
    title: { rendered: "Governed Data Engineering Guide" },
    content: { rendered: "Data Engineering practices for governed enterprise pipelines." },
  };
  const apiService: WordPressItem = {
    ...offering(996, "API Development Company", "api-development"),
    content: { rendered: "An API is an application programming interface that enables software systems to communicate." },
  };
  const shoppingArticle: WordPressItem = {
    id: 997, type: "post", slug: "social-shopping-guide", link: "https://example.test/insights/social-shopping-guide/",
    title: { rendered: "Social Shopping Guide" },
    content: { rendered: "Modern-age shopping is constantly evolving. API integrations can support commerce workflows." },
  };
  const runtimeApiArticle: WordPressItem = {
    id: 1006, type: "post", slug: "importance-of-apis-in-the-world-of-social-media",
    link: "https://example.test/blog/importance-of-apis-in-the-world-of-social-media/",
    title: { rendered: "Importance of APIs in the World of Social Media" },
    content: { rendered: "API is the acronym for Application Programming Interface which is a set of instructions, standards, or requirements that enables a software or app to employ features/services of another app, platform, or device for better services." },
  };
  const vendorSdk: WordPressItem = {
    id: 1002, type: "post", slug: "vendor-sdk-guide", link: "https://example.test/insights/vendor-sdk-guide/",
    title: { rendered: "Vendor SDK Guide" },
    content: { rendered: "Vendor SDK is a product integration toolkit. This SDK helps configure vendor-specific storefront extensions." },
  };
  const productHome: WordPressItem = {
    id: 998, type: "page", slug: "home", link: "https://example.test/", title: { rendered: "Home" },
    content: { rendered: "" },
    acf: {
      kagen_card_heading: "Atlas Launch",
      hero_description: "Atlas Launch, our AI-native platform, helps enterprises plan, build, test, and launch with greater speed and efficiency.",
      kagen_card_cover_description_link: "https://example.test/products/atlas-launch/",
    },
  };
  const kagenHome: WordPressItem = {
    id: 1007, type: "page", slug: "kagen-home", link: "https://example.test/kagen/", title: { rendered: "Kagen" },
    content: { rendered: "" },
    acf: {
      kagen_card_heading: "Kagen ADD",
      hero_description: "Accelerate delivery, boost productivity, and bring ideas to market faster with Kagen ADD, our AI-native platform that helps enterprises plan, build, test, and launch with greater speed and efficiency.",
      kagen_card_cover_description_link: "https://www.kagen.ai/product/kagen-add-ai-native-sdlc-platform",
    },
  };
  const unlinkedEntityHome: WordPressItem = {
    id: 1001, type: "page", slug: "platform-overview", link: "https://example.test/platform-overview/",
    title: { rendered: "Platform Overview" }, content: { rendered: "" },
    acf: {
      platform_card_heading: "Orbit Relay",
      platform_description: "Orbit Relay, our enterprise platform, enables teams to coordinate governed delivery workflows.",
    },
  };
  const productEngineeringHome: WordPressItem = {
    id: 1008, type: "page", slug: "home-services", link: "https://example.test/", title: { rendered: "Home" },
    content: { rendered: "" },
    acf: {
      services: [{
        link: { title: "AI-Native Product Engineering", url: "https://successive.tech/product-engineering-services-solutions/" },
        description: "Design and ship production-grade products and platforms.",
      }],
    },
  };
  const strategyService = offering(999, "Transform Business with AI Strategy Consulting", "ai-strategy-consulting");
  const detailedStrategyService: WordPressItem = {
    ...strategyService,
    content: { rendered: "<p>Harness intelligence to streamline operations, automate decisions, and drive measurable growth. Capture opportunities faster with an artificial intelligence strategy built on real-world enterprise expertise. Define your AI vision, accelerate transformation, and align every initiative with business goals.</p><p>Assess infrastructure, data quality, and culture to identify gaps and ensure your business is ready for AI adoption. Develop tailored PoCs to validate AI use cases, minimize risks, refine strategies, and deliver tangible insights. Create a step-by-step AI roadmap aligned with business goals, defining models, milestones, and smooth adoption.</p>" },
  };
  const strategyArticle: WordPressItem = {
    id: 1000, type: "post", slug: "effective-ai-strategy", link: "https://example.test/insights/effective-ai-strategy/",
    title: { rendered: "Crafting an Effective AI Strategy to Drive Business Growth" },
    content: { rendered: "A related article about AI strategy and business growth." },
  };
  const paymentGatewayArticle: WordPressItem = {
    id: 1003, type: "post", slug: "payment-gateway-integration-roadmap-costs-skills",
    link: "https://example.test/insights/payment-gateway-integration-roadmap-costs-skills/",
    title: { rendered: "Payment Gateway Integration: Roadmap, Costs, Skills" },
    content: { rendered: "Payment Gateway Integration: Roadmap, Costs, Skills is an editorial guide to delivery planning, capability decisions, and team skills." },
  };
  const cloudPricingArticle: WordPressItem = {
    id: 1004, type: "post", slug: "cloud-pricing-strategies-enterprise-applications",
    link: "https://example.test/insights/cloud-pricing-strategies-enterprise-applications/",
    title: { rendered: "Cloud Pricing Strategies for Enterprise Applications" },
    content: { rendered: "This editorial article covers Cloud Cost Optimization and cloud pricing strategies for enterprise applications." },
  };
  const cloudCostArticle: WordPressItem = {
    id: 1005, type: "post", slug: "cloud-cost-optimization-guide",
    link: "https://example.test/insights/cloud-cost-optimization-guide/",
    title: { rendered: "Cloud Cost Optimization Guide" },
    content: { rendered: "A published editorial guide to Cloud Cost Optimization practices and enterprise cloud efficiency." },
  };
  const awards: WordPressItem = {
    id: 1010, type: "page", slug: "awards", link: "https://example.test/awards/",
    title: { rendered: "Awards & Recognitions" }, content: { rendered: "" },
    acf: {
      title: "Awards & Recognitions",
      description: "Published recognition and milestone evidence.",
      title2: "Our Achievements",
      description2: "Published accomplishments as an industry leader.",
      cta_heading: "Successive Advantage",
      cta_description: "Unrelated AI product-engineering promotion.",
    },
  };
  const modernizationEbook: WordPressItem = {
    id: 1012, type: "page", slug: "application-modernization-ebook",
    link: "https://example.test/application-modernization-ebook/",
    title: { rendered: "Application Modernization" },
    content: { rendered: "<p>This eBook describes how the cloud can help you accelerate your application modernization initiatives and choose the best strategy for your business.</p>" },
    acf: {
      cta_description: "AI-enabled, technology-driven innovation for enterprise growth.",
      resource_cards: [
        { title: "Application Modernization eBook", description: "This sibling description must not be used as factual evidence for the selected record.", url: "https://example.test/application-modernization-ebook/" },
        { title: "Banking Modernization Guide", description: "Particularly aimed at helping enterprises, such as banks, transform operations.", url: "https://example.test/banking-modernization-guide/" },
      ],
    },
  };
  const partners: WordPressItem = {
    id: 1011, type: "page", slug: "partners", link: "https://example.test/partners/",
    title: { rendered: "Partners & Alliances" }, content: { rendered: "" },
    acf: {
      partnerships_repeater: [{
        acf_repeater: "Cloud Partnerships",
        partnerships_logos: [{ logo: { url: "https://example.test/cloud.svg", alt: "Example Cloud Partner" } }],
      }],
    },
  };
  return {
    offerings: [
      offering(901, "Platform Migration", "platform-migration"),
      offering(902, "Analytics Engineering", "analytics-engineering"),
      offering(903, "Interface Framework", "interface-framework"),
      offering(904, "Intelligent Automation Services", "intelligent-automation-services"),
      offering(905, "Cloud Migration Consulting Services", "cloud-migration"),
      offering(906, "Data Engineering Services", "data-engineering"),
      offering(907, "React", "react"),
      offering(908, "Artificial Intelligence (AI) Development Company", "ai-development-company"),
      offering(909, "Cloud Cost Management Services", "cloud-cost-management"),
      offering(910, "Data Analytics Consulting", "data-analytics-consulting"),
      offering(911, "React Development Services", "react-development"),
      offering(912, "Application Modernization", "application-modernization"),
      offering(913, "Customer Experience", "customer-experience"),
      offering(914, "DevSecOps Services", "devsecops"),
      offering(918, "Alpha", "alpha"),
      offering(919, "Alphi", "alphi"),
      { ...offering(921, "Sample Cloud Consulting Services", "sample-cloud-consulting"),
        content: { rendered: "<p>Sample Cloud Consulting Services support architecture and migration planning.</p>" } },
      {
        ...offering(920, "Sample Data Service", "sample-data-service"),
        content: { rendered: "<p>Sample Data Service helps organizations create trusted data foundations through end-to-end end-to-end data processing and governance.</p><p>Data is ingested, cleansed, validated, and transformed before delivery.</p><p>Workflows orchestrate storage, processing, and governed delivery.</p><p>Monitoring, lifecycle controls, and compliance policies maintain reliability.</p><p>Prepared data supports analytics and business decision-making.</p>" },
        acf: {
          services_repeater: [{ heading: "Sample Data Service", description: "Capabilities include ingestion, transformation, and quality controls." }],
          cta_description: "Talk to our experts or explore our FAQs to learn more about how these services can be tailored to your needs.",
          cta_button: { title: "Connect", url: "https://example.test/contact/" },
        },
      },
      { ...offering(917, "Workflow Enablement Services", "workflow-enablement"),
        content: { rendered: "<p>Workflow Enablement Services gives enterprise teams a governed delivery foundation.</p><p>Teams can use automation, governance controls, and observability dashboards.</p><p>The approach begins with assessment, then implementation roadmaps and release workflows.</p><p>This improves resilience, efficiency, and performance for enterprise teams.</p><p>Use cases include portfolio planning for enterprise teams.</p>" } },
      { ...offering(916, "Platform Engineering Services", "platform-engineering"),
        content: { rendered: "<p>Platform engineering helps enterprises establish reliable digital delivery foundations.</p>" },
        acf: { services_repeater: [{ heading: "Platform Engineering Services", description: "Successive supports automation, governance, and developer enablement for teams modernizing delivery workflows." }] } },
      { ...offering(915, "Experience Design Services", "experience-design-services"),
        content: { rendered: "AI AI AI and Quantum Orchard are mentioned in selected experience workflows, while this service provides experience design." } },
    ],
    includeCanonicalApi: true, contact, about, navigation, cloudCase, adjacentTechnology, dataGuide, apiService, shoppingArticle, runtimeApiArticle,
    includeDetailedAiStrategy: false, structuredComposerCalls: [] as string[], productHome, kagenHome, unlinkedEntityHome, productEngineeringHome, strategyService, detailedStrategyService, strategyArticle, vendorSdk, paymentGatewayArticle, cloudPricingArticle, cloudCostArticle, awards, partners, modernizationEbook,
  };
});

vi.mock("./successive-api", () => ({
  fetchAllPublishedContent: vi.fn(async () => [...fixtures.offerings, fixtures.contact, fixtures.about, fixtures.partners,
    fixtures.navigation, fixtures.cloudCase, fixtures.adjacentTechnology, fixtures.dataGuide,
    ...(fixtures.includeCanonicalApi ? [fixtures.apiService] : [fixtures.runtimeApiArticle]),
    fixtures.shoppingArticle, fixtures.productHome, fixtures.kagenHome, fixtures.unlinkedEntityHome, fixtures.productEngineeringHome,
    ...(fixtures.includeDetailedAiStrategy ? [fixtures.detailedStrategyService] : [fixtures.strategyService]), fixtures.strategyArticle, fixtures.vendorSdk,
    fixtures.paymentGatewayArticle, fixtures.cloudPricingArticle, fixtures.cloudCostArticle, fixtures.modernizationEbook]),
  fetchSuccessive: vi.fn(async (path: string) => path.includes("/pages/partners") ? [fixtures.partners]
    : path.includes("/pages/awards") ? [fixtures.awards]
    : path.includes("/pages/contact") ? [fixtures.contact]
    : path.includes("/pages/about-us") ? [fixtures.about] : []),
  getContentLoadDiagnostics: vi.fn(() => ({ cache: "hit", durationMs: 0, failedCollections: [], partial: false, itemCount: 10 })),
}));

vi.mock("./env", () => ({
  getEnv: () => ({
    SUCCESSIVE_API_BASE_URL: "https://example.test/api",
    SUCCESSIVE_PUBLIC_SITE_URL: "https://example.test",
    ALLOWED_ORIGINS: "https://example.test",
    AI_PROVIDER: "openai", AI_API_KEY: "test", AI_MODEL: "test",
  }),
}));

vi.mock("./llm", () => ({
  getLLMProvider: () => ({
    generateCommercialResponse: async () => { throw new Error("Use deterministic commercial response"); },
    generateStructuredResponse: async ({ message, evidencePackage }: { message: string; evidencePackage?: { resolvedSubject: { canonicalName: string }; questionFocus: string } }) => {
      fixtures.structuredComposerCalls.push(message);
      if (evidencePackage?.resolvedSubject.canonicalName === "Workflow Enablement Services") {
        const answers: Record<string, string> = {
          overview: "## Workflow Enablement Services\n\nWorkflow Enablement Services gives enterprise teams a governed delivery foundation.",
          capabilities: "## Workflow Enablement Services\n\nWorkflow Enablement Services provides automation, governance controls, and observability dashboards for enterprise teams.",
          process: "## Workflow Enablement Services\n\nWorkflow Enablement Services begins with assessment, followed by implementation roadmaps and release workflows.",
          benefits: "## Workflow Enablement Services\n\nWorkflow Enablement Services improves resilience, efficiency, and performance for enterprise teams.",
          use_cases: "## Workflow Enablement Services\n\nWorkflow Enablement Services supports portfolio planning as a published use case for enterprise teams.",
        };
        return { answer: answers[evidencePackage.questionFocus] ?? answers.overview!, cards: [], suggestions: [], sources: [], confidence: "high" as const };
      }
      if (/^tell me about intelligent automation services$/i.test(message.trim())) return {
        answer: "Intelligent Automation Services provides an overview at https://example.test/not-validated/.",
        cards: [], suggestions: [], sources: [], confidence: "high" as const,
      };
      if (/^ai adoption strategy$/i.test(message.trim())) return {
        answer: "## AI Strategy Consulting\n\nHarness intelligence to streamline operations, automate decisions, and drive measurable growth. Capture opportunities faster with an artificial intelligence strategy built on real-world enterprise expertise. Define your AI vision and align every initiative with business goals.\n\nSuccessive assesses infrastructure, data quality, and culture to identify AI-readiness gaps. It develops tailored PoCs to validate use cases and refine strategies before creating a step-by-step roadmap for adoption.",
        cards: [], suggestions: [], sources: [], confidence: "high" as const,
      };
      if (/^tell me about platform engineering services$/i.test(message.trim())) return {
        answer: "## Platform Engineering Services\n\n[Platform Engineering Services](https://example.test/platform-engineering/) helps enterprises establish reliable digital delivery foundations.\n\nSuccessive supports automation, governance, and developer enablement for teams modernizing delivery workflows.",
        cards: [], suggestions: [], sources: [], confidence: "high" as const,
      };
      if (/^tell me about ai-native product engineering$/i.test(message.trim())) return {
        answer: "## AI-Native Product Engineering\n\nAI-Native Product Engineering",
        cards: [], suggestions: [], sources: [], confidence: "high" as const,
      };
      if (/^what is an api\??$/i.test(message.trim())) return {
        answer: "Modern-age shopping is constantly evolving with the proliferation of customer touchpoints.",
        cards: [], suggestions: [], sources: [], confidence: "high" as const,
      };
      throw new Error("Use deterministic grounded response");
    },
  }),
}));

let post: typeof import("@/app/api/chat/route").POST;

beforeAll(async () => {
  ({ POST: post } = await import("@/app/api/chat/route"));
});

async function send(message: string, sessionId: string, history: Array<{ role: "user" | "assistant"; content: string }> = [], suggestionAction?: unknown) {
  const request = new NextRequest("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.test", "x-forwarded-for": sessionId },
    body: JSON.stringify({ message, history, seenContent: [], sessionId, suggestionAction }),
  });
  const response = await post(request);
  expect(response.status).toBe(200);
  return response.json() as Promise<{ data: { answer: string; cards: Array<{ title: string }>; sources: Array<{ title: string; url: string }>;
    suggestions: string[]; suggestionActions: Array<{ id: string; label: string; subject?: string; topic?: string; targetUrl?: string }>;
    insufficientContext?: boolean;
    diagnostics?: { facetCount: number; informationalFacetCount: number; informationalPartCount: number } } }>;
}

describe("actual chat route multi-intent composition", () => {
  it.each(["Partners", "Partners & Alliances"])("retains the canonical page-backed partner role through the actual route: %s", async (query) => {
    const result = await send(query, `route-partner-${query.length}`);
    expect(result.data.answer).toMatch(/Cloud Partnerships|Example Cloud Partner/i);
    expect(result.data.answer).not.toMatch(/couldn.t confirm the capability/i);
    expect(result.data.sources[0]?.url).toBe("https://example.test/partners/");
  });

  it.each(["Award", "successive award", "any award"])("keeps the structured aggregate local for the actual route: %s", async (query) => {
    const result = await send(query, `route-structured-award-${query.length}`);
    expect(result.data.answer).toContain("Published recognition and milestone evidence.");
    expect(result.data.answer).toContain("Published accomplishments as an industry leader.");
    expect(result.data.answer).not.toContain("Unrelated AI product-engineering");
    expect(result.data.answer).toMatch(/Explore \[Awards & Recognitions\]\(https:\/\/example\.test\/awards\//);
    expect(result.data.answer.match(/Explore \[/g)).toHaveLength(1);
  });

  it("propagates an authoritative typo-recovered structured identity through the actual POST route", async () => {
    const result = await send("awrad", "route-structured-award-typo");
    expect(result.data.answer).toContain("Published recognition and milestone evidence.");
    expect(result.data.answer).not.toMatch(/couldn.t confirm the requested fact for awrad/i);
    expect(result.data.cards[0]?.title).toBe("Awards & Recognitions");
    expect(result.data.sources[0]?.url).toBe("https://example.test/awards/");
    expect(result.data.insufficientContext).not.toBe(true);
  });

  it("keeps an exact standalone resource answer inside its authored local evidence through POST", async () => {
    const result = await send("Tell me about the Application Modernization eBook.", "route-resource-locality");
    expect(result.data.cards[0]?.title).toBe("Application Modernization");
    expect(result.data.sources[0]?.url).toBe("https://example.test/application-modernization-ebook/");
    expect(result.data.answer).toContain("cloud can help you accelerate your application modernization");
    expect(result.data.answer).not.toMatch(/AI-enabled|technology-driven innovation|such as banks|Banking Modernization Guide/i);
  });

  it("keeps the unqualified Application Modernization request on the canonical service", async () => {
    const result = await send("Tell me about Application Modernization.", "route-modernization-service-control");
    expect(result.data.sources[0]?.url).toBe("https://example.test/application-modernization/");
    expect(result.data.sources[0]?.url).not.toBe("https://example.test/application-modernization-ebook/");
  });

  it("fails closed instead of filling an explicit related-article request with unrelated content through POST", async () => {
    const result = await send("Show me articles related to Customer Experience.", "route-related-explicit-subject");
    expect(result.data.insufficientContext).toBe(true);
    expect(result.data.cards).toEqual([]);
    expect(result.data.answer).toMatch(/couldn.t find a strongly matching Successive blog/i);
    expect(result.data.answer).not.toMatch(/Cloud|DevOps/i);
  });

  it("resolves a qualifier-prefixed canonical service but fails closed when the attribute is unpublished through POST", async () => {
    const result = await send("free Sample Cloud Consulting services?", "route-attribute-entity-separation");
    expect(result.data.insufficientContext).toBe(true);
    expect(result.data.cards).toEqual([]);
    expect(result.data.answer).toMatch(/couldn.t confirm.*availability.*sample cloud consulting/i);
    expect(result.data.answer).not.toMatch(/architecture and migration planning/i);
  });

  it("keeps factual service evidence separate from presentation fields and retains one terminal CTA", async () => {
    const result = await send("What capabilities are included in Sample Data Service?", "route-factual-presentation-boundary");
    expect(result.data.answer).toMatch(/ingestion, transformation, and quality controls/i);
    expect(result.data.answer).not.toMatch(/Talk to our experts|explore our FAQs|tailored to your needs/i);
    expect(result.data.answer).not.toContain("end-to-end end-to-end");
    expect(result.data.answer.match(/(?:Explore|Read|View|Meet|Dive) \[/g)).toHaveLength(1);
  });

  it.each([
    "Tell me about AI-Native Product Engineering",
    "How does AI-Native Product Engineering work?",
    "What capabilities are included in AI-Native Product Engineering?",
  ])("retains concise factual body evidence for a bounded embedded capability through POST: %s", async (query) => {
    const result = await send(query, `route-concise-embedded-capability-${query.length}`);
    expect(result.data.cards[0]?.title).toBe("AI-Native Product Engineering");
    expect(result.data.sources[0]?.url).toBe("https://successive.tech/product-engineering-services-solutions/");
    expect(result.data.answer).toContain("Design and ship production-grade products and platforms.");
    expect(result.data.answer).not.toMatch(/^## AI-Native Product Engineering\s+AI-Native Product Engineering\s+Explore/m);
    expect(result.data.answer.match(/(?:Explore|Read|View|Meet|Dive) \[/g)).toHaveLength(1);
  });

  it("bypasses the final composer only for an independent exact overview through the serialized POST route", async () => {
    fixtures.structuredComposerCalls.length = 0;
    const overview = await send("Tell me about AI-Native Product Engineering", "route-overview-no-composer");
    expect(overview.data.answer).toContain("Design and ship production-grade products and platforms.");
    expect(fixtures.structuredComposerCalls).toEqual([]);

    await send("How does AI-Native Product Engineering work?", "route-process-keeps-composer");
    expect(fixtures.structuredComposerCalls).toEqual(["How does AI-Native Product Engineering work?"]);
  });



  it.each([
    ["Tell me about Sample Data Service.", /trusted data foundations/i, /Data is ingested, cleansed, validated, and transformed/i],
    ["How does Sample Data Service work?", /Monitoring, lifecycle controls, and compliance policies maintain reliability/i, /Data is ingested, cleansed, validated, and transformed/i],
    ["What capabilities are included in Sample Data Service?", /Capabilities include ingestion, transformation, and quality controls/i, /trusted data foundations/i],
  ])("uses ranked factual evidence for the requested question facet through POST: %s", async (query, expectedLeadingEvidence, distinctEvidence) => {
    const result = await send(query, `route-question-focus-${query.length}`);
    expect(result.data.cards[0]?.title).toBe("Sample Data Service");
    expect(result.data.answer).toMatch(expectedLeadingEvidence);
    expect(result.data.answer).not.toMatch(/Talk to our experts|explore our FAQs/i);
    expect(result.data.answer).not.toContain("end-to-end end-to-end");
    expect(result.data.answer.match(/(?:Explore|Read|View|Meet|Dive) \[/g)).toHaveLength(1);
    expect(result.data.answer).toMatch(distinctEvidence);
  });

  it.each([
    "Tell me about Data Engineering.",
    "What capabilities are included in Data Engineering?",
    "How does Data Engineering work?",
    "What are the benefits of Data Engineering?",
  ])("keeps Data Engineering grounded and presentation-clean through POST: %s", async (query) => {
    const result = await send(query, `route-data-engineering-${query.length}`);
    expect(result.data.cards[0]?.title).toBe("Data Engineering Services");
    expect(result.data.answer).not.toMatch(/Talk to our experts|explore our FAQs/i);
    expect(result.data.answer.match(/(?:Explore|Read|View|Meet|Dive) \[/g)).toHaveLength(1);
  });

  it("fails closed for an ambiguous typo through the actual POST route", async () => {
    const result = await send("alphe", "route-ambiguous-entity-typo");
    expect(result.data.cards.map((card) => card.title)).not.toContain("Alpha");
    expect(result.data.cards.map((card) => card.title)).not.toContain("Alphi");
    expect(result.data.insufficientContext).toBe(true);
  });

  it("uses canonical direct definition evidence instead of an incidental commerce article through POST", async () => {
    const result = await send("What is an API?", "route-api-definition");
    expect(result.data.cards[0]?.title).toBe("API Development Company");
    expect(result.data.answer).toMatch(/API is an application programming interface/i);
    expect(result.data.answer).not.toMatch(/shopping is constantly evolving|offline|latency|failure|fallback/i);
    expect(result.data.answer.match(/\]\(https:\/\/example\.test\/api-development\/\)/g)).toHaveLength(1);
    expect(result.data.answer).toMatch(/Explore \[API Development Company\]/);
  });

  it("elaborates a thin substantial service only from distinct same-subject evidence through POST", async () => {
    const result = await send("Tell me about Platform Engineering Services", "route-thin-platform-engineering");
    expect(result.data.answer).toMatch(/^## Platform Engineering Services/m);
    expect(result.data.answer).toMatch(/reliable digital delivery foundations/i);
    expect(result.data.answer).toMatch(/automation, governance, and developer enablement/i);
    expect(result.data.answer.split(/\n\s*\n/).length).toBeGreaterThanOrEqual(3);
    expect(result.data.answer.match(/\]\(https:\/\/example\.test\/platform-engineering\/\)/g)).toHaveLength(1);
    expect(result.data.answer.match(/(?:Explore|Read|View|Meet|Dive) \[/g)).toHaveLength(1);
    expect(result.data.answer).not.toMatch(/GIS|Spatial AI|Contact Us/i);
  });

  it("rejects a composer URL outside the primary record allow-list through POST", async () => {
    const result = await send("Tell me about Intelligent Automation Services", "route-composer-unknown-url");
    expect(result.data.answer).not.toContain("not-validated");
    expect(result.data.answer).toMatch(/Intelligent Automation Services/i);
    expect(result.data.answer.match(/\]\(https:\/\/example\.test\/intelligent-automation-services\/\)/g)).toHaveLength(1);
  });

  it("keeps a resolved canonical offering through a natural benefit question on the complete POST route", async () => {
    const result = await send(
      "How does Cloud Migration Consulting help businesses modernize?",
      "route-natural-offering-benefit",
    );
    expect(result.data.cards[0]?.title).toBe("Cloud Migration Consulting Services");
    expect(result.data.answer).toMatch(/Cloud Migration Consulting Services/i);
    expect(result.data.answer).toMatch(/moderniz|assessment|engineering|implementation|managed delivery/i);
    expect(result.data.answer).not.toMatch(/couldn.t confirm|could not find reliable/i);
  });

  it("freshly composes distinct same-subject answers for each supported question focus through POST", async () => {
    const queries = [
      ["Tell me about Workflow Enablement Services", "governed delivery foundation"],
      ["What capabilities are included in Workflow Enablement Services?", "automation, governance controls, and observability dashboards"],
      ["How does Workflow Enablement Services work?", "assessment, followed by implementation roadmaps and release workflows"],
      ["How does Workflow Enablement Services help businesses?", "resilience, efficiency, and performance"],
      ["What use cases does Workflow Enablement Services support?", "portfolio planning"],
    ] as const;
    const answers: string[] = [];
    for (const [query, expectedEvidence] of queries) {
      const result = await send(query, `route-focus-${expectedEvidence.slice(0, 12)}`);
      expect(result.data.cards[0]?.title).toBe("Workflow Enablement Services");
      expect(result.data.answer).toContain(expectedEvidence);
      expect(result.data.answer).toMatch(/Explore \[Workflow Enablement Services\]/);
      answers.push(result.data.answer);
    }
    expect(new Set(answers).size).toBe(queries.length);
  });


  it("keeps the final generic definition CTA-free when only an editorial API article is available", async () => {
    fixtures.includeCanonicalApi = false;
    try {
      const result = await send("What is an API?", "route-api-runtime-editorial-only");
      expect(result.data.cards[0]?.title).toBe("Importance of APIs in the World of Social Media");
      expect(result.data.answer).toBe("API is the acronym for Application Programming Interface which is a set of instructions, standards, or requirements that enables a software or app to employ features/services of another app, platform, or device for better services.");
      expect(result.data.answer).not.toMatch(/\]\(https?:\/\//);
      expect(result.data.answer).not.toMatch(/BigCommerce|GraphQL|Storefront|Stencil|latency|failure/i);
    } finally {
      fixtures.includeCanonicalApi = true;
    }
  });

  it("returns safe no-content rather than a vendor-specific definition for a generic compact subject", async () => {
    const result = await send("What is SDK?", "route-sdk-specialization-boundary");
    expect(result.data.answer).toMatch(/couldn.t confirm|could not find reliable|available Successive content/i);
    expect(result.data.answer).not.toMatch(/vendor-specific storefront|Vendor SDK is/i);
  });

  it("keeps a bounded structured platform definition through the complete POST route", async () => {
    const result = await send("What is Atlas Launch?", "route-embedded-platform");
    expect(result.data.cards[0]?.title).toBe("Atlas Launch");
    expect(result.data.sources[0]?.url).toBe("https://example.test/products/atlas-launch/");
    expect(result.data.answer).toMatch(/Atlas Launch.*AI-native platform/i);
    expect(result.data.answer).toMatch(/^## Atlas Launch\b/m);
    expect(result.data.answer.match(/\]\(https:\/\/example\.test\/products\/atlas-launch\/\)/g)).toHaveLength(1);
    expect(result.data.answer).toMatch(/Explore \[Atlas Launch\]/);
    expect(result.data.answer).not.toMatch(/Contact Us|social-shopping|effective-ai-strategy/i);
  });

  it("keeps a structurally validated embedded product definition when its local description leads with value language", async () => {
    const result = await send("What is Kagen ADD?", "route-kagen-value-led-definition");
    expect(result.data.cards[0]?.title).toBe("Kagen ADD");
    expect(result.data.sources[0]?.url).toBe("https://www.kagen.ai/product/kagen-add-ai-native-sdlc-platform");
    expect(result.data.answer).toMatch(/Accelerate delivery.*Kagen ADD.*AI-native platform/i);
    expect(result.data.answer).toMatch(/^## Kagen ADD\b/m);
    expect(result.data.answer.match(/\]\(https:\/\/www\.kagen\.ai\/product\/kagen-add-ai-native-sdlc-platform\)/g)).toHaveLength(1);
    expect(result.data.answer).not.toMatch(/couldn.t confirm|Contact Us|social-shopping/i);
  });

  it("does not invent a CTA for an embedded platform without a structural destination", async () => {
    const result = await send("What is Orbit Relay?", "route-unlinked-platform");
    expect(result.data.answer).toMatch(/Orbit Relay.*enterprise platform/i);
    expect(result.data.answer).not.toMatch(/\]\(https?:\/\//);
  });

  it("prefers an aligned canonical capability but preserves an explicit editorial request through POST", async () => {
    const capability = await send("AI Adoption Strategy", "route-ai-adoption");
    expect(capability.data.cards[0]?.title).toBe("Transform Business with AI Strategy Consulting");
    const article = await send("show me an article about AI Adoption Strategy", "route-ai-adoption-article");
    expect(article.data.cards[0]?.title).toBe("Crafting an Effective AI Strategy to Drive Business Growth");
  });

  it("adds a grounded second aspect for AI Strategy through final POST serialization", async () => {
    fixtures.includeDetailedAiStrategy = true;
    try {
      const result = await send("AI Adoption Strategy", "route-ai-adoption-depth");
      const paragraphs = result.data.answer.split(/\n\s*\n/).filter(Boolean);
      expect(result.data.cards[0]?.title).toBe("Transform Business with AI Strategy Consulting");
      expect(result.data.answer).toMatch(/^## AI Strategy Consulting\b/m);
      expect(paragraphs).toHaveLength(4);
      expect(paragraphs[1]).toMatch(/streamline operations|business goals/i);
      expect(paragraphs[2]).toMatch(/infrastructure|data quality|PoCs|roadmap/i);
      expect(result.data.answer.match(/\]\(https:\/\/example\.test\/ai-strategy-consulting\/\)/g)).toHaveLength(1);
    } finally {
      fixtures.includeDetailedAiStrategy = false;
    }
  });

  it("keeps cost vocabulary in an explicitly requested editorial title out of the commercial route", async () => {
    const result = await send(
      "Show articles related to Payment Gateway Integration: Roadmap, Costs, Skills.",
      "route-editorial-title-costs",
    );
    expect(result.data.cards[0]?.title).toBe("Payment Gateway Integration: Roadmap, Costs, Skills");
    expect(result.data.answer).toContain("Payment Gateway Integration: Roadmap, Costs, Skills");
    expect(result.data.answer).not.toContain("Contact Us");
    expect(result.data.answer).not.toMatch(/pricing depends|the cost of/i);
  });

  it("keeps a pricing word in an explicit article title out of commercial routing through POST", async () => {
    const result = await send(
      "Show me the Cloud Pricing Strategies for Enterprise Applications article.",
      "route-editorial-title-pricing",
    );
    expect(result.data.cards[0]?.title).toBe("Cloud Pricing Strategies for Enterprise Applications");
    expect(result.data.answer).not.toContain("Contact Us");
  });

  it("keeps Cloud Cost Optimization informational and editorial requests out of commercial routing", async () => {
    const informational = await send("What is Cloud Cost Optimization?", "route-cloud-cost-informational");
    expect(informational.data.answer).not.toContain("Contact Us");
    expect(informational.data.cards.map(({ title }) => title)).not.toContain("Contact Us");

    const editorial = await send("Show articles about Cloud Cost Optimization.", "route-cloud-cost-editorial");
    expect(editorial.data.cards[0]?.title).toBe("Cloud Cost Optimization Guide");
    expect(editorial.data.answer).not.toContain("Contact Us");
  });

  it("preserves direct commercial requests and an editorial-plus-commercial turn through POST", async () => {
    const pricing = await send("How much does Payment Gateway Integration cost?", "route-payment-gateway-pricing");
    expect(pricing.data.answer).toMatch(/cost of Payment Gateway/i);
    expect(pricing.data.answer).toContain("Contact Us");

    const quote = await send("Give me a quote for Payment Gateway Integration.", "route-payment-gateway-quote");
    expect(quote.data.answer).toMatch(/tailored quotation for Payment Gateway/i);
    expect(quote.data.answer).toContain("Contact Us");

    const mixed = await send(
      "Show me the Payment Gateway Integration article and tell me how much implementation costs.",
      "route-editorial-commercial-mixed",
    );
    expect(mixed.data.cards.map(({ title }) => title)).toEqual(expect.arrayContaining([
      "Payment Gateway Integration: Roadmap, Costs, Skills", "Contact Us",
    ]));
    expect(mixed.data.answer).toContain("Contact Us");
    expect(mixed.data.answer).toMatch(/cost/i);
  });

  it.each([
    ["Tell me about Cloud Migration and how much would implementation cost?", "Cloud Migration Consulting Services", "cost"],
    ["Tell me about Data Engineering and who can I contact for a project?", "Data Engineering Services", "requirements"],
    ["What is React and what does it cost to create a React project?", "React", "cost"],
    ["What AI services do you provide and how can I discuss a project?", "Artificial Intelligence (AI) Development Company", "requirements"],
    ["Tell me about Platform Migration and how much would implementation cost?", "Platform Migration", "cost"],
    ["Tell me about Analytics Engineering and who can I contact for a project?", "Analytics Engineering", "requirements"],
    ["Tell me about Interface Framework and can I get a quote?", "Interface Framework", "quotation"],
    ["Tell me about Intelligent Automation Services and how can I discuss implementation?", "Intelligent Automation Services", "implementation"],
  ])("preserves informational evidence and the commercial action through POST: %s", async (query, offering, commercialTerm) => {
    const facets = extractQueryFacets(query);
    expect(facets).toHaveLength(2);
    expect(await resolveExactIndexedTitle(query)).toBeUndefined();
    const result = await send(query, `route-${offering.replace(/\s+/g, "-")}`);
    expect(result.data.answer).toContain(offering);
    expect(result.data.answer.toLowerCase()).toContain(commercialTerm);
    expect(result.data.answer).toContain("Contact Us");
    expect(result.data.cards.map(({ title }) => title)).toEqual(expect.arrayContaining([offering, "Contact Us"]));
    expect(result.data.sources.map(({ title }) => title)).toEqual(expect.arrayContaining([offering, "Contact Us"]));
    expect(result.data.cards.map(({ title }) => title)).toEqual([offering, "Contact Us"]);
    expect(result.data.sources.map(({ title }) => title)).toEqual([offering, "Contact Us"]);
    expect(result.data.suggestionActions.length).toBeGreaterThan(0);
    expect(result.data.suggestions).toEqual(result.data.suggestionActions.map(({ label }) => label));
    expect(result.data.suggestionActions.every(({ subject, topic }) =>
      !/founder ai|react cost|data engineering application modernization/i.test(`${subject ?? ""} ${topic ?? ""}`))).toBe(true);
    expect(result.data.suggestions.join(" ")).not.toMatch(/content directory|site map/i);
    expect(result.data.diagnostics).toMatchObject({ facetCount: 2, informationalFacetCount: 1, informationalPartCount: 1 });
  });

  it("preserves the structured leadership and company-overview route", async () => {
    const result = await send("Who is the CEO and tell me about the company?", "route-leadership-company");
    expect(result.data.answer).toContain("Published Executive");
    expect(result.data.answer).toContain("digital transformation company overview");
    expect(result.data.cards.every(({ title }) => !/case study/i.test(title))).toBe(true);
  });

  it("keeps a leadership facet separate from an unrelated offering facet", async () => {
    const result = await send("Who is the Founder and what AI services does Successive provide?", "route-founder-ai");
    expect(result.data.answer).toContain("Published Executive");
    expect(result.data.answer).toContain("Artificial Intelligence (AI) Development Company");
    expect(result.data.suggestionActions.every(({ subject, topic }) =>
      /ai services/i.test(`${subject ?? ""} ${topic ?? ""}`) &&
      !/founder/i.test(`${subject ?? ""} ${topic ?? ""}`))).toBe(true);
  });

  it("binds a dependent commercial sentence to its preceding offering", async () => {
    const result = await send("Tell me about React development. How much would that service cost?", "route-react-dependent");
    expect(result.data.answer).toContain("React Development Services");
    expect(result.data.answer.toLowerCase()).toContain("cost");
    expect(result.data.answer).not.toContain("Tell React");
  });

  it.each([
    "what is react and cost of project",
    "What is React and how much does a project usually cost?",
    "What is React and project cost",
  ])("composes an informational answer with explicitly generic project pricing: %s", async (query) => {
    expect(extractQueryFacets(query)).toHaveLength(2);
    const result = await send(query, `route-generic-project-${query.length}`);
    expect(result.data.answer).toContain("React");
    expect(result.data.answer).toContain("Pricing depends on the service, project scope");
    expect(result.data.answer).not.toMatch(/The cost of React/i);
    expect(result.data.answer).toContain("Contact Us");
    expect(result.data.cards.map(({ title }) => title)).toEqual(["React", "Contact Us"]);
    expect(result.data.sources.map(({ title }) => title)).toEqual(["React", "Contact Us"]);
  });

  it("keeps an explicit specific commercial subject ahead of the informational sibling", async () => {
    const result = await send(
      "What is React and how much does Cloud Migration implementation cost?",
      "route-explicit-commercial-subject",
    );
    expect(result.data.answer).toContain("React");
    expect(result.data.answer).toMatch(/cost of Cloud Migration/i);
    expect(result.data.answer).not.toMatch(/cost of React/i);
  });

  it("does not turn a person facet into the subject of generic project pricing", async () => {
    const result = await send(
      "Who is the Founder and how much does a project cost?",
      "route-person-generic-project",
    );
    expect(result.data.answer).toContain("Published Executive");
    expect(result.data.answer).toContain("Pricing depends on the service, project scope");
    expect(result.data.answer).not.toMatch(/cost of (?:the )?Founder|cost of Published Executive/i);
  });

  it("does not import an unrelated historical topic into an explicit current subject", async () => {
    const result = await send("Tell me about Customer Experience and show me related services.", "route-topic-reset", [
      { role: "user", content: "Tell me about healthcare data analytics." },
      { role: "assistant", content: "Healthcare data analytics information." },
    ]);
    expect(result.data.answer).toContain("Customer Experience");
    expect(result.data.answer).not.toContain("Healthcare data analytics");
  });

  it("preserves an offering while safely handling a project-scope facet", async () => {
    const result = await send("Tell me about DevSecOps and what would a project typically involve?", "route-project-scope");
    expect(result.data.answer).toContain("DevSecOps Services");
    expect(result.data.answer).toContain("Contact Us");
  });

  it("keeps a displayed multi-intent suggestion aligned when executed", async () => {
    const result = await send("Tell me about Cloud services and then tell me about Data Engineering.", "route-action-source");
    const action = result.data.suggestionActions[0];
    expect(action?.targetUrl).toBeTruthy();
    expect(`${action?.subject} ${action?.topic}`).toMatch(/data engineering/i);
    expect(`${action?.subject} ${action?.topic}`).not.toMatch(/cloud/i);
    const clicked = await send(action!.label, "route-action-click", [], action);
    expect(clicked.data.cards.some(({ title }) => action!.label.includes(title))).toBe(true);
  });

  it("parses the real Cloud relation request through POST without instruction residue", async () => {
    const result = await send(
      "Tell me about your cloud services and give me an example of a related case study.",
      "route-cloud-relation-real-shape",
      [{ role: "assistant", content: "Hi! How can I help you explore Successive?" }],
    );
    expect(result.data.answer).toMatch(/cloud/i);
    expect(result.data.answer).not.toMatch(/example give|connected device app development/i);
    expect(result.data.cards.some(({ title }) => /cloud/i.test(title))).toBe(true);
    expect(result.data.cards.every(({ title }) => !/connected device/i.test(title))).toBe(true);
    expect(result.data.sources.every(({ title }) => !/connected device/i.test(title))).toBe(true);
  });

  it("uses a role-compatible canonical acronym identity before body-only service mentions", async () => {
    const result = await send("Tell me about AI services and show me related case studies.", "route-ai-service-family");
    expect(result.data.cards[0]?.title).toBe("Artificial Intelligence (AI) Development Company");
    expect(result.data.cards.map(({ title }) => title)).not.toContain("Experience Design Services");
    expect(result.data.answer).not.toContain("Experience Design Services");
  });

  it("does not manufacture a service family from body-only mentions", async () => {
    const result = await send("Tell me about Quantum Orchard services.", "route-missing-service-family");
    expect(result.data.cards).toEqual([]);
    expect(result.data.sources).toEqual([]);
    expect(result.data.answer).toMatch(/couldn.t find|couldn.t confirm|not find|no valid/i);
  });

  it("reuses validated topic discovery for the latest grounded multi-intent facet", async () => {
    const result = await send(
      "Tell me about Cloud Migration and then tell me about Data Engineering.",
      "route-latest-topic-discovery",
    );
    expect(result.data.cards.map(({ title }) => title)).toEqual([
      "Cloud Migration Consulting Services", "Data Engineering Services",
    ]);
    expect(result.data.suggestionActions).toHaveLength(1);
    expect(result.data.suggestionActions[0]).toMatchObject({
      subject: "Data Engineering Services",
      topic: "Data Engineering Services",
    });
    expect(result.data.suggestionActions[0]?.label).toMatch(/data engineering/i);
    expect(`${result.data.suggestionActions[0]?.subject} ${result.data.suggestionActions[0]?.topic}`)
      .not.toMatch(/cloud migration/i);
  });

  it("does not fall back to an earlier facet when the latest facet has no validated relation", async () => {
    const result = await send(
      "Tell me about Data Engineering and then tell me about Interface Framework.",
      "route-no-stale-suggestion-fallback",
    );
    expect(result.data.answer).toContain("Data Engineering Services");
    expect(result.data.answer).toContain("Interface Framework");
    expect(result.data.suggestionActions).toEqual([]);
    expect(result.data.suggestions).toEqual([]);
  });

  it("lets an explicit current topic switch own suggestions despite prior history", async () => {
    const result = await send(
      "Tell me about Cloud Migration and then tell me about Data Engineering.",
      "route-history-topic-reset-suggestions",
      [
        { role: "user", content: "Tell me about Customer Experience." },
        { role: "assistant", content: "Customer Experience information." },
      ],
    );
    expect(result.data.suggestionActions.every(({ subject, topic }) =>
      /data engineering/i.test(`${subject ?? ""} ${topic ?? ""}`) &&
      !/customer experience|cloud migration/i.test(`${subject ?? ""} ${topic ?? ""}`))).toBe(true);
  });
});
