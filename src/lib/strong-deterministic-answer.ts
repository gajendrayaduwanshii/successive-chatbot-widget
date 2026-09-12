import { factualDocumentEvidence, normalizeSearchText } from "./search-index";
import type { GroundedEvidencePackage } from "./grounded-evidence-package";
import type { QueryUnderstanding } from "./query-understanding";
import type { SearchMatch } from "./search-retriever";

type Focus = GroundedEvidencePackage["questionFocus"];
const focusPatterns: Partial<Record<Focus, RegExp>> = {
  process: /\b(?:steps?|assess|configure|install|integrat\w*|deploy\w*|workflow|pipeline|transform\w*|process\w*)\b/i,
  capabilities: /\b(?:supports?|provides?|enables?|offers?|include[sd]?|features?|capabilities|usps?|used for)\b/i,
  use_cases: /\b(?:used (?:for|to)|supports?|enables?|applications?|use cases?)\b/i,
  benefits: /\b(?:reduces?|improves?|increases?|saves?|helps?|benefits?|efficiency)\b/i,
  technology: /\b(?:platform|technology|technologies|integrat\w*|built|powered)\b/i,
};
const verb = /\b(?:is|are|was|were|has|have|provides?|supports?|enables?|offers?|includes?|brings?|helps?|uses?|allows?|reduces?|improves?|requires?|combines?|collects?|transforms?|loads?)\b/i;
const artifacts = /[<>“”"]|\[|\]|…|\.{3}|\betc\.|\b(?:download|subscribe|contact us|get in touch|click here|learn more|read more|you will learn|thanks to|exciting|excellent|best-in-class)\b/i;
const temporal = /\b(?:soon|currently|now|today|next year|last year|will|roll(?:ing)? out|rollout|back in \d{4})\b/i;
const dependent = /^(?:it|they|this|these|those|the service|the company|also|however)\b/i;
const complex = /\b(?:compare|comparison|versus|vs|recommend|should|best for|better than|why|whether)\b/i;

/** Source-only presentation: no fetches, model knowledge, or new retrieval. */
export function buildStrongDeterministicAnswer(args: {
  primary: SearchMatch | undefined;
  evidence: GroundedEvidencePackage | undefined;
  understanding: QueryUnderstanding;
  standalone: boolean;
  singleSource: boolean;
}): { answer?: string; points: string[]; facets: string[]; reason: string } {
  const { primary, evidence, understanding } = args;
  const fail = (reason: string) => ({ points: [] as string[], facets: [] as string[], reason });
  if (!primary || !evidence || !args.standalone || !args.singleSource ||
    understanding.isFollowUp || understanding.needsClarification || understanding.containsPremise ||
    understanding.temporalIntent || understanding.answerMode === "recommend" || understanding.answerMode === "list" ||
    complex.test(evidence.userQuery) || !["informational", "explore", "discovery", "solve_problem"].includes(understanding.intent))
    return fail("complex-or-contextual");
  // A bare canonical title can contain problem vocabulary. Actual problem
  // statements still require the existing reasoning path.
  if (understanding.intent === "solve_problem" &&
    normalizeSearchText(evidence.userQuery) !== normalizeSearchText(primary.document.title))
    return fail("problem-reasoning");
  if (primary.confidence !== "high" || !primary.matchedFields.some(field =>
    /^(?:exact-title-lock|normalized-exact-title|exact-entity-authority|canonical-page-identity|strong-equivalent-canonical-subject)$/.test(field)))
    return fail("canonical-confidence");
  const url = evidence.validatedLinks.canonical;
  if (!url || !/^https:\/\/[^\s)]+$/.test(url) || evidence.questionFocus === "relationship") return fail("source-or-focus");
  // A local match may be a nested unit on a larger page. Never borrow its
  // parent's unrelated body. A matching document title AND URL proves that
  // the existing record itself is the selected unit.
  const ownsRecord = !primary.localEvidence ||
    (primary.localEvidence.url?.replace(/\/$/, "") === primary.document.url.replace(/\/$/, "") &&
      normalizeSearchText(primary.localEvidence.heading ?? "") === normalizeSearchText(primary.document.title));
  const values = ownsRecord ? factualDocumentEvidence(primary.document) : primary.localEvidence?.passages ?? primary.selectedPassages;
  const subject = new Set(normalizeSearchText(primary.document.title).split(" ").filter(t => t.length >= 3));
  const relevant = (text: string) => normalizeSearchText(text).split(" ").some(t => subject.has(t));
  const selected: string[] = [];
  const add = (text: string) => {
    const terms = new Set(normalizeSearchText(text).split(" ").filter(t => t.length > 3));
    if (selected.some(existing => {
      const prior = new Set(normalizeSearchText(existing).split(" ").filter(t => t.length > 3));
      return [...terms].filter(t => prior.has(t)).length / Math.max(1, Math.min(terms.size, prior.size)) >= 0.72;
    })) return;
    if (selected.join(" ").length + text.length <= 1600 && selected.length < 6) selected.push(text);
  };
  // Learning topics are not facts about implementation. Present them as
  // published topic coverage, only for an overview, never as process steps.
  if (evidence.questionFocus === "overview" && understanding.answerMode !== "define") {
    const learning = values.flatMap(value => {
      const section = value.split(/\byou will learn\s*:/i)[1];
      if (!section || !relevant(value)) return [];
      return (section.match(/\bHow to [^?.!]+\?/gi) ?? [])
        .map(text => text.replace(/\?$/, "").replace(/^How/, "how").trim())
        .filter(text => text.split(/\s+/).length >= 6 && !artifacts.test(text));
    });
    learning.forEach(add);
    if (selected.length >= 2) return {
      answer: `## [${primary.document.title.replace(/[\[\]]/g, "")}](${url})\n\nThe published description covers ${selected.join(" and ")}.`,
      points: selected, facets: selected.map(() => "published learning topic"), reason: "grounded-topic-coverage",
    };
    selected.length = 0;
  }
  const pattern = focusPatterns[evidence.questionFocus];
  const candidates = values.flatMap(value => {
    const parts = value.replace(/[\u200b-\u200d\ufeff]/g, "").split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/\s+/g, " ").trim());
    return parts.map((text, index) => ({ text, index, parts }));
  }).filter(({ text }) => text.length >= 45 && text.length <= 420 && /[.!]$/.test(text) &&
    !text.includes("?") && !/^(?:steps to|how to|you are|you can|other .*elements)\b/i.test(text) && !artifacts.test(text) && !temporal.test(text) && verb.test(text) &&
    (!pattern || pattern.test(text)));
  // Prefer an independently understandable opening; then use only sentences
  // whose own subject, or immediately preceding selected sentence, anchors it.
  candidates.sort((a, b) => Number(dependent.test(a.text)) - Number(dependent.test(b.text)));
  for (const { text, index, parts } of candidates) {
    const anchored = !dependent.test(text) && relevant(text);
    const followsSelected = index > 0 && selected.includes(parts[index - 1]!);
    if (!anchored && !followsSelected) continue;
    add(text);
  }
  if (selected.length < 2 || selected.join(" ").length < 180) return { points: selected, facets: selected.map(() => evidence.questionFocus), reason: "insufficient-substantive-evidence" };
  // Definition openings must actually define the subject rather than merely
  // enumerate features. Other focused openings already passed the facet verb.
  if (understanding.answerMode === "define" && !/\b(?:is|are|refers to|provides?)\b/i.test(selected[0]!))
    return { points: selected, facets: selected.map(() => evidence.questionFocus), reason: "definition-coverage" };
  const paragraphs = [selected[0]!, ...Array.from({ length: Math.ceil((selected.length - 1) / 3) }, (_, i) => selected.slice(1 + i * 3, 4 + i * 3).join(" "))];
  return {
    answer: `## [${primary.document.title.replace(/[\[\]]/g, "")}](${url})\n\n${paragraphs.join("\n\n")}`,
    points: selected, facets: selected.map(() => evidence.questionFocus), reason: "grounded-complete-sentences",
  };
}
