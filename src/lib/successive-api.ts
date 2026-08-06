import { unstable_cache } from "next/cache";
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
  query.set("per_page", query.get("per_page") ?? "100");
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
      next: { revalidate: 300 },
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
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) =>
      fetchPage(collection, index + 2, params),
    ),
  );
  return [...first.items, ...rest.flatMap(({ items }) => items)];
}

async function fetchAllPublishedContentUncached(): Promise<WordPressItem[]> {
  const settled = await Promise.allSettled(
    CONTENT_COLLECTIONS.map((collection) => fetchCollection(collection)),
  );
  const items = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (!items.length) {
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return [];
  }
  return items;
}

const fetchCachedPublishedContent = unstable_cache(
  fetchAllPublishedContentUncached,
  ["successive-complete-content-v1"],
  { revalidate: 300 },
);

export async function fetchAllPublishedContent(): Promise<WordPressItem[]> {
  // Tests use deterministic fetch mocks; production uses Vercel's shared data
  // cache so the complete corpus is reused across function instances.
  return process.env.NODE_ENV === "test"
    ? fetchAllPublishedContentUncached()
    : fetchCachedPublishedContent();
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
    params.set("slug", url.pathname.slice("/pages/".length));
    return fetchCollection("pages", params);
  }
  if (url.pathname === "/pages") return fetchCollection("pages", params);
  if (url.pathname === "/posts") return fetchCollection("posts", params);
  const requestedType = url.searchParams.get("type");
  if (requestedType === "post") return fetchCollection("posts", params);
  if (requestedType === "page") return fetchCollection("pages", params);
  return fetchAllPublishedContent();
}
