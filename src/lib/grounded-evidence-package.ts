import { normalizeSearchText } from "./search-index";
import type { QueryUnderstanding } from "./query-understanding";
import type { SearchMatch } from "./search-retriever";
import { factualDocumentEvidence } from "./search-index";
import { documentContentType, supportsEvidenceDrivenDepth } from "./response-alignment";

export type EvidenceClusterKind =
  | "description"
  | "capabilities"
  | "process_implementation"
  | "features"
  | "use_cases"
  | "technologies_platforms"
  | "outcomes"
  | "methodology"
  | "faq"
  | "structured_entity";

export interface GroundedEvidencePackage {
  userQuery: string;
  questionFocus: "overview" | "process" | "capabilities" | "use_cases" | "technology" | "benefits" | "relationship";
  conversationContext: { hasPriorContext: boolean; isFollowUp: boolean };
  resolvedSubject: {
    canonicalName: string;
    role: string;
    recordIdentity: string;
    embeddedEntity: boolean;
  };
  requestedIntent: { answerMode: QueryUnderstanding["answerMode"]; requestedRole: string | null };
  primaryEvidence: { passages: string[]; localHeadings: string[]; description?: string };
  supportingEvidence: { semanticClusters: Array<{ kind: EvidenceClusterKind; passages: string[]; source: "subject_local" | "structural_canonical" }> };
  validatedLinks: { canonical?: string; contextual: string[]; contact?: string };
  restrictions: { evidenceOnly: true; noInventedUrls: true; unsupportedFactPolicy: "acknowledge_limited_published_evidence" };
}

function questionFocus(query: string): GroundedEvidencePackage["questionFocus"] {
  const normalized = normalizeSearchText(query);
  if (/\b(?:integrat|compatib|support .* with|work with|available with|implement .* with)\b/.test(normalized)) return "relationship";
  // A how-help question asks for supported value/outcomes; plain how/work
  // questions retain the process interpretation below.
  if (/\b(?:how (?:does|do).{0,80}\bhelp|benefits?|outcomes?|help|value)\b/.test(normalized)) return "benefits";
  if (/\b(?:how (?:does|do)|process|implement|methodology|approach|work)\b/.test(normalized)) return "process";
  if (/\b(?:capabilit(?:y|ies)?|features?|what can)\b/.test(normalized)) return "capabilities";
  if (/\b(?:use cases?|applications?)\b/.test(normalized)) return "use_cases";
  if (/\b(?:technology|technologies|platforms?)\b/.test(normalized)) return "technology";
  return "overview";
}

const FOCUS_CLUSTER_ORDER: Record<GroundedEvidencePackage["questionFocus"], EvidenceClusterKind[]> = {
  overview: ["description", "capabilities", "outcomes", "process_implementation"],
  capabilities: ["capabilities", "features", "technologies_platforms", "process_implementation"],
  process: ["process_implementation", "methodology", "capabilities", "outcomes"],
  use_cases: ["use_cases", "features", "outcomes", "capabilities"],
  technology: ["technologies_platforms", "process_implementation", "capabilities"],
  benefits: ["outcomes", "capabilities", "description", "process_implementation"],
  relationship: [],
};

function prioritizeClusters(
  clusters: GroundedEvidencePackage["supportingEvidence"]["semanticClusters"],
  focus: GroundedEvidencePackage["questionFocus"],
): GroundedEvidencePackage["supportingEvidence"]["semanticClusters"] {
  const preferred = FOCUS_CLUSTER_ORDER[focus];
  return [...clusters].sort((left, right) => {
    const leftPosition = preferred.indexOf(left.kind);
    const rightPosition = preferred.indexOf(right.kind);
    return (leftPosition < 0 ? 99 : leftPosition) - (rightPosition < 0 ? 99 : rightPosition);
  });
}

