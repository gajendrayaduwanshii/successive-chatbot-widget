import { getEnv } from "./env";
import type { WordPressItem } from "@/types/wordpress";

export class SuccessiveApiError extends Error {
  constructor(
    message: string,
    public kind: "timeout" | "unavailable" | "invalid",
  ) {
    super(message);
  }
}

const CONTENT_COLLECTIONS = [
  "posts",
  "pages",
  "accelerators",
  "award",
  "careers",
  "case_study",
  "employee-perspective",
  "industries",
  "media-coverage",
  "partners",
  "press-release",
  "thought-leadership",
] as const;

type Collection = (typeof CONTENT_COLLECTIONS)[number];
// The API supports 100 items per page. A size of 10 multiplies cold-start
// network requests and makes the first chat request appear to hang.
const PAGE_SIZE = 100;
const WORDPRESS_CONCURRENCY = 4;
const CORPUS_TTL_MS = 60 * 60 * 1000;
const CORPUS_STALE_MS = 2 * 60 * 60 * 1000;
const CANONICAL_TTL_MS = 60 * 60 * 1000;
const CANONICAL_STALE_MS = 2 * 60 * 60 * 1000;

export interface ContentLoadDiagnostics {
  cache: "hit" | "miss" | "stale";
  durationMs: number;
  failedCollections: string[];
  partial: boolean;
  itemCount: number;
}

let corpusCache:
  | { items: WordPressItem[]; loadedAt: number; diagnostics: ContentLoadDiagnostics }
  | undefined;
let corpusBuildPromise: Promise<WordPressItem[]> | undefined;
const canonicalCache = new Map<string, { items: WordPressItem[]; loadedAt: number }>();
const canonicalRequests = new Map<string, Promise<WordPressItem[]>>();
let lastDiagnostics: ContentLoadDiagnostics = {
  cache: "miss",
  durationMs: 0,
  failedCollections: [],
  partial: false,
  itemCount: 0,
};

export function getContentLoadDiagnostics(): ContentLoadDiagnostics {
  return { ...lastDiagnostics, failedCollections: [...lastDiagnostics.failedCollections] };
}

async function mapBounded<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await operation(values[index]!) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}

const customContentType = (collection: Collection): string => {
  if (collection === "posts") return "post";
  if (collection === "pages") return "page";
  return collection;
};

function endpoint(collection: Collection, params?: URLSearchParams): string {
  const base = getEnv().SUCCESSIVE_API_BASE_URL.replace(/\/$/, "");
  const query = new URLSearchParams(params);
  const slug = query.get("slug");
  if (collection === "pages" && slug) {
    return `${base}/pages/${encodeURIComponent(slug)}`;
  }
  query.delete("slug");
  query.set("type", customContentType(collection));
  query.set("per_page", query.get("per_page") ?? String(PAGE_SIZE));
  return `${base}/content?${query}`;
}

