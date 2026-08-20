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
  return /\b(?:what|which|who|where|how|does|do|is|are|can|could|show|find|give|tell|explain|summarize|any|latest|newest|case stud(?:y|ies)|customer example|article|blog|news|service|partner)\b/i.test(clause);
}

export function extractQueryFacets(message: string): QueryFacet[] {
  const normalized = message.replace(/\s+/g, " ").trim();
  const clauses = normalized
    .split(/\s*(?:[?;]+|,\s+(?=(?:(?:and|also)\s+)?(?:do|does|can|could|is|are|show|find|give|tell|any|what|which|who|where|how|latest|newest)\b)|\s+and\s+(?=(?:do|does|can|could|is|are|show|find|give|tell|any|what|which|who|where|how|latest|newest)\b))\s*/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= 2 && isFacetClause(clause));
  const candidates = clauses.length >= 2 ? clauses : [normalized];
  return candidates.slice(0, 4).map((text, index) => ({
    id: `facet-${index + 1}`,
    text,
    relation: inferQueryRelation(text),
    understanding: buildDeterministicUnderstanding(text),
  }));
}

export function isMultiIntentQuery(message: string): boolean {
  return extractQueryFacets(message).length > 1;
}
