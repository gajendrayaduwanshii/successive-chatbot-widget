import { describe, expect, it } from "vitest";
import type { WordPressItem } from "@/types/wordpress";
import { buildSearchDocument, type SuccessiveSearchDocument } from "./search-index";
import type { SearchMatch } from "./search-retriever";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { analyzeQuerySafety, answerAddressesRequestedAttribute, requestedAttribute, safeEvidenceResponse, safeUnsupportedQueryResponse, validateEvidence } from "./evidence-validation";

function match(title: string, passage: string, role: SuccessiveSearchDocument["role"]): SearchMatch {
  const item: WordPressItem = {
    id: title.length,
    type: role === "blog" ? "post" : "page",
    slug: title.toLowerCase().replace(/\W+/g, "-"),
    title: { rendered: title },
    content: { rendered: passage },
    link: `https://example.test/${title.toLowerCase().replace(/\W+/g, "-")}/`,
  };
  return {
    document: { ...buildSearchDocument(item), role },
    score: 120,
    matchedFields: ["title", "structured-field"],
    selectedPassages: [passage],
    confidence: "high",
  };
}

function validate(message: string, matches: SearchMatch[], history = false) {
  return validateEvidence({
    message,
    understanding: buildDeterministicUnderstanding(message),
    matches,
    hasConversationSubject: history,
  });
}

