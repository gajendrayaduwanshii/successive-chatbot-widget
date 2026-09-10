import { describe, expect, it } from "vitest";
import { commercialAnswer, commercialSubject, commercialSubjectFromAnswer, detectCommercialIntent, detectCommercialIntents, hasExplicitGenericProjectSubject, isCommerciallyPriceableContext, isDependentCommercialSubjectQuery } from "./commercial-intent";
import { buildDeterministicUnderstanding, buildRetrievalQuery, resolveConversationUnderstanding } from "./query-understanding";

const openings = [
  "What is the", "Could you share the", "I need a", "Please provide a", "Can I get a",
  "We would like a", "Help me understand the", "I'd like to request a", "Can your team discuss the", "Tell me the",
];
const commercialTerms = [
  "cost", "pricing", "price estimate", "project quote", "quotation", "commercial proposal",
  "implementation budget", "service charges", "consultation", "development cost", "project estimate", "sales discussion",
];
const variations = openings.flatMap((opening) => commercialTerms.map((term) => `${opening} ${term} for cloud migration?`));

describe("generic commercial intent", () => {
  it("keeps a numeric branded subject in a direct quote request", () => {
    expect(detectCommercialIntent("Can I get a quote for 24×7 managed IT Company?"))
      .toBe("quote");
    expect(commercialSubject("Can I get a quote for 24×7 managed IT Company?"))
      .toBe("24 7 managed it company");
  });

  it("recognizes at least 100 compositional sales and marketing variations", () => {
    expect(variations).toHaveLength(120);
    expect(variations.filter((query) => detectCommercialIntent(query))).toHaveLength(120);
  });

  it.each([
    "How much will this service cost?", "CMS development cost?", "I need a quotation",
    "Can someone contact me?", "Can we discuss our requirements?", "I want to start a project",
    "Could your team help us implement this?", "I'd like to talk to an expert",
    "Can I get a timeline for cloud migration?", "Do you provide a dedicated team for this?",
    "Can I discuss a custom requirement for CatalogIQ?", "Can I get an integration requirement for our platform?",
  ])("recognizes unseen commercial wording: %s", (query) => {
    expect(detectCommercialIntent(query)).not.toBeNull();
  });

  it.each([
    ["I would like a quote for DevSecOps", "quote", "devsecops"],
    ["Could you help me with a quotation for Kagen?", "quote", "kagen"],
    ["I would like help implementing cloud migration", "implementation", "cloud migration"],
    ["I would like pricing for AI development", "pricing", "ai development"],
    ["Could you help me with pricing for mobile development", "pricing", "mobile development"],
    ["I would like a consultation about website development", "consultation", "website development"],
    ["Can I get a timeline for cloud migration", "estimate", "cloud migration"],
    ["Can I get a dedicated team for mobile development", "project_discussion", "mobile development"],
    ["Can I get a custom requirement for CatalogIQ", "project_discussion", "catalogiq"],
    ["Can I get an integration requirement for Drupal development", "implementation", "drupal development"],
  ] as const)("resolves confirmed commercial grammar: %s", (query, intent, subject) => {
    expect(detectCommercialIntent(query)).toBe(intent);
    expect(commercialSubject(query)).toBe(subject);
  });

  it("keeps informational implementation wording out of commercial routing", () => {
    expect(detectCommercialIntent("How is DevSecOps implemented?")).toBeNull();
    expect(detectCommercialIntent("How do teams implement DevSecOps?")).toBeNull();
  });

  it("keeps commercial words inside an explicitly requested editorial title out of sales routing", () => {
    expect(detectCommercialIntent("Show articles related to Payment Gateway Integration: Roadmap, Costs, Skills."))
      .toBeNull();
    expect(detectCommercialIntent("Show me the Cloud Pricing Strategies for Enterprise Applications article."))
      .toBeNull();
    expect(detectCommercialIntent("How much does Payment Gateway Integration cost?")).toBe("pricing");
    expect(detectCommercialIntent("Give me a quote for Payment Gateway Integration.")).toBe("quote");
    expect(detectCommercialIntents("Show me the Payment Gateway Integration article and tell me how much implementation costs."))
      .toEqual(["pricing"]);
  });

  it.each([
    "What is cloud computing?", "What services do you provide?", "Tell me about CMS.",
    "Show case studies.", "Who is your CEO?", "Where is your Pune office?",
    "Show current openings.", "Tell me about your culture.", "How can we reduce cloud cost?",
  ])("does not create a false commercial intent: %s", (query) => {
    expect(detectCommercialIntent(query)).toBeNull();
  });

  it("retains a prior subject for a commercial pronoun follow-up", () => {
    expect(commercialSubject("How much would it cost?", "cms")).toBe("cms");
    expect(commercialSubject("Cloud migration pricing?", "cms")).toBe("cloud migration");
  });

  it.each([
    ["Can you provide a proposal for cloud services?", null, "cloud services"],
    ["We are planning a cloud migration. Can we discuss our requirements?", null, "cloud migration"],
    ["Can you give me an estimate?", "cms development", "cms development"],
    ["Can I get a quote?", "cms development", "cms development"],
    ["Can someone contact me?", "cms development", "cms development"],
    ["Actually, can I get an estimate for cloud migration?", "cms development", "cloud migration"],
    ["What is your pricing?", null, null],
  ])("extracts only a valid commercial subject: %s", (query, inherited, expected) => {
    expect(commercialSubject(query, inherited)).toBe(expected);
  });

  it("never presents an invented numeric price and uses the official contact target", () => {
    const answer = commercialAnswer("generative ai", "https://successive.tech/contact/", "pricing");
    expect(answer).toContain("requirements, scope, integrations, customization, complexity");
    expect(answer).toContain("[Contact Us](https://successive.tech/contact/)");
    expect(answer).not.toMatch(/[$£€]\s*\d|\b\d+(?:\.\d+)?\s*(?:usd|inr|dollars?|hours?|weeks?)\b/i);
  });

  it("uses a no-subject response for generic pricing", () => {
    const answer = commercialAnswer(null, "https://successive.tech/contact/", "pricing");
    expect(answer).toMatch(/^Pricing depends on the service, project scope/);
    expect(answer).not.toContain("Pricing for");
  });

  it.each([
    ["What is the cost of your AI development services?", "pricing", "ai development services"],
    ["I want to discuss my project requirements with your sales team.", "project_discussion", null],
    ["How can we engage Successive for our software development project?", "buying", "software development"],
    ["Can you provide a proposal for cloud services?", "proposal", "cloud services"],
    ["I need a consultation for an AI solution.", "consultation", "ai"],
    ["Can your team implement DevSecOps for us?", "implementation", "devsecops"],
    ["I need a quotation for website development.", "quote", "website development"],
    ["Can you give me an estimate for CMS development?", "estimate", "cms development"],
    ["What is your pricing?", "pricing", null],
  ] as const)("passes the final commercial case: %s", (query, intent, subject) => {
    expect(detectCommercialIntent(query)).toBe(intent);
    expect(commercialSubject(query)).toBe(subject);
    const answer = commercialAnswer(subject, "https://successive.tech/contact/", intent);
    expect(answer).toContain("[Contact Us](https://successive.tech/contact/)");
  });

  it("preserves two explicit commercial requests", () => {
    expect(detectCommercialIntents("Can I get a quote and discuss implementation?")).toEqual(["quote", "implementation"]);
    const answer = commercialAnswer("cloud migration", "https://successive.tech/contact/", ["quote", "implementation"]);
    expect(answer).toMatch(/quotation/i);
    expect(answer).toMatch(/implementation/i);
  });

  it("recovers the active topic from the prior commercial answer after older turns age out", () => {
    const implementation = commercialAnswer("cms development", "https://successive.tech/contact/", "implementation");
    const inherited = commercialSubjectFromAnswer(implementation);
    expect(inherited).toBe("cms development");
    expect(commercialSubject("Can someone contact me?", inherited)).toBe("cms development");
  });

  it.each([
    ["Do you offer a demo?", "emerging automation", "emerging automation"],
    ["What would implementation cost?", "content platform", "content platform"],
    ["I need a proposal for this", "data engineering", "data engineering"],
  ])("keeps commercial actions separate from an unseen business subject: %s", (query, inherited, expected) => {
    expect(commercialSubject(query, inherited)).toBe(expected);
  });

  it.each([
    "What is the cost of one project?",
    "How much does a project cost?",
    "What is the price of a project?",
  ])("routes generic project pricing without manufacturing a subject: %s", (query) => {
    expect(detectCommercialIntent(query)).toBe("pricing");
    expect(commercialSubject(query)).toBeNull();
  });

  it.each([
    "How much does a project generally cost?",
    "What is the typical project pricing?",
    "Can I get an estimated project budget?",
  ])("does not promote residual pricing grammar into a subject: %s", (query) => {
    expect(commercialSubject(query)).toBeNull();
  });

  it("keeps a generic project quote independent of an unrelated inherited subject", () => {
    const query = "Can I get a quote for a project?";
    expect(isDependentCommercialSubjectQuery(query)).toBe(false);
    expect(commercialSubject(query)).toBeNull();
  });

  it.each(["How much does a project cost?", "What is the price of a project?"])(
    "does not make independent project pricing dependent: %s", (query) => {
      expect(isDependentCommercialSubjectQuery(query)).toBe(false);
    });

  it.each([
    "How much does a project usually cost?",
    "cost of project",
    "project cost",
  ])("preserves an explicitly generic project scope: %s", (query) => {
    expect(hasExplicitGenericProjectSubject(query)).toBe(true);
    expect(commercialSubject(query)).toBeNull();
  });

  it.each([
    "How much would that service cost?",
    "How much does cloud migration implementation cost?",
  ])("does not misclassify a dependent or specific commercial subject as generic: %s", (query) => {
    expect(hasExplicitGenericProjectSubject(query)).toBe(false);
  });

  it("inherits only an explicitly referenced, priceable grounded context", () => {
    expect(isDependentCommercialSubjectQuery("How much does it cost?")).toBe(true);
    expect(isCommerciallyPriceableContext("cloud migration", "service")).toBe(true);
    expect(isCommerciallyPriceableContext("executive profile", "leadership")).toBe(false);
    expect(isCommerciallyPriceableContext("industry award", "award")).toBe(false);
  });

  it("keeps a priceable service for a genuinely dependent commercial follow-up", () => {
    expect(isDependentCommercialSubjectQuery("What would that service cost?")).toBe(true);
    expect(isCommerciallyPriceableContext("platform engineering", "service")).toBe(true);
    expect(commercialSubject("What would that service cost?", "platform engineering"))
      .toBe("platform engineering");
  });

  it("keeps a dependent commercial action attached to the validated prior offering", () => {
    expect(isDependentCommercialSubjectQuery("Can I get a quote for that service?")).toBe(true);
    expect(commercialSubject("Can I get a quote for that service?", "data engineering"))
      .toBe("data engineering");
  });

  it.each([
    "Tell me about your Cloud Cost Optimization Strategy.",
    "Explain cloud cost management.",
    "What is FinOps cost control?",
    "I don't need pricing, just explain the service.",
  ])("does not confuse informational or negated cost language with sales: %s", (query) => {
    expect(detectCommercialIntent(query)).toBeNull();
  });

  it("keeps explicit pricing after a correction and preserves a technology subject", () => {
    expect(detectCommercialIntent("I'm not asking about cloud cost optimization; I want project pricing.")).toBe("pricing");
    expect(commercialSubject("How much does it cost to develop a Flutter application?", "flutter")).toBe("flutter application");
  });
  it.each([
    "Who can I contact for a project?",
    "Who should I speak with about implementation?",
    "Who can I contact about this service?",
    "How do I get in touch for a proposal?",
    "Who should I talk to about integration requirements?",
  ])("classifies a business-object contact request without requiring a named employee: %s", (query) => {
    expect(detectCommercialIntent(query)).toBe("project_discussion");
  });

  it.each([
    "Who is the CEO?",
    "Who is the CTO?",
    "Who heads the engineering team?",
    "Tell me about Jordan Reed.",
  ])("does not turn a genuine person or role request into commercial contact: %s", (query) => {
    expect(detectCommercialIntent(query)).toBeNull();
  });
});

