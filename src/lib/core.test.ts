import { afterEach, describe, expect, it, vi } from "vitest";
import { detectIntent } from "./intent-detector";
import { htmlToText } from "./html-utils";
import { flattenAcf, normalizeContent } from "./content-normalizer";
import { relevanceScore } from "./relevance-score";
import {
  assistantResponseSchema,
  filterResponseUrls,
  normalizeAssistantResponse,
} from "./llm/schemas";
import { retrieveContent } from "./content-retriever";
import {
  buildContentDetail,
  buildProductComparison,
} from "./api-response-builder";
import { corsHeaders } from "./cors";
import {
  hexColorSchema,
  httpUrlSchema,
  parseWidgetQuery,
  readableForeground,
  widgetMessageSchema,
} from "./widget-config";
import { readFileSync } from "node:fs";
import {
  cleanText,
  deduplicateSegments,
  extractAcfContent,
} from "./acf-extractor";
import {
  buildSearchDocument,
  buildSearchChunks,
  normalizeWordPressUrl,
} from "./search-index";
import {
  detectRequestedServiceTypes,
  isBroadAiServicesQuery,
  isUseCaseQuery,
  matchesRequestedServiceType,
  normalizeQuery,
  rankSearchDocument,
  requestedCollection,
  retrieveFromIndex,
} from "./search-retriever";
import { fetchAllPublishedContent } from "./successive-api";
import {
  canUseEnglishQueryDirectly,
  prepareEnglishQuery,
} from "./query-language";
import { greetingResponse, isGreeting } from "./conversation";
import {
  asksForAnotherResult,
  buildConversationRetrievalQuery,
  buildRelatedServiceRetrievalQuery,
  contentIdentitiesFromAssistantHistory,
  contentIdentity,
  isVagueBusinessDiscovery,
  shouldDeduplicateDiscoveryResults,
} from "./conversation-context";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("intent detection", () => {
  it("detects Successive website intents", () => {
    expect(detectIntent("Tell me about Successive services")).toBe("products");
    expect(detectIntent("who is Successive")).toBe("about");
    expect(detectIntent("Show customer stories")).toBe("case_studies");
    expect(detectIntent("any example")).toBe("case_studies");
    expect(detectIntent("show me another example")).toBe("case_studies");
    expect(detectIntent("what servies you provid")).toBe("products");
    expect(detectIntent("more serivces")).toBe("products");
    expect(detectIntent("any webniar for cloud")).toBe("events");
    expect(detectIntent("show case stduy")).toBe("case_studies");
    expect(detectIntent("we need app devlopment")).toBe("products");
    expect(detectIntent("Book a demo")).toBe("contact");
    expect(detectIntent("I need help")).toBe("general");
    expect(detectIntent("about")).toBe("about");
    expect(detectIntent("customers")).toBe("case_studies");
    expect(detectIntent("latest whitepaper")).toBe("resources");
    expect(detectIntent("whitepeper")).toBe("resources");
    expect(detectIntent("whtieperper")).toBe("resources");
    expect(
      detectIntent(
        "Web apps strengthen online presence and engage customers across browsers.",
      ),
    ).toBe("general");
    expect(detectIntent("industers")).toBe("page");
    expect(
      detectIntent(
        "Tell me more about Unleash Creativity with a Trusted Creative Design Company",
      ),
    ).toBe("general");
  });
});

