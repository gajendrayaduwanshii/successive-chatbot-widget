import { describe, expect, it } from "vitest";
import type { WordPressItem } from "@/types/wordpress";
import { buildSearchDocument, type SuccessiveSearchDocument } from "./search-index";
import type { SearchMatch } from "./search-retriever";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { analyzeQuerySafety, requestedAttribute, safeEvidenceResponse, safeUnsupportedQueryResponse, validateEvidence } from "./evidence-validation";

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
});