const CLUSTER_PATTERNS: Array<[EvidenceClusterKind, RegExp]> = [
  ["capabilities", /\b(?:capabilit(?:y|ies)?|services?|supports?|enables?|helps? .*?(?:build|manage|optimiz|accelerat))\b/i],
  ["process_implementation", /\b(?:implement|deploy|integrat|migrat|moderniz|roadmap|workflow|delivery|assessment|readiness|proof of concept|poc|governance|pipeline|ingest(?:ion)?|validat(?:e|ion)|transform(?:ation)?|orchestrat(?:e|ion)|lifecycle|stages?)\b/i],
  ["features", /\b(?:features?|automation|dashboard|quality checks?|visibility|release)\b/i],
  ["use_cases", /\b(?:use cases?|applications?|for (?:teams|enterprises|organizations|businesses))\b/i],
  ["technologies_platforms", /\b(?:cloud|aws|azure|gcp|kubernetes|container|platform|technology|technologies|data)\b/i],
  ["outcomes", /\b(?:outcomes?|efficiency|costs?|resilien|scalab|growth|performance|risk|time to value)\b/i],
  ["methodology", /\b(?:methodology|approach|strategy|framework|best practice)\b/i],
];

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentences(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => value.split(/(?<=[.!?])\s+|\n+/))
    .map(clean)
    .filter((value) => normalizeSearchText(value).split(" ").filter(Boolean).length >= 6)
    .filter((value) => {
      const key = normalizeSearchText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function clusterEvidence(values: string[], embeddedEntity: boolean, source: "subject_local" | "structural_canonical"): GroundedEvidencePackage["supportingEvidence"] {
  const clusters = new Map<EvidenceClusterKind, string[]>();
  sentences(values).forEach((value) => {
    const kind = embeddedEntity ? "structured_entity" as const :
      CLUSTER_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] ?? "description";
    const current = clusters.get(kind) ?? [];
    if (current.length < 3) current.push(value);
    clusters.set(kind, current);
  });
  return { semanticClusters: [...clusters].map(([kind, passages]) => ({ kind, passages, source })) };
}

/** Builds a small, same-record evidence contract for the grounded composer. */
export function buildGroundedEvidencePackage(args: {
  userQuery: string;
  primary: SearchMatch;
  understanding: QueryUnderstanding;
  hasPriorContext: boolean;
  structuralCanonicalSupport?: SearchMatch["document"];
}): GroundedEvidencePackage {
  const { primary, understanding } = args;
  const embeddedEntity = Boolean(primary.localEvidence) ||
    primary.matchedFields.includes("embedded-structural-parent") ||
    primary.matchedFields.includes("exact-embedded-entity");
  const factualValues = factualDocumentEvidence(primary.document);
  const localValues = primary.localEvidence?.passages ?? (embeddedEntity
    ? primary.selectedPassages
    : [...factualValues, ...primary.document.faqItems.flatMap((item) => [item.question, item.answer])]);
  const primaryPassages = sentences(primary.localEvidence?.passages ?? (embeddedEntity
    ? primary.selectedPassages
    : factualValues)).slice(0, 2);
  const focus = questionFocus(args.userQuery);
  const structuralValues = args.structuralCanonicalSupport
    ? factualDocumentEvidence(args.structuralCanonicalSupport)
      .filter((value) => !localValues.some((local) => normalizeSearchText(local) === normalizeSearchText(value)))
      .slice(0, 12)
    : [];
  const localEvidence = clusterEvidence(localValues, embeddedEntity, "subject_local");
  const structuralEvidence = clusterEvidence(structuralValues, false, "structural_canonical");
  const evidence = { semanticClusters: [...localEvidence.semanticClusters, ...structuralEvidence.semanticClusters] };
  if (!embeddedEntity && !evidence.semanticClusters.some((cluster) => cluster.kind === "description") && primaryPassages.length)
    evidence.semanticClusters.unshift({ kind: "description", passages: primaryPassages.slice(0, 1), source: "subject_local" });
  return {
    userQuery: args.userQuery,
    questionFocus: focus,
    conversationContext: { hasPriorContext: args.hasPriorContext, isFollowUp: understanding.isFollowUp },
    resolvedSubject: {
      canonicalName: primary.document.title,
      role: documentContentType(primary.document),
      recordIdentity: `${primary.document.type}:${primary.document.id}`,
      embeddedEntity,
    },
    requestedIntent: { answerMode: understanding.answerMode, requestedRole: understanding.requestedContentType ?? null },
    primaryEvidence: {
      passages: primaryPassages,
      localHeadings: primary.localEvidence?.heading ? [primary.localEvidence.heading] : embeddedEntity ? [] : primary.document.headings.slice(0, 6),
      description: primaryPassages[0],
    },
    // Select the bounded budget only after focus ordering. Otherwise early
    // generic clusters could crowd out the evidence that answers the question.
    supportingEvidence: { semanticClusters: prioritizeClusters(evidence.semanticClusters, focus).slice(0, 4) },
    validatedLinks: { canonical: primary.document.url || undefined, contextual: [] },
    restrictions: { evidenceOnly: true, noInventedUrls: true, unsupportedFactPolicy: "acknowledge_limited_published_evidence" },
  };
}

const EXCLUDED_ROLES = new Set(["blog", "whitepaper", "case-study", "career", "company", "leadership"]);

/** Stage 2 remains deliberately limited to standalone substantial informational turns. */
export function isEligibleGroundedComposer(primary: SearchMatch | undefined, understanding: QueryUnderstanding): primary is SearchMatch {
  if (!primary || EXCLUDED_ROLES.has(documentContentType(primary.document))) return false;
  // A broad collection remains on its category path. A named subject asking
  // for its use cases can parse as a list, but is still one bounded entity
  // question and should receive question-aware composition.
  if (understanding.isFollowUp || understanding.answerMode === "recommend" ||
      (understanding.answerMode === "list" && understanding.isBroadQuery)) return false;
  const explicitTerms = [...understanding.entities, ...understanding.topics]
    .flatMap((value) => normalizeSearchText(value).split(" ")).filter(Boolean);
  if (understanding.answerMode === "define" && explicitTerms.length === 1 && explicitTerms[0]!.length <= 4) return false;
  return supportsEvidenceDrivenDepth(primary, understanding);
}

export function hasOnlyValidatedComposerUrls(answer: string, evidence: GroundedEvidencePackage): boolean {
  const allowed = new Set([evidence.validatedLinks.canonical, ...evidence.validatedLinks.contextual, evidence.validatedLinks.contact].filter(Boolean));
  return [...answer.matchAll(/https?:\/\/[^\s)]+/g)].every((match) => allowed.has(match[0]));
}

