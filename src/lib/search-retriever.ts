import { fetchAllPublishedContent } from "./successive-api";
import { detectIntent } from "./intent-detector";
import {
  buildSearchIndex,
  normalizeSearchText,
  type SuccessiveSearchChunk,
  type SuccessiveSearchDocument,
} from "./search-index";

const STOPWORDS = new Set([
  "do",
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
}

export function normalizeQuery(query: string): string {
  const normalized = normalizeSearchText(query);
  // Recover a known high-level topic even when visitors add misspellings or
  // accidental keyboard noise around it (for example, "ai servies fhfghf").
  const recognizedTopic =
    /\bai\b.*\b(?:service|services|servies|solution|solutions)\b/.test(
      normalized,
    )
      ? "ai services"
      : normalized;
  // Short topic prompts need enough meaning to retrieve the corresponding
  // website page. This keeps answers grounded while supporting the terse
  // queries people naturally enter in a chat widget.
  const topicAliases: Record<string, string> = {
    about: "successive company",
    "about us": "successive company",
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
  };
  const corrected = tokens.map((token) => corrections[token] ?? token);
  return [...new Set(corrected)].join(" ");
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
  const phraseQuery = normalizeSearchText(query);
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
        normalizedQuery.includes(alias) &&
        (!normalizedQuery.startsWith("successive ") ||
          alias.startsWith("successive "))),
  );
  if (matchedAlias) {
    documentBonus += 100;
    matchedFields.push("alias");
  }
  const titleTerms = new Set(document.normalizedTitle.split(" ").map(stem));
  const queryTerms = normalizedQuery.split(" ").map(stem).filter(Boolean);
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
  if (document.contentQuality < 25) score -= 30;
  if (
    /privacy|sitemap|thank-you|thank you/i.test(
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
): Promise<RetrievalResult> {
  const index = await loadSearchIndex();
  const normalizedQuery = normalizeQuery(query);
  const intent = detectIntent(query);
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
  const categoryIndex = index.filter((document) => {
    if (intent === "products" || intent === "product_detail") {
      // Successive publishes services/solutions as standard pages and posts,
      // not a custom `product` post type. Keep both collections eligible and
      // let full-text relevance select AI, engineering, cloud, data, etc.
      return true;
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
  const matches = categoryIndex
    .map((document) => rankSearchDocument(document, query, idf))
    .filter((match) => match.score >= 48 && match.selectedPassages.length > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.document.contentQuality - a.document.contentQuality,
    )
    .slice(0, 5);
  return {
    normalizedQuery,
    indexedDocuments: index.length,
    reliableMatchFound: matches.length > 0,
    matches,
    isProductList,
  };
}
