import { describe, expect, it } from "vitest";
import { buildDeterministicOverviewAnswer, buildGroundedEvidencePackage, buildQuestionFocusedFallback, hasOnlyValidatedComposerUrls, hasQuestionFocusCoverage, isEligibleDeterministicOverview, isEligibleGroundedComposer, questionFocusEvidence } from "./grounded-evidence-package";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { buildSearchDocument, factualDocumentEvidence } from "./search-index";
import type { SearchMatch } from "./search-retriever";

function match(args: { title?: string; role?: SearchMatch["document"]["role"]; content?: string }): SearchMatch {
  const document = buildSearchDocument({
    id: 77, type: "page", slug: "delivery-offering", link: "https://successive.tech/delivery-offering/",
    title: { rendered: args.title ?? "Delivery Engineering Services" },
    content: { rendered: `<p>${args.content ?? "Delivery engineering helps enterprises improve product delivery and operational value. Teams use implementation roadmaps, automation, governance, and release workflows to improve reliability."}</p>` },
  });
  document.role = args.role ?? "service";
  return { document, score: 500, confidence: "high", matchedFields: ["near-exact-title"], selectedPassages: [document.textSegments[0]!] };
}

describe("grounded evidence package", () => {
  it("ranks same-subject factual evidence by process and capabilities without presentation fields", () => {
    const primary = match({
      title: "Sample Data Service",
      content: "Sample Data Service creates trusted data foundations. Data moves through ingestion, validation, transformation, and governed delivery. Improves reliability and analytics readiness.",
    });
    primary.document.role = "service";
    primary.document.structuredFields.push({ path: "services_repeater[0].description", label: "description", value: "Capabilities include ingestion, transformation, governance, and quality controls.", kind: "text" });
    primary.document.structuredFields.push({ path: "cta_description", label: "description", value: "Talk to our experts to learn more.", kind: "text" });
    expect(factualDocumentEvidence(primary.document).join(" ")).toContain("Capabilities include ingestion");
    const capabilities = buildGroundedEvidencePackage({ userQuery: "What capabilities are included in Sample Data Service?", primary,
      understanding: buildDeterministicUnderstanding("What capabilities are included in Sample Data Service?"), hasPriorContext: false });
    const process = buildGroundedEvidencePackage({ userQuery: "How does Sample Data Service work?", primary,
      understanding: buildDeterministicUnderstanding("How does Sample Data Service work?"), hasPriorContext: false });
    expect(capabilities.questionFocus).toBe("capabilities");
    expect(process.questionFocus).toBe("process");
    expect(questionFocusEvidence(capabilities).join(" ")).toMatch(/Capabilities include ingestion/i);
    expect(questionFocusEvidence(process).join(" ")).toMatch(/ingestion, validation, transformation/i);
    expect(JSON.stringify(capabilities)).not.toMatch(/Talk to our experts/i);
  });

  it("keeps up to three distinct process passages and leaves a concise fallback when evidence is limited", () => {
    const primary = match({ title: "Sample Data Service" });
    primary.document.editorTextSegments = [
      "Data is ingested, cleansed, validated, and transformed before delivery.",
      "Workflows orchestrate storage, processing, and governed delivery.",
      "Monitoring, lifecycle controls, and compliance policies maintain reliability.",
      "Workflows orchestrate storage, processing, and governed delivery for teams.",
    ];
    const process = buildGroundedEvidencePackage({
      userQuery: "How does Sample Data Service work?", primary,
      understanding: buildDeterministicUnderstanding("How does Sample Data Service work?"), hasPriorContext: false,
    });
    const focused = questionFocusEvidence(process);
    expect(focused).toHaveLength(3);
    expect(focused.join(" ")).toMatch(/ingested, cleansed, validated/i);
    expect(focused.join(" ")).toMatch(/Workflows orchestrate storage/i);
    expect(focused.join(" ")).toMatch(/Monitoring, lifecycle controls/i);
    expect(buildQuestionFocusedFallback("A generic summary.", process)).toContain("\n\n");

    primary.document.editorTextSegments = ["Data is ingested, cleansed, validated, and transformed before delivery."];
    const limited = buildGroundedEvidencePackage({
      userQuery: "How does Sample Data Service work?", primary,
      understanding: buildDeterministicUnderstanding("How does Sample Data Service work?"), hasPriorContext: false,
    });
    expect(questionFocusEvidence(limited)).toHaveLength(1);
  });
  it("builds bounded same-record clusters for a rich substantial service", () => {
    const primary = match({});
    const pkg = buildGroundedEvidencePackage({
      userQuery: "Tell me about Delivery Engineering Services", primary,
      understanding: buildDeterministicUnderstanding("Tell me about Delivery Engineering Services"), hasPriorContext: false,
    });
    expect(pkg.resolvedSubject).toMatchObject({ canonicalName: "Delivery Engineering Services", role: "service", embeddedEntity: false });
    expect(pkg.supportingEvidence.semanticClusters.map((cluster) => cluster.kind)).toEqual(expect.arrayContaining(["process_implementation"]));
    expect(pkg.supportingEvidence.semanticClusters.length).toBeLessThanOrEqual(4);
    expect(pkg.validatedLinks.canonical).toBe("https://successive.tech/delivery-offering/");
  });

  it("keeps four complementary validated groups in a direct canonical overview without repeating its title", () => {
    const primary = match({
      title: "Delivery Engineering Services",
      content: "Delivery Engineering Services creates reliable product delivery foundations. Teams use automation and governance controls to improve release quality. An implementation roadmap coordinates delivery stages. The approach improves operational efficiency and resilience.",
    });
    primary.matchedFields = ["normalized-exact-title"];
    const understanding = buildDeterministicUnderstanding("Delivery Engineering Services");
    const pkg = buildGroundedEvidencePackage({ userQuery: "Delivery Engineering Services", primary, understanding, hasPriorContext: false });
    const answer = buildDeterministicOverviewAnswer(pkg)!;
    expect(answer).toMatch(/reliable product delivery foundations/i);
    expect(answer).toMatch(/automation and governance|implementation roadmap/i);
    expect(answer).toMatch(/operational efficiency and resilience/i);
    expect(answer).not.toMatch(/\n\nDelivery Engineering Services\n\n/);
    expect(answer.split(/\n\s*\n/)).toHaveLength(3);
  });

  it("keeps the same evidence boundary while exposing a question-aware composition focus", () => {
    const primary = match({});
    const overview = buildGroundedEvidencePackage({
      userQuery: "Tell me about Delivery Engineering Services", primary,
      understanding: buildDeterministicUnderstanding("Tell me about Delivery Engineering Services"), hasPriorContext: false,
    });
    const process = buildGroundedEvidencePackage({
      userQuery: "How does Delivery Engineering Services work?", primary,
      understanding: buildDeterministicUnderstanding("How does Delivery Engineering Services work?"), hasPriorContext: false,
    });
    expect(overview.questionFocus).toBe("overview");
    expect(process.questionFocus).toBe("process");
    expect(process.supportingEvidence.semanticClusters[0]?.kind).toBe("process_implementation");
    expect(questionFocusEvidence(process).join(" ")).toMatch(/implementation roadmaps|release workflows/i);
    expect(hasQuestionFocusCoverage("Delivery Engineering Services provides a focused approach.", process)).toBe(false);
    expect(hasQuestionFocusCoverage("Delivery Engineering Services uses implementation roadmaps and release workflows.", process)).toBe(true);
  });

  it("admits only a direct, independent, high-confidence overview with validated evidence to the no-composer path", () => {
    const primary = match({
      content: "Delivery Engineering creates reliable product delivery foundations. Teams use implementation roadmaps, automation, and governed release workflows to improve operational value.",
    });
    primary.matchedFields = ["normalized-exact-title"];
    const overviewUnderstanding = buildDeterministicUnderstanding("Tell me about Delivery Engineering Services");
    const overview = buildGroundedEvidencePackage({
      userQuery: "Tell me about Delivery Engineering Services", primary, understanding: overviewUnderstanding, hasPriorContext: false,
    });
    expect(isEligibleDeterministicOverview({ primary, evidence: overview, understanding: overviewUnderstanding,
      directEnglish: true, hasPriorContext: false, resolvedFollowUp: false, hasAction: false, isCommercial: false, facetCount: 0 })).toBe(true);
    expect(buildDeterministicOverviewAnswer(overview)).toMatch(/reliable product delivery foundations/i);

    const complexUnderstanding = buildDeterministicUnderstanding("How does Delivery Engineering Services work?");
    const complex = buildGroundedEvidencePackage({
      userQuery: "How does Delivery Engineering Services work?", primary, understanding: complexUnderstanding, hasPriorContext: false,
    });
    expect(isEligibleDeterministicOverview({ primary, evidence: complex, understanding: complexUnderstanding,
      directEnglish: true, hasPriorContext: false, resolvedFollowUp: false, hasAction: false, isCommercial: false, facetCount: 0 })).toBe(false);
    expect(isEligibleDeterministicOverview({ primary, evidence: overview, understanding: overviewUnderstanding,
      directEnglish: true, hasPriorContext: true, resolvedFollowUp: false, hasAction: false, isCommercial: false, facetCount: 0 })).toBe(false);
  });

  it("allows commercial vocabulary inside an exact informational title while retaining commercial and partial-authority exclusions", () => {
    const primary = match({
      title: "Cloud Cost Analysis",
      content: "Cloud Cost Analysis provides practical cloud spend visibility. Teams use governed optimization practices to improve cloud efficiency.",
    });
    primary.matchedFields = ["normalized-exact-title"];
    const understanding = buildDeterministicUnderstanding("Cloud Cost Analysis");
    const evidence = buildGroundedEvidencePackage({ userQuery: "Cloud Cost Analysis", primary, understanding, hasPriorContext: false });
    const base = { primary, evidence, understanding, directEnglish: true, hasPriorContext: false, resolvedFollowUp: false, hasAction: false, facetCount: 0 };
    expect(isEligibleDeterministicOverview({ ...base, isCommercial: false })).toBe(true);
    expect(isEligibleDeterministicOverview({ ...base, isCommercial: true })).toBe(false);

    primary.matchedFields = ["compound-canonical-capability"];
    expect(isEligibleDeterministicOverview({ ...base, isCommercial: false })).toBe(false);
    primary.matchedFields = ["compound-canonical-capability", "canonical-service-authority"];
    expect(isEligibleDeterministicOverview({ ...base, isCommercial: false })).toBe(true);
  });

  it("treats a canonical how-help question as benefits rather than process grammar", () => {
    const primary = match({ title: "Delivery Engineering", content: "Delivery engineering improves resilience, efficiency, and performance for enterprise teams. Teams use implementation roadmaps and release workflows to improve reliability." });
    primary.selectedPassages = ["Delivery engineering improves resilience, efficiency, and performance for enterprise teams."];
    const benefits = buildGroundedEvidencePackage({
      userQuery: "How does Delivery Engineering help enterprises improve reliability?",
      primary,
      understanding: buildDeterministicUnderstanding("How does Delivery Engineering Services help enterprises improve reliability?"), hasPriorContext: false,
    });
    expect(benefits.questionFocus).toBe("benefits");
  });

  it("never imports an attractive neighboring record into the package", () => {
    const primary = match({ content: "Delivery engineering provides a focused approach for enterprise teams." });
    const neighbor = match({ title: "Cloud Optimization Services", content: "Cloud optimization provides automation, security, and cost outcomes." });
    const pkg = buildGroundedEvidencePackage({
      userQuery: "Tell me about Delivery Engineering Services", primary,
      understanding: buildDeterministicUnderstanding("Tell me about Delivery Engineering Services"), hasPriorContext: false,
    });
    expect(JSON.stringify(pkg)).not.toContain(neighbor.document.title);
    expect(JSON.stringify(pkg)).not.toContain("Cloud optimization provides");
  });

  it("keeps an embedded entity bounded to its selected local evidence", () => {
    const primary = match({ content: "Parent-page cloud and AI content must not be exposed as product evidence." });
    primary.matchedFields = ["embedded-structural-parent"];
    primary.selectedPassages = ["Delivery Accelerator is a product platform that helps teams plan, build, test, and release software."];
    const pkg = buildGroundedEvidencePackage({
      userQuery: "What is Delivery Accelerator?", primary,
      understanding: buildDeterministicUnderstanding("What is Delivery Accelerator?"), hasPriorContext: false,
    });
    expect(pkg.resolvedSubject.embeddedEntity).toBe(true);
    expect(JSON.stringify(pkg)).toContain("Delivery Accelerator");
    expect(JSON.stringify(pkg)).not.toContain("Parent-page cloud");
  });

  it("treats an exact embedded match as local even when it has no legacy parent-link marker", () => {
    const primary = match({ content: "Parent-page AI, cloud, and commerce material must not enter this answer." });
    primary.matchedFields = ["exact-embedded-entity"];
    primary.selectedPassages = ["Embedded Platform helps delivery teams plan, build, test, and launch software."];
    const pkg = buildGroundedEvidencePackage({
      userQuery: "What is Embedded Platform?", primary,
      understanding: buildDeterministicUnderstanding("What is Embedded Platform?"), hasPriorContext: false,
    });
    expect(JSON.stringify(pkg)).toContain("Embedded Platform helps");
    expect(JSON.stringify(pkg)).not.toContain("Parent-page AI");
  });

  it("keeps each resolved card inside its own structured local evidence unit", () => {
    const aggregate = match({ title: "Capability collection", content: "Parent page overview." });
    aggregate.document.descriptions = [
      "Capability Alpha provides governed delivery workflows.",
      "Capability Beta provides cloud cost visibility.",
      "Capability Gamma provides customer analytics.",
    ];
    aggregate.document.textSegments = [...aggregate.document.descriptions];
    const resolve = (title: string, groupPath: string, passage: string): SearchMatch => ({
      ...aggregate,
      document: { ...aggregate.document, title },
      selectedPassages: [title, passage],
      matchedFields: ["exact-structured-section"],
      localEvidence: { groupPath, heading: title, passages: [title, passage] },
    });
    const alpha = buildGroundedEvidencePackage({
      userQuery: "Tell me about Capability Alpha", primary: resolve("Capability Alpha", "capabilities[0]", aggregate.document.descriptions[0]!),
      understanding: buildDeterministicUnderstanding("Tell me about Capability Alpha"), hasPriorContext: false,
    });
    const beta = buildGroundedEvidencePackage({
      userQuery: "Tell me about Capability Beta", primary: resolve("Capability Beta", "capabilities[1]", aggregate.document.descriptions[1]!),
      understanding: buildDeterministicUnderstanding("Tell me about Capability Beta"), hasPriorContext: false,
    });
    expect(JSON.stringify(alpha)).toContain("governed delivery");
    expect(JSON.stringify(alpha)).not.toMatch(/cloud cost visibility|customer analytics/i);
    expect(JSON.stringify(beta)).toContain("cloud cost visibility");
    expect(JSON.stringify(beta)).not.toMatch(/governed delivery|customer analytics/i);
  });

  it("retains broad same-page evidence for a dedicated service without a local unit", () => {
    const primary = match({ title: "Data Engineering", content: "Data Engineering provides governed pipelines. Teams use modern data platforms, quality controls, and analytics workflows." });
    const pkg = buildGroundedEvidencePackage({
      userQuery: "Tell me about Data Engineering", primary,
      understanding: buildDeterministicUnderstanding("Tell me about Data Engineering"), hasPriorContext: false,
    });
    expect(JSON.stringify(pkg)).toMatch(/modern data platforms|analytics workflows/i);
  });

  it("admits extra depth only from an explicitly structural canonical record", () => {
    const primary = match({ title: "Capability Atlas", content: "Unrelated parent copy must stay outside the card." });
    primary.matchedFields = ["exact-structured-section", "exact-embedded-entity", "embedded-direct-subject-authority", "embedded-structural-parent"];
    primary.localEvidence = {
      groupPath: "services[0]",
      heading: "Capability Atlas",
      passages: ["Capability Atlas", "Design and ship dependable products for enterprise teams."],
      url: "https://successive.tech/capability-atlas/",
    };
    const canonical = buildSearchDocument({
      id: 78, type: "page", slug: "capability-atlas", link: "https://successive.tech/capability-atlas/",
      title: { rendered: "Product Engineering Services" }, content: { rendered: "" },
      acf: {
        description: "The canonical service combines modern technologies and agile practices to deliver scalable products.",
        benefits_repeater: [{ heading: "Lifecycle delivery", description: "Teams manage product evolution from ideation through launch with an end-to-end delivery approach." }],
        cta_description: "Talk to our experts about unrelated promotional details.",
      },
    });
    const pkg = buildGroundedEvidencePackage({
      userQuery: "Tell me about Capability Atlas", primary,
      understanding: buildDeterministicUnderstanding("Tell me about Capability Atlas"), hasPriorContext: false,
      structuralCanonicalSupport: canonical,
    });
    const structural = pkg.supportingEvidence.semanticClusters.filter((cluster) => cluster.source === "structural_canonical");
    expect(structural.flatMap((cluster) => cluster.passages).join(" ")).toMatch(/modern technologies|product evolution/i);
    expect(JSON.stringify(pkg)).not.toMatch(/Talk to our experts|Unrelated parent copy/i);
    const answer = buildDeterministicOverviewAnswer(pkg)!;
    expect(answer).toContain("Design and ship dependable products for enterprise teams.");
    expect(answer).toMatch(/modern technologies|product evolution/i);
    expect(answer).not.toMatch(/\n\nCapability Atlas\n\n/);
    expect(answer.split(/\n\s*\n/)).toHaveLength(3);

    const processUnderstanding = buildDeterministicUnderstanding("How does Capability Atlas work?");
    const process = buildGroundedEvidencePackage({
      userQuery: "How does Capability Atlas work?", primary,
      understanding: processUnderstanding, hasPriorContext: false,
      structuralCanonicalSupport: canonical,
    });
    expect(isEligibleDeterministicOverview({ primary, evidence: process, understanding: processUnderstanding,
      directEnglish: true, hasPriorContext: false, resolvedFollowUp: false, hasAction: false, isCommercial: false, facetCount: 0 })).toBe(true);
    expect(isEligibleDeterministicOverview({ primary, evidence: process, understanding: processUnderstanding,
      directEnglish: true, hasPriorContext: true, resolvedFollowUp: false, hasAction: false, isCommercial: false, facetCount: 0 })).toBe(false);
    expect(isEligibleDeterministicOverview({ primary, evidence: process, understanding: processUnderstanding,
      directEnglish: true, hasPriorContext: true, resolvedFollowUp: true, hasAction: false, isCommercial: false, facetCount: 0 })).toBe(true);
    expect(buildDeterministicOverviewAnswer(process)).toMatch(/end-to-end delivery approach/i);
  });

  it("rejects composer URLs outside the validated allow-list and preserves short factual fast paths", () => {
    const primary = match({});
    const pkg = buildGroundedEvidencePackage({
      userQuery: "Tell me about Delivery Engineering Services", primary,
      understanding: buildDeterministicUnderstanding("Tell me about Delivery Engineering Services"), hasPriorContext: false,
    });
    expect(hasOnlyValidatedComposerUrls("Read https://example.test/not-allowed", pkg)).toBe(false);
    expect(hasOnlyValidatedComposerUrls("Read https://successive.tech/delivery-offering/", pkg)).toBe(true);
    const api = match({ title: "API Development Services" });
    expect(isEligibleGroundedComposer(api, buildDeterministicUnderstanding("What is API?"))).toBe(false);
  });

  it("uses focused evidence rather than a generic summary when coverage rejects composition", () => {
    const primary = match({ content: "Delivery engineering improves resilience, efficiency, and performance for enterprise teams." });
    primary.document.title = "Delivery Engineering";
    primary.selectedPassages = ["Delivery engineering improves resilience, efficiency, and performance for enterprise teams."];
    const pkg = buildGroundedEvidencePackage({
      userQuery: "How does Delivery Engineering help businesses?", primary,
      understanding: buildDeterministicUnderstanding("How does Delivery Engineering help businesses?"), hasPriorContext: false,
    });
    expect(hasQuestionFocusCoverage("Delivery Engineering offers a focused service.", pkg)).toBe(false);
    expect(buildQuestionFocusedFallback("Delivery Engineering offers a focused service.", pkg)).toMatch(/resilience, efficiency, and performance/i);
  });
});