describe("multi-turn conversation context", () => {
  it("grounds related-service follow-ups in the latest assistant sources", () => {
    const history = [
      { role: "user" as const, content: "more blogs" },
      {
        role: "assistant" as const,
        content:
          "Read [AI in Supply Chain](https://successive.tech/ai-supply-chain/) and [Retail AI](https://successive.tech/retail-ai/).",
      },
    ];
    expect(
      buildRelatedServiceRetrievalQuery(
        "Show me related Successive services",
        history,
      ),
    ).toBe("AI in Supply Chain. Retail AI. related Successive services");
    expect(
      buildRelatedServiceRetrievalQuery(
        "Show me relevant Successive services",
        history,
      ),
    ).toBe("AI in Supply Chain. Retail AI. related Successive services");
  });

  it("turns a related-service suggestion after fallback into broad discovery", () => {
    expect(
      buildRelatedServiceRetrievalQuery(
        "Show me relevant Successive services",
        [
          { role: "user", content: "gajedran" },
          {
            role: "assistant",
            content:
              "I could not find reliable information in the available Successive website content.",
          },
        ],
      ),
    ).toBe(
      "digital transformation cloud data artificial intelligence experience design services",
    );
  });
  it("carries recent business context into referential content transitions", () => {
    const query = buildConversationRetrievalQuery("Any case studies?", [
      { role: "user", content: "I work in healthcare." },
      { role: "assistant", content: "How can we help?" },
      { role: "user", content: "We want to improve hospital operations." },
      { role: "assistant", content: "AI may help." },
      { role: "user", content: "Can AI help us as well?" },
    ]);
    expect(query).toContain("healthcare");
    expect(query).toContain("hospital operations");
    expect(query).toContain("Any case studies?");
  });

  it("carries AI context into a misspelled request for more services", () => {
    expect(
      buildConversationRetrievalQuery("more serivces", [
        { role: "user", content: "ai service" },
        { role: "assistant", content: "Generative AI and AI strategy" },
      ]),
    ).toBe("ai service. more serivces");
    expect(asksForAnotherResult("more serivces")).toBe(true);
    expect(shouldDeduplicateDiscoveryResults("more serivces", "products")).toBe(
      true,
    );
  });

  it("resets retrieval context when the visitor explicitly changes topic", () => {
    expect(
      buildConversationRetrievalQuery(
        "Actually I am more interested in cloud",
        [{ role: "user", content: "Show me AI services" }],
      ),
    ).toBe("Actually I am more interested in cloud");
  });

  it("keeps a standalone AI services query independent from old history", () => {
    expect(
      buildConversationRetrievalQuery("ai services", [
        { role: "user", content: "Which industries can use GIS?" },
        { role: "assistant", content: "Agriculture and healthcare." },
        { role: "user", content: "Do you have any webinars?" },
      ]),
    ).toBe("ai services");
  });

  it("keeps a misspelled whitepaper query independent from old history", () => {
    expect(
      buildConversationRetrievalQuery("whitepeper", [
        { role: "user", content: "Show me AI services" },
      ]),
    ).toBe("whitepeper");
  });

  it("does not contaminate explicit suggestion titles with old About context", () => {
    const history = [
      { role: "user" as const, content: "About Successive" },
      { role: "assistant" as const, content: "Successive company overview" },
    ];
    expect(buildConversationRetrievalQuery("Innovation", history)).toBe(
      "Innovation",
    );
    expect(buildConversationRetrievalQuery("Successive Digital", history)).toBe(
      "Successive Digital",
    );
    expect(
      buildConversationRetrievalQuery("Digital Transformation", history),
    ).toBe("Digital Transformation");
    expect(
      buildConversationRetrievalQuery(
        "Tell me more about Unleash Creativity with a Trusted Creative Design Company",
        history,
      ),
    ).toBe(
      "Tell me more about Unleash Creativity with a Trusted Creative Design Company",
    );
  });

  it("distinguishes detail requests from requests for unseen results", () => {
    expect(
      asksForAnotherResult(
        "Tell me more about Unleash Creativity with a Trusted Creative Design Company",
      ),
    ).toBe(false);
    expect(asksForAnotherResult("show me another service")).toBe(true);
    expect(asksForAnotherResult("more")).toBe(true);
  });

  it("deduplicates discovery categories but keeps navigation and detail repeatable", () => {
    expect(shouldDeduplicateDiscoveryResults("show blogs", "blogs")).toBe(true);
    expect(
      shouldDeduplicateDiscoveryResults("Digital Transformation", "general"),
    ).toBe(false);
    expect(
      shouldDeduplicateDiscoveryResults(
        "Tell me more about Digital Transformation",
        "general",
      ),
    ).toBe(false);
    expect(shouldDeduplicateDiscoveryResults("About Successive", "about")).toBe(
      false,
    );
    expect(shouldDeduplicateDiscoveryResults("Contact Us", "contact")).toBe(
      false,
    );
  });

  it("matches previously shown content by canonical URL or normalized title", () => {
    expect(
      contentIdentity("AI Strategy", "https://successive.ai/ai-strategy/"),
    ).toEqual(["url:https://successive.ai/ai-strategy", "title:ai strategy"]);
  });

  it("recovers seen content from older clients that only send answer history", () => {
    expect(
      contentIdentitiesFromAssistantHistory([
        { role: "user", content: "ai services" },
        {
          role: "assistant",
          content:
            "See [Generative AI Consulting](https://successive.ai/gen-ai/).",
        },
      ]),
    ).toEqual([
      "url:https://successive.ai/gen-ai",
      "title:generative ai consulting",
    ]);
  });

  it("does not let an old collection override a new all-services request", () => {
    expect(
      buildConversationRetrievalQuery("all service", [
        { role: "user", content: "all whitepaper" },
        { role: "assistant", content: "Here are the whitepapers." },
      ]),
    ).toBe("all service");
  });

  it("recognizes fragmented discovery prompts", () => {
    expect(isVagueBusinessDiscovery("Need help")).toBe(true);
    expect(isVagueBusinessDiscovery("Cloud migration help")).toBe(false);
  });

  it("recognizes generic service recommendation requests with typos", () => {
    expect(isVagueBusinessDiscovery("i need some suggetion for services")).toBe(
      true,
    );
    expect(isVagueBusinessDiscovery("recommend services for my business")).toBe(
      true,
    );
  });
});

