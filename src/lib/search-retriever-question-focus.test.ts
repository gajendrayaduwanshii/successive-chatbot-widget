import { describe, expect, it } from "vitest";
import { buildSearchDocument } from "./search-index";
import { matchEntityFirstQuestionSpan } from "./search-retriever";

describe("entity-first natural question retrieval", () => {
  it("resolves a canonical offering span without treating outcome grammar as entity identity", () => {
    const offering = buildSearchDocument({
      id: 1, type: "page", slug: "delivery-consulting-services",
      link: "https://successive.tech/delivery-consulting-services/",
      title: { rendered: "Delivery Consulting Services for Enterprise Modernization" },
      content: { rendered: "Delivery consulting supports modernization through implementation planning and automation." },
    });
    offering.role = "service";
    const unrelated = buildSearchDocument({
      id: 2, type: "page", slug: "automation-services", link: "https://successive.tech/automation-services/",
      title: { rendered: "Automation Services" }, content: { rendered: "Automation services improve operational efficiency." },
    });
    unrelated.role = "service";
    const result = matchEntityFirstQuestionSpan(
      [offering, unrelated],
      "How does Delivery Consulting help businesses modernize?",
    );
    expect(result?.document.title).toBe("Delivery Consulting Services for Enterprise Modernization");
    expect(result?.matchedFields).toContain("entity-first-question-span");
  });

  it("does not manufacture an entity span for a question with no canonical title evidence", () => {
    const document = buildSearchDocument({
      id: 3, type: "page", slug: "delivery-consulting-services", link: "https://successive.tech/delivery-consulting-services/",
      title: { rendered: "Delivery Consulting Services" }, content: { rendered: "Delivery consulting." },
    });
    document.role = "service";
    expect(matchEntityFirstQuestionSpan([document], "How does unrelated work improve outcomes?")).toBeUndefined();
  });
});
