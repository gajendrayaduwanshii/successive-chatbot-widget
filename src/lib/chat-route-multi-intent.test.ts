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
      { ...offering(915, "Experience Design Services", "experience-design-services"),
        content: { rendered: "AI AI AI and Quantum Orchard are mentioned in selected experience workflows, while this service provides experience design." } },
    ],
    contact, about, navigation, cloudCase, adjacentTechnology, dataGuide,
  };
});

vi.mock("./successive-api", () => ({
  fetchAllPublishedContent: vi.fn(async () => [...fixtures.offerings, fixtures.contact, fixtures.about,
    fixtures.navigation, fixtures.cloudCase, fixtures.adjacentTechnology, fixtures.dataGuide]),
  fetchSuccessive: vi.fn(async (path: string) => path.includes("/pages/contact") ? [fixtures.contact]
    : path.includes("/pages/about-us") ? [fixtures.about] : []),
  getContentLoadDiagnostics: vi.fn(() => ({ cache: "hit", durationMs: 0, failedCollections: [], partial: false, itemCount: 10 })),
}));

vi.mock("./env", () => ({
  getEnv: () => ({
    SUCCESSIVE_API_BASE_URL: "https://example.test/api",
    SUCCESSIVE_PUBLIC_SITE_URL: "https://example.test",
    ALLOWED_ORIGINS: "https://example.test",
    AI_PROVIDER: "openai", AI_API_KEY: undefined, AI_MODEL: "test",
  }),
}));

vi.mock("./llm", () => ({
  getLLMProvider: () => ({
    generateCommercialResponse: async () => { throw new Error("Use deterministic commercial response"); },
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
  return response.json() as Promise<{ data: { answer: string; cards: Array<{ title: string }>; sources: Array<{ title: string }>;
    suggestions: string[]; suggestionActions: Array<{ id: string; label: string; subject?: string; topic?: string; targetUrl?: string }>;
    diagnostics?: { facetCount: number; informationalFacetCount: number; informationalPartCount: number } } }>;
}

describe("actual chat route multi-intent composition", () => {
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