const COVERAGE_STOPWORDS = new Set(["successive", "services", "service", "helps", "help", "enterprise", "enterprises", "business", "businesses", "through", "with", "that", "this", "their", "your", "from", "into", "and", "the", "for"]);

export function questionFocusEvidence(evidence: GroundedEvidencePackage): string[] {
  const preferred = FOCUS_CLUSTER_ORDER[evidence.questionFocus];
  const candidates = evidence.supportingEvidence.semanticClusters
    .filter((cluster) => preferred.includes(cluster.kind))
    .flatMap((cluster) => cluster.passages)
  const selected: string[] = [];
  for (const candidate of candidates) {
    const terms = new Set(normalizeSearchText(candidate).split(" ").filter((term) => term.length >= 4));
    const redundant = selected.some((existing) => {
      const existingTerms = new Set(normalizeSearchText(existing).split(" ").filter((term) => term.length >= 4));
      const overlap = [...terms].filter((term) => existingTerms.has(term)).length;
      return overlap / Math.max(1, Math.min(terms.size, existingTerms.size)) >= 0.72;
    });
    if (!redundant) selected.push(candidate);
    if (selected.length === 3) break;
  }
  return selected;
}

/** Deterministic fallback for a rejected composition: context plus the evidence that answers the question. */
export function buildQuestionFocusedFallback(
  deterministicAnswer: string,
  evidence: GroundedEvidencePackage | undefined,
): string {
  if (!evidence || ["overview", "relationship"].includes(evidence.questionFocus)) return deterministicAnswer;
  const focused = questionFocusEvidence(evidence);
  if (!focused.length) return deterministicAnswer;
  const normalizedBase = normalizeSearchText(deterministicAnswer);
  const additions = focused.filter((passage) => !normalizedBase.includes(normalizeSearchText(passage)));
  if (!additions.length) return focused.join("\n\n");
  // Focused evidence already answers a non-overview question. Do not append a
  // generic page summary merely to expose a second same-subject source link.
  return additions.join("\n\n");
}

/**
 * A deliberately narrow no-composer path for an independently resolved,
 * standalone overview.  This is evidence presentation, not a second ranking
 * policy: the route has already selected and validated the primary result.
 */
export function isEligibleDeterministicOverview(args: {
  primary: SearchMatch | undefined;
  evidence: GroundedEvidencePackage | undefined;
  understanding: QueryUnderstanding;
  directEnglish: boolean;
  hasPriorContext: boolean;
  resolvedFollowUp: boolean;
  hasAction: boolean;
  isCommercial: boolean;
  facetCount: number;
}): boolean {
  return deterministicOverviewEligibility(args).eligible;
}

