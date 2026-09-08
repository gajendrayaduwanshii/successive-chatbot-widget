import { describe, expect, it } from "vitest";
import { detectCommercialIntent, commercialSubject } from "../src/lib/commercial-intent";
import { buildDeterministicUnderstanding, resolveConversationUnderstanding } from "../src/lib/query-understanding";
import { detectIntent } from "../src/lib/intent-detector";

const subjects = [
  "cloud migration", "AI development", "Generative AI", "DevSecOps", "headless CMS",
  "data engineering", "mobile development", "website development", "Kagen", "healthcare solutions",
  "product engineering", "experience design", "application modernization",
];
const requests = [
  ["pricing for", "pricing"], ["a cost estimate for", "pricing"], ["a quote for", "quote"],
  ["a quotation for", "quote"], ["a proposal for", "proposal"], ["a consultation about", "consultation"],
  ["to discuss requirements for", "project_discussion"], ["help implementing", "implementation"],
  ["to start a project involving", "buying"], ["to contact your team about", "contact_sales"],
] as const;
const voices = ["I would like", "Could you help me with"];
const commercialMatrix = voices.flatMap((voice) => requests.flatMap(([request, intent]) =>
  subjects.map((subject) => ({ query: `${voice} ${request} ${subject}?`, intent, subject }))));

describe("maximum-coverage commercial verification matrix", () => {
  it("covers 260 distinct commercial messages", () => {
    expect(new Set(commercialMatrix.map(({ query }) => query)).size).toBe(260);
  });
  it.each(commercialMatrix)("$query", ({ query, intent, subject }) => {
    expect(detectCommercialIntent(query)).toBe(intent);
    expect(commercialSubject(query)).toContain(subject.toLowerCase());
  });
});

describe("current direct intent and content-type inventory", () => {
  it.each([
    ["Tell me about Successive", "about", null], ["Show AI services", "products", "service"],
    ["Show healthcare case studies", "case_studies", "case-study"], ["Show AI articles", "blogs", "blog"],
    ["Latest whitepaper", "resources", "whitepaper"], ["Any AI webinar?", "events", "webinar"],
    ["Tell me about Kagen", "products", "kagen-product"], ["Show current openings", "page", "career"],
    ["Show your partners", "general", "partner"], ["Show all industries", "page", "industry"],
    ["Contact Successive", "contact", null], ["What is cloud computing?", "general", null],
  ] as const)("routes %s", (query, intent, contentType) => {
    expect(detectIntent(query)).toBe(intent);
    expect(buildDeterministicUnderstanding(query).requestedContentType).toBe(contentType);
  });
});

describe("current generic context transitions", () => {
  const resolve = (current: string, previous: string) => resolveConversationUnderstanding(
    buildDeterministicUnderstanding(current), [{ role: "user", content: previous }],
  ).understanding;
  it("retains topic when content type changes", () => {
    expect(resolve("Show related case studies", "Show AI services")).toMatchObject({ topics: ["ai"], requestedContentType: "case-study" });
  });
  it("clears topic for an all-collection request", () => {
    expect(resolve("Show all case studies", "Show AI services")).toMatchObject({ topics: [], requestedContentType: "case-study" });
  });
  it("replaces topic on an explicit switch", () => {
    const result = resolve("Tell me about cloud migration", "Tell me about CMS");
    expect(result.topics).toContain("cloud"); expect(result.topics).not.toContain("cms");
  });
  it("retains a person-role subject for a pronoun follow-up", () => {
    expect(resolve("Tell me more about him", "Who is the CEO?").topics).toContain("ceo");
  });
  it("retains an entity across an industry evidence request", () => {
    expect(resolve("Which industries have you implemented this in?", "Tell me about Generative AI"))
      .toMatchObject({ topics: ["generative", "ai"], requestedContentType: "industry" });
  });
});
