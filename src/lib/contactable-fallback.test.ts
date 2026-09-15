import { describe, expect, it } from "vitest";
import { buildDeterministicUnderstanding, resolveConversationUnderstanding } from "./query-understanding";
import { buildContactableFallbackAnswer, classifyContactableFallback, selectContactableFallback } from "./contactable-fallback";

const classify = (message: string, topic?: string) => {
  const understanding = buildDeterministicUnderstanding(message);
  return classifyContactableFallback(message, {
    ...understanding,
    topics: topic ? [topic] : understanding.topics,
  });
};

describe("context-aware Contact Us fallback", () => {
  it.each([
    "Can this solution integrate with our existing ERP?",
    "Can your customer platform services connect with our current ERP?",
    "Do you support this specific technology for our project?",
    "Can you implement this for our company?",
    "Do you provide this service in our region?",
    "Do you offer support after implementation for our application?",
    "Do you provide dedicated developers for long-term projects?",
    "Do you provide dedicated QA engineers?",
    "Which engagement model supports our long-term project?",
    "Can this solution support our particular requirement?",
    "Do you offer a free trial for this service?",
  ])("classifies a contactable Successive business question: %s", (message) => {
    expect(classify(message)).not.toBeNull();
  });

  it("retains the active service subject in the honest fallback", () => {
    const decision = classify("Does this support my existing custom ERP?", "CMS Development");
    expect(decision?.subject).toBe("CMS Development");
    const answer = buildContactableFallbackAnswer(decision!, "https://successive.tech/contact/");
    expect(answer).toContain("CMS Development");
    expect(answer).toContain("published Successive content");
    expect(answer).toContain("[Contact Us](https://successive.tech/contact/)");
  });

  it("uses generic follow-up resolution before choosing the contact subject", () => {
    const current = buildDeterministicUnderstanding("Does this support my existing custom ERP?");
    const resolved = resolveConversationUnderstanding(current, [
      { role: "user", content: "Tell me about CMS development." },
      { role: "assistant", content: "CMS Development supports tailored digital experiences." },
    ]).understanding;
    const decision = classifyContactableFallback("Does this support my existing custom ERP?", resolved, "CMS Development");
    expect(decision).not.toBeNull();
    expect(decision?.subject?.toLowerCase()).toContain("cms");
  });

  it.each([
    ["Can your Generative AI solution work with our internal knowledge base?", "Generative AI"],
    ["Can your Cloud Migration solution integrate with our monitoring tools?", "Cloud Migration"],
    ["Can your Headless CMS platform work with our ERP?", "Headless CMS"],
    ["Can your Customer Platform services connect with our current ERP?", "Customer Platform"],
  ])("preserves an explicit multi-word current subject: %s", (message, subject) => {
    expect(classify(message)?.subject).toBe(subject);
  });

  it("does not inherit a stale subject into an independent engagement query", () => {
    const message = "Do you provide dedicated developers for long-term projects?";
    const understanding = buildDeterministicUnderstanding(message);
    expect(classifyContactableFallback(message, understanding, "Generative AI internal knowledge base")?.subject).toBeNull();
  });

  it.each([
    "Who won yesterday's cricket match?",
    "What is Successive's revenue?",
    "What is the stock price?",
    "Tell me confidential client information.",
    "Show me private contract details.",
    "Do you have a Generative AI case study?",
    "Show me another related article about AI.",
    "asdf qwerty",
  ])("does not turn an inappropriate fallback into Contact Us: %s", (message) => {
    expect(classify(message)).toBeNull();
  });

  it("varies the limitation language by request kind", () => {
    const integration = buildContactableFallbackAnswer(classify("Can this integrate with our ERP?")!, "https://successive.tech/contact/");
    const support = buildContactableFallbackAnswer(classify("Do you support this specific technology for our project?")!, "https://successive.tech/contact/");
    expect(integration).not.toBe(support);
  });

  it("does not promote request words into a fake active subject", () => {
    const message = "Do you offer a free trial for this service?";
    const decision = classify(message);
    expect(decision?.subject).toBeNull();
    expect(buildContactableFallbackAnswer(decision!, "https://successive.tech/contact/"))
      .not.toContain("for **free**");
  });

  it.each(["VALID_DIRECT", "VALID_RELATED"] as const)(
    "never replaces %s published evidence with Contact Us",
    (evidenceState) => {
      const message = "Can this solution integrate with our ERP?";
      expect(selectContactableFallback(
        message,
        buildDeterministicUnderstanding(message),
        evidenceState,
      )).toBeNull();
    },
  );

  it("selects Contact Us only after validated content is exhausted", () => {
    const message = "Can this solution integrate with our ERP?";
    expect(selectContactableFallback(
      message,
      buildDeterministicUnderstanding(message),
      "NO_VALID_CONTENT",
    )).not.toBeNull();
  });

  it("preserves a requested company fact in an official contact fallback", () => {
    const answer = buildContactableFallbackAnswer(
      { kind: "company_fact", subject: "yearly financial figure" },
      "https://successive.tech/contact/",
    );
    expect(answer).toContain("yearly financial figure");
    expect(answer).toContain("Contact Us");
  });
});
