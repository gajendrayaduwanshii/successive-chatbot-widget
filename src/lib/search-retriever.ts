import {
  fetchAllPublishedContent,
} from "./successive-api";
import { detectIntent, type Intent } from "./intent-detector";
import { contentIdentity } from "./conversation-context";
import {
  buildSearchIndex,
  normalizeSearchText,
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
const INDEX_CACHE_MS = 5 * 60 * 1000;
let cachedIndex:
  { expiresAt: number; documents: SuccessiveSearchDocument[] } | undefined;
let indexBuildPromise: Promise<SuccessiveSearchDocument[]> | undefined;
let lastIndexDiagnostics = { cache: "miss" as "hit" | "miss" | "shared", durationMs: 0, documents: 0 };

export function getIndexDiagnostics() {
  return { ...lastIndexDiagnostics };
}

export interface SearchMatch {
  document: SuccessiveSearchDocument;
  score: number;
  matchedFields: string[];
  selectedPassages: string[];
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

export function requestedCollection(
  query: string,
):
  | { label: string; matches: (document: SuccessiveSearchDocument) => boolean }
  | undefined {
  const q = normalizeSearchText(query);
  const requestsFullCollection = /\b(?:total|all|list|count|how many)\b/.test(
    q,
  );
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
      matches: (document) => document.type === "award",
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
        normalizedServiceType(document.service_type) === "expertise",
    };
  if (/\b(?:pillar|pillars|piller|pillers)\b/.test(q))
    return {
      label: "service pillars",
      matches: (document) =>
        normalizedServiceType(document.service_type) === "pillar",
    };
  // A paginated service request can carry a topic from prior turns (for
  // example, "AI services" -> "more services"), so keep it in semantic
  // retrieval. Explicit all/list/count requests still enumerate all services.
  if (requestsFullCollection && /\bservices?\b/.test(q))
    return {
      label: "services",
      matches: (document) =>
        normalizedServiceType(document.service_type) === "service",
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

function extractDirectLookupSubject(query: string): string {
  return normalizeSearchText(query)
    .replace(/^(?:summarize|summarise|give me a summary of)\s+(?:the\s+)?(?:blog|article|post)\s+/, "")
    .replace(/^(?:tell me (?:more )?about|do you have information about|show me (?:the )?(?:customer story|case study)|what business needs does)\s+/, "")
    .replace(/^(?:what|who)\s+(?:is|are)\s+(?:the\s+)?/, "")
    .replace(/\s+(?:address|addresses)$/, "")
    .trim();
}

function directIdentityStrength(document: SuccessiveSearchDocument, subject: string): number {
  if (!subject) return 0;
  const slug = normalizeSearchText(document.slug.replace(/-/g, " "));
  if (document.normalizedTitle === subject) return 1;
  if (slug === subject) return 0.99;
  if (document.aliases.includes(subject)) return 0.98;
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
    return (document.role === "product" || document.productLike) && (requested !== "kagen-product" || /kagen/.test(identity));
  if (requested === "technology") return document.role === "technology" || document.role === "global_capabilities";
  if (requested === "company" || requested === "leadership") return document.role === "company";
  if (requested === "culture") return document.role === "culture" || document.role === "company";
  if (requested === "sub-service") return normalizedServiceType(document.service_type) === "sub service";
  if (requested === "expertise") return normalizedServiceType(document.service_type) === "expertise";
  if (requested === "solution") return document.role === "service" || /solution/.test(identity);
  if (requested === "resource") return document.role === "resource";
  if (requested === "thought-leadership")
    return ["thought-leadership", "employee-perspective"].includes(document.type);
  if (requested === "partner") return document.type === "partners";
  if (requested === "industry") return document.type === "industries";
  if (requested === "career") return document.type === "careers" || document.slug === "careers";
  if (requested === "service")
    return ["service", "expertise", "pillar"].includes(normalizedServiceType(document.service_type));
  return document.type === "page";
}

export function normalizeQuery(query: string): string {
  const normalized = normalizeSearchText(query);
  // Recover a known high-level topic even when visitors add misspellings or
  // accidental keyboard noise around it (for example, "ai servies fhfghf").
  const recognizedTopic = /\bai\b.*\b(?:service|services|servies|solution|solutions)\b/.test(
          normalized,
        )
      ? "ai services"
      : normalized;
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

function normalizedServiceType(value: string | undefined): string {
  const normalized = normalizeSearchText(value ?? "").replace(/\s+/g, "-");
  // WordPress currently stores the dropdown values as `Sub-service` and the
  // misspelled `Piller`. Visitors use the cleaner words service and pillar.
  if (normalized === "sub-service") return "service";
  if (normalized === "piller") return "pillar";
  return normalized;
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
  const serviceType = normalizedServiceType(document.service_type);
  if (!["service", "expertise", "pillar"].includes(serviceType)) return false;
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
  return (
    requested.length === 0 ||
    requested.includes(
      normalizedServiceType(serviceType) as RequestedServiceType,
    )
  );
}

export function requestsSpecificServiceTaxonomy(query: string): boolean {
  return detectRequestedServiceTypes(query).some(
    (type) => type === "pillar" || type === "expertise",
  );
}

function withoutServiceTypeTerms(query: string): string {
  return normalizeSearchText(query)
    .replace(
      /\b(?:services?|servires?|serivces?|expertise|experts?|exper|pillars?|pillers?)\b/g,
      " ",
    )
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
  // WordPress content is already revalidated every five minutes. Reusing the
  // derived index avoids repeated recursive ACF traversal and chunk generation
  // on every chat request while preserving the same freshness window.
  if (process.env.NODE_ENV === "test")
    return buildSearchIndex(await fetchAllPublishedContent());
  if (cachedIndex && cachedIndex.expiresAt > Date.now()) {
    lastIndexDiagnostics = { cache: "hit", durationMs: 0, documents: cachedIndex.documents.length };
    return cachedIndex.documents;
  }
  if (indexBuildPromise) {
    lastIndexDiagnostics = { ...lastIndexDiagnostics, cache: "shared" };
    return indexBuildPromise;
  }
  const startedAt = Date.now();
  indexBuildPromise = fetchAllPublishedContent()
    .then(buildSearchIndex)
    .then((documents) => {
      cachedIndex = { documents, expiresAt: Date.now() + INDEX_CACHE_MS };
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
  const normalizedQuery = normalizeQuery(query);
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
  const explicitlyTypedLookup =
    /^(?:show me (?:the )?(?:customer story|case study)|(?:find|show|do you have) (?:me )?(?:a |an |the )?(?:white ?paper|e-?book|webinar|event|blog|article|thought leadership|case stud(?:y|ies)))\b/i.test(
      currentMessage.trim(),
    );
  const directMatches = index
    .map((document) => ({ document, strength: directIdentityStrength(document, directSubject) }))
    .filter(({ document, strength }) =>
      strength >= 0.9 &&
      (strength >= 0.99 ||
        !explicitlyTypedLookup ||
        isRequestedContentTypeCompatible(document, understanding?.requestedContentType ?? null)) &&
      !contentIdentity(document.title, document.url).some((key) => excludedContent.has(key)),
    )
    .sort((a, b) => b.strength - a.strength || b.document.contentQuality - a.document.contentQuality);
  if (directMatches.length) {
    const matches: SearchMatch[] = directMatches.slice(0, 3).map(({ document, strength }, position) => ({
      document,
      score: Math.round((500 + strength * 100 - position) * 100) / 100,
      matchedFields: [strength >= 0.99 ? "normalized-exact-title" : "near-exact-title"],
      selectedPassages: document.chunks[0]?.text ? [document.chunks[0].text] : [],
      confidence: "high",
      scoreBreakdown: { title: 500, headings: 0, metadata: 0, body: 0, contentType: 0, penalties: 0, authorityCoverage: strength },
    }));
    return { normalizedQuery, indexedDocuments: index.length, reliableMatchFound: true, matches, isProductList };
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
        const aType = normalizedServiceType(a.service_type) === "pillar" ? 1 : 0;
        const bType = normalizedServiceType(b.service_type) === "pillar" ? 1 : 0;
        return bType - aType || b.contentQuality - a.contentQuality;
      });
    const authoritative = portfolio.filter((document) => normalizedServiceType(document.service_type) === "pillar");
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
  const topicalQuery =
    intent === "case_studies"
      ? normalizeSearchText(query)
          .replace(
            /\b(?:find|show|tell|case|study|studies|success|story|stories|about)\b/g,
            " ",
          )
          .replace(/\s+/g, " ")
          .trim()
      : requestedServiceTypes.length
        ? withoutServiceTypeTerms(query)
        : query;
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