describe("generic follow-up context", () => {
  it.each([
    ["Tell me about DevSecOps", "Any related articles?", "blog", ["devsecops"]],
    ["Tell me about healthcare", "What services are related to this?", "service", ["healthcare"]],
    ["Tell me about Kagen", "Any case studies for it?", "case-study", ["kagen"]],
    ["Tell me about the AWS partnership", "Which services are related to it?", "service", ["aws"]],
    ["Tell me about API engineering", "Which industries use this?", "industry", ["api", "engineering"]],
  ] as const)("switches content type while retaining a generic subject: %s -> %s",
    (first, followUp, contentType, topics) => {
      const resolved = resolveConversationUnderstanding(buildDeterministicUnderstanding(followUp), [
        { role: "user", content: first }, { role: "assistant", content: "Validated answer." },
      ]).understanding;
      expect(resolved.requestedContentType).toBe(contentType);
      expect(resolved.topics).toEqual(expect.arrayContaining([...topics]));
    });

  it.each(["services", "case studies", "articles", "resources", "products", "partners", "openings", "locations"])(
    "treats all as a broadening operator for %s", (collection) => {
      const resolved = resolveConversationUnderstanding(
        buildDeterministicUnderstanding(`Show all ${collection}`),
        [{ role: "user", content: "Show AI services" }],
      ).understanding;
      expect(resolved.topics).not.toContain("all");
      expect(resolved.retrievalConcepts).not.toContain("all");
      expect(resolved.domains).not.toContain("all");
    });

  it.each([
    ["What AI services does Successive offer?", "ai"],
    ["What cloud services does Successive provide?", "cloud"],
    ["What security capabilities do you have?", "security"],
  ])("separates request language from the subject: %s", (query, subject) => {
    const understanding = buildDeterministicUnderstanding(query);
    expect(understanding.topics).toEqual([subject]);
    expect(understanding.requestedContentType).toBe("service");
  });

  it("keeps the last explicit subject across dependent content-type turns", () => {
    const history = [
      { role: "user" as const, content: "Tell me more about Generative AI." },
      { role: "assistant" as const, content: "Validated Generative AI content." },
      { role: "user" as const, content: "Do you have any case studies for it?" },
      { role: "assistant" as const, content: "No strongly matching published case study was found." },
    ];
    const caseStudy = resolveConversationUnderstanding(
      buildDeterministicUnderstanding(history[2]!.content), history.slice(0, 2),
    ).understanding;
    expect(caseStudy.topics).toEqual(["generative", "ai"]);
    expect(caseStudy.requestedContentType).toBe("case-study");

    const industries = resolveConversationUnderstanding(
      buildDeterministicUnderstanding("Which industries have you implemented this in?"), history,
    ).understanding;
    expect(industries.topics).toEqual(["generative", "ai"]);
    expect(industries.requestedContentType).toBe("industry");
    expect(industries.intent).toBe("evidence");
  });

  it.each([
    ["Show AI services", "Which of these are related to retail?", "service"],
    ["Show healthcare case studies", "Only retail ones", "case-study"],
    ["Tell me about Kagen", "What can it do?", "kagen-product"],
    ["Who is the CEO?", "Tell me more about him", null],
  ] as const)("retains relevant subject/type from %s -> %s", (first, followUp, expectedType) => {
    const resolved = resolveConversationUnderstanding(buildDeterministicUnderstanding(followUp), [
      { role: "user", content: first }, { role: "assistant", content: "Validated Successive answer." },
    ]).understanding;
    expect(resolved.topics.length + resolved.entities.length).toBeGreaterThan(0);
    expect(resolved.requestedContentType).toBe(expectedType);
  });

  it("clears a stale topic when a broad collection is explicitly requested", () => {
    const resolved = resolveConversationUnderstanding(buildDeterministicUnderstanding("Show all case studies"), [
      { role: "user", content: "Show AI services" }, { role: "assistant", content: "AI services." },
    ]).understanding;
    expect(resolved.requestedContentType).toBe("case-study");
    expect(resolved.topics).not.toContain("ai");
    expect(resolved.topics).not.toContain("all");
    expect(buildRetrievalQuery(resolved)).toBe("");
  });

  it("switches to an explicit new subject instead of leaking old context", () => {
    const resolved = resolveConversationUnderstanding(buildDeterministicUnderstanding("Tell me about cloud migration"), [
      { role: "user", content: "Tell me about CMS development" }, { role: "assistant", content: "CMS." },
    ]).understanding;
    expect(resolved.topics).toContain("cloud");
    expect(resolved.topics).not.toContain("cms");
  });
});
