import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchAllPublishedContent,
} from "./successive-api";
import { detectIntent, type Intent } from "./intent-detector";
import { contentIdentity } from "./conversation-context";
import {
  buildSearchIndex,
  isServiceFamilySchemaType,
  normalizeSearchText,
  normalizeServiceSchemaType,
  servicePortfolioTaxonomyType,
  type SuccessiveSearchChunk,
  type SuccessiveSearchDocument,
} from "./search-index";
import type { QueryUnderstanding } from "./query-understanding";
import { buildRetrievalQuery } from "./query-understanding";

const STOPWORDS = new Set([
  "do",
  "i",
  "am",
  "you",
  "know",
  "about",
  "tell",
  "me",
  "can",
  "explain",
  "please",
  "show",
  "what",
  "is",
  "the",
  "a",
  "an",
  "how",
  "does",
  "of",
  "to",
  "and",
  "or",
  "in",
  "on",
  "for",
  "with",
  "this",
  "that",
  "option",
  "options",
  "which",
  "serve",
  "serves",
  "latest",
  "recent",
  "blog",
  "blogs",
  "article",
  "articles",
  "planning",
  "program",
  "programme",
  "offer",
  "offers",
  "find",
  "more",
]);

// Lightweight synonym expansion gives paraphrases semantic-style recall
// without introducing a vector database or any external retrieval service.
const SYNONYM_GROUPS = [
  ["voice", "speech", "conversation", "call"],
  ["accurate", "accuracy", "reliable", "correct"],
  ["vendor", "provider", "platform", "solution"],
  ["complex", "difficult", "challenging"],
  ["automate", "automation", "automated"],
  ["document", "content", "knowledge"],
  ["customer", "client", "consumer"],
  ["secure", "security", "protected"],
  ["event", "events", "webinar", "webinars"],
  ["location", "locations", "office", "offices", "address"],
  ["modernization", "modernisation", "migration", "transformation"],
  ["chatbot", "chatbots", "conversational ai", "virtual assistant", "ai assistant"],
  ["crm", "customer relationship management", "salesforce"],
  ["devsecops", "secure delivery", "secure sdlc", "shift left", "ci cd security", "application security", "security automation", "iac security"],
  ["finops", "cloud cost optimization", "cloud cost visibility", "spend governance", "cloud economics"],
  ["cms", "headless cms", "content management", "content platform", "content publishing", "content operations"],
  ["application modernization", "legacy modernization", "monolith modernization", "technical debt"],
  ["cloud migration", "workload migration", "minimal downtime", "migration modernization"],
  ["api engineering", "api management", "api governance", "integration architecture"],
  ["workflow automation", "intelligent automation", "manual process automation"],
];
const INDEX_CACHE_MS = 60 * 60 * 1000;
const PERSISTED_INDEX_PATH = path.join(process.cwd(), ".next", "cache", "successive-search-index.json");
let cachedIndex:
  { expiresAt: number; documents: SuccessiveSearchDocument[] } | undefined;
let indexBuildPromise: Promise<SuccessiveSearchDocument[]> | undefined;
let lastIndexDiagnostics = { cache: "miss" as "hit" | "miss" | "shared", durationMs: 0, documents: 0 };

async function readPersistedIndex(): Promise<SuccessiveSearchDocument[] | undefined> {
  if (process.env.NODE_ENV === "test") return undefined;
  try {
    const parsed = JSON.parse(await readFile(PERSISTED_INDEX_PATH, "utf8")) as {
      loadedAt?: number;
      documents?: SuccessiveSearchDocument[];
    };
    if (!parsed.loadedAt || !Array.isArray(parsed.documents) ||
        Date.now() - parsed.loadedAt >= INDEX_CACHE_MS)
      return undefined;
    return parsed.documents;
  } catch {
    return undefined;
  }
}

async function persistIndex(documents: SuccessiveSearchDocument[]): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    await mkdir(path.dirname(PERSISTED_INDEX_PATH), { recursive: true });
    await writeFile(PERSISTED_INDEX_PATH, JSON.stringify({ loadedAt: Date.now(), documents }));
  } catch {
    // A read-only deployment can still use the in-memory index safely.
  }
}

export function getIndexDiagnostics() {
  return { ...lastIndexDiagnostics };
}

export interface SearchMatch {
  document: SuccessiveSearchDocument;
  score: number;
  matchedFields: string[];
  selectedPassages: string[];
  /**
   * A bounded unit recovered from a repeated/embedded structured record.
   * This is deliberately carried separately from the source document: the
   * source may be an aggregate page, while the answer subject is one card.
   */
  localEvidence?: { groupPath: string; passages: string[]; heading?: string; url?: string };
  scoreBreakdown?: {
    title: number;
    headings: number;
    metadata: number;
    body: number;
    contentType: number;
    penalties: number;
    authorityCoverage: number;
    topic?: number;
    problem?: number;
    outcome?: number;
    industry?: number;
    entity?: number;
    functional?: number;
    bridge?: number;
    constraintsSatisfied?: number;
    constraintsTotal?: number;
    contradictions?: number;
  };
  rejectionReason?: string;
  confidence?: "high" | "medium" | "low";
}

export interface RetrievalResult {
  normalizedQuery: string;
  indexedDocuments: number;
  reliableMatchFound: boolean;
  matches: SearchMatch[];
  isProductList: boolean;
  collectionTotal?: number;
  collectionLabel?: string;
  candidates?: SearchMatch[];
  timings?: { indexLoadMs: number; relationshipScoringMs: number; rankingMs: number };
}

function requestedRoleRepresentationTier(
  match: SearchMatch,
  requested: QueryUnderstanding["requestedContentType"],
): number {
  if (!requested) return 1;
  const role = match.document.role;
  const direct = requested === "product" || requested === "kagen-product"
    ? role === "product"
    : requested === "service" || requested === "sub-service" || requested === "expertise" || requested === "solution"
      ? role === "service" || role === "global_capabilities" || role === "technology"
      : requested === "case-study"
        ? role === "case_study"
        : requested === "blog"
          ? role === "blog"
          : requested === "partner"
            ? role === "partner"
            : requested === "industry"
              ? role === "industry"
              : requested === "accelerator"
                ? role === "accelerator"
                : isRequestedContentTypeCompatible(match.document, requested);
  if (direct) return 4;
  if (match.matchedFields.includes("exact-embedded-entity")) return 3;
  if (isRequestedContentTypeCompatible(match.document, requested)) return 2;
  return 0;
}

/** Shared candidate source for plural and singular "other" requests. */
export function selectSiblingEntityMatches(args: {
  candidates: SearchMatch[];
  understanding: QueryUnderstanding;
  previouslyPresented: string;
  limit?: number;
}): SearchMatch[] {
  const requested = args.understanding.requestedContentType;
  const seen = args.previouslyPresented.toLowerCase();
  const unique = new Set<string>();
  return args.candidates
    .filter((match) => match.score >= 48 && match.selectedPassages.length > 0)
    .filter((match) => !match.matchedFields.some((field) => /entity-mismatch|incidental-body-only/.test(field)))
    .filter((match) => requestedRoleRepresentationTier(match, requested) > 0)
    .filter(({ document }) =>
      !seen.includes(document.url.toLowerCase()) &&
      !seen.includes(document.title.toLowerCase()),
    )
    .map((match) => {
      if (!['product', 'kagen-product'].includes(requested ?? '')) return match;
      const descriptive = [...match.document.chunks.map(({ text }) => text), ...match.selectedPassages]
        .flatMap((passage) => [
          ...(passage.match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)+\s+is\s+[^.\n]{0,220}\b(?:product|platform|solution|tool)\b[^.\n]*\./g) ?? []),
          ...passage.split(/(?<=[.!?])\s+/),
        ])
        .filter((sentence) =>
          /\b(?:is|are)\s+(?:an?\s+)?[^.!?]{0,100}\b(?:product|platform|solution|tool)\b/i.test(sentence) ||
          /\b(?:product|platform|solution|tool)\b.{0,100}\b(?:helps?|enables?|automates?|supports?)\b/i.test(sentence),
        );
      if (!descriptive.length) return match;
      return {
        ...match,
        selectedPassages: descriptive.slice(0, 3),
      };
    })
    .sort((left, right) =>
      requestedRoleRepresentationTier(right, requested) - requestedRoleRepresentationTier(left, requested) ||
      right.score - left.score ||
      right.document.contentQuality - left.document.contentQuality,
    )
    .filter(({ document }) => {
      const identity = `${document.role}:${document.normalizedTitle}`;
      if (unique.has(identity)) return false;
      unique.add(identity);
      return true;
    })
    .slice(0, args.limit ?? 8);
}

export function requestedCollection(
  query: string,
):
  | { label: string; matches: (document: SuccessiveSearchDocument) => boolean }
  | undefined {
  const q = normalizeSearchText(query);
  const requestsFullCollection = /\b(?:total|all|list|count|how many)\b/.test(q) ||
    /^(?:what|which)\s+(?:\w+\s+){0,2}(?:products?|accelerators?|awards?|recognitions?)\s+(?:are\s+)?available$/.test(q) ||
    /^(?:show|give|provide)(?:\s+me)?\s+(?:the\s+)?available\s+(?:products?|accelerators?|awards?|recognitions?)$/.test(q) ||
    /^(?:what|which)\s+(?:awards?|recognitions?)\s+(?:has|have|did)\b.*\b(?:receive|received|win|won|earn|earned)$/.test(q);
  const requestsNextPage =
    /\b(?:more|another|other|others|different|next)\b/.test(q);
  if (!requestsFullCollection && !requestsNextPage) return undefined;
  if (/\b(?:webinar|webinars|event|events)\b/.test(q))
    return {
      label: "webinars and events",
      matches: (document) =>
        /\b(?:webinars?|events?)\b/.test(
          `${document.normalizedTitle} ${document.slug.replace(/-/g, " ")}`,
        ),
    };
  if (/\bcase stud(?:y|ies)\b/.test(q))
    return {
      label: "case studies",
      matches: (document) => document.type.includes("case"),
    };
  if (/\b(?:blog|blogs|articles|insights)\b/.test(q))
    return {
      label: "blogs and insights",
      matches: (document) => document.type === "post",
    };
  if (/\b(?:industry|industries)\b/.test(q))
    return {
      label: "industries",
      matches: (document) => document.type === "industries",
    };
  if (/\baccelerators?\b/.test(q))
    return {
      label: "accelerators",
      matches: (document) => document.type === "accelerators",
    };
  if (/\bproducts?\b/.test(q))
    return {
      label: "products",
      matches: (document) => document.role === "product" || document.productLike,
    };
  if (/\b(?:press releases?|media coverage|newsroom)\b/.test(q))
    return {
      label: "PR and media coverage",
      matches: (document) =>
        ["press-release", "media-coverage"].includes(document.type),
    };
  if (/\b(?:career|careers|jobs)\b/.test(q))
    return {
      label: "career pages",
      matches: (document) => document.type === "careers",
    };
  if (/\b(?:partners|alliances)\b/.test(q))
    return {
      label: "partners and alliances",
      matches: (document) => document.type === "partners",
    };
  if (/\b(?:awards|recognitions)\b/.test(q))
    return {
      label: "awards and recognitions",
      matches: (document) => document.type === "award" || document.role === "awards",
    };
  if (/\b(?:thought leadership|thought-leadership)\b/.test(q))
    return {
      label: "thought leadership",
      matches: (document) => document.type === "thought-leadership",
    };
  if (/\b(?:employee perspective|employee perspectives)\b/.test(q))
    return {
      label: "employee perspectives",
      matches: (document) => document.type === "employee-perspective",
    };
  if (/\b(?:expert|experts|expertise)\b/.test(q))
    return {
      label: "expertise pages",
      matches: (document) =>
        servicePortfolioTaxonomyType(document.service_type) === "expertise",
    };
  if (/\b(?:pillar|pillars|piller|pillers)\b/.test(q))
    return {
      label: "service pillars",
      matches: (document) =>
        servicePortfolioTaxonomyType(document.service_type) === "pillar",
    };
  // A paginated service request can carry a topic from prior turns (for
  // example, "AI services" -> "more services"), so keep it in semantic
  // retrieval. Explicit all/list/count requests still enumerate all services.
  if (requestsFullCollection && /\bservices?\b/.test(q))
    return {
      label: "services",
      matches: (document) =>
        servicePortfolioTaxonomyType(document.service_type) === "service",
    };
  return undefined;
}

function isWhitepaperDocument(document: SuccessiveSearchDocument): boolean {
  if (document.type !== "page" || document.slug === "whitepaper-listing")
    return false;
  return (
    document.combinedText.includes("download this whitepaper") ||
    /(?:white-?paper|ebook)/.test(document.slug) ||
    /^(?:gen ai implementation guide for banking|create an experience led growth strategy to win customers)$/.test(
      document.normalizedTitle,
    )
  );
}

export function extractExplicitInformationalSubject(query: string): string | undefined {
  const normalized = normalizeSearchText(query)
    .replace(/^switch (?:topics?|subject)\s+/, "");
  const wrapped = [
    /^(?:please|pls)\s+tell(?: me)?\s+(?:about|abt)\s+(.+)$/,
    /^(?:can|could|would)\s+you\s+tell\s+me\s+about\s+(.+)$/,
    /^what\s+about\s+(.+)$/,
    /^(?:show(?: me)?|find|give me|list|do you have)\s+(?:the\s+)?(?:related\s+)?(?:blogs?|articles?|posts?|resources?|guides?|case studies|reports?|white ?papers?|e-?books?)\s+(?:related to|about|on|for)\s+(.+)$/,
    // A leading factual/commercial predicate qualifies the following subject;
    // it is not part of the entity identity. This is a bounded query shape,
    // not global adjective removal.
    /^(?:free|paid|pricing|price|cost|trial|subscription|included|available|certified|partnered|supported|guaranteed|unlimited)\s+(.+)$/,
    /^(?:is|are)\s+(.+?)\s+(?:free|paid|included|available|certified|partnered|supported|guaranteed|unlimited)$/,
    /^(?:explain|describe|show me)\s+(?:the\s+)?(.+)$/,
    /^(?:summarize|summarise|give me a summary of)\s+(?:the\s+)?(?:blog|article|post)?\s*(.+)$/,
    /^(?:tell me (?:more )?about|do you have information about)\s+(.+)$/,
    // Keep the wrapper suffix structural. An optional suffix can otherwise be
    // skipped and become part of the captured entity.
    /^what\s+(?:is|are)\s+(?:the\s+)?(.+)\s+used for$/,
    /^what\s+does\s+(.+)\s+(?:do|discuss|cover)$/,
    /^what\s+(?:capabilities|features?)\s+(?:are|is)\s+(?:included|available|offered)\s+(?:in|with|for)\s+(.+)$/,
    /^what\s+(.+?\s+(?:services?|capabilities|solutions?|products?))\s+does\s+.+\s+(?:provide|offer)$/,
    /^how\s+does\s+(.+)\s+work$/,
    /^what\s+(?:is|are)\s+(?:the\s+)?(.+)$/,
  ].map((pattern) => normalized.match(pattern)?.[1]?.trim()).find(Boolean);
  const bare = !wrapped && normalized.split(" ").length <= 10 &&
    !/^(?:what|which|who|where|when|why|how|can|could|would|should|do|does|did|is|are|show|find|list|give|please)\b/.test(normalized)
    ? normalized : undefined;
  const subject = (wrapped ?? bare)
    ?.replace(/^\s*(?:your|our|the)\s+/, "")
    ?.replace(/^\s*(?:the\s+)?(?:blog|article|post)\s+/, "")
    .replace(/\s+(?:address|addresses)$/, "")
    .trim();
  return subject || undefined;
}

