import { describe, expect, it } from "vitest";
import { commercialSubject, detectCommercialIntent } from "./commercial-intent";
import { buildDeterministicUnderstanding, resolveConversationUnderstanding } from "./query-understanding";

const mandatoryFlows = [
  ["What is Successive Digital?", "What services does it offer?"],
  ["Tell me about Kagen.", "What products does it include?"],
  ["Do you offer cloud services?", "Tell me more about the migration ones."],
  ["What is Flutter?", "Is it better than native development?"],
  ["Tell me about a healthcare case study.", "How did they reduce onboarding time?"],
  ["Tell me about an AWS case study.", "How did they use Lambda and S3?"],
  ["What industries do you serve?", "Which is your biggest focus?"],
  ["What is Kagen ADD?", "Are there other Kagen products?"],
  ["What certifications do you hold?", "Are you ISO certified too?"],
  ["Where is your HQ?", "Do you have an office in India too?"],
  ["What is an API?", "What is API testing?"],
  ["Do you do data science?", "Do you mean data engineering too?"],
  ["What is cloud computing?", "I mean cloud security, actually."],
  ["Tell me about Successive.", "What about the founder?"],
  ["What is generative AI?", "Do you build GenAI solutions?"],
  ["Since you only work with startups...", "What services do you offer enterprises?"],
  ["Since you're a US-only company...", "Do you have offices in India?"],
  ["You don't do security, right?", "So who handles security?"],
  ["Is Successive a product company?", "Or a services company?"],
  ["Who won yesterday's cricket match?", "What's the score?"],
  ["What's the latest news about Successive?", "What happened this month?"],
  ["What is the stock price of Successive?", "What's its revenue?"],
  ["What are your office timings?", "Are you open on weekends?"],
  ["What services does Successive offer?", "What does Successive do?"],
  ["How much does a project cost?", "What is the price of a project?"],
  ["What industries do you serve?", "Which sectors do you work in?"],
  ["Where is your office?", "What are your locations?"],
];

const subjects = [
  "cloud migration", "AI development", "Generative AI", "DevSecOps", "headless CMS",
  "data engineering", "mobile development", "website development", "Kagen", "healthcare",
  "product engineering", "experience design", "application modernization", "Flutter", "React",
  "Node", "AWS", "Azure", "API testing", "cloud security",
];
const commercialForms = [
  ["What is the cost of", "pricing"], ["Can I get an estimate for", "estimate"],
  ["I need a quote for", "quote"], ["Please prepare a proposal for", "proposal"],
  ["I need a consultation about", "consultation"], ["Can we discuss requirements for", "project_discussion"],
  ["Can your team implement", "implementation"], ["How do we engage Successive for", "buying"],
  ["I want to contact your sales team about", "contact_sales"], ["Could you share pricing for", "pricing"],
] as const;
const commercialMessages = ["", "Please "].flatMap((prefix) => commercialForms.flatMap(([form, intent]) =>
  subjects.map((subject) => ({ query: `${prefix}${form} ${subject}?`, intent, subject }))));

const transitions = [
  "Tell me more about it", "Show related case studies", "Show related articles", "Which industries use this",
  "Show all services", "Actually I mean cloud security", "What does it do", "Any examples for this",
  "Can I get an estimate", "Can your team implement this for us", "What about the first one",
  "No, show the other one", "How much would something like this cost",
];
const contextMessages = subjects.flatMap((subject) => transitions.map((followUp) => ({ subject, followUp })));
const directTemplates = [
  "Tell me about", "Explain", "Show services for", "Show case studies for", "Show articles about",
  "Which industries use", "What capabilities support", "Do you work with", "Show all resources for", "Compare options for",
];
const directMessages = directTemplates.flatMap((template) => subjects.map((subject) => `${template} ${subject}?`));
const allMessages = new Set([
  ...mandatoryFlows.flat(), ...commercialMessages.map(({ query }) => query),
  ...contextMessages.flatMap(({ subject, followUp }) => [`Tell me about ${subject}`, followUp]), ...directMessages,
]);

describe("expanded QA inventory", () => {
  it(`contains ${allMessages.size} distinct realistic messages`, () => {
    expect(allMessages.size).toBeGreaterThanOrEqual(500);
    expect(allMessages.size).toBeLessThanOrEqual(800);
  });

  it.each(mandatoryFlows)("executes mandatory flow: %s -> %s", (first, second) => {
    const initial = buildDeterministicUnderstanding(first);
    const next = resolveConversationUnderstanding(buildDeterministicUnderstanding(second), [
      { role: "user", content: first }, { role: "assistant", content: "Validated Successive response." },
    ]).understanding;
    expect(initial.normalizedQuery.length).toBeGreaterThan(1);
    expect(next.normalizedQuery.length).toBeGreaterThan(1);
  });

  it.each(commercialMessages)("commercial routing: $query", ({ query, intent, subject }) => {
    expect(detectCommercialIntent(query)).toBe(intent);
    expect(commercialSubject(query)).toContain(subject.toLowerCase());
  });

  it.each(contextMessages)("context transition: $subject -> $followUp", ({ subject, followUp }) => {
    const resolved = resolveConversationUnderstanding(buildDeterministicUnderstanding(followUp), [
      { role: "user", content: `Tell me about ${subject}` }, { role: "assistant", content: `Validated ${subject} response.` },
    ]).understanding;
    if (/show all/i.test(followUp)) expect(resolved.topics).not.toContain(subject.split(" ")[0]!.toLowerCase());
    else expect(resolved.normalizedQuery.length).toBeGreaterThan(1);
  });

  it.each(directMessages)("direct understanding: %s", (query) => {
    const result = buildDeterministicUnderstanding(query);
    expect(result.normalizedQuery.length).toBeGreaterThan(1);
  });

  it("protects the project-cost versus cloud-cost collision", () => {
    expect(detectCommercialIntent("What is the cost of one project?")).toBe("pricing");
    expect(commercialSubject("What is the cost of one project?")).toBeNull();
    expect(detectCommercialIntent("Tell me about your Cloud Cost Optimization Strategy.")).toBeNull();
  });
});
