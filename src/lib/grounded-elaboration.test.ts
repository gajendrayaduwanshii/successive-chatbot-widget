import { describe, expect, it } from "vitest";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { buildSearchDocument } from "./search-index";
import { isSafeGroundedElaboration, planGroundedElaboration } from "./grounded-elaboration";
import type { SearchMatch } from "./search-retriever";

function serviceMatch(): SearchMatch {
  const document = buildSearchDocument({
    id: 1, type: "page", slug: "platform-engineering", link: "https://successive.tech/platform-engineering/",
    title: { rendered: "Platform Engineering Services" },
    content: { rendered: "<p>Platform engineering helps enterprises establish reliable digital delivery foundations.</p><p>Successive supports platform design, automation, governance, and developer enablement for teams modernizing delivery workflows.</p>" },
  });
  document.role = "service";
  return { document, score: 500, confidence: "high", matchedFields: ["near-exact-title"], selectedPassages: [document.textSegments[0]!] };
}

function singleAspectServiceMatch(): SearchMatch {
  const document = buildSearchDocument({
    id: 2, type: "page", slug: "strategy", link: "https://successive.tech/strategy/",
    title: { rendered: "Strategy Services" },
    content: { rendered: "<p>Strategy services help enterprises define a clear direction, align initiatives with business priorities, and focus investment on measurable value.</p>" },
  });
  document.role = "service";
  return { document, score: 500, confidence: "high", matchedFields: ["near-exact-title"], selectedPassages: [document.textSegments[0]!] };
}

function substantialMatch(args: { title: string; role: SearchMatch["document"]["role"]; content: string }): SearchMatch {
  const document = buildSearchDocument({
    id: 20, type: "page", slug: "substantial-offering", link: "https://successive.tech/substantial-offering/",
    title: { rendered: args.title }, content: { rendered: `<p>${args.content}</p>` },
  });
  document.role = args.role;
  return { document, score: 500, confidence: "high", matchedFields: ["near-exact-title"], selectedPassages: [document.textSegments[0]!] };
}

describe("conditional grounded elaboration", () => {
  it("allows a thin substantial service only when unique same-subject evidence exists", () => {
    const understanding = buildDeterministicUnderstanding("Tell me about Platform Engineering Services");
    const plan = planGroundedElaboration({
      answer: "Platform engineering helps enterprises establish reliable digital delivery foundations.",
      primary: serviceMatch(), understanding,
    });
    expect(plan).toMatchObject({ eligible: true, reason: "ELABORATED_SECOND_ASPECT_AVAILABLE" });
    expect(plan.additionalEvidence.join(" ")).toMatch(/automation|governance|developer enablement/i);
  });

  it("does not treat a three-sentence one-aspect response as sufficient when distinct evidence exists", () => {
    const plan = planGroundedElaboration({
      answer: "Platform engineering establishes reliable delivery foundations. It helps teams move faster with a consistent approach. It aligns platform investment with business priorities.",
      primary: serviceMatch(), understanding: buildDeterministicUnderstanding("Tell me about Platform Engineering Services"),
    });
    expect(plan).toMatchObject({ eligible: true, reason: "ELABORATED_SECOND_ASPECT_AVAILABLE" });
    expect(plan.additionalEvidence.join(" ")).toMatch(/automation|governance|developer enablement/i);
  });

  it("skips a one-aspect response when no distinct same-subject evidence exists", () => {
    const plan = planGroundedElaboration({
      answer: "Strategy services define a clear direction for enterprises. They align initiatives with business priorities. They focus investment on measurable value.",
      primary: singleAspectServiceMatch(), understanding: buildDeterministicUnderstanding("Tell me about Strategy Services"),
    });
    expect(plan.reason).toBe("SKIPPED_NO_DISTINCT_SECOND_ASPECT");
  });

  it("recognizes already multi-aspect, factual, and editorial answers without an extra composition instruction", () => {
    const service = serviceMatch();
    const detailed = planGroundedElaboration({
      answer: "Platform engineering establishes reliable digital delivery foundations. Successive supports automation, governance, and developer enablement.",
      primary: service, understanding: buildDeterministicUnderstanding("Tell me about Platform Engineering Services"),
    });
    expect(detailed.reason).toBe("SKIPPED_ALREADY_SUFFICIENT_MULTI_ASPECT");
    expect(planGroundedElaboration({
      answer: "Published Executive is the Founder and CEO.", primary: service,
      understanding: buildDeterministicUnderstanding("Who is the CEO?"),
    }).reason).toBe("SKIPPED_QUERY_TYPE");
    expect(planGroundedElaboration({
      answer: "An article summary.", primary: service,
      understanding: { ...buildDeterministicUnderstanding("Show articles about platform engineering"), requestedContentType: "blog" },
    }).reason).toBe("SKIPPED_QUERY_TYPE");
  });

  it.each([
    ["solution", substantialMatch({ title: "Enterprise Integration Solution", role: "page", content: "The integration solution connects enterprise systems through a clear delivery approach. Its implementation workflow maps interfaces, validates data exchange, and governs rollout across teams." })],
    ["industry", substantialMatch({ title: "Healthcare Technology Services", role: "industry", content: "Healthcare technology services improve digital experiences for providers and patients. They support compliant workflows, care coordination, and secure handling of sensitive data." })],
    ["product", substantialMatch({ title: "Delivery Accelerator Platform", role: "product", content: "The delivery accelerator platform helps teams streamline product delivery. Its features automate quality checks, provide workflow visibility, and support governed releases." })],
  ])("elaborates a substantial %s only from its own distinct evidence", (_kind, primary) => {
    const plan = planGroundedElaboration({
      answer: `${primary.document.title} provides a focused approach that helps enterprises create value. It gives teams a clear path for their priorities.`,
      primary, understanding: buildDeterministicUnderstanding(`Tell me about ${primary.document.title}`),
    });
    expect(plan).toMatchObject({ eligible: true, reason: "ELABORATED_SECOND_ASPECT_AVAILABLE" });
    expect(plan.additionalEvidence.join(" ")).toMatch(/implementation|compliant|features/i);
  });

  it("keeps an embedded entity local and does not elaborate it from surrounding record content", () => {
    const primary = substantialMatch({
      title: "Embedded Product", role: "product",
      content: "A generic company capability offers automation, governance, and implementation support across many services.",
    });
    primary.matchedFields = ["embedded-structural-parent"];
    primary.selectedPassages = ["Embedded Product is a focused platform for delivery teams."];
    const plan = planGroundedElaboration({
      answer: "Embedded Product is a focused platform for delivery teams.", primary,
      understanding: buildDeterministicUnderstanding("What is Embedded Product?"),
    });
    expect(plan.reason).toBe("SKIPPED_NO_DISTINCT_SECOND_ASPECT");
  });

  it("rejects generated elaboration that changes subject, adds a commercial CTA, or invents a URL", () => {
    const plan = planGroundedElaboration({
      answer: "Platform engineering helps enterprises establish reliable digital delivery foundations.",
      primary: serviceMatch(), understanding: buildDeterministicUnderstanding("Tell me about Platform Engineering Services"),
    });
    expect(isSafeGroundedElaboration(
      "Platform Engineering Services supports automation and governance.", plan, ["https://successive.tech/platform-engineering/"],
    )).toBe(true);
    expect(isSafeGroundedElaboration(
      "GIS services include guaranteed delivery. Contact Us at https://example.test/.", plan, ["https://successive.tech/platform-engineering/"],
    )).toBe(false);
  });
});