/** Exposes the bounded fast-path predicates for focused route diagnostics/tests. */
export function deterministicOverviewEligibility(args: {
  primary: SearchMatch | undefined;
  evidence: GroundedEvidencePackage | undefined;
  understanding: QueryUnderstanding;
  directEnglish: boolean;
  hasPriorContext: boolean;
  resolvedFollowUp: boolean;
  hasAction: boolean;
  isCommercial: boolean;
  facetCount: number;
}): { eligible: boolean; failedPredicate?: string } {
  const { primary, evidence, understanding } = args;
  if (!primary || !evidence || !args.directEnglish || (args.hasPriorContext && !args.resolvedFollowUp) || args.hasAction || args.isCommercial || args.facetCount > 1)
    return { eligible: false, failedPredicate: !primary ? "primary" : !evidence ? "evidence" : !args.directEnglish ? "directEnglish" : args.hasPriorContext && !args.resolvedFollowUp ? "context" : args.hasAction ? "action" : args.isCommercial ? "commercial" : "multiFacet" };
  const resourceIdentity = `${primary.document.slug} ${primary.document.url} ${primary.document.title}`;
  if (["resource", "ebook"].includes(documentContentType(primary.document)) ||
      /\b(?:ebook|resource|guide)\b/i.test(resourceIdentity))
    return { eligible: false, failedPredicate: "resourceComposer" };
  if (understanding.isFollowUp && !args.resolvedFollowUp) return { eligible: false, failedPredicate: "followUp" };
  if (!["overview", "technology", "process", "capabilities", "benefits", "use_cases"].includes(evidence.questionFocus)) return { eligible: false, failedPredicate: "focus" };
  if (!["explore", "informational", "discovery", "solve_problem"].includes(understanding.intent)) return { eligible: false, failedPredicate: "intent" };
  if (!isSimpleOverviewShape(evidence.userQuery, evidence.questionFocus)) return { eligible: false, failedPredicate: "directShape" };
  if (!evidence.validatedLinks.canonical || !/^https:\/\/[^/]+\/.+/.test(evidence.validatedLinks.canonical)) return { eligible: false, failedPredicate: "canonicalUrl" };
  const exactAuthority = primary.matchedFields.some((field) =>
    /(?:exact-title|normalized-exact-title|exact-entity-authority|exact-embedded-entity|embedded-direct-subject-authority|canonical-page-identity|strong-equivalent-canonical-subject)/.test(field),
  );
  // Compound capability resolution is authoritative only when both markers
  // are present. Either marker alone can describe a partial relationship.
  const compoundCanonicalAuthority = primary.matchedFields.includes("compound-canonical-capability") &&
    primary.matchedFields.includes("canonical-service-authority");
  if (!(exactAuthority || compoundCanonicalAuthority)) return { eligible: false, failedPredicate: "authority" };
  if (primary.confidence !== "high") return { eligible: false, failedPredicate: "confidence" };
  // Facet-specific deterministic answers need a narrower identity boundary
  // than a general overview: a directly linked embedded unit, a paired
  // canonical-capability relation, or an exact resource. This keeps ordinary
  // broad service/process synthesis on the existing composer path.
  const facetSpecific = !["overview", "technology"].includes(evidence.questionFocus);
  const boundedFacetAuthority = Boolean(primary.localEvidence?.url) || compoundCanonicalAuthority ||
    ["resource", "ebook", "whitepaper"].includes(documentContentType(primary.document));
  if (facetSpecific && !boundedFacetAuthority) return { eligible: false, failedPredicate: "facetAuthority" };
  if (facetSpecific && !questionFocusEvidence(evidence).length) return { eligible: false, failedPredicate: "facetEvidence" };
  if (!deterministicFacetEvidence(evidence).length) return { eligible: false, failedPredicate: "factualEvidence" };
  return { eligible: true };
}

function isSimpleOverviewShape(query: string, focus: GroundedEvidencePackage["questionFocus"]): boolean {
  const value = normalizeSearchText(query);
  if (/\b(?:compare|versus|vs|recommend|should|could|integrat|compatib)\b/.test(value)) return false;
  if (!["overview", "technology"].includes(focus))
    return /^(?:what|how|why|does|do|is|are|tell|explain|describe|give)\b/.test(value);
  return !/^(?:what|which|who|where|when|can|could|would|should|do|does|did)\b/.test(value) ||
    /^(?:what is|tell me about|give me (?:an )?overview of|overview of|explain|describe)\b/.test(value);
}