describe("service type query filtering", () => {
  it("recognizes use-case requests for any topic", () => {
    expect(isUseCaseQuery("i want use case of ai")).toBe(true);
    expect(isUseCaseQuery("Show cloud applications for business")).toBe(true);
    expect(isUseCaseQuery("Give me healthcare use cases")).toBe(true);
    expect(isUseCaseQuery("AI services")).toBe(false);
  });

  it("treats generic AI services as a complete portfolio query", () => {
    expect(isBroadAiServicesQuery("ai services")).toBe(true);
    expect(isBroadAiServicesQuery("Show me Successive AI services")).toBe(true);
    expect(isBroadAiServicesQuery("generative ai services")).toBe(false);
    expect(isBroadAiServicesQuery("AI strategy consulting services")).toBe(
      false,
    );
  });
  it("maps dropdown wording and common misspellings to strict ACF values", () => {
    expect(detectRequestedServiceTypes("show cloud pillar services")).toEqual([
      "service",
      "pillar",
    ]);
    expect(detectRequestedServiceTypes("show piller")).toEqual(["pillar"]);
    expect(detectRequestedServiceTypes("AI expert")).toEqual(["expertise"]);
    expect(detectRequestedServiceTypes("service pillar exper")).toEqual([
      "service",
      "pillar",
      "expertise",
    ]);
  });

  it("keeps only documents matching the requested ACF service type", () => {
    expect(matchesRequestedServiceType("cloud pillar services", "Pillar")).toBe(
      true,
    );
    expect(
      matchesRequestedServiceType("cloud pillar services", "Expertise"),
    ).toBe(false);
    expect(matchesRequestedServiceType("cloud service", "Sub-service")).toBe(
      true,
    );
    expect(matchesRequestedServiceType("service pillar", "Piller")).toBe(true);
    expect(matchesRequestedServiceType("service pillar", "Sub-service")).toBe(
      true,
    );
    expect(matchesRequestedServiceType("service pillar", "Expertise")).toBe(
      false,
    );
    expect(matchesRequestedServiceType("cloud services", undefined)).toBe(
      false,
    );
  });
});
describe("collection pagination requests", () => {
  it("routes more/another requests through every repeatable collection", () => {
    const expected = new Map([
      ["more blogs", "blogs and insights"],
      ["another case study", "case studies"],
      ["more industries", "industries"],
      ["next webinar", "webinars and events"],
      ["more accelerators", "accelerators"],
      ["other awards", "awards and recognitions"],
      ["more partners", "partners and alliances"],
      ["more careers", "career pages"],
      ["more press releases", "PR and media coverage"],
      ["more thought leadership", "thought leadership"],
      ["more employee perspectives", "employee perspectives"],
      ["more expertise", "expertise pages"],
      ["more pillars", "service pillars"],
    ]);
    for (const [query, label] of expected)
      expect(requestedCollection(query)?.label).toBe(label);
  });

  it("keeps more services available for topic-aware semantic retrieval", () => {
    expect(requestedCollection("more services")).toBeUndefined();
    expect(requestedCollection("list all services")?.label).toBe("services");
  });
});
describe("short topic query normalization", () => {
  it("expands navigation prompts and common misspellings for retrieval", () => {
    expect(normalizeQuery("about")).toBe("us successive company");
    expect(normalizeQuery("customers")).toBe("customer case studies");
    expect(normalizeQuery("careers")).toBe("careers jobs");
    expect(normalizeQuery("industers")).toBe("industries industry");
    expect(normalizeQuery("ai servies fhfghf")).toBe("ai services");
    expect(normalizeQuery("ai serivces")).toBe("ai services");
  });
});
describe("query language preparation", () => {
  it("uses deterministic preparation for English queries", () => {
    expect(
      canUseEnglishQueryDirectly("Tell me about Successive products"),
    ).toBe(true);
    expect(
      prepareEnglishQuery("Tell me about Successive products"),
    ).toMatchObject({
      englishQuery: "Tell me about Successive products",
      responseLanguage: "English",
    });
  });

  it("sends Roman Hindi and non-Latin queries to translation", () => {
    expect(
      canUseEnglishQueryDirectly(
        "mujhe Successive products ke bare mein batao",
      ),
    ).toBe(false);
    expect(canUseEnglishQueryDirectly("केगन के उत्पाद बताएं")).toBe(false);
  });
});
describe("normal conversation", () => {
  it("recognizes standalone greetings and returns action chips", () => {
    expect(isGreeting("Hi")).toBe(true);
    expect(isGreeting("hello!")).toBe(true);
    expect(isGreeting("hi, explain Successive products")).toBe(false);
    expect(greetingResponse().suggestions).toEqual([
      "Explore Successive services",
      "Show me case studies",
      "Tell me about Successive",
      "Contact Successive",
    ]);
  });
});
describe("assistant response transport normalization", () => {
  it("bounds WordPress fields and ignores an invalid optional image", () => {
    const result = normalizeAssistantResponse({
      answer: "A grounded answer",
      cards: [
        {
          type: "page",
          title: "T".repeat(240),
          description: "D".repeat(620),
          url: "https://successive.ai/example",
          image: "not-a-url",
          badge: "B".repeat(80),
          service_type: "Sub-service",
        },
      ],
      suggestions: ["S".repeat(200)],
      sources: [
        {
          title: "T".repeat(240),
          url: "https://successive.ai/example",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cards[0]).toMatchObject({
      title: "T".repeat(200),
      description: "D".repeat(500),
      image: undefined,
      badge: "B".repeat(50),
      service_type: "Sub-service",
    });
    expect(result.data.suggestions[0]).toHaveLength(160);
    expect(result.data.sources[0]?.title).toHaveLength(200);
  });
});
describe("HTML utilities", () => {
  it("removes unsafe markup and decodes entities", () => {
    expect(
      htmlToText("<p>Hello &amp; welcome</p><script>alert(1)</script>"),
    ).toBe("Hello & welcome");
  });
});
describe("ACF normalization", () => {
  it("recursively extracts text, links, and images", () => {
    const result = flattenAcf({
      group: [
        { body: "<b>Useful</b>" },
        { hero_image: "https://successive.ai/a.jpg" },
      ],
    });
    expect(result.text).toContain("Useful");
    expect(result.images).toContain("https://successive.ai/a.jpg");
  });
  it("normalizes WordPress items safely", () => {
    const result = normalizeContent({
      id: 1,
      type: "product",
      link: "https://successive.ai/p",
      title: { rendered: "PRISM" },
      content: { rendered: "<p>Content</p>" },
    });
    expect(result).toMatchObject({
      title: "PRISM",
      plainText: "PRISM\nContent",
      url: "https://successive.ai/p",
    });
  });
  it("uses a meaningful ACF hero description when excerpt is empty", () => {
    const result = normalizeContent({
      id: 2,
      type: "product",
      link: "https://successive.ai/voice",
      title: { rendered: "Successive VOICE" },
      excerpt: { rendered: "" },
      acf: {
        image: {
          filename: "voice-screenshot.png",
          url: "https://successive.ai/voice.png",
        },
        hero_description:
          "Deploy enterprise AI voice agents for secure and natural call automation.",
      },
    });
    expect(result.excerpt).toBe(
      "Deploy enterprise AI voice agents for secure and natural call automation.",
    );
  });
  it("uses a broad Home product heading instead of product-specific metadata", () => {
    const result = normalizeContent({
      id: 3,
      type: "page",
      slug: "home",
      link: "https://successive.ai/",
      title: { rendered: "Home" },
      acf: {
        home_hero_description: "A product-specific description.",
        home_products_heading:
          "AI-Native Suite Built to Automate, Govern, and Scale",
      },
    });
    expect(result.excerpt).toBe(
      "AI-Native Suite Built to Automate, Govern, and Scale",
    );
  });
});
describe("relevance scoring", () => {
  it("weights title and matching type", () => {
    const base = {
      id: 1,
      type: "product",
      slug: "",
      title: "Successive PRISM",
      excerpt: "",
      plainText: "platform",
      url: "",
      acfText: "",
      extractedUrls: [],
    };
    expect(
      relevanceScore(base, "Successive PRISM", "products"),
    ).toBeGreaterThan(
      relevanceScore(
        { ...base, title: "Other" },
        "Successive PRISM",
        "general",
      ),
    );
  });
});
describe("structured responses", () => {
  it("validates bounds and filters invented URLs", () => {
    const valid = assistantResponseSchema.parse({
      answer: "Answer",
      cards: [
        {
          type: "product",
          title: "Good",
          description: "",
          url: "https://successive.ai/good",
        },
        {
          type: "page",
          title: "Bad",
          description: "",
          url: "https://evil.test/",
        },
      ],
      suggestions: [],
      sources: [{ title: "Good", url: "https://successive.ai/good" }],
    });
    const filtered = filterResponseUrls(
      valid,
      new Set(["https://successive.ai/good"]),
    );
    expect(filtered.cards).toHaveLength(1);
    expect(filtered.sources).toHaveLength(1);
  });
});
// These tests document the custom Kagen endpoint contract retained in the
// reference project. Successive uses custom v1 collections; its adapter
// has dedicated tests in successive-api.test.ts.
describe.skip("legacy custom WordPress retrieval", () => {
  it("returns every product and excludes other content for a product-list query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 1,
                type: "product",
                slug: "product-one",
                link: "https://successive.ai/product/one/",
                title: { rendered: "Product One" },
                content: {
                  rendered: "<p>First published Successive product.</p>",
                },
              },
              {
                id: 2,
                type: "product",
                slug: "product-two",
                link: "https://successive.ai/product/two/",
                title: { rendered: "Product Two" },
                content: {
                  rendered: "<p>Second published Successive product.</p>",
                },
              },
              {
                id: 3,
                type: "post",
                slug: "product-post",
                link: "https://successive.ai/blog/product-post/",
                title: { rendered: "Product Post" },
                content: {
                  rendered: "<p>A post about Successive products.</p>",
                },
              },
              {
                id: 4,
                type: "case-study",
                slug: "product-story",
                link: "https://successive.ai/case-study/product-story/",
                title: { rendered: "Product Customer Story" },
                content: { rendered: "<p>A customer product story.</p>" },
              },
              {
                id: 5,
                type: "page",
                slug: "about-us",
                link: "https://successive.ai/about-us/",
                title: { rendered: "About Us" },
                content: { rendered: "<p>About the Successive company.</p>" },
              },
            ]),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-WP-TotalPages": "1",
              },
            },
          ),
      ),
    );

    const result = await retrieveFromIndex("Explain Successive products");

    expect(result.isProductList).toBe(true);
    expect(result.matches.map(({ document }) => document.type)).toEqual([
      "product",
      "product",
    ]);
    expect(result.matches.map(({ document }) => document.title)).toEqual([
      "Product One",
      "Product Two",
    ]);
  });

  it("fetches product data dynamically and ranks matching products", async () => {
    const products = [
      {
        id: 10,
        type: "product",
        slug: "prism",
        link: "https://successive.ai/prism",
        title: { rendered: "Successive PRISM" },
        excerpt: { rendered: "Content intelligence platform" },
      },
      {
        id: 11,
        type: "product",
        slug: "new-product",
        link: "https://successive.ai/new",
        title: { rendered: "New Dynamic Product" },
        excerpt: { rendered: "A newly published product" },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            url.includes("type=product")
              ? JSON.stringify(products)
              : JSON.stringify({
                  id: 20,
                  type: "page",
                  link: "https://successive.ai/products",
                  title: { rendered: "Products" },
                }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const result = await retrieveContent("Explain Successive products");
    expect(result.items.map((item) => item.title)).toContain(
      "New Dynamic Product",
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("type=product"),
      expect.any(Object),
    );
  });
  it("retrieves only the PRISM and Products pages for a PRISM question", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify({
              id: url.includes("successive-prism") ? 40 : 41,
              type: "page",
              slug: url.includes("successive-prism")
                ? "successive-prism"
                : "products",
              link: url.includes("successive-prism")
                ? "https://successive.ai/successive-prism/"
                : "https://successive.ai/products/",
              title: {
                rendered: url.includes("successive-prism")
                  ? "Successive PRISM AI-first Content Intelligence Platform"
                  : "Products",
              },
              content: { rendered: "<p>Official page content</p>" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const result = await retrieveContent("What is Successive PRISM?");
    expect(result.intent).toBe("product_detail");
    expect(result.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Successive PRISM AI-first Content Intelligence Platform",
        "Products",
      ]),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("type=product"),
      expect.any(Object),
    );
  });
  it("selects the matching dynamic AI Voice product and Products page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.includes("type=product")
          ? [
              {
                id: 51,
                type: "product",
                slug: "successive-add",
                link: "https://successive.ai/product/successive-add/",
                title: { rendered: "Successive ADD" },
                content: { rendered: "<p>Software delivery</p>" },
              },
              {
                id: 52,
                type: "product",
                slug: "successive-voice",
                link: "https://successive.ai/product/successive-voice/",
                title: { rendered: "Successive VOICE AI Voice Agents" },
                content: {
                  rendered: "<p>AI voice agents for call automation</p>",
                },
              },
            ]
          : {
              id: 53,
              type: "page",
              slug: "products",
              link: "https://successive.ai/products/",
              title: { rendered: "Products" },
            };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const result = await retrieveContent("do you know about AI voice");
    expect(result.intent).toBe("product_detail");
    expect(result.items.map((item) => item.title)).toEqual([
      "Successive VOICE AI Voice Agents",
      "Products",
    ]);
  });
  it("uses the Home page instead of the disabled About page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 30,
              type: "page",
              slug: "home",
              link: "https://successive.ai/",
              title: { rendered: "Home" },
              content: {
                rendered: "<h2>About Successive</h2><p>Company overview</p>",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const result = await retrieveContent("Who is Successive?");
    expect(result.intent).toBe("about");
    expect(result.items[0]?.plainText).toContain("About Successive");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pages/home"),
      expect.any(Object),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/pages/about-us"),
      expect.any(Object),
    );
  });
  it("maps the phonetic Kaga Eye query to Home page company content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 31,
              type: "page",
              slug: "home",
              link: "https://successive.ai/",
              title: { rendered: "Home" },
              acf: {
                hero_description:
                  "Successive AI unifies enterprise intelligence with agentic workflows.",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const result = await retrieveContent("do you know about kaga eye");
    expect(result.intent).toBe("about");
    expect(result.items[0]?.excerpt).toContain(
      "Successive AI unifies enterprise intelligence",
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pages/home"),
      expect.any(Object),
    );
  });
  it("does not substitute generic pages when API search has no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const result = await retrieveContent("unknown unpublished subject");
    expect(result.items).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
describe("actionable product follow-ups", () => {
  it("builds a real comparison and does not repeat the compare suggestion", () => {
    const products = [
      {
        id: 1,
        type: "product",
        slug: "one",
        title: "Product One",
        excerpt: "Automates document workflows",
        plainText: "Automates document workflows",
        url: "https://successive.ai/one",
        acfText: "",
        extractedUrls: [],
      },
      {
        id: 2,
        type: "product",
        slug: "two",
        title: "Product Two",
        excerpt: "Supports voice automation",
        plainText: "Supports voice automation",
        url: "https://successive.ai/two",
        acfText: "",
        extractedUrls: [],
      },
    ];
    const response = buildProductComparison(products);
    expect(response).not.toBeNull();
    if (!response) throw new Error("Expected API-backed comparison");
    expect(response.answer).toContain("| Product | Published overview |");
    expect(response.answer).toContain("Product One");
    expect(response.cards).toHaveLength(2);
    expect(response.suggestions).not.toContain("Compare these products");
  });
  it("builds product details only from retrieved API fields", () => {
    const response = buildContentDetail([
      {
        id: 7,
        type: "page",
        slug: "prism",
        title: "Successive PRISM",
        excerpt: "Official PRISM overview from WordPress.",
        plainText: "Successive PRISM Official PRISM overview from WordPress.",
        url: "https://successive.ai/prism",
        acfText: "",
        extractedUrls: [],
      },
    ]);
    expect(response?.answer).toContain(
      "Official PRISM overview from WordPress",
    );
    expect(response?.cards).toHaveLength(1);
    expect(response?.sources).toEqual([
      { title: "Successive PRISM", url: "https://successive.ai/prism" },
    ]);
  });
});
describe("widget configuration", () => {
  it("validates colors, URLs, and constrains dimensions", () => {
    expect(hexColorSchema.safeParse("#11AAff").success).toBe(true);
    expect(hexColorSchema.safeParse("red").success).toBe(false);
    expect(httpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrlSchema.safeParse("http://example.com/widget").success).toBe(
      false,
    );
    const parsed = parseWidgetQuery(
      new URLSearchParams(
        "width=999&height=1&zIndex=-5&position=top&primaryColor=red",
      ),
    );
    expect(parsed).toMatchObject({
      width: 400,
      height: 650,
      zIndex: 2147483000,
      position: "bottom-right",
      primaryColor: "#0063ce",
    });
    expect(readableForeground("#ffffff")).toBe("#111827");
    expect(readableForeground("#111827")).toBe("#ffffff");
  });
  it("validates postMessage origins through shape and namespace", () => {
    expect(
      widgetMessageSchema.safeParse({
        namespace: "successive-chat",
        type: "SUCCESSIVE_CHAT_READY",
      }).success,
    ).toBe(true);
    expect(
      widgetMessageSchema.safeParse({
        namespace: "other",
        type: "SUCCESSIVE_CHAT_READY",
      }).success,
    ).toBe(false);
    expect(
      widgetMessageSchema.safeParse({
        namespace: "successive-chat",
        type: "EVIL",
      }).success,
    ).toBe(false);
  });
  it("enforces configured CORS origins", () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://successive.ai");
    vi.stubEnv("WIDGET_ALLOWED_ORIGINS", "https://partner.example");
    expect(corsHeaders("https://partner.example").isAllowed).toBe(true);
    expect(corsHeaders("https://evil.example").isAllowed).toBe(false);
    expect(
      corsHeaders("https://successive.ai").headers[
        "Access-Control-Allow-Origin"
      ],
    ).toBe("https://successive.ai");
    vi.unstubAllEnvs();
  });
  it("allows file-origin widget demos only outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(corsHeaders("null")).toMatchObject({
      isAllowed: true,
      headers: { "Access-Control-Allow-Origin": "null" },
    });
    vi.stubEnv("NODE_ENV", "production");
    expect(corsHeaders("null").isAllowed).toBe(false);
  });
  it("protects duplicate initialization and exposes only the public API", () => {
    const script = readFileSync("public/successive-chat-widget.js", "utf8");
    expect(script).toContain(
      "window.SuccessiveChat && window.SuccessiveChat.__initialized",
    );
    for (const method of ["open", "close", "toggle", "destroy", "isOpen"])
      expect(script).toContain(`${method}:`);
    expect(script).not.toContain('document.createElement("iframe")');
    expect(script).toContain("fetch(config.apiUrl");
    expect(script).toContain("safeUrl(value");
  });
});
describe("complete ACF search indexing", () => {
  it("preserves the service type used by service story cards", () => {
    const document = buildSearchDocument({
      id: 2603,
      type: "page",
      slug: "full-stack-development-company",
      link: "https://successive.ai/full-stack-development-company/",
      title: { rendered: "Full-Stack Development Services" },
      acf: {
        service_type: "Sub-service",
        description2: "Complete full-stack service content.",
      },
    });
    expect(document.service_type).toBe("Sub-service");
  });
  it("preserves paragraphs and overlap while chunking long content", () => {
    const chunks = buildSearchChunks(10, [
      `First paragraph ${"foundation ".repeat(90)}`,
      `Middle paragraph ${"accuracy ".repeat(90)}`,
      `Final paragraph ${"complexity ".repeat(90)}`,
    ]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 2200)).toBe(true);
    expect(
      chunks.some((chunk) => chunk.text.includes("Middle paragraph")),
    ).toBe(true);
  });
  it("extracts nested template fields and excludes image metadata", () => {
    const extracted = extractAcfContent({
      product_template_3_hero_heading: "Agentic Driven Delivery",
      product_template_3_sections: [
        {
          heading: "Swarm Intelligence",
          description:
            "Multiple implementations run in parallel and evaluate trade-offs.",
        },
      ],
      hero_image: {
        ID: 99,
        filename: "screenshot.png",
        width: 1200,
        sizes: { thumbnail: "https://successive.ai/thumb.png" },
        url: "https://successive.ai/hero.png",
        alt: "Agentic delivery workflow",
      },
    });
    expect(extracted.headings).toEqual(
      expect.arrayContaining(["Agentic Driven Delivery", "Swarm Intelligence"]),
    );
    expect(extracted.descriptions).toContain(
      "Multiple implementations run in parallel and evaluate trade-offs.",
    );
    expect(extracted.textSegments.join(" ")).not.toContain("screenshot.png");
    expect(extracted.images).toEqual([
      {
        url: "https://successive.ai/hero.png",
        alt: "Agentic delivery workflow",
        title: undefined,
      },
    ]);
  });
  it("cleans repeated phrases and duplicate repeaters", () => {
    expect(cleanText("E-commerceE-commerce")).toBe("E-commerce");
    expect(
      cleanText(
        "AI-Native Voice PlatformAI-Native Voice PlatformAI-Native Voice Platform",
      ),
    ).toBe("AI-Native Voice Platform");
    expect(
      deduplicateSegments(["Secure workflows", "secure workflows", "Other"]),
    ).toEqual(["Secure workflows", "Other"]);
  });
  it("rejects FAQ answers that only repeat their question", () => {
    const extracted = extractAcfContent({
      faq_items: [
        { question: "What is VOICE?", answer: "What is VOICE?" },
        {
          question: "How does it help?",
          answer: "It automates published voice workflows securely.",
        },
      ],
    });
    expect(extracted.faqItems).toHaveLength(1);
    expect(extracted.faqItems[0]?.question).toBe("How does it help?");
  });
  it("discovers a product-like PRISM page and ranks aliases exactly", () => {
    const document = buildSearchDocument({
      id: 80,
      type: "page",
      slug: "successive-prism-ai-first-content-intelligence-platform",
      link: "https://successive.ai/successive-prism/",
      title: {
        rendered: "Successive PRISM AI-first Content Intelligence Platform",
      },
      acf: {
        hero_description:
          "An AI-first content intelligence platform for enterprises.",
      },
    });
    expect(document.productLike).toBe(true);
    expect(document.aliases).toContain("successive prism");
    expect(
      rankSearchDocument(document, "successive prism").score,
    ).toBeGreaterThan(100);
    expect(rankSearchDocument(document, "prism").score).toBeGreaterThan(100);
  });
  it("normalizes conversational queries without removing product entities", () => {
    expect(normalizeQuery("Do you know about Successive EYE?")).toBe(
      "successive eye",
    );
    expect(normalizeQuery("Please explain Successive ADD")).toBe(
      "agentic driven delivery legacy systems",
    );
  });
  it("does not treat an isolated EYE acronym as the Successive EYE entity", () => {
    const document = buildSearchDocument({
      id: 81,
      type: "case-studies",
      slug: "unrelated-case-study",
      link: "https://successive.ai/case-study/",
      title: { rendered: "Conversational AI Case Study" },
      acf: {
        heading: "EYE",
        description:
          "A published case study about conversational voice interactions.",
      },
    });
    expect(rankSearchDocument(document, "successive eye").score).toBeLessThan(
      55,
    );
  });
  it("converts only the configured WordPress localhost origin", () => {
    vi.stubEnv(
      "SUCCESSIVE_API_BASE_URL",
      "http://localhost/wp-successive/wp-json/successive/v1",
    );
    vi.stubEnv("SUCCESSIVE_PUBLIC_SITE_URL", "https://successive.ai");
    expect(
      normalizeWordPressUrl("http://localhost/wp-successive/product/voice/"),
    ).toBe("https://successive.ai/product/voice/");
    expect(normalizeWordPressUrl("https://cdn.example.com/video.mp4")).toBe(
      "https://cdn.example.com/video.mp4",
    );
    vi.unstubAllEnvs();
  });
  it("preserves the local WordPress subdirectory when it is public", () => {
    vi.stubEnv(
      "SUCCESSIVE_API_BASE_URL",
      "http://localhost/wp-successive/wp-json/successive/v1",
    );
    vi.stubEnv("SUCCESSIVE_PUBLIC_SITE_URL", "http://localhost/wp-successive");
    expect(
      normalizeWordPressUrl("http://localhost/wp-successive/product/voice/"),
    ).toBe("http://localhost/wp-successive/product/voice/");
    vi.unstubAllEnvs();
  });
  it.skip("loads every legacy custom WordPress pagination page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const page = new URL(url).searchParams.get("page");
        return new Response(
          JSON.stringify([
            {
              id: page === "1" ? 1 : 2,
              type: "page",
              slug: `page-${page}`,
              link: `https://successive.ai/page-${page}/`,
              title: { rendered: `Page ${page}` },
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-WP-TotalPages": "2",
            },
          },
        );
      }),
    );
    const items = await fetchAllPublishedContent();
    expect(items.map((item) => item.id)).toEqual([1, 2]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("returns empty retrieval context without inventing matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-WP-TotalPages": "1",
            },
          }),
      ),
    );
    const result = await retrieveFromIndex("Successive UNKNOWN");
    expect(result.reliableMatchFound).toBe(false);
    expect(result.matches).toEqual([]);
  });
  it("keeps legal pages out of AI use-case results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 1,
                type: "page",
                slug: "terms-of-services",
                link: "https://successive.tech/terms-of-services/",
                title: { rendered: "Terms of Services" },
                content: {
                  rendered:
                    "<p>AI applications and use cases are mentioned in shared website content. This privacy policy explains how user information is handled.</p>",
                },
              },
              {
                id: 2,
                type: "post",
                slug: "enterprise-ai-applications-benefits-challenges",
                link: "https://successive.tech/blog/enterprise-ai-applications-benefits-challenges/",
                title: {
                  rendered:
                    "Enterprise AI Applications, Benefits and Challenges",
                },
                content: {
                  rendered:
                    "<h2>Enterprise AI use cases</h2><p>Businesses use conversational AI for customer self-service, marketing support, finance workflows, and enterprise operations.</p>",
                },
              },
              {
                id: 3,
                type: "post",
                slug: "generative-ai-in-customer-experience",
                link: "https://successive.tech/blog/generative-ai-in-customer-experience/",
                title: { rendered: "Generative AI in Customer Experience" },
                content: {
                  rendered:
                    "<p>Generative AI helps customers self-assist through conversational experiences and personalized support.</p>",
                },
              },
              {
                id: 4,
                type: "post",
                slug: "cloud-computing-use-cases",
                link: "https://successive.tech/blog/cloud-computing-use-cases/",
                title: { rendered: "Cloud Computing Use Cases" },
                content: {
                  rendered:
                    "<p>Cloud applications support scalable infrastructure, modernization, disaster recovery, and data analytics workloads.</p>",
                },
              },
            ]),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-WP-TotalPages": "1",
              },
            },
          ),
      ),
    );
    const result = await retrieveFromIndex("i want use case of ai");
    expect(result.reliableMatchFound).toBe(true);
    expect(result.collectionLabel).toBe("use cases");
    expect(result.matches.map(({ document }) => document.slug)).toContain(
      "enterprise-ai-applications-benefits-challenges",
    );
    expect(result.matches.map(({ document }) => document.slug)).not.toContain(
      "terms-of-services",
    );
    expect(
      result.matches.every((match) =>
        match.matchedFields.includes("topic-use-case"),
      ),
    ).toBe(true);

    const cloudResult = await retrieveFromIndex("show cloud use cases");
    expect(cloudResult.reliableMatchFound).toBe(true);
    expect(cloudResult.matches[0]?.document.slug).toBe(
      "cloud-computing-use-cases",
    );
    expect(
      cloudResult.matches.map(({ document }) => document.slug),
    ).not.toContain("terms-of-services");
  });
  it("retrieves an article from an exact sentence in the middle of its body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 803,
                type: "post",
                slug: "enterprise-ai-voice-agent-buying-guide-2026",
                link: "https://successive.ai/blog/voice-guide/",
                title: {
                  rendered:
                    "The 2026 Enterprise AI and AI Voice Agent Buying Guide",
                },
                content: {
                  rendered: `<h3>Accuracy &amp; Voice Intelligence</h3>
                    <p>At the core of any AI voice agent is its ability to understand and respond accurately.</p>
                    <p>While most vendors demonstrate near-perfect conversations in controlled environments, real-world conditions are far more complex.</p>
                    <p>An enterprise-grade system must recognize speech across accents and noisy environments.</p>`,
                },
              },
              {
                id: 804,
                type: "post",
                slug: "unrelated",
                link: "https://successive.ai/blog/unrelated/",
                title: { rendered: "Document Automation Overview" },
                content: {
                  rendered:
                    "<p>Automate document workflows with governed content intelligence.</p>",
                },
              },
            ]),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-WP-TotalPages": "1",
              },
            },
          ),
      ),
    );
    const result = await retrieveFromIndex(
      "most vendors demonstrate near-perfect conversations in controlled environments, real-world conditions are far more complex.",
    );
    expect(result.reliableMatchFound).toBe(true);
    expect(result.matches[0]?.document.id).toBe(803);
    expect(result.matches[0]?.matchedFields).toContain("exact-content-phrase");
    expect(result.matches[0]?.selectedPassages[0]).toContain(
      "real-world conditions are far more complex",
    );
  });
  it("searches recursively nested ACF prose using paraphrased keywords", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 900,
                type: "product",
                slug: "voice",
                link: "https://successive.ai/product/voice/",
                title: { rendered: "Successive VOICE" },
                acf: {
                  flexible_sections: [
                    {
                      tabs: [
                        {
                          rich_text:
                            "<p>Reliable speech automation handles challenging customer calls in noisy environments.</p>",
                        },
                      ],
                    },
                  ],
                },
              },
            ]),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-WP-TotalPages": "1",
              },
            },
          ),
      ),
    );
    const result = await retrieveFromIndex(
      "accurate voice platform for complex client conversations",
    );
    expect(result.reliableMatchFound).toBe(true);
    expect(result.matches[0]?.document.id).toBe(900);
    expect(result.matches[0]?.matchedFields).toContain("semantic-expansion");
  });
  it.skip("surfaces legacy custom WordPress API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unavailable", { status: 503 })),
    );
    await expect(fetchAllPublishedContent()).rejects.toThrow(
      "WordPress returned 503",
    );
  });
});