async function fetchPage(
  collection: Collection,
  page: number,
  params = new URLSearchParams(),
  attempt = 0,
): Promise<{ items: WordPressItem[]; totalPages: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const query = new URLSearchParams(params);
  query.set("page", String(page));
  try {
    const response = await fetch(endpoint(collection, query), {
      signal: controller.signal,
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new SuccessiveApiError(
        `WordPress ${collection} endpoint returned ${response.status}`,
        "unavailable",
      );
    }
    const json: unknown = await response.json();
    const detailResponse = collection === "pages" && params.has("slug");
    const items = detailResponse && json && !Array.isArray(json) ? [json] : json;
    if (!Array.isArray(items)) {
      throw new SuccessiveApiError(
        `WordPress ${collection} endpoint returned invalid data`,
        "invalid",
      );
    }
    return {
      items: items as WordPressItem[],
      totalPages: Math.max(
        1,
        Number(response.headers.get("X-WP-TotalPages") ?? "1") || 1,
      ),
    };
  } catch (error) {
    if (
      attempt === 0 &&
      (!(error instanceof SuccessiveApiError) || error.kind !== "invalid")
    ) {
      return fetchPage(collection, page, params, attempt + 1);
    }
    if (error instanceof SuccessiveApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SuccessiveApiError("WordPress request timed out", "timeout");
    }
    throw new SuccessiveApiError(
      "Could not reach the Successive content service",
      "unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCollection(
  collection: Collection,
  params = new URLSearchParams(),
): Promise<WordPressItem[]> {
  const first = await fetchPage(collection, 1, params);
  if (first.totalPages <= 1) return first.items;
  const pages = Array.from({ length: first.totalPages - 1 }, (_, index) => index + 2);
  const rest = await mapBounded(pages, WORDPRESS_CONCURRENCY, (page) =>
    fetchPage(collection, page, params),
  );
  return [
    ...first.items,
    ...rest.flatMap((result) =>
      result.status === "fulfilled" ? result.value.items : [],
    ),
  ];
}

async function fetchCanonicalPage(slug: string): Promise<WordPressItem[]> {
  if (process.env.NODE_ENV === "test")
    return fetchCollection("pages", new URLSearchParams({ slug }));
  const now = Date.now();
  const cached = canonicalCache.get(slug);
  if (cached && now - cached.loadedAt < CANONICAL_TTL_MS) return cached.items;
  const pending = canonicalRequests.get(slug);
  if (pending) return cached && now - cached.loadedAt < CANONICAL_STALE_MS
    ? cached.items
    : pending;
  const request = fetchCollection("pages", new URLSearchParams({ slug }))
    .then((items) => {
      if (items.length) canonicalCache.set(slug, { items, loadedAt: Date.now() });
      return items;
    })
    .catch((error) => {
      if (cached && Date.now() - cached.loadedAt < CANONICAL_STALE_MS) return cached.items;
      throw error;
    })
    .finally(() => canonicalRequests.delete(slug));
  canonicalRequests.set(slug, request);
  return request;
}

async function fetchAllPublishedContentUncached(): Promise<WordPressItem[]> {
  const startedAt = Date.now();
  const settled = await mapBounded(
    CONTENT_COLLECTIONS,
    WORDPRESS_CONCURRENCY,
    (collection) => fetchCollection(collection),
  );
  const items = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (!items.length) {
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return [];
  }
  const failedCollections = CONTENT_COLLECTIONS.filter(
    (_, index) => settled[index]?.status === "rejected",
  );
  lastDiagnostics = {
    cache: "miss",
    durationMs: Date.now() - startedAt,
    failedCollections: [...failedCollections],
    partial: failedCollections.length > 0,
    itemCount: items.length,
  };
  return items;
}

export async function fetchAllPublishedContent(): Promise<WordPressItem[]> {
  if (process.env.NODE_ENV === "test") return fetchAllPublishedContentUncached();
  const now = Date.now();
  if (corpusCache && now - corpusCache.loadedAt < CORPUS_TTL_MS) {
    lastDiagnostics = { ...corpusCache.diagnostics, cache: "hit", durationMs: 0 };
    return corpusCache.items;
  }
  if (corpusBuildPromise) {
    if (corpusCache && now - corpusCache.loadedAt < CORPUS_STALE_MS) {
      lastDiagnostics = { ...corpusCache.diagnostics, cache: "stale", durationMs: 0 };
      return corpusCache.items;
    }
    return corpusBuildPromise;
  }
  corpusBuildPromise = fetchAllPublishedContentUncached()
    .then((items) => {
      corpusCache = { items, loadedAt: Date.now(), diagnostics: lastDiagnostics };
      return items;
    })
    .catch((failure) => {
      if (corpusCache && Date.now() - corpusCache.loadedAt < CORPUS_STALE_MS) {
        lastDiagnostics = { ...corpusCache.diagnostics, cache: "stale", durationMs: 0 };
        return corpusCache.items;
      }
      throw failure;
    })
    .finally(() => {
      corpusBuildPromise = undefined;
    });
  return corpusBuildPromise;
}

export async function fetchRelevantRenderedPages(
  query: string,
): Promise<WordPressItem[]> {
  if (/\b(?:web app|web apps|browser|online presence)\b/i.test(query)) {
    const canonicalPages = await fetchCollection(
      "pages",
      new URLSearchParams({ slug: "custom-web-app-development" }),
    );
    return canonicalPages;
  }
  let searches = [query];
  if (/\bai\b.*\b(?:service|services|solution|solutions)\b/i.test(query)) {
    searches = [query, "artificial intelligence", "generative AI"];
  }
  const searchSettled = await Promise.allSettled(
    searches.map((search) =>
      fetchCollection("pages", new URLSearchParams({ search, per_page: "20" })),
    ),
  );
  const fulfilledItems = (
    results: PromiseSettledResult<WordPressItem[]>[],
  ): WordPressItem[] =>
    results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  const pages = [
    ...new Map(
      fulfilledItems(searchSettled).map((page) => [page.id, page]),
    ).values(),
  ].slice(0, 10);
  return pages;
}

/**
 * Compatibility adapter for chatbot call sites using Successive custom v1.
 */
export async function fetchSuccessive(path: string): Promise<WordPressItem[]> {
  const url = new URL(path, "https://adapter.local");
  const params = new URLSearchParams();
  const search = url.searchParams.get("search");
  if (search) params.set("search", search);

  if (url.pathname.startsWith("/pages/")) {
    return fetchCanonicalPage(url.pathname.slice("/pages/".length));
  }
  if (url.pathname === "/pages") return fetchCollection("pages", params);
  if (url.pathname === "/posts") return fetchCollection("posts", params);
  const requestedType = url.searchParams.get("type");
  if (requestedType === "post") return fetchCollection("posts", params);
  if (requestedType === "page") return fetchCollection("pages", params);
  const collection = CONTENT_COLLECTIONS.find((candidate) =>
    customContentType(candidate) === requestedType || candidate === requestedType,
  );
  if (collection) return fetchCollection(collection, params);
  return fetchAllPublishedContent();
}