/** Produces a bounded, source-only overview from independently useful facts. */
export function buildDeterministicOverviewAnswer(evidence: GroundedEvidencePackage): string | undefined {
  const paragraphs = deterministicOverviewParagraphs(evidence);
  if (!paragraphs.length) return undefined;
  const title = evidence.resolvedSubject.canonicalName.replace(/[\[\]]/g, "").trim();
  const heading = evidence.validatedLinks.canonical
    ? `[${title}](${evidence.validatedLinks.canonical})`
    : title;
  return `## ${heading}\n\n${paragraphs.join("\n\n")}`;
}

function deterministicFacetEvidence(evidence: GroundedEvidencePackage): string[] {
  const title = normalizeSearchText(evidence.resolvedSubject.canonicalName);
  const facetSpecific = !["overview", "technology"].includes(evidence.questionFocus);
  const overviewKinds: EvidenceClusterKind[] = ["capabilities", "outcomes", "process_implementation", "features", "technologies_platforms", "methodology", "description"];
  const byKind = evidence.supportingEvidence.semanticClusters
    .filter((cluster) => overviewKinds.includes(cluster.kind))
    .sort((left, right) => overviewKinds.indexOf(left.kind) - overviewKinds.indexOf(right.kind));
  const clustered = byKind.map((cluster) => bestOverviewClusterPassage(cluster)).filter((value): value is string => Boolean(value));
  // A direct facet answer starts with the ranked evidence for that facet;
  // overview answers retain the subject-local description as their opening.
  const values = facetSpecific
    ? [...questionFocusEvidence(evidence), ...evidence.primaryEvidence.passages.slice(0, 1), ...clustered]
    : [...evidence.primaryEvidence.passages.slice(0, 1), ...clustered];
  const seen = new Set<string>();
  return values
    .map(clean)
    .filter((value) => normalizeSearchText(value).split(" ").filter(Boolean).length >= 6)
    .filter((value) => normalizeSearchText(value) !== title)
    .filter((value) => {
      const key = normalizeSearchText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // A direct canonical lookup may have four independently useful factual
    // groups (for example overview, capability, operating approach, and
    // outcome). Keep that final complementary group instead of collapsing a
    // well-supported answer into a title and one sentence.
    .slice(0, 4);
}

/** Groups the direct explanation and complementary same-subject facts without adding connective prose. */
function deterministicOverviewParagraphs(evidence: GroundedEvidencePackage): string[] {
  const values = deterministicFacetEvidence(evidence);
  if (!values.length) return [];
  const [overview, ...supporting] = values;
  // The first sentence is the direct subject description. Remaining evidence
  // is independently selected by semantic cluster and stays in one bounded
  // factual paragraph instead of becoming a source dump.
  return supporting.length
    ? [overview!, supporting.join(" ")]
    : [overview!];
}

function bestOverviewClusterPassage(cluster: GroundedEvidencePackage["supportingEvidence"]["semanticClusters"][number]): string | undefined {
  if (cluster.kind !== "process_implementation") return cluster.passages[0];
  return cluster.passages.find((passage) =>
    /\b(?:assess(?:ment)?|readiness|proof of concept|pocs?|roadmap|implement|deploy|integrat|governance|workflow|lifecycle)\b/i.test(passage),
  ) ?? cluster.passages[0];
}

/** Conservative lexical guard: reject a generic summary when it ignores available focus evidence. */
export function hasQuestionFocusCoverage(answer: string, evidence: GroundedEvidencePackage): boolean {
  if (["overview", "relationship"].includes(evidence.questionFocus)) return true;
  const focusPassages = questionFocusEvidence(evidence);
  if (!focusPassages.length) return true;
  const subjectTerms = new Set(normalizeSearchText(evidence.resolvedSubject.canonicalName).split(" "));
  const meaningful = (term: string) => term.length >= 5 && !COVERAGE_STOPWORDS.has(term) && !subjectTerms.has(term);
  const answerTerms = new Set(normalizeSearchText(answer).split(" ").filter(meaningful));
  const evidenceTerms = [...new Set(normalizeSearchText(focusPassages.join(" ")).split(" ").filter(meaningful))];
  const requiredOverlap = evidenceTerms.length >= 8 ? 2 : 1;
  return evidenceTerms.filter((term) => answerTerms.has(term)).length >= requiredOverlap;
}