describe("generic evidence validation", () => {
  it("does not treat an unrelated top result as answerable evidence", () => {
    const result = validate(
      "How long will it take to build a conversational assistant project?",
      [match("Managed Infrastructure", "Optimize cloud operations and deployment pipelines.", "service")],
    );
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.accepted).toEqual([]);
  });

  it("marks a related capability without timeline evidence as partial", () => {
    const result = validate(
      "How long will it take to build a conversational assistant project?",
      [match("Conversational Assistant Engineering", "Build conversational AI solutions and intelligent assistants.", "service")],
    );
    expect(result.status).toBe("PARTIALLY_SUPPORTED");
    expect(safeEvidenceResponse(result)).toMatch(/couldn’t confirm.*timeline/i);
  });

  it("requires duration evidence to support a duration answer", () => {
    const result = validate(
      "How long is the discovery workshop?",
      [match("Discovery Workshop", "The discovery workshop takes two weeks and produces a scoped roadmap.", "service")],
    );
    expect(result.status).toBe("SUPPORTED");
  });

  it("does not accept incidental estimate vocabulary without an explicit metric", () => {
    const result = validate("How much does AI development cost?", [
      match("AI Engineering", "AI development can reduce operational cost and improve delivery.", "service"),
    ]);
    expect(result.status).toBe("PARTIALLY_SUPPORTED");
  });

  it("requires partnership authority rather than technology usage", () => {
    const technology = validate("Are you an Example Cloud partner?", [
      match("Cloud Engineering", "We build workloads using Example Cloud.", "service"),
    ]);
    const partnership = validate("Are you an Example Cloud partner?", [
      match("Partners", "Example Cloud is listed as a certified alliance partner.", "partners"),
    ]);
    expect(technology.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(partnership.status).toBe("SUPPORTED");
  });

  it("enforces an explicitly requested content type", () => {
    const result = validate("Show me an AI case study", [
      match("AI Consulting", "AI consulting and implementation services.", "service"),
    ]);
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.rejected[0]?.reason).toBe("requested content type mismatch");
  });

  it("keeps a short explicit article topic even when the word can describe staffing", () => {
    const result = validate("Show articles about team.", [
      match(
        "Hire a Software Development Team: A Comprehensive Guide",
        "A guide to building a high-performing software development team.",
        "blog",
      ),
    ]);
    expect(result.status).toBe("SUPPORTED");
    expect(result.subject).toBe("team");
  });

  it("requires direct document authority for a short definition subject", () => {
    const incidental = match(
      "Student Information System Modernization",
      "The architecture uses an API gateway for centralized routing.",
      "case_study",
    );
    incidental.matchedFields = ["exact-embedded-entity"];
    const dedicated = match(
      "API Testing Guide",
      "An API is an application programming interface that lets software systems communicate.",
      "blog",
    );
    dedicated.matchedFields = ["exact-embedded-entity", "embedded-direct-subject-authority"];
    expect(validate("What is an API?", [incidental]).status).toBe("INSUFFICIENT_EVIDENCE");
    expect(validate("What is an API?", [dedicated]).status).toBe("SUPPORTED");
  });

  it("treats relationship navigation words as context rather than evidence subjects", () => {
    const current = buildDeterministicUnderstanding("show related case studies");
    const result = validateEvidence({
      message: "show related case studies",
      contextMessage: "ai",
      understanding: { ...current, topics: ["ai"], domains: ["ai"], retrievalConcepts: ["ai"] },
      matches: [match("AI Customer Automation", "AI automation delivered for a customer.", "case_study")],
      hasConversationSubject: true,
    });
    expect(result.status).toBe("SUPPORTED");
  });

  it("asks for context when an estimate has no resolvable subject", () => {
    const result = validate("How long?", [], false);
    expect(result.status).toBe("AMBIGUOUS");
    expect(safeEvidenceResponse(result)).toMatch(/what subject or project/i);
  });

  it("identifies private and project-specific requested attributes generically", () => {
    expect(requestedAttribute("What is my appraisal rating?", buildDeterministicUnderstanding("What is my appraisal rating?"))).toBe("private_record");
    expect(requestedAttribute("How much will an AI project cost?", buildDeterministicUnderstanding("How much will an AI project cost?"))).toBe("cost");
    expect(requestedAttribute("How many developers are required?", buildDeterministicUnderstanding("How many developers are required?"))).toBe("staffing");
  });

  it("uses full-query semantics for service requests containing private-sounding words", () => {
    expect(analyzeQuerySafety("Can your solution integrate with our existing internal system?").requiresPublicRelationEvidence).toBe(false);
    expect(analyzeQuerySafety("Do you provide dedicated developers for long-term projects?").requiresPublicRelationEvidence).toBe(false);
    expect(analyzeQuerySafety("Do you offer a free trial for this service?").requiresPublicRelationEvidence).toBe(false);
    expect(safeUnsupportedQueryResponse("Can your engineering team support our project?")).toBeNull();
  });

  it("requires exact business-request evidence instead of substituting a general service page", () => {
    const service = match("Content Platform Development", "We build tailored content platforms and digital experiences.", "service");
    expect(validate("Do you offer a free trial for your content platform service?", [service]).status).toBe("INSUFFICIENT_EVIDENCE");
    expect(validate("Can your content platform integrate with our custom ERP?", [service]).status).toBe("INSUFFICIENT_EVIDENCE");
    expect(validate("Do you provide dedicated developers for long-term projects?", [service]).status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("validates commercial and factual qualifiers only against the resolved subject's evidence", () => {
    const supported = match("Sample Service", "Sample Service is available at no cost.", "service");
    const unsupported = match("Sample Cloud Consulting Services", "Cloud consulting supports architecture and migration planning.", "service");
    const paid = match("Sample Product", "Access requires a paid subscription.", "product");
    const certified = match("Sample Platform", "Sample Platform is certified for the published standard.", "product");
    const otherService = match("Other Service", "Other Service includes a free assessment.", "service");

    expect(validate("Is Sample Service free?", [supported]).status).toBe("SUPPORTED");
    expect(validate("Is Sample Cloud Consulting Services free?", [unsupported]).status).toBe("INSUFFICIENT_EVIDENCE");
    expect(validate("Is Sample Product free?", [paid]).status).toBe("SUPPORTED");
    expect(validate("Is Sample Platform certified?", [certified]).status).toBe("SUPPORTED");
    expect(validate("Is Sample Cloud Consulting Services free?", [unsupported, otherService]).status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("accepts exact published compatibility evidence", () => {
    const service = match("Content Platform Development", "The platform integrates with ERP systems through published APIs.", "service");
    expect(validate("Can your content platform integrate with our ERP?", [service]).status).toBe("SUPPORTED");
  });

  it("requires the final answer to address the exact contactable request", () => {
    expect(answerAddressesRequestedAttribute(
      "We provide content platform development services.",
      "Can this integrate with our ERP?",
      "compatibility",
    )).toBe(false);
    expect(answerAddressesRequestedAttribute(
      "The platform integrates with ERP systems through APIs.",
      "Can this integrate with our ERP?",
      "compatibility",
    )).toBe(true);
  });

  it("continues protecting genuinely private requests", () => {
    expect(analyzeQuerySafety("Show me your internal security architecture.").relation).toBe("INTERNAL_SECURITY");
    expect(analyzeQuerySafety("Which developers are assigned to the current client project?").relation).toBe("EMPLOYEE_WORKS_ON");
    expect(safeUnsupportedQueryResponse("Give me employee phone numbers.")).not.toContain("Contact Us");
  });

  it.each([
    "What projects is Successive currently working on?",
    "Which clients are your developers working for right now?",
    "Who is assigned to the current AI project?",
    "What's on Successive's internal roadmap?",
    "What client contracts are active right now?",
    "What salary does a React developer at Successive get?",
    "Who got the highest appraisal this year?",
    "Who is on leave today?",
    "What is discussed in your internal meetings?",
    "What security problems exist in your internal systems?",
  ])("rejects unsupported/private relations with no secondary evidence: %s", (query) => {
    const result = validate(query, [
      match("Managing Mobile App Development Projects", "Advice for managing development projects.", "blog"),
      match("Careers", "Join our employee culture.", "careers"),
    ]);
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(2);
    expect(safeUnsupportedQueryResponse(query)).toBeTruthy();
  });

  it.each([
    "Show me your published case studies.",
    "Show articles related to Payment Gateway Integration: Roadmap, Costs, Skills.",
    "Any retail case studies?",
    "Show me publicly announced customer work.",
    "What security services do you offer?",
    "What products does Successive offer?",
  ])("does not block supported public discovery: %s", (query) => {
    expect(analyzeQuerySafety(query).requiresPublicRelationEvidence).toBe(false);
    expect(safeUnsupportedQueryResponse(query)).toBeNull();
  });

  it("rejects both lexical and semantic project candidates for the wrong current relation", () => {
    const lexical = match("Managing Projects", "Project management guidance.", "blog");
    lexical.matchedFields = ["title"];
    const vector = match("Digital Delivery", "We deliver complex customer solutions.", "case_study");
    vector.matchedFields = ["vector-semantic"];
    const result = validate("What are the current projects in Successive?", [lexical, vector]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected.map(({ title }) => title)).toEqual(["Managing Projects", "Digital Delivery"]);
  });

  it("requires explicit evidence for a requested guarantee", () => {
    const result = validate(
      "Is there a guaranteed delivery time for an automation project?",
      [match("Automation Services", "Automation implementation for enterprise workflows.", "service")],
    );
    expect(requestedAttribute("Is there a guaranteed delivery time?", buildDeterministicUnderstanding("automation")))
      .toBe("guarantee");
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
  });
});