/** Removes grammar which must not make a short technical subject look specific. */
export function semanticInformationalSubject(subject: string): string {
  return normalizeSearchText(subject)
    .replace(/^(?:a|an|the)\s+/, "")
    .trim();
}

export function isShortSemanticSubject(subject: string): boolean {
  const semantic = semanticInformationalSubject(subject);
  return semantic.split(" ").filter(Boolean).length === 1 && semantic.length >= 2 && semantic.length <= 4;
}

export function isDirectDefinitionQuery(message: string): boolean {
  return /^(?:what\s+(?:is|are)|define|explain|what\s+does\s+.+\s+mean)\b/i.test(message.trim());
}

export function isCompactDefinitionSubject(subject: string): boolean {
  const terms = semanticInformationalSubject(subject).split(" ").filter(Boolean);
  return terms.length <= 2 && terms.join("").length <= 12;
}

/**
 * Identity is not definition evidence. A direct-definition response may only
 * compose a subject-focused explanatory sentence from the selected record.
 */
export function definitionEvidencePassages(
  document: SuccessiveSearchDocument,
  subject: string,
): string[] {
  const normalizedSubject = semanticInformationalSubject(subject);
  if (!normalizedSubject) return [];
  const escaped = normalizedSubject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const explanatory = new RegExp(
    `\\b${escaped}\\b(?:\\s+(?:is|are)\\s+(?:an?|the)\\b|(?:\\s*,?\\s*(?:our|an?|the)\\s+)?(?:(?:ai|cloud|enterprise|digital|native|agentic)[ -]){0,3}(?:platform|product|service|capability|accelerator)\\b|\\s+(?:refers?\\s+to|means?|enables?|allows?|helps?|provides?)\\b)`,
    "i",
  );
  const contextualOnly = /\b(?:offline|unavailable|failure|fails?|failing|latency|fallback|error|errors|exception|troubleshoot(?:ing)?|retry|timeout|outage)\b/i;
  // A generic subject must be the local thing being explained. "This API"
  // inherits its identity from its preceding section, which may be a vendor
  // or product API, and therefore cannot define generic API.
  const equivalentLead = new RegExp(`^(?:(?:an?|the)\\s+)?${escaped}\\b`, "i");
  const sources = [
    ...document.structuredFields.filter((field) => field.kind === "text").map((field) => field.value),
    ...document.descriptions,
    ...document.textSegments,
    ...document.chunks.map((chunk) => chunk.text),
  ];
  const seen = new Set<string>();
  return sources.flatMap((source) => source.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 20 && equivalentLead.test(sentence) &&
      explanatory.test(sentence) && !contextualOnly.test(sentence))
    .filter((sentence) => {
      const key = normalizeSearchText(sentence);
      if ([...seen].some((existing) => existing.includes(key) || key.includes(existing))) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

/**
 * A direct entity question can be answered from first-party, subject-specific
 * capability evidence even when the publisher did not write a dictionary
 * sentence. Identity remains title/slug/alias-bound; this never searches
 * arbitrary body text to discover an entity.
 */
export function semanticSynthesisEvidencePassages(
  document: SuccessiveSearchDocument,
  subject: string,
): string[] {
  const normalizedSubject = semanticInformationalSubject(subject);
  const subjectTerms = normalizedSubject.split(" ").filter((term) => term.length >= 2);
  if (!subjectTerms.length || !hasDirectSubjectAuthority(document, normalizedSubject)) return [];
  const seen = new Set<string>();
  const factual = /\b(?:develop(?:ment|ers?|ing)?|build(?:ing|s)?|engineer(?:ing|ed|s)?|implement(?:ation|ing|s)?|frontend|interface|application|platform|framework|component|experience|integrat(?:e|ion|ing)|support(?:s|ing)?|enabl(?:e|es|ing)|help(?:s|ing)?|use(?:d|s)?|scal(?:e|able|ing)|moderniz(?:e|ation|ing))\b/i;
  const sources = [
    ...document.descriptions,
    ...document.textSegments,
    ...document.structuredFields.filter((field) => field.kind === "text").map((field) => field.value),
    ...document.chunks.map((chunk) => chunk.text),
  ];
  return sources.flatMap((source) => source.split(/(?<=[.!?])\s+|\n+/))
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 30 && factual.test(sentence))
    .filter((sentence) => {
      const terms = new Set(normalizeSearchText(sentence).split(" "));
      // The title/slug has already established identity for this canonical
      // record, so its own authored factual copy is locally attributable even
      // when the copy uses a pronoun such as "this framework".
      return subjectTerms.every((term) => terms.has(term)) ||
        hasDirectSubjectAuthority(document, normalizedSubject);
    })
    .filter((sentence) => {
      const key = normalizeSearchText(sentence);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function subjectTokensMatch(value: string, subject: string): boolean {
  const subjectTokens = semanticInformationalSubject(subject).split(" ").filter(Boolean);
  const valueTokens = new Set(normalizeSearchText(value).split(" ").filter(Boolean)
    .map((token) => token.length > 3 ? token.replace(/s$/, "") : token));
  return subjectTokens.length > 0 && subjectTokens.every((token) =>
    valueTokens.has(token.length > 3 ? token.replace(/s$/, "") : token));
}

/**
 * A short explicit subject needs document-level proof that it is the subject,
 * rather than a coincidental occurrence in prose. This intentionally uses
 * title/slug or a title-local acronym, never body or recursively extracted ACF
 * labels (which can include decorative icon/media names).
 */
export function hasDirectSubjectAuthority(document: SuccessiveSearchDocument, subject: string): boolean {
  const semantic = semanticInformationalSubject(subject);
  if (!semantic) return false;
  const slug = document.slug.replace(/-/g, " ");
  if (subjectTokensMatch(document.title, semantic) || subjectTokensMatch(slug, semantic)) return true;
  // Index aliases can include acronyms lifted from arbitrary section headings.
  // Only a title-local parenthetical acronym is document identity evidence.
  if (new RegExp(`\\(${semantic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "i").test(document.title)) return true;
  return false;
}

function extractDirectLookupSubject(query: string): string {
  return semanticInformationalSubject(extractExplicitInformationalSubject(query) ?? normalizeSearchText(query))
    .replace(/^\s*(?:the\s+)?(?:blog|article|post)\s+/, "")
    .replace(/\s+(?:address|addresses)$/, "")
    .trim();
}

function directIdentityStrength(
  document: SuccessiveSearchDocument,
  subject: string,
  requestedContentType?: QueryUnderstanding["requestedContentType"],
): number {
  if (!subject) return 0;
  const slug = normalizeSearchText(document.slug.replace(/-/g, " "));
  if (document.normalizedTitle === subject) return 1;
  if (slug === subject) return 0.99;
  if (document.aliases.includes(subject)) return 0.98;
  const acronym = subject.replace(/[^a-z0-9]/g, "");
  const parentheticalAcronyms = [...document.title.matchAll(/\(([A-Za-z0-9]{2,8})\)/g)];
  if (acronym.length >= 2 && acronym.length <= 8 &&
      parentheticalAcronyms.some((match) => normalizeSearchText(match[1] ?? "") === acronym)) {
    const prefix = document.title.slice(0, parentheticalAcronyms.find((match) =>
      normalizeSearchText(match[1] ?? "") === acronym)?.index ?? 0);
    const initials = normalizeSearchText(prefix).split(" ").filter(Boolean)
      .slice(-acronym.length).map((term) => term[0]).join("");
    if (initials === acronym) return 0.985;
  }
  if (slug.startsWith(`${subject} `) &&
      /^(?:(?:and|for|of|the|review|services?|solutions?|platform|product|company|consulting|capabilities|development|framework)\s*){1,8}$/.test(slug.slice(subject.length + 1)))
    return 0.97;
  if (document.normalizedTitle.startsWith(`${subject} `) &&
      /^(?=.*\b(?:review|services?|solutions?|platform|product|company|consulting|capabilities|development|framework)\b)(?:(?:and|for|of|the|review|services?|solutions?|platform|product|company|consulting|capabilities|development|framework)\s*){1,8}$/.test(document.normalizedTitle.slice(subject.length + 1)))
    return 0.97;
  // Canonical technology pages may put a short implementation qualifier
  // between the subject and their role-bearing suffix. The subject remains a
  // literal title prefix and the suffix is deliberately bounded.
  if (subject.length >= 4 && document.normalizedTitle.startsWith(`${subject} `) &&
      /^(?:(?:[a-z0-9+#.-]{1,16})\s+){0,3}(?:services?|solutions?|platform|product|company|consulting|capabilities|development|framework)(?:\s+(?:company|services?|solutions?))?$/.test(
        document.normalizedTitle.slice(subject.length + 1),
      )) return 0.97;
  if (subject.split(" ").length >= 2 && ["product", "kagen-product"].includes(requestedContentType ?? "") &&
      (document.productLike || document.role === "product")) {
    const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const productIdentity = new RegExp(`(?:\\b${escaped}\\b.{0,80}\\b(?:product|platform)\\b|\\b(?:product|platform)\\b.{0,80}\\b${escaped}\\b)`, "i");
    if (document.structuredFields.some(({ value }) => productIdentity.test(normalizeSearchText(value)))) return 0.97;
  }
  if (subject.split(" ").length < 2) return 0;
  const meaningfulSubject = subject
    .replace(/\b(?:successive|digital|company|about us)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Brand-only phrasing is company discovery, not an exact resource alias.
  // Many editorial titles contain the brand and must not hijack About.
  if (!meaningfulSubject) return 0;
  const subjectTerms = new Set(subject.split(" "));
  const titleTerms = new Set(document.normalizedTitle.split(" "));
  const overlap = [...subjectTerms].filter((term) => titleTerms.has(term)).length;
  const coverage = overlap / Math.max(subjectTerms.size, titleTerms.size, 1);
  if ((document.normalizedTitle.includes(subject) || subject.includes(document.normalizedTitle)) && coverage >= 0.72)
    return 0.9 + coverage * 0.08;
  return coverage >= 0.88 ? coverage : 0;
}

// These are intent facets, not topic aliases: a canonical strategy/advisory
// page can answer an adoption-strategy request only when the rest of the
// explicit multi-word subject remains title-local as well.
const EQUIVALENT_SUBJECT_FACETS = [
  ["adopt", "adoption", "adopting", "implement", "implementation", "consult", "consulting", "advisory", "readiness"],
  ["strategy", "strategic", "roadmap", "planning"],
];

function sameEquivalentFacet(left: string, right: string): boolean {
  return EQUIVALENT_SUBJECT_FACETS.some((facet) => facet.includes(left) && facet.includes(right));
}

/**
 * Conservative title-level equivalence for an explicit compound subject.
 * It is intentionally unavailable to editorial/announcement records and
 * requires all but one subject facet to remain literal canonical identity.
 */
export function canonicalEquivalentSubjectStrength(
  document: SuccessiveSearchDocument,
  subject: string,
): number {
  const subjectTerms = [...new Set(semanticInformationalSubject(subject).split(" ").filter((term) => term.length > 1))];
  if (subjectTerms.length < 3 || ["post", "press-release", "media-coverage"].includes(document.type)) return 0;
  const canonicalRepresentation = ["service", "technology", "product", "global_capabilities", "industry", "page"].includes(document.role) &&
    document.type === "page";
  if (!canonicalRepresentation) return 0;
  const titleTerms = new Set(normalizeSearchText(`${document.title} ${document.slug.replace(/-/g, " ")}`).split(" "));
  const literal = subjectTerms.filter((term) => titleTerms.has(term));
  if (literal.length < subjectTerms.length - 1) return 0;
  const missing = subjectTerms.filter((term) => !titleTerms.has(term));
  const replacements = [...titleTerms].filter((term) => !subjectTerms.includes(term));
  if (missing.length !== 1 || !replacements.some((term) => sameEquivalentFacet(missing[0]!, term))) return 0;
  return 0.9 + literal.length / subjectTerms.length * 0.08;
}

const MENTION_ONLY_TERMS = /\b(?:mention(?:ed|s)?|referenc(?:e|ed|es)|named|cited|announc(?:e|ed|ement))\b/;
const MAJOR_SECTION_COLLECTION = /(?:^|[._-])(?:capabilit(?:y|ies)|services?|offerings?|solutions?|products?|accelerators?|strateg(?:y|ies)|engineering|business(?:_areas?)?)(?:\[\d+\]|\.\d+)(?:\.|$)/i;
const SECTION_TITLE_FIELD = /(?:^|[._-])(?:title|heading|label|name)$/i;

function sectionPrefix(path: string): string | undefined {
  const match = path.match(/^(.*?(?:\[\d+\]|\.\d+))\./);
  return match?.[1];
}

function isFirstPartySuccessiveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "successive.tech" || url.hostname.endsWith(".successive.tech"));
  } catch {
    return false;
  }
}

function subjectHasLocalDescription(text: string, normalizedSubject: string): boolean {
  const escaped = normalizedSubject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\b${escaped}\\b(?:\\s*,?\\s*(?:our|an?|the))?\\s+(?:(?:ai|cloud|enterprise|digital|native|agentic)[ -]){0,3}(?:is|are|was|were|helps?|enables?|provides?|supports?|delivers?|uses?|offers?|accelerates?|automates?|orchestrates?|powers?|platform|product|service|capability)\\b`,
    "i",
  ).test(normalizeSearchText(text));
}

function entityFieldPrefix(path: string): string | undefined {
  const match = path.match(/^(.*?)(?:[._-](?:title|heading|label|name))$/i);
  return match?.[1];
}

function entityCanonicalLink(
  document: SuccessiveSearchDocument,
  subject: string,
): string | undefined {
  const normalizedSubject = semanticInformationalSubject(subject);
  const prefixes = document.structuredFields
    .filter((field) => field.kind === "text" && SECTION_TITLE_FIELD.test(field.path) &&
      normalizeSearchText(field.value) === normalizedSubject)
    .map((field) => entityFieldPrefix(field.path))
    .filter((prefix): prefix is string => Boolean(prefix));
  for (const prefix of prefixes) {
    const link = document.structuredLinks.find((candidate) =>
      candidate.path.startsWith(prefix) &&
      (isFirstPartySuccessiveUrl(candidate.url) ||
        normalizeSearchText(new URL(candidate.url).pathname.replace(/[-_/]+/g, " "))
          .includes(normalizedSubject)),
    );
    if (link) return link.url;
  }
  return undefined;
}

/**
 * Repeated ACF cards are semantic units. Their field path is the boundary:
 * a matching card title may use only its own copy and authored link, never a
 * neighbouring card or an unrelated Home-page block.
 */
function structuredMajorSectionEvidence(
  document: SuccessiveSearchDocument,
  subject: string,
): { document: SuccessiveSearchDocument; passages: string[]; strength: number; localEvidence: NonNullable<SearchMatch["localEvidence"]> } | undefined {
  const normalizedSubject = semanticInformationalSubject(subject);
  if (normalizedSubject.split(" ").length < 2) return undefined;
  const titleField = document.structuredFields.find((field) =>
    field.kind === "text" && SECTION_TITLE_FIELD.test(field.path) &&
    normalizeSearchText(field.value) === normalizedSubject &&
    Boolean(sectionPrefix(field.path)) && MAJOR_SECTION_COLLECTION.test(field.path),
  );
  if (!titleField) return undefined;
  const prefix = sectionPrefix(titleField.path)!;
  const localFields = document.structuredFields.filter((field) =>
    field.kind === "text" && field.path.startsWith(`${prefix}.`),
  );
  const details = localFields
    .filter((field) => field.path !== titleField.path && normalizeSearchText(field.value) !== normalizedSubject)
    .map((field) => field.value.trim())
    .filter((value, index, all) => value.length >= 24 && /[a-z]/i.test(value) &&
      all.findIndex((candidate) => normalizeSearchText(candidate) === normalizeSearchText(value)) === index)
    .slice(0, 3);
  if (!details.length) return undefined;
  const localLink = document.structuredLinks.find((link) =>
    link.path.startsWith(`${prefix}.`) && isFirstPartySuccessiveUrl(link.url),
  );
  const title = titleField.value.trim();
  return {
    document: {
      ...document,
      title,
      normalizedTitle: normalizeSearchText(title),
      aliases: [...new Set([...document.aliases, normalizeSearchText(title)])],
      // A structured capability card is represented as a capability while its
      // originating page remains the evidence record and carries the content.
      role: "service",
      url: localLink?.url ?? document.url,
    },
    passages: [title, ...details],
    strength: localLink ? 1 : 0.94,
    localEvidence: { groupPath: prefix, passages: [title, ...details], heading: title, url: localLink?.url },
  };
}

function embeddedEntityPassages(
  document: SuccessiveSearchDocument,
  subject: string,
): { passages: string[]; strength: number; structuredDefinitionAuthority: boolean; structuralDestination?: string; displayEntity?: string; localEvidence?: NonNullable<SearchMatch["localEvidence"]> } | undefined {
  const normalizedSubject = semanticInformationalSubject(subject);
  const subjectTerms = normalizedSubject.split(" ").filter(Boolean);
  const shortSubject = isShortSemanticSubject(subject);
  if ((!shortSubject && (subjectTerms.length < 2 || normalizedSubject.length < 5)) ||
      (shortSubject && !hasDirectSubjectAuthority(document, normalizedSubject))) return undefined;
  // Do not elevate a short acronym from incidental body copy merely because an
  // article in the user phrasing made the raw subject appear multi-word.

  const exact = ` ${normalizedSubject} `;
  const localTitleField = document.structuredFields.find((field) =>
    field.kind === "text" && SECTION_TITLE_FIELD.test(field.path) &&
    normalizeSearchText(field.value) === normalizedSubject,
  );
  // A flat field-name prefix (for example `kagen_card_heading`) does not
  // establish a sibling boundary. Only an indexed/nested ACF path carries a
  // structural container we can safely use to exclude distant fields.
  const inferredPrefix = localTitleField ? entityFieldPrefix(localTitleField.path) : undefined;
  const localPrefix = inferredPrefix && /(?:\[\d+\]|\.)/.test(inferredPrefix)
    ? inferredPrefix
    : undefined;
  const localStructuredFields = localPrefix
    ? document.structuredFields.filter((field) => field.kind === "text" && field.path.startsWith(`${localPrefix}.`))
    : document.structuredFields.filter((field) => field.kind === "text");
  const structuredPassages = localStructuredFields
    .map(({ value }) => ({ text: value.trim(), normalizedText: normalizeSearchText(value) }))
    .filter(({ text, normalizedText }) => text.length >= 40 &&
      ` ${normalizedText} `.includes(exact) && subjectHasLocalDescription(normalizedText, normalizedSubject) &&
      !MENTION_ONLY_TERMS.test(normalizedText));
  // A named entity does not need a standalone CMS record when the same
  // authoritative structured record gives it both a bounded label and a
  // local product/platform/service-style definition. Keeping these as two
  // separate structured fields is common in Home-page card/hero schemas.
  const structuredDefinitionAuthority = Boolean(localTitleField) && structuredPassages.length > 0;
  const structuralDestination = structuredDefinitionAuthority
    ? entityCanonicalLink(document, normalizedSubject)
    : undefined;
  const displayEntity = structuredDefinitionAuthority ? localTitleField?.value.trim() : undefined;
  const candidates = document.chunks
    .filter((chunk) => ` ${chunk.normalizedText} `.includes(exact))
    .map((chunk) => {
      const position = chunk.normalizedText.indexOf(normalizedSubject);
      const nearby = chunk.normalizedText.slice(
        Math.max(0, position - 180),
        Math.min(chunk.normalizedText.length, position + normalizedSubject.length + 420),
      );
      const descriptive = subjectHasLocalDescription(nearby, normalizedSubject) &&
        !MENTION_ONLY_TERMS.test(nearby);
      const structured = document.structuredFields.some(({ value }) => {
        const normalized = normalizeSearchText(value);
        return ` ${normalized} `.includes(exact) && subjectHasLocalDescription(normalized, normalizedSubject);
      });
      const heading = document.headings.some((value) =>
        ` ${normalizeSearchText(value)} `.includes(exact),
      );
      return {
        chunk,
        score: (descriptive ? 60 : 0) + (structured ? 35 : 0) + (heading ? 25 : 0),
        descriptive,
      };
    })
    .filter((candidate) => candidate.descriptive)
    .sort((a, b) => b.score - a.score || a.chunk.position - b.chunk.position);
  if (!candidates.length && !structuredPassages.length) return undefined;

  const representationRole = ["product", "service", "technology", "partner", "industry", "accelerator", "company", "global_capabilities", "page"].includes(document.role);
  const supportingRole = ["press_release", "media", "editorial", "blog", "case_study", "resource"].includes(document.role);
  const roleStrength = representationRole ? 30 : supportingRole ? 12 : 0;
  return {
    passages: [...structuredPassages.map(({ text }) => text), ...candidates.map(({ chunk }) => chunk.text)]
      .filter((passage, index, all) => all.findIndex((other) => normalizeSearchText(other) === normalizeSearchText(passage)) === index)
      .slice(0, 2),
    strength: Math.min(1, 0.55 + (candidates[0]?.score ?? 95) / 200 + roleStrength / 100),
    structuredDefinitionAuthority,
    structuralDestination,
    displayEntity,
    localEvidence: localPrefix
      ? {
        groupPath: localPrefix,
        passages: [localTitleField!.value.trim(), ...structuredPassages.map(({ text }) => text)]
          .filter((value, index, all) => all.findIndex((other) => normalizeSearchText(other) === normalizeSearchText(value)) === index)
          .slice(0, 3),
        heading: localTitleField!.value.trim(),
        url: structuralDestination,
      }
      : undefined,
  };
}

export function rankEmbeddedEntityEvidence(
  index: SuccessiveSearchDocument[],
  currentMessage: string,
  understanding: QueryUnderstanding | undefined,
  excludedContent: Set<string>,
): SearchMatch[] {
  // A named capability question is a bounded entity request, even when the
  // answer mode is represented as a list. Broad collections remain outside
  // this entity-local path.
  if (!understanding || !["define", "explain", "details", "summarize", "list"].includes(understanding.answerMode) ||
      (understanding.answerMode === "list" && understanding.isBroadQuery)) return [];
  const subject = withoutServiceTypeTerms(extractDirectLookupSubject(currentMessage));
  const definitionQuery = isDirectDefinitionQuery(currentMessage) && isCompactDefinitionSubject(subject);
  if (!subject || /\b(?:other|another|more|else)\b/.test(normalizeSearchText(currentMessage))) return [];

  const structuredSections = index
    .map((document) => ({ source: document, evidence: structuredMajorSectionEvidence(document, subject) }))
    .filter((item): item is { source: SuccessiveSearchDocument; evidence: NonNullable<typeof item.evidence> } =>
      Boolean(item.evidence) && !contentIdentity(item.source.title, item.source.url)
        .some((key) => excludedContent.has(key)),
    )
    .map(({ evidence }): SearchMatch => ({
      document: evidence.document,
      score: Math.round((400 + evidence.strength * 100 + evidence.document.contentQuality / 10) * 100) / 100,
      matchedFields: ["exact-structured-section", "exact-embedded-entity", "embedded-direct-subject-authority"],
      selectedPassages: evidence.passages,
      localEvidence: evidence.localEvidence,
      confidence: "high",
      scoreBreakdown: { title: 400, headings: 100, metadata: 100, body: 100, contentType: 80, penalties: 0, authorityCoverage: 1, entity: 1 },
    }));
  if (structuredSections.length) return structuredSections.slice(0, 5);

  return index
    .map((document) => ({ document, evidence: embeddedEntityPassages(document, subject) }))
    .filter((item): item is { document: SuccessiveSearchDocument; evidence: NonNullable<typeof item.evidence> } =>
      Boolean(item.evidence) &&
      // A bounded structured entity has already proven its local identity,
      // role-bearing description, and structural destination. Unlike generic
      // prose, its authored description may lead with value language before
      // naming the entity, so the compact-definition sentence-start guard does
      // not apply to that independently validated structured record.
      (!definitionQuery || item.evidence?.structuredDefinitionAuthority || definitionEvidencePassages(item.document, subject).length > 0) &&
      !contentIdentity(item.document.title, item.document.url).some((key) => excludedContent.has(key)),
    )
    .map(({ document, evidence }): SearchMatch => {
      const dedicated = directIdentityStrength(document, subject, understanding.requestedContentType) >= 0.9;
      const directSubjectAuthority = hasDirectSubjectAuthority(document, subject);
      const boundedStructuredAuthority = evidence.structuredDefinitionAuthority;
      const roleAligned = isRequestedContentTypeCompatible(document, understanding.requestedContentType);
      const representation = !["post", "press-release", "media-coverage"].includes(document.type);
      const canonicalSubjectRepresentation = directSubjectAuthority &&
        ["service", "technology", "product", "global_capabilities", "company", "industry"].includes(document.role);
      const priority = dedicated ? 400 : canonicalSubjectRepresentation ? 400 : directSubjectAuthority || boundedStructuredAuthority ? 360 : representation && roleAligned ? 300 : representation ? 230 : roleAligned ? 170 : 110;
      return {
        document: evidence.structuralDestination ? {
          ...document,
          url: evidence.structuralDestination,
          role: "product",
          productLike: true,
          title: evidence.displayEntity ?? document.title,
          normalizedTitle: normalizeSearchText(evidence.displayEntity ?? document.title),
          aliases: evidence.displayEntity
            ? [...new Set([...document.aliases, normalizeSearchText(evidence.displayEntity)])]
            : document.aliases,
        } : document,
        score: Math.round((priority + evidence.strength * 100 + document.contentQuality / 10) * 100) / 100,
        matchedFields: [
          dedicated ? "exact-entity-authority" : "exact-embedded-entity",
          ...(directSubjectAuthority || boundedStructuredAuthority ? ["embedded-direct-subject-authority"] : []),
          ...(evidence.structuralDestination ? ["embedded-structural-parent"] : []),
          roleAligned ? "requested-role-representation" : "requested-role-supporting-evidence",
        ],
        selectedPassages: definitionQuery && !evidence.structuredDefinitionAuthority
          ? definitionEvidencePassages(document, subject)
          : evidence.passages,
        localEvidence: evidence.localEvidence,
        confidence: evidence.strength >= 0.8 ? "high" : "medium",
        scoreBreakdown: {
          title: dedicated ? 400 : 0,
          headings: 0,
          metadata: Math.round(evidence.strength * 100),
          body: 100,
          contentType: roleAligned ? 80 : 0,
          penalties: 0,
          authorityCoverage: 1,
          entity: 1,
        },
      };
    })
    .sort((a, b) => b.score - a.score || b.document.contentQuality - a.document.contentQuality)
    .slice(0, 5);
}

function canonicalPageMatch(
  document: SuccessiveSearchDocument,
  message: string,
): boolean {
  if (document.type !== "page") return false;
  const query = normalizeSearchText(message)
    .replace(/\b(?:what|which|who|where|when|why|how|is|are|was|were|do|does|did|have|has|tell|show|give|list|find|explain|define|me|us|our|your|the|a|an|any|some|available|current|about|successive|digital|please)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query) return false;
  const identities = [
    document.normalizedTitle,
    normalizeSearchText(document.slug.replace(/-/g, " ")),
    ...document.aliases.map(normalizeSearchText),
  ].filter((identity) => identity.length >= 4);
  const canonicalTerm = (term: string) => term
    .replace(/ships?$/i, "")
    .replace(/(?:ies|s)$/i, (suffix) => suffix === "ies" ? "y" : "")
    .trim();
  const queryTerms = [...new Set(query.split(" ").map(canonicalTerm).filter(Boolean))];
  return identities.some((identity) => {
    const identityTerms = new Set(identity.split(" ").map(canonicalTerm).filter(Boolean));
    return identity === query ||
      ` ${query} `.includes(` ${identity} `) ||
      ` ${identity} `.includes(` ${query} `) ||
      (queryTerms.length > 0 && queryTerms.every((term) => identityTerms.has(term)));
  });
}

export function isRequestedContentTypeCompatible(
  document: SuccessiveSearchDocument,
  requested: QueryUnderstanding["requestedContentType"],
): boolean {
  if (!requested) return true;
  const identity = `${document.type} ${document.slug} ${document.normalizedTitle}`;
  if (requested === "case-study") return document.type.includes("case");
  if (requested === "blog") return document.type === "post";
  if (requested === "event") return /event|webinar/.test(identity);
  if (requested === "webinar") return /webinar/.test(identity);
  if (requested === "whitepaper") return isWhitepaperDocument(document);
  if (requested === "ebook") return /ebook|e-book/.test(identity);
  if (requested === "press-release") return document.type === "press-release";
  if (requested === "media-coverage") return document.type === "media-coverage";
  if (requested === "news") return ["press-release", "media-coverage"].includes(document.type);
  if (requested === "accelerator") return document.type === "accelerators" || /accelerator/.test(identity);
  if (requested === "award") return document.role === "awards";
  if (requested === "product" || requested === "kagen-product")
    return (document.role === "product" || document.productLike) &&
      (requested !== "kagen-product" || /kagen/.test(`${identity} ${document.normalizedTitle} ${document.combinedText}`));
  if (requested === "technology") return document.role === "technology" || document.role === "global_capabilities";
  if (requested === "company" || requested === "leadership") return document.role === "company";
  if (requested === "culture") return document.role === "culture" || document.role === "company";
  if (requested === "sub-service") return normalizeServiceSchemaType(document.service_type) === "sub-service";
  if (requested === "expertise") return normalizeServiceSchemaType(document.service_type) === "expertise";
  if (requested === "solution") return document.role === "service" || /solution/.test(identity);
  if (requested === "resource") return ["resource", "blog", "editorial"].includes(document.role) || document.type === "post" ||
    (document.type === "page" && /\b(?:resource|guide|report|white ?paper|e-?book|download)\b/.test(
      `${identity} ${document.descriptions.slice(0, 3).join(" ")}`,
    ));
  if (requested === "thought-leadership")
    return ["thought-leadership", "employee-perspective"].includes(document.type);
  // Specialized portfolio records are sometimes published as generic pages.
  // Their indexed semantic role is the stable compatibility contract; the
  // underlying WordPress type is only an implementation detail.
  if (requested === "partner") return ["partner", "partners"].includes(document.role);
  if (requested === "industry") return document.role === "industry";
  if (requested === "career") return ["career", "careers"].includes(document.role);
  if (requested === "service") {
    if (document.role === "service" || document.role === "global_capabilities" ||
        isServiceFamilySchemaType(document.service_type)) return true;
    // Some current and future published pages omit the legacy service taxonomy. A
    // page is still service-compatible when its own structured copy clearly
    // presents an offering/program and describes what the company delivers.
    if (document.type !== "page" || document.role !== "page") return false;
    const offeringText = normalizeSearchText(`${document.title} ${document.headings.join(" ")} ${document.descriptions.slice(0, 4).join(" ")}`);
    return /\b(?:services?|consulting|development|implementation|proof of concept|workshop|program|solution)\b/.test(offeringText) &&
      /\b(?:we|our|successive)\b/.test(offeringText);
  }
  return document.type === "page";
}

export function normalizeQuery(query: string): string {
  const normalized = normalizeSearchText(query);
  // Remove obvious keyboard-noise tokens without collapsing a specific topic
  // into a broader known phrase. This preserves unseen compound subjects while
  // retaining typo/noise tolerance for every category.
  const recognizedTopic = normalized.split(" ")
    .filter((token) => token.length < 5 || /[aeiouy0-9]/.test(token))
    .join(" ");
  // Short topic prompts need enough meaning to retrieve the corresponding
  // website page. This keeps answers grounded while supporting the terse
  // queries people naturally enter in a chat widget.
  const topicAliases: Record<string, string> = {
    about: "about us successive company",
    "about us": "about us successive company",
    customers: "customer case studies",
    clients: "customer case studies",
    careers: "careers jobs",
    career: "careers jobs",
    industries: "industries industry",
    industry: "industries industry",
    industers: "industries industry",
    induster: "industries industry",
  };
  const retrievalQuery = topicAliases[recognizedTopic] ?? recognizedTopic;
  const tokens = retrievalQuery
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token));
  const corrections: Record<string, string> = {
    kaga: "successive",
    induster: "industry",
    industers: "industries",
    servies: "services",
    serivce: "service",
    serivces: "services",
    whitepeper: "whitepaper",
    whitepepers: "whitepapers",
    whtieperper: "whitepaper",
    whtieperpers: "whitepapers",
  };
  const corrected = tokens.map((token) => corrections[token] ?? token);
  return [...new Set(corrected)].join(" ");
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (left.length === right.length && left[i] === right[j + 1] && left[i + 1] === right[j]) {
      if (++edits > 1) return false;
      i += 2; j += 2; continue;
    }
    if (++edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}

function boundedTitleTypoStrength(document: SuccessiveSearchDocument, subject: string): number {
  const subjectTokens = normalizeSearchText(subject).split(" ").filter(Boolean);
  const identities = [document.normalizedTitle, normalizeSearchText(document.slug.replace(/-/g, " ")), ...document.aliases];
  // One misspelled entity token may resolve only against a title/slug/alias
  // identity token. Ambiguity is rejected by matchExactIndexedTitle below;
  // arbitrary body vocabulary is never eligible for this recovery.
  if (subjectTokens.length === 1 && subjectTokens[0]!.length >= 4) {
    const normalizedSubject = subjectTokens[0]!.replace(/(?:ies|s)$/i, (suffix) => suffix === "ies" ? "y" : "");
    const tokenMatches = (identity: string) => normalizeSearchText(identity).split(" ").some((token) => {
      const normalizedToken = token.replace(/(?:ies|s)$/i, (suffix) => suffix === "ies" ? "y" : "");
      return editDistanceAtMostOne(normalizedSubject, normalizedToken);
    });
    // A normalized slug is a document-owned canonical identity and is more
    // specific than a coincidental title/alias token. This only breaks a tie
    // among already one-edit, authoritative candidates; it never consults
    // body text or lowers the edit-distance rule.
    if (tokenMatches(document.slug.replace(/-/g, " "))) return 0.98;
    return identities.some(tokenMatches) ? 0.97 : 0;
  }
  return identities.some((identity) => {
    const identityTokens = normalizeSearchText(identity).split(" ").filter(Boolean);
    if (identityTokens.length !== subjectTokens.length || identityTokens.length < 2) return false;
    const mismatches = identityTokens.filter((token, index) => token !== subjectTokens[index]);
    if (mismatches.length !== 1) return false;
    const position = identityTokens.findIndex((token, index) => token !== subjectTokens[index]);
    return editDistanceAtMostOne(identityTokens[position]!, subjectTokens[position]!);
  }) ? 0.97 : 0;
}

/** Corrects one-edit tokens only when the correction is owned by indexed identities. */
function correctMinorTyposFromIndex(query: string, index: SuccessiveSearchDocument[]): string {
  const vocabulary = new Map<string, number>();
  index.forEach((document) => {
    const identity = `${document.normalizedTitle} ${document.slug.replace(/-/g, " ")} ${document.headings.join(" ")}`;
    normalizeSearchText(identity).split(" ").filter((token) => token.length >= 5)
      .forEach((token) => vocabulary.set(token, (vocabulary.get(token) ?? 0) + 1));
  });
  return normalizeSearchText(query).split(" ").map((token) => {
    if (token.length < 5 || vocabulary.has(token)) return token;
    const candidates = [...vocabulary.entries()]
      .filter(([candidate]) => editDistanceAtMostOne(token, candidate))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // Never guess between multiple corpus identities. Frequency is not
    // identity evidence and must not turn a typo into an unrelated entity.
    return candidates.length === 1 ? candidates[0]![0] : token;
  }).join(" ");
}

type RequestedServiceType = "service" | "pillar" | "expertise";

export function detectRequestedServiceTypes(
  query: string,
): RequestedServiceType[] {
  const normalized = normalizeSearchText(query);
  const requested: RequestedServiceType[] = [];
  if (
    /\b(?:service|services|servire|servires|serivce|serivces)\b/.test(
      normalized,
    )
  )
    requested.push("service");
  if (/\b(?:pillar|pillars|piller|pillers)\b/.test(normalized))
    requested.push("pillar");
  if (/\b(?:expert|experts|expertise|exper)\b/.test(normalized))
    requested.push("expertise");
  return requested;
}

export function isBroadAiServicesQuery(query: string): boolean {
  const normalized = normalizeSearchText(query)
    .replace(
      /\b(?:show|give|tell|list|explore|find|what|me|about|successive|all|the|your|please|does|do|provide|provides|offer|offers)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:ai|ai (?:and )?ml|artificial intelligence(?: and machine learning)?)(?: (?:services?|solutions?|offerings?))?$/.test(
    normalized,
  );
}

export function isUseCaseQuery(query: string): boolean {
  const normalized = normalizeSearchText(query);
  return (
    /\buse cases?\b/.test(normalized) ||
    /\b(?:show|give|find|list|examples? of|what are)\b.*\bapplications\b/.test(
      normalized,
    )
  );
}

function extractUseCaseTopic(query: string): string {
  return normalizeSearchText(query)
    .replace(/\b(?:use cases?|applications?)\b/g, " ")
    .replace(
      /\b(?:i|we|want|need|show|give|tell|find|some|me|us|the|a|an|of|for|in|about|please|business)\b/g,
      " ",
    )
    .replace(/\band its\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUseCaseScoringQuery(query: string): string {
  const topic = extractUseCaseTopic(query);
  return `${topic || "business"} use cases applications`;
}

function matchesUseCaseTopic(
  document: SuccessiveSearchDocument,
  topic: string,
): boolean {
  if (!topic) return true;
  const documentText = ` ${document.combinedText} `;
  if (/^(?:ai|artificial intelligence)$/.test(topic))
    return /\b(?:ai|artificial intelligence|machine learning|generative ai|genai|agentic ai)\b/.test(
      documentText,
    );
  return topic
    .split(" ")
    .filter(Boolean)
    .every((term) => documentText.includes(` ${term} `));
}

function isLegalDocument(document: SuccessiveSearchDocument): boolean {
  return /^(?:terms-of-services?|privacy-policy|cookie-policy|cookies?|sitemap|thank-you)/.test(
    document.slug,
  );
}

function explicitlyRequestsLegalContent(query: string): boolean {
  return /\b(?:terms? (?:of )?(?:service|use)|privacy(?: policy)?|cookie(?: policy)?|sitemap)\b/.test(
    normalizeSearchText(query),
  );
}

function isAiPortfolioDocument(document: SuccessiveSearchDocument): boolean {
  if (!isServiceFamilySchemaType(document.service_type)) return false;
  const identityText = normalizeSearchText(
    [
      document.title,
      document.slug.replace(/-/g, " "),
      ...document.headings.slice(0, 8),
    ].join(" "),
  );
  return /\b(?:ai|artificial intelligence|machine learning|generative ai|genai)\b/.test(
    identityText,
  );
}

export function matchesRequestedServiceType(
  query: string,
  serviceType: string | undefined,
): boolean {
  const requested = detectRequestedServiceTypes(query);
  const normalized = servicePortfolioTaxonomyType(serviceType);
  return requested.length === 0 || Boolean(normalized) &&
    requested.includes(normalized as RequestedServiceType);
}

export function requestsSpecificServiceTaxonomy(query: string): boolean {
  return detectRequestedServiceTypes(query).some(
    (type) => type === "pillar" || type === "expertise",
  );
}

function withoutServiceTypeTerms(query: string): string {
  const normalized = normalizeSearchText(query);
  // Strategy/approach are meaningful facets in compound capability names
  // (for example, an adoption strategy). They are wrappers only for a short
  // named subject such as "DevSecOps approach".
  const wrapperTerms = normalized.split(" ").filter(Boolean).length > 2
    ? /\b(?:services?|servires?|serivces?|expertise|experts?|exper|pillars?|pillers?)\b/g
    : /\b(?:services?|servires?|serivces?|expertise|experts?|exper|pillars?|pillers?|approach|strategy)\b/g;
  return normalized
    .replace(wrapperTerms, " ")
    .replace(/\band its\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  if (token.length <= 4) return token;
  return token
    .replace(/(ization|ational|fulness|ousness|iveness)$/i, "")
    .replace(/(ments|ment|ingly|edly|ing|ers|ies|ied|ed|es|s)$/i, "")
    .slice(0, 20);
}

function tokenEditDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[right.length]!;
}

function fuzzyPersonEntityInText(entity: string, text: string): boolean {
  const entityTokens = normalizeSearchText(entity).split(" ").filter(Boolean);
  if (entityTokens.length < 2) return false;
  const first = entityTokens[0]!;
  const last = entityTokens[entityTokens.length - 1]!;
  const textTokens = normalizeSearchText(text).split(" ").filter(Boolean);
  return textTokens.includes(first) && textTokens.some((token) =>
    token === last ||
    (token.length >= 4 && last.length >= 4 && tokenEditDistance(token, last) <= 1),
  );
}

function expandedTerms(normalizedQuery: string): Set<string> {
  const base = normalizedQuery.split(" ").filter(Boolean);
  const terms = new Set(base.flatMap((token) => [token, stem(token)]));
  for (const group of SYNONYM_GROUPS) {
    if (group.some((term) =>
      terms.has(term) || terms.has(stem(term)) ||
      (term.includes(" ") && ` ${normalizedQuery} `.includes(` ${term} `)),
    ))
      group.forEach((term) => {
        terms.add(term);
        terms.add(stem(term));
        term.split(" ").filter(Boolean).forEach((token) => {
          terms.add(token);
          terms.add(stem(token));
        });
      });
  }
  return terms;
}

function termCoverage(query: string, profileTerms: string[]): number {
  const queryTerms = [...new Set(normalizeQuery(query).split(" ").map(stem).filter((term) => term.length > 2))];
  if (!queryTerms.length) return 0;
  const profile = new Set(profileTerms.map(stem));
  return queryTerms.filter((term) => profile.has(term)).length / queryTerms.length;
}

function functionalCompatibility(query: string, document: SuccessiveSearchDocument): number {
  const queryTerms = new Set(normalizeQuery(query).split(" ").map(stem).filter((term) => term.length > 2));
  const evidence = new Set([
    ...document.capabilityProfile.identityTerms,
    ...document.capabilityProfile.activityTerms,
    ...document.capabilityProfile.businessFunctionTerms,
    ...document.capabilityProfile.technologyTerms,
  ].map(stem));
  const overlap = [...queryTerms].filter((term) => evidence.has(term)).length;
  return Math.min(1, overlap / 2);
}

function businessDimensions(
  document: SuccessiveSearchDocument,
  understanding: QueryUnderstanding | undefined,
) {
  const topicQuery = [...(understanding?.topics ?? []), ...(understanding?.domains ?? []), ...(understanding?.technicalSignals ?? [])].join(" ");
  const problemQuery = understanding?.businessProblem ?? "";
  const outcomeQuery = (understanding?.desiredOutcomes ?? []).join(" ");
  const industryQuery = understanding?.industry ?? "";
  const entityQuery = [...(understanding?.entities ?? []), understanding?.existingPlatform ?? ""].join(" ");
  return {
    topic: termCoverage(topicQuery, document.capabilityProfile.identityTerms),
    problem: termCoverage(problemQuery, document.capabilityProfile.problemTerms),
    outcome: termCoverage(outcomeQuery, document.capabilityProfile.outcomeTerms),
    industry: termCoverage(industryQuery, document.capabilityProfile.industryTerms),
    entity: termCoverage(entityQuery, [
      ...document.aliases.flatMap((alias) => alias.split(" ")),
      ...document.capabilityProfile.technologyTerms,
    ]),
    functional: functionalCompatibility(problemQuery || topicQuery, document),
  };
}

function constraintAssessment(
  document: SuccessiveSearchDocument,
  understanding: QueryUnderstanding | undefined,
  dimensions = businessDimensions(document, understanding),
) {
  if (!understanding) return { total: 0, satisfied: 0, contradictions: 0 };
  const checks: boolean[] = [];
  if ([...understanding.topics, ...understanding.domains, ...understanding.technicalSignals].length)
    checks.push(dimensions.topic >= 0.2);
  if (understanding.businessProblem) checks.push(dimensions.problem >= 0.12 || dimensions.topic >= 0.34);
  if (understanding.desiredOutcomes.length) checks.push(dimensions.outcome >= 0.2);
  if (understanding.industry) checks.push(dimensions.industry >= 0.5 || document.role === "industry");
  if (understanding.entities.length || understanding.existingPlatform) checks.push(dimensions.entity >= 0.5);
  if (understanding.requestedContentType)
    checks.push(isRequestedContentTypeCompatible(document, understanding.requestedContentType));
  return {
    total: checks.length,
    satisfied: checks.filter(Boolean).length,
    contradictions: checks.filter((value) => !value).length,
  };
}

export function cardEligibility(
  match: SearchMatch,
  understanding: QueryUnderstanding,
  topScore: number,
): { accepted: boolean; reason?: string } {
  const breakdown = match.scoreBreakdown;
  if (understanding.requestedContentType &&
      !isRequestedContentTypeCompatible(match.document, understanding.requestedContentType))
    return { accepted: false, reason: "requested content type mismatch" };
  if (match.matchedFields.includes("incidental-body-only"))
    return { accepted: false, reason: "topic appears only incidentally in body text" };
  if (match.score < Math.max(80, topScore * 0.82))
    return { accepted: false, reason: "below independent card relevance threshold" };
  if ((breakdown?.contradictions ?? 0) > 0)
    return { accepted: false, reason: "one or more explicit constraints are not satisfied" };
  if ((breakdown?.constraintsTotal ?? 0) >= 2 &&
      (breakdown?.constraintsSatisfied ?? 0) < (breakdown?.constraintsTotal ?? 0))
    return { accepted: false, reason: "incomplete multi-constraint match" };
  const businessNeed = ["solve_problem", "recommendation"].includes(understanding.intent);
  if (businessNeed) {
    if (match.document.role !== "service")
      return { accepted: false, reason: "supporting evidence is not a primary capability card" };
    const problemCompatible = (breakdown?.problem ?? 0) >= 0.16 ||
      (breakdown?.topic ?? 0) >= 0.34 || (breakdown?.outcome ?? 0) >= 0.34;
    if (!problemCompatible)
      return { accepted: false, reason: "weak business-problem compatibility" };
  }
  const authoritative = match.confidence === "high" ||
    (match.confidence === "medium" && (breakdown?.authorityCoverage ?? 0) >= 0.45);
  if (!authoritative) return { accepted: false, reason: "insufficient topic authority" };
  return { accepted: true };
}

function chunkTerms(chunk: SuccessiveSearchChunk): Set<string> {
  const terms = chunk.normalizedText.split(" ").filter(Boolean);
  return new Set(terms.flatMap((token) => [token, stem(token)]));
}

function phraseNgrams(tokens: string[], size: number): string[] {
  if (tokens.length < size) return [];
  return Array.from({ length: tokens.length - size + 1 }, (_, index) =>
    tokens.slice(index, index + size).join(" "),
  );
}

function buildInverseDocumentFrequency(
  documents: SuccessiveSearchDocument[],
): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const document of documents) {
    const terms = new Set(
      document.chunks.flatMap((chunk) =>
        chunk.normalizedText.split(" ").map(stem),
      ),
    );
    terms.forEach((term) =>
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1),
    );
  }
  const total = Math.max(1, documents.length);
  return new Map(
    [...frequencies].map(([term, frequency]) => [
      term,
      Math.log(1 + (total - frequency + 0.5) / (frequency + 0.5)) + 1,
    ]),
  );
}

async function loadSearchIndex(): Promise<SuccessiveSearchDocument[]> {
  // WordPress content is already revalidated every hour. Reusing the
  // derived index avoids repeated recursive ACF traversal and chunk generation
  // on every chat request while preserving the same freshness window.
  if (process.env.NODE_ENV === "test")
    return buildSearchIndex(await fetchAllPublishedContent());
  if (cachedIndex && cachedIndex.expiresAt > Date.now()) {
    lastIndexDiagnostics = { cache: "hit", durationMs: 0, documents: cachedIndex.documents.length };
    return cachedIndex.documents;
  }
  const persisted = await readPersistedIndex();
  if (persisted?.length) {
    cachedIndex = { documents: persisted, expiresAt: Date.now() + INDEX_CACHE_MS };
    lastIndexDiagnostics = { cache: "hit", durationMs: 0, documents: persisted.length };
    return persisted;
  }
  if (indexBuildPromise) {
    lastIndexDiagnostics = { ...lastIndexDiagnostics, cache: "shared" };
    return indexBuildPromise;
  }
  const startedAt = Date.now();
  // The derived full-corpus index also exceeds Next's per-entry cache limit.
  // Retain the existing process/persisted index cache and in-flight promise.
  indexBuildPromise = fetchAllPublishedContent()
    .then((items) => buildSearchIndex(items))
    .then((documents) => {
      cachedIndex = { documents, expiresAt: Date.now() + INDEX_CACHE_MS };
      void persistIndex(documents);
      lastIndexDiagnostics = {
        cache: "miss",
        durationMs: Date.now() - startedAt,
        documents: documents.length,
      };
      return documents;
    })
    .finally(() => {
      indexBuildPromise = undefined;
    });
  return indexBuildPromise;
}

/**
 * Resolves only explicit lookup wrappers around a known indexed identity.
 * Intent-looking words inside the captured title remain part of that identity.
 */
export function matchExactIndexedTitle(
  index: SuccessiveSearchDocument[],
  message: string,
  requestedContentType?: QueryUnderstanding["requestedContentType"],
): SearchMatch | undefined {
  // A role-relation request cannot use its source entity as an untyped exact
  // answer. Typed editorial requests may still resolve an exact same-role
  // record before relation discovery (for example, a named article title).
  if (isExplicitRequestedRoleRelation(message) && !requestedContentType) return undefined;
  const explicitSubject = extractExplicitInformationalSubject(message);
  if (!explicitSubject) return undefined;
  const subject = semanticInformationalSubject(correctMinorTyposFromIndex(explicitSubject, index));
  const familyTerms = subject.split(" ").filter((term) =>
    !/^(?:service|services|capability|capabilities|solution|solutions|offering|offerings|technology|technologies)$/.test(term));
  const broadFamilyLookup = familyTerms.length === 1 &&
    /\b(?:services?|capabilities|solutions?|offerings?|technolog(?:y|ies))\b/.test(subject);
  if (broadFamilyLookup) return undefined;
  const definitionQuery = isDirectDefinitionQuery(message) && isCompactDefinitionSubject(subject);
  const explicitEditorialRequest = ["blog", "resource", "whitepaper", "ebook", "case-study"].includes(requestedContentType ?? "");
  const editorialRepresentation = (document: SuccessiveSearchDocument) => {
    const identity = `${document.type} ${document.slug} ${document.normalizedTitle}`;
    return document.type === "post" || ["blog", "resource", "editorial", "whitepaper", "report"].includes(document.role) ||
      /\b(?:e-?book|white ?paper|guide|article|blog|case study)\b/.test(identity);
  };
  const directResourceEvidence = (document: SuccessiveSearchDocument): SearchMatch["localEvidence"] | undefined => {
    const resourceRecord = document.role === "resource" ||
      /\b(?:e-?book|white ?paper|guide|report|case study|article|blog)\b/.test(
        normalizeSearchText(`${document.type} ${document.slug} ${document.title}`),
      );
    const authoredBody = document.editorTextSegments ?? [];
    if (!resourceRecord || !authoredBody.length) return undefined;
    return {
      groupPath: "record.authored-body",
      passages: [document.title, ...authoredBody],
      heading: document.title,
      url: document.url,
    };
  };
  const candidates = index
    .map((document) => ({ document, strength: Math.max(
      directIdentityStrength(document, subject), boundedTitleTypoStrength(document, subject),
    ), definitionPassages: definitionQuery ? definitionEvidencePassages(document, subject) : [],
    semanticPassages: definitionQuery ? semanticSynthesisEvidencePassages(document, subject) : [],
    localEvidence: directResourceEvidence(document) }))
    .filter(({ document, strength, definitionPassages, semanticPassages }) =>
      strength >= 0.96 &&
      (document.normalizedTitle.split(" ").length >= 2 || strength >= 0.99) &&
      (!explicitEditorialRequest || isRequestedContentTypeCompatible(document, requestedContentType ?? null)) &&
      (!definitionQuery || definitionPassages.length > 0 || semanticPassages.length > 0),
    )
    .sort((a, b) => {
      const authority = (document: SuccessiveSearchDocument) =>
        ["service", "technology", "product", "global_capabilities"].includes(document.role) ||
          (document.role === "page" && /\b(?:services?|solutions?|consulting)\b/.test(
            normalizeSearchText(`${document.title} ${document.slug.replace(/-/g, " ")} ${document.service_type ?? ""}`),
          )) ? 3
          : document.role === "case_study" ? 2
          : ["partner", "partners", "blog", "editorial"].includes(document.role) ? 0 : 1;
      const roleDelta = explicitEditorialRequest
        ? Number(editorialRepresentation(b.document)) - Number(editorialRepresentation(a.document))
        : authority(b.document) - authority(a.document);
      const literalDelta = Number(b.strength >= 0.99) - Number(a.strength >= 0.99);
      return roleDelta || literalDelta || b.strength - a.strength ||
      b.document.normalizedTitle.length - a.document.normalizedTitle.length ||
      b.document.contentQuality - a.document.contentQuality;
    });
  const selected = candidates[0];
  const identityAuthority = (document: SuccessiveSearchDocument) =>
    ["service", "technology", "product", "global_capabilities"].includes(document.role) ||
      (document.role === "page" && /\b(?:services?|solutions?|consulting)\b/.test(
        normalizeSearchText(`${document.title} ${document.slug.replace(/-/g, " ")} ${document.service_type ?? ""}`),
      )) ? 3
      : document.role === "case_study" ? 2
      : ["partner", "partners", "blog", "editorial"].includes(document.role) ? 0 : 1;
  if (selected && candidates[1]?.strength === selected.strength &&
      identityAuthority(candidates[1].document) === identityAuthority(selected.document)) return undefined;
  if (!selected) return undefined;
  return {
    document: selected.document,
    score: Math.round((700 + selected.strength * 100) * 100) / 100,
    matchedFields: [selected.strength >= 0.99 ? "exact-title-lock" : "indexed-entity-typo-recovery",
      ...(definitionQuery && !selected.definitionPassages.length ? ["semantic-subject-evidence"] : [])],
    selectedPassages: definitionQuery
      ? (selected.definitionPassages.length ? selected.definitionPassages : selected.semanticPassages)
      : selected.localEvidence?.passages ?? [selected.document.chunks[0]?.text].filter((value): value is string => Boolean(value)),
    localEvidence: selected.localEvidence,
    confidence: "high",
    scoreBreakdown: {
      title: 700, headings: 0, metadata: 0, body: 0, contentType: 0,
      penalties: 0, authorityCoverage: selected.strength, entity: 1,
    },
  };
}

/**
 * Natural questions often wrap a canonical offering in outcome language. This
 * recognizes only a contiguous, independently title-local entity span; it
 * does not relax lexical ranking for queries that cannot prove such a span.
 */
export function matchEntityFirstQuestionSpan(index: SuccessiveSearchDocument[], message: string): SearchMatch | undefined {
  const normalized = normalizeSearchText(message);
  if (!/^(?:what|how|why|when|where|which|can|could|would|do|does|is|are|tell|explain|describe)\b/.test(normalized)) return undefined;
  const tokens = normalized.split(" ").filter(Boolean);
  const candidates: Array<{ document: SuccessiveSearchDocument; span: string; length: number; authority: number }> = [];
  for (let start = 0; start < tokens.length - 1; start += 1) {
    for (let end = Math.min(tokens.length, start + 7); end >= start + 2; end -= 1) {
      const span = tokens.slice(start, end).join(" ");
      index.forEach((document) => {
        const title = document.normalizedTitle;
        const canonicalOffering = ["service", "technology", "product", "accelerator", "industry", "global_capabilities"].includes(document.role) ||
          (document.role === "page" && /\b(?:services?|solutions?|consulting|capabilit(?:y|ies)|implementation|integration|development|engineering|platform|modernization)\b/.test(title));
        if (!canonicalOffering || !title.startsWith(`${span} `)) return;
        const suffix = title.slice(span.length + 1);
        if (!/\b(?:services?|solutions?|consulting|capabilit(?:y|ies)|implementation|integration|development|engineering|platform|modernization)\b/.test(suffix)) return;
        candidates.push({ document, span, length: end - start, authority: document.role === "service" ? 3 : 2 });
      });
    }
  }
  candidates.sort((left, right) => right.length - left.length || right.authority - left.authority || left.document.title.length - right.document.title.length);
  const selected = candidates[0];
  if (!selected || (candidates[1] && candidates[1].length === selected.length && candidates[1].authority === selected.authority)) return undefined;
  return {
    document: selected.document,
    score: 795,
    confidence: "high",
    matchedFields: ["entity-first-question-span", "canonical-page-identity"],
    selectedPassages: [selected.document.chunks[0]?.text].filter((value): value is string => Boolean(value)),
    scoreBreakdown: { title: 700, headings: 0, metadata: 0, body: 0, contentType: 0, penalties: 0, authorityCoverage: 0.97, entity: 1 },
  };
}

export async function resolveExactIndexedTitle(
  message: string,
  requestedContentType?: QueryUnderstanding["requestedContentType"],
): Promise<SearchMatch | undefined> {
  return matchExactIndexedTitle(await loadSearchIndex(), message, requestedContentType);
}

export function isExplicitRequestedRoleRelation(message: string): boolean {
  return Boolean(explicitRequestedRoleRelationSubject(message));
}

/** Keeps an explicit result role separate from the current-turn subject. */
function explicitRequestedRoleRelationSubject(message: string): string | undefined {
  return normalizeSearchText(message).match(
    /^(?:show(?: me)?|find|give me|do you have|any)\s+(?:related\s+)?(?:services?|capabilities|case studies|customer stories|blogs?|articles?|posts?|resources?|guides?|reports?|white ?papers?|e-?books?|products?|partners?|industries|accelerators?)\s+(?:related to|for|about|on)\s+(.+)$/,
  )?.[1]?.trim();
}

function hasStrongRelatedSubjectEvidence(document: SuccessiveSearchDocument, subject: string): boolean {
  const normalizedSubject = normalizeSearchText(subject);
  if (!normalizedSubject) return false;
  // Require the complete subject in one bounded, first-party field. This is
  // intentionally stricter than generic lexical scoring, which can assemble
  // coincidental words from unrelated content.
  return [
    document.title,
    document.slug.replace(/[-_]+/g, " "),
    ...document.aliases,
    ...document.headings.slice(0, 4),
    ...document.descriptions.slice(0, 4),
  ].some((field) => normalizeSearchText(field).includes(normalizedSubject));
}

export function matchValidatedRequestedRole(
  index: SuccessiveSearchDocument[],
  message: string,
  requested: QueryUnderstanding["requestedContentType"],
): SearchMatch[] {
  if (!requested) return [];
  const normalized = normalizeSearchText(message);
  const subject = explicitRequestedRoleRelationSubject(normalized);
  if (!subject) return [];
  const base = index
    .map((document) => ({ document, strength: directIdentityStrength(document, subject) }))
    .filter(({ strength }) => strength >= 0.96)
    .sort((a, b) => b.strength - a.strength)[0]?.document;
  if (!base) return [];
  const compatibleCandidates = index
    .filter((document) => document.id !== base.id || document.type !== base.type)
    .map((document) => {
      const relation = base.relatedCapabilities.find((item) => item.documentId === document.id) ??
        document.relatedCapabilities.find((item) => item.documentId === base.id);
      const structuralRelation = Boolean(relation?.evidence.some((item) =>
        ["explicit-reference", "internal-link", "taxonomy"].includes(item),
      ));
      const directSubjectEvidence = hasStrongRelatedSubjectEvidence(document, subject);
      return { document, relation, structuralRelation, directSubjectEvidence };
    })
    .filter(({ document, structuralRelation, directSubjectEvidence }) =>
      isRequestedContentTypeCompatible(document, requested) && (structuralRelation || directSubjectEvidence),
    );
  // Published structural links are the strongest relationship signal. Only
  // when none exists for the requested role may an independently subject-led
  // first-party record supply the bounded fallback set.
  const structuralCandidates = compatibleCandidates.filter(({ structuralRelation }) => structuralRelation);
  return (structuralCandidates.length ? structuralCandidates : compatibleCandidates)
    .sort((a, b) => Number(b.structuralRelation) - Number(a.structuralRelation) ||
      (b.relation?.score ?? 0) - (a.relation?.score ?? 0) || b.document.contentQuality - a.document.contentQuality)
    .slice(0, 5)
    .map(({ document, relation, structuralRelation }, position) => ({
      document, score: Math.round((620 + (structuralRelation ? relation?.score ?? 0 : 0.5) * 100 - position) * 100) / 100,
      matchedFields: [structuralRelation ? "validated-role-relation" : "strong-subject-role-relation", "requested-role-representation"],
      selectedPassages: [document.chunks[0]?.text].filter((value): value is string => Boolean(value)),
      confidence: "high" as const,
      scoreBreakdown: { title: 0, headings: 0, metadata: 620, body: 0, contentType: 100, penalties: 0, authorityCoverage: structuralRelation ? relation?.score ?? 0 : 0.5, entity: 1 },
    }));
}

function scoreChunk(
  chunk: SuccessiveSearchChunk,
  phraseQuery: string,
  normalizedQuery: string,
  idf: Map<string, number>,
): { score: number; fields: string[] } {
  const fields: string[] = [];
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const uniqueQueryTerms = new Set(queryTokens.map(stem));
  const expanded = expandedTerms(normalizedQuery);
  const terms = chunkTerms(chunk);
  const exactMatches = [...uniqueQueryTerms].filter((term) => terms.has(term));
  const expandedMatches = [...expanded].filter((term) => terms.has(term));
  const coverage =
    exactMatches.length /
    Math.max(1, uniqueQueryTerms.size || queryTokens.length);
  const weightedOverlap = exactMatches.reduce(
    (sum, term) => sum + (idf.get(term) ?? 1),
    0,
  );
  const phraseTokens = phraseQuery.split(" ").filter(Boolean);
  const bigrams = phraseNgrams(phraseTokens, 2);
  const trigrams = phraseNgrams(phraseTokens, 3);
  const matchedBigrams = bigrams.filter((gram) =>
    chunk.normalizedText.includes(gram),
  ).length;
  const matchedTrigrams = trigrams.filter((gram) =>
    chunk.normalizedText.includes(gram),
  ).length;

  let score = weightedOverlap * 9 + coverage * 45;
  if (phraseQuery.length >= 12 && chunk.normalizedText.includes(phraseQuery)) {
    score += 180;
    fields.push("exact-content-phrase");
  }
  if (matchedTrigrams) {
    score += 45 * (matchedTrigrams / Math.max(1, trigrams.length));
    fields.push("ordered-trigrams");
  } else if (matchedBigrams) {
    score += 24 * (matchedBigrams / Math.max(1, bigrams.length));
    fields.push("ordered-bigrams");
  }
  if (exactMatches.length) fields.push("content-token-overlap");
  if (expandedMatches.length > exactMatches.length) {
    score += Math.min(18, (expandedMatches.length - exactMatches.length) * 3);
    fields.push("semantic-expansion");
  }
  // A single generic word should never make a long document reliable.
  if (coverage < (uniqueQueryTerms.size <= 2 ? 0.5 : 0.34)) score *= 0.35;
  return { score, fields };
}

export function rankSearchDocument(
  document: SuccessiveSearchDocument,
  query: string,
  idf = new Map<string, number>(),
  understanding?: QueryUnderstanding,
): SearchMatch {
  const phraseQuery = normalizeSearchText(query).replace(
    /^(?:tell me more about|tell me about|explain|show me|what is|what are|define)\s+(?:the\s+)?/,
    "",
  );
  const normalizedQuery = normalizeQuery(query);
  const matchedFields: string[] = [];
  let titleScore = 0;
  let headingScore = 0;
  let metadataScore = 0;
  let contentTypeScore = 0;
  let penalties = 0;
  if (document.normalizedTitle === phraseQuery) {
    titleScore += 120;
    matchedFields.push("exact-title");
  } else if (
    phraseQuery.length >= 3 &&
    document.normalizedTitle.includes(phraseQuery)
  ) {
    titleScore += 90;
    matchedFields.push("title-phrase");
  }
  const matchedAlias = document.aliases.some(
    (alias) =>
      alias === normalizedQuery ||
      (alias.length >= 3 &&
        (` ${normalizedQuery} `.includes(` ${alias} `) ||
          normalizedQuery.startsWith(`${alias} `) ||
          normalizedQuery.endsWith(` ${alias}`)) &&
        (!normalizedQuery.startsWith("successive ") ||
          alias.startsWith("successive "))),
  );
  if (matchedAlias) {
    metadataScore += 100;
    matchedFields.push("alias");
  }
  if (canonicalPageMatch(document, query)) {
    metadataScore += 160;
    matchedFields.push("canonical-page-identity");
  }
  const titleTerms = new Set(document.normalizedTitle.split(" ").map(stem));
  const queryTerms = normalizedQuery.split(" ").map(stem).filter(Boolean);
  const titleOverlap = [...new Set(queryTerms)].filter((term) =>
    titleTerms.has(term),
  ).length;
  if (titleOverlap) {
    titleScore += Math.min(60, titleOverlap * 20);
    matchedFields.push("title-token-overlap");
  }
  if (queryTerms.length && queryTerms.every((term) => titleTerms.has(term))) {
    titleScore += 50;
    matchedFields.push("all-tokens-title");
  }

  const rankedChunks = document.chunks
    .map((chunk) => ({
      chunk,
      ...scoreChunk(chunk, phraseQuery, normalizedQuery, idf),
    }))
    .sort((a, b) => b.score - a.score || a.chunk.position - b.chunk.position);
  const best = rankedChunks[0];
  const headingText = normalizeSearchText(document.headings.slice(0, 12).join(" "));
  const ownedPhraseQuery = phraseQuery
    .replace(/^(?:our|your|successive(?: digital)? s)\s+/, "")
    .trim();
  const metadataText = normalizeSearchText(
    `${document.slug.replace(/-/g, " ")} ${document.aliases.join(" ")} ${document.service_type ?? ""}`,
  );
  const distinctQueryTerms = [...new Set(queryTerms)];
  const headingMatches = distinctQueryTerms.filter((term) =>
    new Set(headingText.split(" ").map(stem)).has(term),
  ).length;
  const metadataMatches = distinctQueryTerms.filter((term) =>
    new Set(metadataText.split(" ").map(stem)).has(term),
  ).length;
  headingScore += Math.min(72, headingMatches * 18);
  metadataScore += Math.min(48, metadataMatches * 12);
  if (phraseQuery.length >= 3 && headingText.includes(phraseQuery)) headingScore += 70;
  if (
    ownedPhraseQuery.length >= 4 &&
    document.headings.some((heading) =>
      normalizeSearchText(heading) === ownedPhraseQuery,
    )
  ) {
    headingScore += 140;
    matchedFields.push("exact-section-heading");
  }
  if (phraseQuery.length >= 3 && metadataText.includes(phraseQuery)) metadataScore += 55;

  const identityTerms = new Set([
    ...document.topicProfile.titleTerms,
    ...document.topicProfile.headingTerms,
    ...document.topicProfile.metadataTerms,
  ].map(stem));
  const identityMatches = distinctQueryTerms.filter((term) => identityTerms.has(term));
  const authorityCoverage = identityMatches.length / Math.max(1, distinctQueryTerms.length);
  for (const entity of understanding?.entities ?? []) {
    const normalizedEntity = normalizeSearchText(entity);
    if (!normalizedEntity) continue;
    const entityTokens = normalizedEntity.split(" ").filter(Boolean);
    const entityVariants = [...new Set([
      normalizedEntity,
      entityTokens.join(" "),
      entityTokens.length > 2
        ? `${entityTokens[0]} ${entityTokens[entityTokens.length - 1]}`
        : "",
    ].filter(Boolean))];
    const identityText = ` ${document.normalizedTitle} ${document.slug.replace(/-/g, " ")} ${document.aliases.join(" ")} `;
    if (entityVariants.some((variant) => identityText.includes(` ${variant} `))) {
      metadataScore += 150;
      matchedFields.push("exact-entity-authority");
    } else if (entityVariants.some((variant) =>
      ` ${document.combinedText} `.includes(` ${variant} `),
    ) || fuzzyPersonEntityInText(normalizedEntity, document.combinedText)) {
      metadataScore += 150;
      matchedFields.push("exact-entity-content");
    } else {
      penalties -= 90;
      matchedFields.push("entity-mismatch");
    }
  }
  if (understanding?.requestedContentType) {
    const requested = understanding.requestedContentType;
    const compatible = isRequestedContentTypeCompatible(document, requested);
    contentTypeScore += compatible ? 45 : -70;
  }
  if (understanding?.intent === "solve_problem" || understanding?.intent === "recommendation") {
    const profileTerms = new Set([
      ...document.capabilityProfile.problemTerms,
      ...document.capabilityProfile.outcomeTerms,
    ].map(stem));
    const profileMatches = distinctQueryTerms.filter((term) => profileTerms.has(term)).length;
    const profileCoverage = profileMatches / Math.max(1, distinctQueryTerms.length);
    if (document.role === "service") contentTypeScore += 45;
    else if (["editorial", "blog", "press_release", "case_study"].includes(document.role)) penalties -= 35;
    if (profileCoverage >= 0.34) {
      metadataScore += Math.round(profileCoverage * 90);
      matchedFields.push("capability-profile");
    }
  }
  if (
    distinctQueryTerms.length <= 2 &&
    document.role === "service" &&
    titleOverlap === distinctQueryTerms.length &&
    titleOverlap > 0
  ) {
    contentTypeScore += 150;
    matchedFields.push("primary-service-authority");
  }
  if (understanding?.intent === "informational" && document.role === "company" &&
      understanding.topics.every((topic) => /^(?:successive|digital|company|about us)$/i.test(topic))) {
    metadataScore += 200;
    matchedFields.push("canonical-company-authority");
  }
  let score = titleScore + headingScore + metadataScore + contentTypeScore + (best?.score ?? 0);
  // Generic short topics demand evidence that the document identifies itself
  // with the topic. A lone body sentence is supporting evidence, not authority.
  if (
    distinctQueryTerms.length <= 2 &&
    authorityCoverage === 0 &&
    !matchedFields.includes("canonical-page-identity")
  ) {
    penalties -= 75;
    matchedFields.push("incidental-body-only");
  } else if (
    distinctQueryTerms.length <= 3 &&
    authorityCoverage < 0.34 &&
    !matchedFields.includes("canonical-page-identity")
  ) {
    penalties -= 35;
    matchedFields.push("weak-topic-authority");
  }
  if (queryTerms.length >= 4) {
    const documentTerms = new Set(document.combinedText.split(" ").map(stem));
    const documentCoverage =
      [...new Set(queryTerms)].filter((term) => documentTerms.has(term))
        .length / new Set(queryTerms).size;
    if (
      documentCoverage < 0.6 &&
      !best?.fields.includes("semantic-expansion")
    ) {
      penalties -= 100;
      matchedFields.push("low-query-coverage");
    }
  }
  if (document.contentQuality < 25) penalties -= 30;
  if (
    /privacy|terms-of-services?|cookie-policy|cookies?|sitemap|thank-you|thank you/i.test(
      `${document.slug} ${document.title}`,
    )
  )
    penalties -= 60;
  score += penalties;
  if (best) matchedFields.push(...best.fields);
  const confidence: SearchMatch["confidence"] =
    matchedFields.some((field) => ["exact-title", "alias", "exact-entity-authority", "exact-entity-content", "canonical-company-authority", "canonical-page-identity"].includes(field))
      ? "high"
      : authorityCoverage >= 0.5 && score >= 90
        ? "medium"
        : "low";
  return {
    document,
    score: Math.round(score * 100) / 100,
    matchedFields: [...new Set(matchedFields)],
    // One substantial overlapping chunk per result yields a bounded Top 5
    // context set while retaining the surrounding paragraphs needed to answer.
    selectedPassages: best?.chunk.text ? [best.chunk.text] : [],
    scoreBreakdown: {
      title: titleScore,
      headings: headingScore,
      metadata: metadataScore,
      body: Math.round((best?.score ?? 0) * 100) / 100,
      contentType: contentTypeScore,
      penalties,
      authorityCoverage: Math.round(authorityCoverage * 100) / 100,
    },
    confidence,
  };
}

export async function retrieveFromIndex(
  query: string,
  currentIntent?: Intent,
  currentMessage = query,
  excludedContent = new Set<string>(),
  understanding?: QueryUnderstanding,
): Promise<RetrievalResult> {
  const retrievalStartedAt = performance.now();
  const baseIndex = await loadSearchIndex();
  const indexLoadedAt = performance.now();
  const normalizedQuery = correctMinorTyposFromIndex(normalizeQuery(query), baseIndex);
  const interpretedIntent: Intent | undefined =
    understanding?.requestedContentType === "case-study" || understanding?.intent === "evidence"
      ? "case_studies"
      : understanding?.requestedContentType === "blog"
        ? "blogs"
        : understanding?.requestedContentType === "event"
          ? "events"
          : understanding?.requestedContentType === "whitepaper"
            ? "resources"
            : understanding?.requestedContentType === "service"
              ? "products"
              : undefined;
  let intent =
    interpretedIntent ??
    (currentIntent && currentIntent !== "general"
      ? currentIntent
      : detectIntent(query));
  if (
    intent === "about" &&
    understanding &&
    understanding.topics.some((topic) => !/^(?:successive|digital|company|about us)$/.test(normalizeSearchText(topic)))
  ) intent = "general";
  const requestedServiceTypes =
    intent === "products" || intent === "product_detail"
      ? detectRequestedServiceTypes(currentMessage)
      : [];
  // The complete corpus already contains rendered pages. Per-query WordPress
  // searches caused request bursts and made a healthy warm index depend on a
  // second upstream round trip.
  const index = baseIndex;
  const isBusinessNeed = understanding?.intent === "solve_problem" || understanding?.intent === "recommendation";
  const bridgeBoosts = new Map<number, number>();
  if (isBusinessNeed) {
    const bridgeQuery = [
      understanding.businessProblem,
      ...understanding.desiredOutcomes,
      ...understanding.domains,
      ...understanding.technicalSignals,
      understanding.industry,
    ].filter(Boolean).join(" ");
    const bridgeIdf = buildInverseDocumentFrequency(index);
    index
      .filter((document) => ["case_study", "editorial", "blog", "press_release", "resource"].includes(document.role))
      .map((document) => rankSearchDocument(document, bridgeQuery || query, bridgeIdf, understanding))
      .filter((match) => match.score >= 90)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .forEach((match) => {
        match.document.relatedCapabilities.forEach((relation) => {
          if (relation.score < 0.55 || relation.evidence.length < 2) return;
          const boost = Math.min(28, relation.score * Math.min(100, match.score) * 0.35);
          bridgeBoosts.set(relation.documentId, Math.max(bridgeBoosts.get(relation.documentId) ?? 0, boost));
        });
      });
  }
  const relationshipsScoredAt = performance.now();
  // Successive exposes services and offerings as ordinary posts/pages. Do not
  // apply the legacy custom-product post-type shortcut.
  const isProductList = false;
  if (isProductList) {
    const matches = index
      .filter(
        (document) =>
          document.type === "product" ||
          (document.type === "page" && document.slug === "products"),
      )
      .map((document) => ({
        document,
        score: 100,
        matchedFields: ["product-category"],
        selectedPassages: document.chunks[0]?.text
          ? [document.chunks[0].text]
          : [],
      }))
      .sort((a, b) => {
        if (a.document.slug === "products") return -1;
        if (b.document.slug === "products") return 1;
        return a.document.title.localeCompare(b.document.title);
      })
      .slice(0, 6);
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: matches.length > 0,
      matches,
      isProductList,
    };
  }
  if (!normalizedQuery)
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: false,
      matches: [],
      isProductList,
    };
  const exactTitleLock = matchExactIndexedTitle(index, currentMessage, understanding?.requestedContentType);
  if (exactTitleLock &&
      !contentIdentity(exactTitleLock.document.title, exactTitleLock.document.url)
        .some((key) => excludedContent.has(key))) {
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: true,
      matches: [exactTitleLock],
      isProductList,
      candidates: [exactTitleLock],
    };
  }
  const entityFirstQuestionMatch = matchEntityFirstQuestionSpan(index, currentMessage);
  if (entityFirstQuestionMatch &&
      !contentIdentity(entityFirstQuestionMatch.document.title, entityFirstQuestionMatch.document.url)
        .some((key) => excludedContent.has(key))) {
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: true,
      matches: [entityFirstQuestionMatch],
      isProductList,
      candidates: [entityFirstQuestionMatch],
    };
  }
  const validatedRoleMatches = matchValidatedRequestedRole(
    index,
    currentMessage,
    understanding?.requestedContentType ?? null,
  ).filter((match) => !contentIdentity(match.document.title, match.document.url)
    .some((key) => excludedContent.has(key)));
  if (validatedRoleMatches.length) {
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: true,
      matches: validatedRoleMatches,
      isProductList,
      candidates: validatedRoleMatches,
    };
  }
  // "Related to" asks for an edge, not another rendering of the base entity.
  // If no structural edge validates the requested role, stop before lexical
  // ranking can return the base subject itself as apparent relationship proof.
  if (isExplicitRequestedRoleRelation(currentMessage)) {
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: false,
      matches: [],
      isProductList,
      candidates: [],
    };
  }
  const embeddedMatches = rankEmbeddedEntityEvidence(
    index,
    currentMessage,
    understanding,
    excludedContent,
  );
  const authoritativeEmbeddedMatches = embeddedMatches.filter((match) =>
    match.matchedFields.includes("embedded-direct-subject-authority") ||
    match.matchedFields.includes("exact-structured-section"),
  );
  if (authoritativeEmbeddedMatches.length) {
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: true,
      matches: authoritativeEmbeddedMatches,
      isProductList,
      candidates: authoritativeEmbeddedMatches,
    };
  }
  if (understanding?.temporalIntent && understanding.requestedContentType) {
    const dated = index
      .filter((document) => isRequestedContentTypeCompatible(document, understanding.requestedContentType))
      .filter((document) => Number.isFinite(Date.parse(document.modified ?? "")))
      .filter((document) => understanding.temporalIntent !== "upcoming" || Date.parse(document.modified ?? "") >= Date.now())
      .filter((document) => !contentIdentity(document.title, document.url).some((key) => excludedContent.has(key)));
    const topicalQuery = buildRetrievalQuery(understanding);
    const datedIdf = buildInverseDocumentFrequency(dated);
    const relevant = understanding.topics.length || understanding.entities.length || understanding.industry
      ? dated.map((document) => rankSearchDocument(document, topicalQuery, datedIdf, understanding))
          .filter((match) => match.score >= 45 && !match.matchedFields.includes("incidental-body-only"))
          .map((match) => match.document)
      : dated;
    const matches = relevant
      .sort((a, b) => understanding.temporalIntent === "upcoming"
        ? Date.parse(a.modified ?? "") - Date.parse(b.modified ?? "")
        : Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""))
      .slice(0, 1)
      .map((document, position): SearchMatch => ({
        document,
        score: 300 - position,
        matchedFields: [understanding.temporalIntent === "upcoming" ? "typed-upcoming-collection" : "typed-latest-collection"],
        selectedPassages: document.chunks[0]?.text ? [document.chunks[0].text] : [],
        confidence: "high",
        scoreBreakdown: { title: 0, headings: 0, metadata: 300 - position, body: 0, contentType: 100, penalties: 0, authorityCoverage: 1 },
      }));
    return { normalizedQuery, indexedDocuments: index.length, reliableMatchFound: matches.length > 0, matches, isProductList };
  }
  const directSubject = withoutServiceTypeTerms(extractDirectLookupSubject(currentMessage));
  const definitionQuery = isDirectDefinitionQuery(currentMessage) && isCompactDefinitionSubject(directSubject);
  const directMatches = index
    .map((document) => ({ document, strength: directIdentityStrength(
      document,
      directSubject,
      understanding?.requestedContentType,
    ), definitionPassages: definitionQuery ? definitionEvidencePassages(document, directSubject) : [],
    semanticPassages: definitionQuery ? semanticSynthesisEvidencePassages(document, directSubject) : [] }))
    .filter(({ document, strength, definitionPassages, semanticPassages }) =>
      strength >= 0.9 &&
      (!understanding?.requestedContentType ||
        isRequestedContentTypeCompatible(document, understanding.requestedContentType)) &&
      (!definitionQuery || definitionPassages.length > 0 || semanticPassages.length > 0) &&
      !contentIdentity(document.title, document.url).some((key) => excludedContent.has(key)),
    )
    .sort((a, b) => b.strength - a.strength || b.document.contentQuality - a.document.contentQuality);
  if (directMatches.length) {
    const matches: SearchMatch[] = directMatches.slice(0, 3).map(({ document, strength, definitionPassages, semanticPassages }, position) => ({
      document,
      score: Math.round((500 + strength * 100 - position) * 100) / 100,
      matchedFields: [strength >= 0.99 ? "normalized-exact-title" : "near-exact-title",
        ...(definitionQuery && !definitionPassages.length ? ["semantic-subject-evidence"] : [])],
      selectedPassages: definitionQuery
        ? (definitionPassages.length ? definitionPassages : semanticPassages)
        : [document.chunks.find(({ normalizedText }) =>
        document.productLike && /\b(?:is|are)\s+(?:an?\s+)?[^.!?]{0,140}\b(?:product|platform|solution|tool)\b/.test(normalizedText))?.text ??
        document.chunks[0]?.text].filter((value): value is string => Boolean(value)),
      confidence: "high",
      scoreBreakdown: { title: 500, headings: 0, metadata: 0, body: 0, contentType: 0, penalties: 0, authorityCoverage: strength },
    }));
    return { normalizedQuery, indexedDocuments: index.length, reliableMatchFound: true, matches, isProductList };
  }
  // Do not let broad lexical ranking turn contextual use/failure language
  // into a definition after all direct authoritative definition evidence was
  // rejected. This remains scoped to compact, explicit definition requests.
  if (definitionQuery) {
    return { normalizedQuery, indexedDocuments: index.length, reliableMatchFound: false, matches: [], candidates: [], isProductList };
  }
  const equivalentMatches = index
    .map((document) => ({ document, strength: canonicalEquivalentSubjectStrength(document, directSubject) }))
    .filter(({ document, strength }) => strength >= 0.95 &&
      !contentIdentity(document.title, document.url).some((key) => excludedContent.has(key)))
    .sort((left, right) => right.strength - left.strength || right.document.contentQuality - left.document.contentQuality)
    .slice(0, 3)
    .map(({ document, strength }, position): SearchMatch => ({
      document,
      score: Math.round((390 + strength * 100 - position) * 100) / 100,
      matchedFields: ["strong-equivalent-canonical-subject", "title-facet-equivalence"],
      selectedPassages: [document.chunks[0]?.text].filter((value): value is string => Boolean(value)),
      confidence: "high",
      scoreBreakdown: { title: 390, headings: 0, metadata: 100, body: 0, contentType: 80, penalties: 0, authorityCoverage: strength, entity: 1 },
    }));
  if (equivalentMatches.length) {
    return { normalizedQuery, indexedDocuments: index.length, reliableMatchFound: true, matches: equivalentMatches, candidates: equivalentMatches, isProductList };
  }
  // A compound capability label may use a canonical service's title for one
  // facet and its own published service copy for the other. This remains
  // fail-closed: every subject facet must be present in that same record and a
  // distinctive facet must identify the service title itself.
  const compoundTerms = directSubject.split(" ").filter((term) => term.length > 2);
  const compoundCapabilityMatches = compoundTerms.length >= 2 && compoundTerms.length <= 4
    ? index.filter((document) => isRequestedContentTypeCompatible(document, "service"))
      .map((document) => {
        const identity = normalizeSearchText(`${document.title} ${document.slug.replace(/-/g, " ")}`);
        const text = ` ${document.combinedText} `;
        const titleTerms = compoundTerms.filter((term) => identity.includes(` ${term} `));
        const allPresent = compoundTerms.every((term) => text.includes(` ${term} `));
        const distinctiveTitle = titleTerms.some((term) => term.length >= 6);
        return { document, titleTerms, allPresent, distinctiveTitle };
      })
      .filter((item) => item.allPresent && item.distinctiveTitle)
      .sort((left, right) => right.titleTerms.length - left.titleTerms.length || right.document.contentQuality - left.document.contentQuality)
      .slice(0, 2)
      .map(({ document }, position): SearchMatch => ({
        document, score: 470 - position,
        matchedFields: ["compound-canonical-capability", "canonical-service-authority"],
        selectedPassages: [document.chunks[0]?.text].filter((value): value is string => Boolean(value)),
        confidence: "high", scoreBreakdown: { title: 300, headings: 0, metadata: 100, body: 100, contentType: 80, penalties: 0, authorityCoverage: 1, entity: 1 },
      }))
    : [];
  if (compoundCapabilityMatches.length)
    return { normalizedQuery, indexedDocuments: index.length, reliableMatchFound: true, matches: compoundCapabilityMatches, candidates: compoundCapabilityMatches, isProductList };
  // An explicit "X services/capabilities" request is an identity lookup, not
  // permission to enumerate otherwise unrelated services whose body mentions
  // X. If no compatible canonical identity was found, fail closed before the
  // broad lexical scorer. Untyped topic discovery continues unchanged.
  if (understanding?.requestedContentType === "service" && directSubject &&
      extractExplicitInformationalSubject(currentMessage)) {
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: false,
      matches: [],
      candidates: [],
      isProductList,
    };
  }
  const broadServiceRequest = understanding?.targetScope === "portfolio" &&
    understanding.requestedContentType === "service" && !understanding.businessProblem &&
    understanding.entities.length === 0 && understanding.topics.length === 0;
  if (broadServiceRequest) {
    const portfolio = index
      .filter((document) => isRequestedContentTypeCompatible(document, "service"))
      .filter((document) => !isLegalDocument(document))
      .filter((document) => !contentIdentity(document.title, document.url).some((key) => excludedContent.has(key)))
      .sort((a, b) => {
        const aType = normalizeServiceSchemaType(a.service_type) === "pillar" ? 1 : 0;
        const bType = normalizeServiceSchemaType(b.service_type) === "pillar" ? 1 : 0;
        return bType - aType || b.contentQuality - a.contentQuality;
      });
    const authoritative = portfolio.filter((document) => normalizeServiceSchemaType(document.service_type) === "pillar");
    const chosen = authoritative.length ? authoritative : portfolio;
    const matches = chosen.slice(0, 8).map((document, position) => ({
      document,
      score: 180 - position,
      matchedFields: ["authoritative-service-portfolio"],
      selectedPassages: document.chunks[0]?.text ? [document.chunks[0].text] : [],
      confidence: "high" as const,
      scoreBreakdown: {
        title: 0,
        headings: 0,
        metadata: 180 - position,
        body: 0,
        contentType: 0,
        penalties: 0,
        authorityCoverage: 1,
      },
    }));
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: matches.length > 0,
      matches,
      isProductList,
      collectionTotal: chosen.length,
      collectionLabel: "services",
    };
  }
  const broadIndustryRequest = understanding?.targetScope === "portfolio" &&
    understanding.requestedContentType === "industry" && understanding.topics.length === 0;
  if (broadIndustryRequest) {
    const portfolio = index
      .filter((document) => document.role === "industry")
      .filter((document) => !contentIdentity(document.title, document.url).some((key) => excludedContent.has(key)))
      .sort((a, b) => a.title.localeCompare(b.title));
    const matches = portfolio.slice(0, 10).map((document, position) => ({
      document,
      score: 180 - position,
      matchedFields: ["authoritative-industry-portfolio"],
      selectedPassages: document.chunks[0]?.text ? [document.chunks[0].text] : [],
      confidence: "high" as const,
      scoreBreakdown: { title: 0, headings: 0, metadata: 180 - position, body: 0, contentType: 0, penalties: 0, authorityCoverage: 1 },
    }));
    return {
      normalizedQuery, indexedDocuments: index.length,
      reliableMatchFound: matches.length > 0, matches, isProductList,
      collectionTotal: portfolio.length, collectionLabel: "industries",
    };
  }
  if (isBroadAiServicesQuery(currentMessage)) {
    const aiPortfolio = index
      .filter(isAiPortfolioDocument)
      .filter(
        (document) =>
          !contentIdentity(document.title, document.url).some((key) =>
            excludedContent.has(key),
          ),
      );
    const aiIdf = buildInverseDocumentFrequency(aiPortfolio);
    const matches = aiPortfolio
      .map((document) =>
        rankSearchDocument(document, "artificial intelligence", aiIdf),
      )
      .filter((match) => match.selectedPassages.length > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.document.contentQuality - a.document.contentQuality,
      )
      .slice(0, 5)
      .map((match) => ({
        ...match,
        score: Math.max(100, match.score),
        matchedFields: [...match.matchedFields, "ai-service-portfolio"],
      }));
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: matches.length > 0,
      matches,
      isProductList,
      collectionTotal: aiPortfolio.length,
      collectionLabel: "AI services",
    };
  }
  if (isUseCaseQuery(currentMessage)) {
    const topic = extractUseCaseTopic(currentMessage);
    const useCaseIndex = index.filter(
      (document) =>
        !isLegalDocument(document) && matchesUseCaseTopic(document, topic),
    );
    const useCaseIdf = buildInverseDocumentFrequency(useCaseIndex);
    const scoringQuery = buildUseCaseScoringQuery(currentMessage);
    const rankedUseCases = useCaseIndex
      .map((document) => {
        const match = rankSearchDocument(document, scoringQuery, useCaseIdf);
        const contentTypeBonus = document.type.includes("case")
          ? 40
          : document.type === "post"
            ? 20
            : 0;
        return {
          ...match,
          score: match.score + contentTypeBonus,
          matchedFields: [...match.matchedFields, "topic-use-case"],
        };
      })
      .filter(
        (match) =>
          (topic ? true : match.score >= 48) &&
          match.selectedPassages.length > 0 &&
          !contentIdentity(match.document.title, match.document.url).some(
            (key) => excludedContent.has(key),
          ),
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.document.contentQuality - a.document.contentQuality,
      );
    const relativeCutoff = topic
      ? (rankedUseCases[0]?.score ?? 0) * 0.65
      : Math.max(48, (rankedUseCases[0]?.score ?? 0) * 0.65);
    const matches = rankedUseCases
      .filter((match) => match.score >= relativeCutoff)
      .slice(0, 5);
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: matches.length > 0,
      matches,
      isProductList,
      collectionTotal: rankedUseCases.length,
      collectionLabel: "use cases",
    };
  }
  if (/\bwhite ?papers?\b/.test(normalizeQuery(currentMessage))) {
    const requestedLatest = /\b(?:latest|newest|most recent)\b/.test(
      normalizeSearchText(query),
    );
    const requestedFullCollection =
      /\b(?:total|all|list|count|how many)\b/.test(
        normalizeSearchText(currentMessage),
      );
    const requestedMore =
      /\b(?:more|another|other|others|different|next)\b/.test(
        normalizeSearchText(currentMessage),
      );
    const allWhitepapers = index
      .filter(isWhitepaperDocument)
      .sort(
        (a, b) => Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""),
      );
    const topicalQuery = normalizeSearchText(query)
      .replace(/\b(?:white ?papers?|ebooks?|resources?|do you have|show me|any|about)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const eligibleWhitepapers = allWhitepapers.filter(
      (document) =>
        !contentIdentity(document.title, document.url).some((key) =>
          excludedContent.has(key),
        ),
    );
    const whitepaperIdf = buildInverseDocumentFrequency(eligibleWhitepapers);
    const whitepapers = eligibleWhitepapers
      .map((document) => rankSearchDocument(document, topicalQuery || "whitepaper", whitepaperIdf, understanding))
      .sort((a, b) => requestedLatest
        ? Date.parse(b.document.modified ?? "") - Date.parse(a.document.modified ?? "")
        : b.score - a.score)
      .slice(
        0,
        requestedLatest ? 1 : requestedFullCollection || requestedMore ? 15 : 3,
      )
      .map((match) => ({ ...match, matchedFields: [...match.matchedFields, "whitepaper-resource"] }))
      .filter((match) => match.selectedPassages.length > 0);
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: whitepapers.length > 0,
      matches: whitepapers,
      isProductList,
      collectionTotal: allWhitepapers.length,
      collectionLabel: "whitepapers",
    };
  }
  const collectionRequest = requestedCollection(currentMessage);
  if (collectionRequest) {
    const collection = index
      .filter(collectionRequest.matches)
      .sort(
        (a, b) => Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""),
      );
    const matches = collection
      .filter(
        (document) =>
          !contentIdentity(document.title, document.url).some((key) =>
            excludedContent.has(key),
          ),
      )
      .slice(0, 15)
      .map((document, position) => ({
        document,
        score: 200 - position,
        matchedFields: ["collection-list", "modified-date-order"],
        selectedPassages: document.chunks[0]?.text
          ? [document.chunks[0].text]
          : [],
      }))
      .filter((match) => match.selectedPassages.length > 0);
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: matches.length > 0,
      matches,
      isProductList,
      collectionTotal: collection.length,
      collectionLabel: collectionRequest.label,
    };
  }
  const normalizedCurrentMessage = normalizeQuery(currentMessage);
  const collectionDocuments =
    intent === "page" &&
    /\b(?:industry|industries)\b/.test(normalizedCurrentMessage)
      ? index.filter((document) => document.type === "industries")
      : intent === "page" &&
          /\b(?:career|careers|job|jobs)\b/.test(normalizedCurrentMessage)
        ? index.filter(
            (document) =>
              document.type === "careers" || document.slug === "careers",
          )
        : [];
  if (collectionDocuments.length) {
    const matches = collectionDocuments
      .filter(
        (document) =>
          !contentIdentity(document.title, document.url).some((key) =>
            excludedContent.has(key),
          ),
      )
      .map((document) => ({
        document,
        score: 100,
        matchedFields: ["collection-intent"],
        selectedPassages: document.chunks[0]?.text
          ? [document.chunks[0].text]
          : [],
        confidence: "high" as const,
        scoreBreakdown: {
          title: 0, headings: 0, metadata: 100, body: 0,
          contentType: 0, penalties: 0, authorityCoverage: 1,
        },
      }))
      .filter((match) => match.selectedPassages.length > 0)
      .sort((a, b) => b.document.contentQuality - a.document.contentQuality)
      .slice(0, 5);
    return {
      normalizedQuery,
      indexedDocuments: index.length,
      reliableMatchFound: matches.length > 0,
      matches,
      isProductList,
    };
  }
  const categoryIndex = index.filter((document) => {
    if (understanding?.requestedContentType &&
        !canonicalPageMatch(document, currentMessage) &&
        !isRequestedContentTypeCompatible(document, understanding.requestedContentType))
      return false;
    // In visitor language, "services" means the whole service family. Keep
    // strict ACF filtering only when the visitor explicitly asks for a pillar
    // or expertise; otherwise a dedicated Expertise/Sub-service page may be
    // the strongest authoritative answer for the named topic.
    if (requestsSpecificServiceTaxonomy(currentMessage) &&
        !matchesRequestedServiceType(currentMessage, document.service_type))
      return false;
    if (isLegalDocument(document)) {
      if (!explicitlyRequestsLegalContent(currentMessage)) return false;
      const requested = normalizeSearchText(currentMessage);
      if (/\bprivacy\b/.test(requested))
        return document.slug === "privacy-policy";
      if (/\bcookie\b/.test(requested)) return /cookie/.test(document.slug);
      if (/\bsitemap\b/.test(requested)) return /sitemap/.test(document.slug);
      return /^terms-of-services?/.test(document.slug);
    }
    if (intent === "about") {
      return (
        document.type === "page" &&
        ["about-us", "about"].includes(document.slug)
      );
    }
    if (intent !== "case_studies" && /\bfull stack\b/.test(normalizedQuery)) {
      return (
        document.type === "page" &&
        document.slug === "full-stack-development-company"
      );
    }
    if (intent === "events") {
      return (
        document.type === "page" &&
        (/webinar|event/.test(document.slug) ||
          /webinar|event/.test(document.normalizedTitle))
      );
    }
    if (
      intent === "page" &&
      /\b(?:career|careers|job|jobs)\b/.test(normalizedCurrentMessage)
    ) {
      return (
        document.type === "careers" ||
        (document.type === "page" && document.slug === "careers")
      );
    }
    if (
      intent === "page" &&
      /\b(?:industry|industries)\b/.test(normalizedCurrentMessage)
    ) {
      return (
        document.type === "industries" ||
        (document.type === "page" && document.slug === "industries")
      );
    }
    if (intent === "products" || intent === "product_detail") {
      if (["product", "kagen-product"].includes(understanding?.requestedContentType ?? ""))
        return document.productLike;
      // Successive publishes services/solutions as standard pages and posts,
      // not a custom `product` post type. Keep both collections eligible and
      // let full-text relevance select AI, engineering, cloud, data, etc.
      return (
        document.type === "page" ||
        document.type === "product" ||
        (document.type === "post" &&
          (document.normalizedTitle === normalizeSearchText(query) ||
            document.aliases.includes(normalizedQuery)))
      );
    }
    if (intent === "case_studies") {
      return (
        document.type.includes("case") ||
        (document.type === "page" && document.slug === "case-studies")
      );
    }
    if (intent === "blogs") {
      return (
        document.type === "post" ||
        (document.type === "page" && ["blog", "blogs"].includes(document.slug))
      );
    }
    return true;
  });
  const idf = buildInverseDocumentFrequency(categoryIndex);
  const correctedTopicalInput = correctMinorTyposFromIndex(query, categoryIndex);
  const topicalQuery =
    intent === "case_studies"
      ? normalizeSearchText(correctedTopicalInput)
          .replace(
            /\b(?:find|show|tell|case|study|studies|success|story|stories|about)\b/g,
            " ",
          )
          .replace(/\s+/g, " ")
          .trim()
      : requestedServiceTypes.length
        ? withoutServiceTypeTerms(correctedTopicalInput)
        : correctedTopicalInput;
  const semanticQuery = understanding ? buildRetrievalQuery(understanding) : "";
  const scoringQuery = intent === "about" ? "about us" : semanticQuery || topicalQuery || query;
  const scoringPlans = understanding
    ? [
        topicalQuery || query,
        ...understanding.topics,
        ...understanding.retrievalConcepts,
        ...(understanding.businessProblem ? [understanding.businessProblem] : []),
      ]
        .map((plan) => plan.trim())
        .filter(Boolean)
        .filter((plan, index, all) => all.indexOf(plan) === index)
        .slice(0, 10)
    : [];
  if (!scoringPlans.length) scoringPlans.push(scoringQuery);
  const evaluatedCandidates = categoryIndex
    .map((document) => {
      const alternatives = scoringPlans.map((plan, planIndex) => ({
        ...rankSearchDocument(document, plan, idf, understanding),
        planIndex,
      })).map((match) => ({
        ...match,
        score: match.score - (match.planIndex === 0 ? 0 : 55),
        matchedFields: match.planIndex === 0
          ? match.matchedFields
          : [...match.matchedFields, "expanded-query-plan"],
      }));
      const strongest = alternatives.sort((a, b) => b.score - a.score)[0]!;
      const dimensions = businessDimensions(document, understanding);
      const constraints = constraintAssessment(document, understanding, dimensions);
      const bridge = bridgeBoosts.get(document.id) ?? 0;
      const dimensionScore = isBusinessNeed
        ? dimensions.topic * 55 + dimensions.problem * 100 + dimensions.outcome * 70 +
          dimensions.industry * 80 + dimensions.entity * 90 + dimensions.functional * 140 + bridge -
          constraints.contradictions * 75 - (dimensions.functional === 0 ? 140 : 0)
        : dimensions.industry * 55 + dimensions.entity * 65;
      const roleAdjustment = isBusinessNeed
        ? document.role === "service"
          ? 90
          : ["case_study", "editorial", "blog", "press_release", "resource"].includes(document.role)
            ? -80
            : -25
        : 0;
      const scopeAdjustment = understanding?.targetScope === "company"
        ? document.role === "company" ? 180 : -90
        : understanding?.targetScope === "entity" && dimensions.entity > 0
          ? dimensions.entity * 100
          : 0;
      const freshnessAdjustment = understanding?.temporalIntent && document.modified
        ? Math.max(0, 30 - (Date.now() - Date.parse(document.modified)) / 31_536_000_000 * 3)
        : 0;
      return {
        ...strongest,
        score: strongest.score + dimensionScore + roleAdjustment + scopeAdjustment + freshnessAdjustment,
        matchedFields: [
          ...strongest.matchedFields,
          `query-plan:${strongest.planIndex + 1}`,
          ...(bridge > 0 ? ["case-study-capability-bridge"] : []),
          ...(isBusinessNeed && document.role === "service" ? ["capability-first"] : []),
        ],
        scoreBreakdown: strongest.scoreBreakdown
          ? {
              ...strongest.scoreBreakdown,
              topic: dimensions.topic,
              problem: dimensions.problem,
              outcome: dimensions.outcome,
              industry: dimensions.industry,
              entity: dimensions.entity,
              functional: dimensions.functional,
              bridge: Math.round(bridge * 100) / 100,
              constraintsSatisfied: constraints.satisfied,
              constraintsTotal: constraints.total,
              contradictions: constraints.contradictions,
            }
          : undefined,
      };
    })
    .map((match) =>
      intent === "events" && match.document.slug === "webinars"
        ? {
            ...match,
            score: 500,
            matchedFields: [...match.matchedFields, "event-collection"],
          }
        : match,
    )
  const rankedMatches = evaluatedCandidates
    .filter(
      (match) =>
        match.score >= 48 &&
        (!understanding?.requestedContentType ||
          (match.scoreBreakdown?.authorityCoverage ?? 0) >= 0.25 ||
          match.matchedFields.includes("normalized-exact-title") ||
          match.matchedFields.includes("exact-entity-authority")) &&
        match.selectedPassages.length > 0 &&
        !contentIdentity(match.document.title, match.document.url).some((key) =>
          excludedContent.has(key),
        ),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.document.contentQuality - a.document.contentQuality,
    );
  const relativeCutoff = Math.max(48, (rankedMatches[0]?.score ?? 0) * 0.65);
  const authoritativePage = rankedMatches.find((match) =>
    match.document.type === "page" &&
    canonicalPageMatch(match.document, currentMessage) &&
    match.matchedFields.some((field) =>
      ["exact-title", "title-phrase", "normalized-exact-title", "near-exact-title", "exact-section-heading", "canonical-page-identity"].includes(field),
    ),
  );
  const resultPool = authoritativePage
    ? rankedMatches.filter((match) => match.document.id === authoritativePage.document.id)
    : rankedMatches;
  const resultCutoff = Math.max(48, (resultPool[0]?.score ?? 0) * 0.65);
  const matches = resultPool
    .filter((match) => match.score >= resultCutoff)
    .slice(0, 5);
  return {
    normalizedQuery,
    indexedDocuments: index.length,
    reliableMatchFound: matches.length > 0,
    matches,
    isProductList,
    candidates: evaluatedCandidates.map((match) => ({
      ...match,
      rejectionReason:
        !match.selectedPassages.length
          ? "no searchable passage"
          : contentIdentity(match.document.title, match.document.url).some(
                (key) => excludedContent.has(key),
              )
            ? "already shown in this conversation"
            : match.score < 48
              ? "below minimum evidence threshold"
              : match.score < relativeCutoff
                ? "below relative relevance threshold"
                : undefined,
    })),
    timings: {
      indexLoadMs: Math.round((indexLoadedAt - retrievalStartedAt) * 100) / 100,
      relationshipScoringMs: Math.round((relationshipsScoredAt - indexLoadedAt) * 100) / 100,
      rankingMs: Math.round((performance.now() - relationshipsScoredAt) * 100) / 100,
    },
  };
}
