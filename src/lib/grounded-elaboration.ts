import { normalizeSearchText } from "./search-index";
import type { QueryUnderstanding } from "./query-understanding";
import type { SearchMatch } from "./search-retriever";
import { compositionEvidence, supportsEvidenceDrivenDepth } from "./response-alignment";
import { factualDocumentEvidence } from "./search-index";

export type ElaborationReason =
  | "ELABORATED_SECOND_ASPECT_AVAILABLE"
  | "SKIPPED_QUERY_TYPE"
  | "SKIPPED_ALREADY_SUFFICIENT_MULTI_ASPECT"
  | "SKIPPED_NO_DISTINCT_SECOND_ASPECT";

export interface GroundedElaborationPlan {
  eligible: boolean;
  reason: ElaborationReason;
  subject: string;
  primaryEvidence: string[];
  additionalEvidence: string[];
}

const EXCLUDED_REQUESTED_TYPES = new Set([
  "blog", "resource", "whitepaper", "ebook", "case-study", "webinar", "event",
  "press-release", "media-coverage", "news", "career", "leadership", "company",
]);

function meaningfulSentences(answer: string): string[] {
  return answer
    .replace(/^#{1,3}\s+.*$/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => normalizeSearchText(sentence).split(" ").filter(Boolean).length >= 6);
}

function isDistinctFrom(answer: string, evidence: string): boolean {
  const answerTerms = new Set(normalizeSearchText(answer).split(" ").filter((term) => term.length >= 5));
  const evidenceTerms = [...new Set(normalizeSearchText(evidence).split(" ").filter((term) => term.length >= 5))];
  if (evidenceTerms.length < 4) return false;
  return evidenceTerms.filter((term) => answerTerms.has(term)).length / evidenceTerms.length < 0.72;
}

const SECOND_ASPECT_TERMS = /\b(?:assess(?:ment)?|readiness|proof of concept|poc|roadmap|implement(?:ation|ing)?|deploy(?:ment|ing)?|integrat(?:e|ion|ing)|governance|governed|security|secure|risk|compliance|privacy|bias|automation|developer enablement|methodology|workflow|use cases?|architecture|supported technolog(?:y|ies)|migration|moderniz(?:e|ation)|manage(?:ment|d)|capabilit(?:y|ies)|features?|functionality|delivery model|differentiator|industry-specific|outcomes?)\b/i;

function evidenceSentences(evidence: string[]): string[] {
  const seen = new Set<string>();
  return evidence
    .flatMap((item) => item.split(/(?<=[.!?])\s+|\n+/))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => normalizeSearchText(item).split(" ").filter(Boolean).length >= 6)
    .filter((item) => {
      const key = normalizeSearchText(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function hasDistinctSemanticCoverage(answer: string, subject = ""): boolean {
  const subjectPattern = subject.trim()
    ? new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig")
    : undefined;
  const sentences = meaningfulSentences(subjectPattern ? answer.replace(subjectPattern, "") : answer);
  const secondary = sentences.filter((sentence) => SECOND_ASPECT_TERMS.test(sentence));
  return secondary.some((sentence) =>
    sentences.some((other) => other !== sentence && isDistinctFrom(sentence, other)));
}

/** Whether a composed answer retained the distinct second aspect required by an eligible plan. */
export function hasGroundedElaborationSecondAspect(answer: string, plan: GroundedElaborationPlan): boolean {
  return plan.eligible && hasDistinctSemanticCoverage(answer, plan.subject);
}

/**
 * Decides whether the existing grounded LLM composition call may add depth.
 * It is intentionally based on subject-aligned evidence and semantic coverage,
 * never a response-length threshold.
 */
export function planGroundedElaboration(args: {
  answer: string;
  primary: SearchMatch | undefined;
  understanding: QueryUnderstanding;
}): GroundedElaborationPlan {
  const { answer, primary, understanding } = args;
  const subject = understanding.entities[0] ?? understanding.topics.join(" ") ?? primary?.document.title ?? "";
  if (!primary || EXCLUDED_REQUESTED_TYPES.has(understanding.requestedContentType ?? "") ||
      ["list", "recommend"].includes(understanding.answerMode) || !supportsEvidenceDrivenDepth(primary, understanding)) {
    return { eligible: false, reason: "SKIPPED_QUERY_TYPE", subject, primaryEvidence: [], additionalEvidence: [] };
  }
  if (understanding.targetScope === "company" || /^(?:who|where)\b/.test(understanding.normalizedQuery)) {
    return { eligible: false, reason: "SKIPPED_QUERY_TYPE", subject, primaryEvidence: [], additionalEvidence: [] };
  }
  const embeddedEntity = Boolean(primary.localEvidence) ||
    primary.matchedFields.includes("embedded-structural-parent") ||
    primary.matchedFields.includes("exact-embedded-entity");
  // Embedded entities are bounded to their selected local section. Canonical
  // records may additionally use their own structured content and FAQs; no
  // cross-record evidence is ever considered here.
  const canonicalEvidence = primary.localEvidence?.passages ?? (embeddedEntity
    ? primary.selectedPassages
    : [
      ...compositionEvidence(primary, 8, understanding),
      ...factualDocumentEvidence(primary.document),
      ...primary.document.faqItems.flatMap((item) => [item.question, item.answer]),
    ]);
  const evidence = evidenceSentences(canonicalEvidence)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 30)
    .slice(0, 12);
  const primaryEvidence = meaningfulSentences(answer).slice(0, 3);
  if (hasDistinctSemanticCoverage(answer, subject)) {
    return { eligible: false, reason: "SKIPPED_ALREADY_SUFFICIENT_MULTI_ASPECT", subject, primaryEvidence, additionalEvidence: [] };
  }
  const additionalEvidence = evidence.filter((item) => SECOND_ASPECT_TERMS.test(item) && isDistinctFrom(answer, item));
  if (!primaryEvidence.length || !additionalEvidence.length) {
    return { eligible: false, reason: "SKIPPED_NO_DISTINCT_SECOND_ASPECT", subject, primaryEvidence, additionalEvidence: [] };
  }
  return { eligible: true, reason: "ELABORATED_SECOND_ASPECT_AVAILABLE", subject, primaryEvidence, additionalEvidence: additionalEvidence.slice(0, 3) };
}

/** Guards an eligible composition result before it can replace deterministic evidence. */
export function isSafeGroundedElaboration(answer: string, plan: GroundedElaborationPlan, allowedUrls: string[]): boolean {
  if (!plan.eligible || !answer.trim() || !normalizeSearchText(answer).includes(normalizeSearchText(plan.subject))) return false;
  if (/\b(?:contact us|pricing|quote|quotation|guarantee|timeline)\b/i.test(answer)) return false;
  const urls = [...answer.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]);
  return urls.every((url) => allowedUrls.includes(url));
}
