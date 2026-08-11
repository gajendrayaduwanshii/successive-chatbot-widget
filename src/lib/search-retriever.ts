import {
  fetchAllPublishedContent,
  fetchRelevantRenderedPages,
} from "./successive-api";
import { detectIntent, type Intent } from "./intent-detector";
import { contentIdentity } from "./conversation-context";
import {
  buildSearchIndex,
  normalizeSearchText,
  type SuccessiveSearchChunk,
  type SuccessiveSearchDocument,
} from "./search-index";

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
];
const INDEX_CACHE_MS = 5 * 60 * 1000;
let cachedIndex:
  { expiresAt: number; documents: SuccessiveSearchDocument[] } | undefined;

export interface SearchMatch {
  document: SuccessiveSearchDocument;
  score: number;
  matchedFields: string[];
  selectedPassages: string[];
}

export interface RetrievalResult {
  normalizedQuery: string;
  indexedDocuments: number;
  reliableMatchFound: boolean;
  matches: SearchMatch[];
  isProductList: boolean;
  collectionTotal?: number;
  collectionLabel?: string;
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

export function normalizeQuery(query: string): string {
  const normalized = normalizeSearchText(query);
  // Recover a known high-level topic even when visitors add misspellings or
  // accidental keyboard noise around it (for example, "ai servies fhfghf").
  const recognizedTopic = /\bsuccessive add\b/.test(normalized)
    ? "agentic driven delivery legacy systems"
    : /\bai\b.*\b(?:service|services|servies|solution|solutions)\b/.test(
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
      /\b(?:show|give|tell|list|explore|find|me|about|successive|all|the|your|please)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:ai|artificial intelligence) (?:services?|solutions?|offerings?)$/.test(
    normalized,
  );
}

export function isUseCaseQuery(query: string): boolean {
  const normalized = normalizeSearchText(query);
  return /\b(?:use cases?|applications?)\b/.test(normalized);
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

function expandedTerms(normalizedQuery: string): Set<string> {
  const base = normalizedQuery.split(" ").filter(Boolean);
  const terms = new Set(base.flatMap((token) => [token, stem(token)]));
  for (const group of SYNONYM_GROUPS) {
    if (group.some((term) => terms.has(term) || terms.has(stem(term))))
      group.forEach((term) => {
        terms.add(term);
        terms.add(stem(term));
      });
  }
  return terms;
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
  if (
    process.env.NODE_ENV !== "test" &&
    cachedIndex &&
    cachedIndex.expiresAt > Date.now()
  )
    return cachedIndex.documents;
  const documents = buildSearchIndex(await fetchAllPublishedContent());
  if (process.env.NODE_ENV !== "test")
    cachedIndex = { documents, expiresAt: Date.now() + INDEX_CACHE_MS };
  return documents;
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
): SearchMatch {
  const phraseQuery = normalizeSearchText(query).replace(
    /^(?:tell me more about|tell me about|explain|show me)\s+/,
    "",
  );
  const normalizedQuery = normalizeQuery(query);
  const matchedFields: string[] = [];
  let documentBonus = 0;
  if (document.normalizedTitle === phraseQuery) {
    documentBonus += 120;
    matchedFields.push("exact-title");
  } else if (
    phraseQuery.length >= 3 &&
    document.normalizedTitle.includes(phraseQuery)
  ) {
    documentBonus += 90;
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
    documentBonus += 100;
    matchedFields.push("alias");
  }
  const titleTerms = new Set(document.normalizedTitle.split(" ").map(stem));
  const queryTerms = normalizedQuery.split(" ").map(stem).filter(Boolean);
  const titleOverlap = [...new Set(queryTerms)].filter((term) =>
    titleTerms.has(term),
  ).length;
  if (titleOverlap) {
    documentBonus += Math.min(60, titleOverlap * 20);
    matchedFields.push("title-token-overlap");
  }
  if (queryTerms.length && queryTerms.every((term) => titleTerms.has(term))) {
    documentBonus += 50;
    matchedFields.push("all-tokens-title");
  }

  const rankedChunks = document.chunks
    .map((chunk) => ({
      chunk,
      ...scoreChunk(chunk, phraseQuery, normalizedQuery, idf),
    }))
    .sort((a, b) => b.score - a.score || a.chunk.position - b.chunk.position);
  const best = rankedChunks[0];
  let score = documentBonus + (best?.score ?? 0);
  if (queryTerms.length >= 4) {
    const documentTerms = new Set(document.combinedText.split(" ").map(stem));
    const documentCoverage =
      [...new Set(queryTerms)].filter((term) => documentTerms.has(term))
        .length / new Set(queryTerms).size;
    if (
      documentCoverage < 0.6 &&
      !best?.fields.includes("semantic-expansion")
    ) {
      score -= 100;
      matchedFields.push("low-query-coverage");
    }
  }
  if (document.contentQuality < 25) score -= 30;
  if (
    /privacy|terms-of-services?|cookie-policy|cookies?|sitemap|thank-you|thank you/i.test(
      `${document.slug} ${document.title}`,
    )
  )
    score -= 60;
  if (best) matchedFields.push(...best.fields);
  return {
    document,
    score: Math.round(score * 100) / 100,
    matchedFields: [...new Set(matchedFields)],
    // One substantial overlapping chunk per result yields a bounded Top 5
    // context set while retaining the surrounding paragraphs needed to answer.
    selectedPassages: best?.chunk.text ? [best.chunk.text] : [],
  };
}

export async function retrieveFromIndex(
  query: string,
  currentIntent?: Intent,
  currentMessage = query,
  excludedContent = new Set<string>(),
): Promise<RetrievalResult> {
  const baseIndex = await loadSearchIndex();
  const normalizedQuery = normalizeQuery(query);
  const intent =
    currentIntent && currentIntent !== "general"
      ? currentIntent
      : detectIntent(query);
  const requestedServiceTypes =
    intent === "products" || intent === "product_detail"
      ? detectRequestedServiceTypes(currentMessage)
      : [];
  let index = baseIndex;
  if (!["blogs", "case_studies", "events"].includes(intent)) {
    try {
      const relevantPages = buildSearchIndex(
        await fetchRelevantRenderedPages(normalizedQuery || query),
      );
      const merged = new Map(
        baseIndex.map((document) => [
          `${document.type}:${document.id}`,
          document,
        ]),
      );
      relevantPages.forEach((document) =>
        merged.set(`${document.type}:${document.id}`, document),
      );
      index = [...merged.values()];
    } catch {
      // The complete cached corpus remains available if targeted lookup fails.
    }
  }
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
    let eligibleWhitepapers = allWhitepapers.filter(
      (document) =>
        !contentIdentity(document.title, document.url).some((key) =>
          excludedContent.has(key),
        ),
    );
    if (!requestedLatest)
      eligibleWhitepapers = [...eligibleWhitepapers].sort(
        () => Math.random() - 0.5,
      );
    const whitepapers = eligibleWhitepapers
      .slice(
        0,
        requestedLatest ? 1 : requestedFullCollection || requestedMore ? 15 : 3,
      )
      .map((document, position) => ({
        document,
        score: 200 - position,
        matchedFields: ["whitepaper-resource", "modified-date-order"],
        selectedPassages: document.chunks[0]?.text
          ? [document.chunks[0].text]
          : [],
      }))
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
    if (!matchesRequestedServiceType(currentMessage, document.service_type))
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
    if (
      intent !== "case_studies" &&
      /\b(?:location data|location intelligence|gis|arcgis)\b/.test(
        normalizedQuery,
      )
    ) {
      return (
        document.type === "page" &&
        /(?:location-intelligence|esri-arcgis|^gis$)/.test(document.slug)
      );
    }
    if (/\bsuccessive add\b/.test(normalizeSearchText(query))) {
      return (
        document.type === "post" &&
        document.slug ===
          "achieve-modernisation-through-agentic-driven-delivery-for-legacy-systems"
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
  const scoringQuery = intent === "about" ? "about us" : topicalQuery || query;
  const rankedMatches = categoryIndex
    .map((document) => rankSearchDocument(document, scoringQuery, idf))
    .map((match) =>
      intent === "events" && match.document.slug === "webinars"
        ? {
            ...match,
            score: 500,
            matchedFields: [...match.matchedFields, "event-collection"],
          }
        : match,
    )
    .filter(
      (match) =>
        match.score >= 48 &&
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
  const matches = rankedMatches
    .filter((match) => match.score >= relativeCutoff)
    .slice(0, 5);
  return {
    normalizedQuery,
    indexedDocuments: index.length,
    reliableMatchFound: matches.length > 0,
    matches,
    isProductList,
  };
}
