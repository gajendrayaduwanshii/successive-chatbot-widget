import { describe, expect, it } from "vitest";
import { continuesOffTopicContext, resolveOfferedResourceFollowUp, resolveStructuredFollowUpMessage } from "./conversation-context";
import { buildDeterministicUnderstanding, applyStructuralBroadQueryRules, classifyFollowUpScope, resolveConversationUnderstanding } from "./query-understanding";
import { classifyUnsupportedCompanyInformation, requestedCompanyFactLabel, understandStructuredRequest } from "./structured-knowledge";
import { requestedAttribute } from "./evidence-validation";

const resolve = (first: string, followUp: string) => resolveConversationUnderstanding(
  buildDeterministicUnderstanding(followUp), [{ role: "user" as const, content: first }],
).understanding;

describe("generic follow-up root-cause regression", () => {
  it("treats a referenced integration requirement as a refinement of the active subject", () => {
    const current = buildDeterministicUnderstanding("Can this integrate with our custom ERP?");
    const resolved = resolveConversationUnderstanding(current, [
      { role: "user", content: "Tell me about content platform development." },
      { role: "assistant", content: "The published service supports tailored content experiences." },
    ]).understanding;
    expect(classifyFollowUpScope(current, current.normalizedQuery)).toBe("REFINE_SCOPE");
    expect(resolved.topics.join(" ")).toContain("content");
    expect(resolved.topics.join(" ")).toContain("erp");
  });

  it("clears stale context for a complete independent engagement request", () => {
    const current = buildDeterministicUnderstanding("Do you provide dedicated developers for long-term projects?");
    const resolved = resolveConversationUnderstanding(current, [
      { role: "user", content: "Can your emerging technology solution work with our internal knowledge base?" },
      { role: "assistant", content: "The published content does not confirm that integration." },
    ]).understanding;
    expect(classifyFollowUpScope(current, current.normalizedQuery)).toBe("SWITCH_TOPIC");
    expect(resolved.topics.join(" ")).not.toContain("knowledge base");
    expect(resolved.topics.join(" ")).not.toContain("emerging technology");
  });

  it("preserves a multi-token explicit subject for generic content discovery", () => {
    const current = buildDeterministicUnderstanding("Tell me about distributed data engineering services.");
    expect(current.requestedContentType).toBe("service");
    expect(current.topics).toEqual(expect.arrayContaining(["distributed", "data", "engineering"]));
  });

  it.each([
    ["Tell me about an emerging automation capability", "Which industries have you implemented this in?", "industry", ["emerging", "automation"]],
    ["Tell me about distributed data engineering", "Any case studies for it?", "case-study", ["distributed", "data", "engineering"]],
    ["Tell me about the Nimbus partnership", "What does it cover?", "partner", ["nimbus"]],
  ] as const)("retains unseen subjects without adding follow-up grammar: %s -> %s", (first, followUp, role, subjects) => {
    const resolved = resolve(first, followUp);
    expect(resolved.requestedContentType).toBe(role);
    expect(resolved.topics).toEqual(expect.arrayContaining([...subjects]));
    expect(resolved.topics.join(" ")).not.toMatch(/implemented this|any studies|does it cover/);
  });

  it("recognizes broad plural collections with singular company grammar", () => {
    expect(applyStructuralBroadQueryRules(
      buildDeterministicUnderstanding("Which industries does Acme serve?"),
      "Which industries does Successive serve?",
    )).toMatchObject({ requestedContentType: "industry", targetScope: "portfolio", topics: [] });
    expect(applyStructuralBroadQueryRules(
      buildDeterministicUnderstanding("What services does Successive offer?"),
      "What services does Successive offer?",
    )).toMatchObject({ requestedContentType: "service", targetScope: "portfolio", topics: [] });
  });
  it.each([
    ["Who won the football match?", "What was the result?"],
    ["Will it rain today?", "What about tomorrow?"],
    ["Tell me about this movie", "Who stars in it?"],
    ["What happened in the election?", "Tell me more"],
  ])("keeps dependent off-topic context: %s -> %s", (first, followUp) => {
    expect(continuesOffTopicContext(followUp, [{ role: "user", content: first }])).toBe(true);
  });

  it.each([
    ["What is Flutter?", "Is it better than native development?", ["flutter", "native"]],
    ["Tell me about React", "How does this compare with Vue?", ["react", "vue"]],
    ["Explain AWS", "AWS vs Azure", ["aws", "azure"]],
    ["Tell me about headless CMS", "Should I use this or a traditional CMS?", ["headless", "traditional"]],
    ["Explain API testing", "What is the difference between this and unit testing?", ["api", "unit"]],
  ])("retains both comparison sides: %s -> %s", (first, followUp, expected) => {
    expect(resolve(first, followUp).topics).toEqual(expect.arrayContaining(expected));
  });

  it.each([
    ["Tell me about cloud computing", "I mean cloud security actually", "security", "computing"],
    ["Tell me about healthcare", "No, I meant retail", "retail", "healthcare"],
    ["Show AWS services", "Actually I mean Azure", "azure", "aws"],
  ])("replaces corrected subjects: %s -> %s", (first, followUp, included, excluded) => {
    const result = resolve(first, followUp);
    expect(result.topics).toContain(included);
    expect(result.topics).not.toContain(excluded);
  });

  it("treats additive 'too' wording as a relationship rather than a replacement", () => {
    expect(resolve("Do you do data science?", "Do you mean data engineering too?").topics)
      .toEqual(expect.arrayContaining(["data", "science", "engineering"]));
  });

  it.each([
    ["What are your office hours?", "operational_hours"], ["Are you open on Sunday?", "operational_hours"],
    ["What is your market cap?", "financial_metrics"], ["What's its revenue?", "financial_metrics"],
    ["Which is your largest industry?", "industry_superlative"], ["What is your primary sector?", "industry_superlative"],
  ] as const)("safely classifies unsupported company information: %s", (query, expected) => {
    expect(classifyUnsupportedCompanyInformation(query)).toBe(expected);
  });

  it.each([
    ["Successive Digital's annual revenue", "annual revenue"],
    ["Successive Digital’s employee count", "employee count"],
    ["annual turnover of Successive Digital", "annual turnover"],
    ["Successive Digital headquarters location", "headquarters location"],
    ["What is Successive Digital's annual revenue?", "annual revenue"],
    ["What is Successive Digital’s annual revenue?", "annual revenue"],
    ["annual revenue", "annual revenue"],
    ["security certifications", "security certifications"],
    ["service availability", "service availability"],
    ["support model", "support model"],
  ])("formats a company-fact label without possessive residue: %s", (query, expected) => {
    const label = requestedCompanyFactLabel(query);
    expect(label).toBe(expected);
    expect(label).not.toMatch(/^(?:s|['’]s|['’]+)(?:\s|$)/i);
  });

  it("keeps a company-overview request on the informational structured route", () => {
    expect(classifyUnsupportedCompanyInformation("Tell me about Successive Digital")).toBeNull();
    expect(understandStructuredRequest("Tell me about Successive Digital")?.attribute).toBe("company_overview");
  });

  it.each(["What industries do you serve?", "Which sectors do you work in?", "Show all industries"])(
    "routes complete industry portfolios: %s", (query) => {
      expect(applyStructuralBroadQueryRules(buildDeterministicUnderstanding(query), query))
        .toMatchObject({ requestedContentType: "industry", targetScope: "portfolio", topics: [] });
    });

  it("grounds company-type clarification through the company overview structure", () => {
    expect(understandStructuredRequest("Is Successive a product company?")?.attribute).toBe("company_overview");
    expect(understandStructuredRequest("Or a services company?")?.attribute).toBe("company_overview");
  });

  it("does not classify company revenue as project cost", () => {
    const understanding = buildDeterministicUnderstanding("What's its revenue?");
    expect(requestedAttribute("What's its revenue?", understanding)).toBe("fact");
  });

  it("classifies natural comparative wording before evidence validation", () => {
    const understanding = resolve("What is Flutter?", "Is it better than native development?");
    expect(requestedAttribute("Is it better than native development?", understanding)).toBe("comparison");
  });

  it.each([
    ["first one", "First"], ["second one", "Second"], ["third one", "Third"],
    ["last one", "Third"], ["next one", "Second"], ["other one", "Second"],
  ])("resolves ordered result reference: %s", (query, expected) => {
    const answer = "[First](https://successive.tech/1/) [Second](https://successive.tech/2/) [Third](https://successive.tech/3/)";
    expect(resolveOfferedResourceFollowUp(query, [{ role: "assistant", content: answer }])).toContain(expected);
  });

  it("grounds dependent language in the latest assistant-presented resource", () => {
    const history = [
      { role: "assistant" as const, content: "[Canonical Architecture Guide](https://successive.tech/blog/architecture/) provides additional context." },
      { role: "user" as const, content: "Thanks" },
      { role: "assistant" as const, content: "You're welcome." },
    ];
    expect(resolveStructuredFollowUpMessage("Where is it used?", history))
      .toContain("Canonical Architecture Guide");
    expect(resolveStructuredFollowUpMessage("Any case studies for this?", history))
      .toBe("Show case studies related to Canonical Architecture Guide");
    expect(resolveStructuredFollowUpMessage("Any examples for this?", history))
      .toBe("Tell me about Canonical Architecture Guide");
  });

  it("resolves ordinals only from the latest grounded assistant result set", () => {
    const history = [{ role: "assistant" as const, content:
      "[First Result](https://successive.tech/first/) [Second Result](https://successive.tech/second/)" }];
    expect(resolveStructuredFollowUpMessage("Tell me more about the second one.", history))
      .toContain("Second Result");
  });

  it.each([
    ["What about distributed data engineering?", ["distributed", "data", "engineering"]],
    ["Tell me about cloud security.", ["cloud", "security"]],
  ] as const)("lets an explicit informational subject replace commercial Contact Us state: %s", (message, topics) => {
    const history = [
      { role: "user" as const, content: "How much does a project cost?" },
      { role: "assistant" as const, content: "Pricing depends on scope. [Contact Us](https://successive.tech/contact/)" },
    ];
    expect(resolveStructuredFollowUpMessage(message, history)).toBeUndefined();
    const resolved = resolveConversationUnderstanding(buildDeterministicUnderstanding(message), history).understanding;
    expect(resolved.topics).toEqual(expect.arrayContaining([...topics]));
    expect(resolved.topics).not.toContain("project");
  });

  it("does not make a broad collection member the subject of independent project pricing", () => {
    const current = buildDeterministicUnderstanding("How much does a project generally cost?");
    const resolved = resolveConversationUnderstanding(current, [
      { role: "user", content: "What services does Successive offer?" },
      { role: "assistant", content: "Six published services were presented." },
    ]).understanding;
    expect(classifyFollowUpScope(current, current.normalizedQuery)).toBe("SWITCH_TOPIC");
    expect(resolved.topics).not.toContain("services");
  });
});
