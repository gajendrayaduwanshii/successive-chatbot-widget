import { describe, expect, it } from "vitest";
import { buildCollectionMemberActions, buildEvidenceBackedSuggestionActions, buildFollowUpQueryActions, hasSuggestionActionExecutor, resolveEligibleActionDocuments, resolveSuggestionAction } from "./suggestion-actions";
import { buildSearchDocument } from "./search-index";
import type { WordPressItem } from "@/types/wordpress";

describe("global suggestion action registry", () => {
  it("builds an executable next question instead of repeating a displayed evidence card", () => {
    const [action] = buildFollowUpQueryActions(["Show me a related case study"]);
    expect(action).toMatchObject({ label: "Show me a related case study", intent: "FOLLOW_UP_QUERY",
      query: "Show me a related case study" });
    expect(action?.resultKeys).toBeUndefined();
    expect(resolveSuggestionAction(action)).toBe("Show me a related case study");
  });

  it("carries the evidence topic when a short follow-up is executed", () => {
    const [action] = buildFollowUpQueryActions(
      ["Explore Successive industries"],
      3,
      "React.js Development Company",
    );
    expect(resolveSuggestionAction(action)).toBe(
      "Explore Successive industries related to React.js Development Company",
    );
  });

  it("canonicalizes a supporting-service follow-up instead of producing a malformed topic sentence", () => {
    const [action] = buildFollowUpQueryActions(
      ["Which Successive services support this capability?"],
      3,
      "React.js Development Company",
    );
    expect(resolveSuggestionAction(action)).toBe(
      "React.js Development Company Successive services",
    );
  });

  it.each([
    ["CUSTOMER_WORK_DISCOVERY", "Customer case studies"],
    ["PUBLIC_ORGANIZATION_OVERVIEW", "clients"],
    ["CONTENT_DISCOVERY", "Published Successive content"],
  ] as const)("has an executor for %s", (intent, expected) => {
    expect(hasSuggestionActionExecutor(intent)).toBe(true);
    expect(resolveSuggestionAction({ id: "fixture", label: "Completely unrelated display wording", intent }))
      .toBe(expected);
  });

  it("uses structured qualifiers without interpreting the display label", () => {
    expect(resolveSuggestionAction({
      id: "case-studies",
      label: "Anything visible to the visitor",
      intent: "CONTENT_DISCOVERY",
      contentType: "case-study",
    })).toBe("Case studies");
  });

  it("uses the same exact result identity for collection pre-flight and execution", () => {
    const item = (id: number, type: string, title: string): WordPressItem => ({ id, type, slug: title.toLowerCase().replace(/\s+/g, "-"),
      link: `https://example.test/${id}/`, title: { rendered: title }, content: { rendered: `${title} published detail.` } });
    const source = buildSearchDocument(item(1, "page", "Published Collection"));
    const member = buildSearchDocument(item(2, "case_study", "Verified Customer Outcome"));
    const [action] = buildCollectionMemberActions(source, [member]);
    expect(action?.resultKeys).toEqual([`${member.type}:${member.id}`]);
    expect(resolveEligibleActionDocuments(action!, [source, member])).toEqual([member]);
    expect(resolveEligibleActionDocuments(action!, [source])).toEqual([]);
  });

  it("suppresses a merely available but unrelated global document", () => {
    const source = buildSearchDocument({ id: 10, type: "page", slug: "source", link: "https://example.test/source/",
      title: { rendered: "Source Capability" }, content: { rendered: "Distinct source evidence." } });
    const unrelated = buildSearchDocument({ id: 11, type: "case_study", slug: "other", link: "https://example.test/other/",
      title: { rendered: "Unrelated Outcome" }, content: { rendered: "Completely separate evidence." } });
    expect(buildEvidenceBackedSuggestionActions({ source, acceptedRelated: [unrelated] })).toEqual([]);
  });
});
