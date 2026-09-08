import { normalizeSearchText } from "./search-index";
import {
  buildDeterministicUnderstanding,
  type QueryUnderstanding,
} from "./query-understanding";

export type QueryRelation =
  | "DEFINES" | "OFFERS" | "USES" | "SUPPORTS" | "PARTNER_OF"
  | "HAS_OFFICE_IN" | "HAS_PRODUCT" | "SERVES_INDUSTRY"
  | "HAS_CASE_STUDY" | "HAS_ARTICLE" | "SECURES" | "MODERNIZES"
  | "AUTOMATES" | "INTEGRATES" | "CONSULTS_ON" | "DESCRIBES";

export interface QueryFacet {
  id: string;
  text: string;
  relation: QueryRelation;
  understanding: QueryUnderstanding;
  subject: string | null;
  requestedContentType: QueryUnderstanding["requestedContentType"];
  dependent: boolean;
}

const RELATION_OBJECT = /^(?:(?:then|also)\s+)?(?:give|show|find|tell|explore|provide|share)(?:\s+me)?\s+(?:(?:an?|the)\s+)?(?:example|related|relevant|matching|associated|case stud(?:y|ies)|articles?|resources?|pages?|use cases?)\b/i;

export function isDependentRelationClause(text: string): boolean {
  const q = normalizeSearchText(text);
  return RELATION_OBJECT.test(q) ||
    /\b(?:related|relevant|matching|associated)\s+(?:services?|case stud(?:y|ies)|articles?|resources?|pages?|use cases?)\b/.test(q) ||
    /^(?:give|show|find|tell)(?: me)? (?:an? )?example$/.test(q);
}

function explicitFacetSubject(text: string, understanding: QueryUnderstanding): string | null {
  const wrapped = normalizeSearchText(text).match(
    /^(?:(?:then|also)\s+)?(?:tell|show|explain|describe)(?: me)?(?: more)? (?:about|of) (.+)$/,
  )?.[1]?.replace(/^(?:your|the)\s+/, "").trim();
  if (wrapped && !isDependentRelationClause(text)) return wrapped;
  const semantic = [...understanding.entities, ...understanding.topics].join(" ").trim();
  return semantic || null;
}

export function inferQueryRelation(message: string): QueryRelation {
  const q = normalizeSearchText(message);
  if (/\b(?:partner|partnership|alliance|allied)\b/.test(q)) return "PARTNER_OF";
  if (/\b(?:office|headquarters|hq|address|located|location)\b/.test(q)) return "HAS_OFFICE_IN";
  if (/\b(?:case study|case studies|customer story|customer example|client example)\b/.test(q)) return "HAS_CASE_STUDY";
  if (/\b(?:blog|article|whitepaper|ebook|resource|news|press release|media coverage)\b/.test(q)) return "HAS_ARTICLE";
  if (/\b(?:product|kagen|platform)\b/.test(q)) return "HAS_PRODUCT";
  if (/\b(?:industry|industries|sector|serve)\b/.test(q)) return "SERVES_INDUSTRY";
  if (/\b(?:secure|security|devsecops|sdlc|vulnerab|compliance)\b/.test(q)) return "SECURES";
  if (/\b(?:modernize|modernise|modernization|modernisation|legacy|monolith)\b/.test(q)) return "MODERNIZES";
  if (/\b(?:automate|automation|manual workflow|repetitive)\b/.test(q)) return "AUTOMATES";
  if (/\b(?:integrate|integration|api)\b/.test(q)) return "INTEGRATES";
  if (/\b(?:consult|consulting|consultancy|advisory)\b/.test(q)) return "CONSULTS_ON";
  if (/^(?:what|who)\s+(?:is|are)\b/.test(q)) return "DEFINES";
  if (/\b(?:use|uses|using|work with)\b/.test(q)) return "USES";
  if (/\b(?:offer|provide|service|capability)\b/.test(q)) return "OFFERS";
  if (/\b(?:support|help|can you|can successive)\b/.test(q)) return "SUPPORTS";
  return "DESCRIBES";
}

function isFacetClause(clause: string): boolean {
  return /\b(?:what|which|who(?:'s|s)?|where|how|does|do|is|are|can|could|show|find|give|tell|explain|summarize|any|latest|newest|case stud(?:y|ies)|customer example|article|blog|news|service|partner|cost|pricing|price)\b/i.test(clause);
}

export function extractQueryFacets(message: string): QueryFacet[] {
  const normalized = message.replace(/\s+/g, " ").trim();
  const clauses = normalized
    .split(/\s*(?:[?;]+|[.!]\s+(?=(?:(?:then|also)\s+)?(?:do|does|can|could|is|are|show|find|give|tell|explain|describe|list|any|what|which|who|where|how|latest|newest)\b)|,\s+(?=(?:(?:and|also|then)\s+)?(?:do|does|can|could|is|are|show|find|give|tell|any|what|which|who|where|how|latest|newest)\b)|\s+and\s+(?=(?:(?:(?:then|also)\s+)?(?:do|does|can|could|is|are|show|find|give|tell|any|what|which|who|where|how|latest|newest)\b|(?:show\s+)?(?:a\s+)?(?:relevant|related)\s+(?:case stud(?:y|ies)|resources?|articles?)|(?:project\s+)?(?:cost|pricing|price)\b|(?:cost|pricing|price)\s+of\b)))\s*/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= 2 && isFacetClause(clause));
  const candidates = clauses.length >= 2 ? clauses : [normalized];
  let activeSubject: string | null = null;
  return candidates.slice(0, 4).map((text, index) => {
    const parsed = buildDeterministicUnderstanding(text);
    const dependent = isDependentRelationClause(text);
    const explicitSubject = dependent ? null : explicitFacetSubject(text, parsed);
    const subject = explicitSubject ?? (dependent ? activeSubject : null);
    if (explicitSubject) activeSubject = explicitSubject;
    const subjectTopics = subject ? normalizeSearchText(subject).split(" ")
      .filter((token) => !/^(?:service|services|capability|capabilities|case|study|studies|article|articles|page|pages)$/.test(token)) : [];
    const understanding = dependent && subjectTopics.length ? {
      ...parsed,
      topics: subjectTopics,
      entities: [],
      retrievalConcepts: subjectTopics,
      targetScope: "topic" as const,
    } : parsed;
    return { id: `facet-${index + 1}`, text, relation: inferQueryRelation(text), understanding,
      subject, requestedContentType: parsed.requestedContentType, dependent };
  });
}

export function isMultiIntentQuery(message: string): boolean {
  return extractQueryFacets(message).length > 1;
}
