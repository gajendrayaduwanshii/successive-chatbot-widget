import { unstable_cache } from "next/cache";
import { getEnv } from "./env";
import { htmlToParagraphs } from "./html-utils";
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

function endpoint(collection: Collection, params?: URLSearchParams): string {
  const base = getEnv().SUCCESSIVE_API_BASE_URL.replace(/\/$/, "");
  const query = new URLSearchParams(params);
  query.set("per_page", query.get("per_page") ?? "100");
  query.set("_embed", "1");
  return `${base}/${collection}?${query}`;
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
    if (!Array.isArray(json)) {
      throw new SuccessiveApiError(
        `WordPress ${collection} endpoint returned invalid data`,
        "invalid",
      );
    }
    return {
      items: json as WordPressItem[],
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

const renderedContent = (item: WordPressItem): string =>
  typeof item.content === "string"
    ? item.content
    : (item.content?.rendered ?? "");

const readableContentLength = (item: WordPressItem): number =>
  htmlToParagraphs(renderedContent(item)).join(" ").length;

async function enrichRenderedContent(
  item: WordPressItem,
  attempt = 0,
): Promise<WordPressItem> {
  if (!item.link) return item;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(item.link, {
      signal: controller.signal,
      next: { revalidate: 300 },
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 SuccessiveAIContentIndexer/1.0",
      },
    });
    if (!response.ok) {
      return attempt === 0 ? enrichRenderedContent(item, 1) : item;
    }
    const html = await response.text();
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
    // A successful document without <main> uses a different template. Retrying
    // the identical response cannot add that element, so retain its REST data.
    if (!main) return item;
    const contentOnly = main
      .replace(
        /<(?:form|nav|footer|aside|noscript|svg|dialog)\b[^>]*>[\s\S]*?<\/(?:form|nav|footer|aside|noscript|svg|dialog)>/gi,
        " ",
      )
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
    const plainText = htmlToParagraphs(contentOnly).join("\n");
    if (!plainText) return item;
    return { ...item, content: { rendered: plainText } };
  } catch {
    // The REST summary remains usable if the rendered page is unavailable.
    return attempt === 0 ? enrichRenderedContent(item, 1) : item;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichWithConcurrency(
  items: WordPressItem[],
  concurrency = 32,
): Promise<WordPressItem[]> {
  const enriched = [...items];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      enriched[index] = await enrichRenderedContent(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return enriched;
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
  // Pages and case studies are always template-hydrated because their REST
  // bodies are commonly empty or summary-only. Other custom collections use
  // public HTML when their REST body is insufficient. Posts keep their strong
  // REST body and hydrate only the exceptional empty record.
  const itemsToHydrate = items.filter(
    (item) =>
      item.type === "page" ||
      item.type === "case_study" ||
      (item.type === "post"
        ? readableContentLength(item) === 0
        : readableContentLength(item) < 500),
  );
  const enrichedItems = await enrichWithConcurrency(itemsToHydrate);
  const enrichedByKey = new Map(
    enrichedItems.map((item) => [`${item.type}:${item.id}`, item]),
  );
  return items.map(
    (item) => enrichedByKey.get(`${item.type}:${item.id}`) ?? item,
  );
}

const fetchCachedPublishedContent = unstable_cache(
  fetchAllPublishedContentUncached,
  ["successive-hydrated-content-v1"],
  { revalidate: 300 },
);

export async function fetchAllPublishedContent(): Promise<WordPressItem[]> {
  // Tests use deterministic fetch mocks; production uses Vercel's shared data
  // cache so a hydrated 900+ document corpus is reused across function instances.
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
    return enrichWithConcurrency(canonicalPages);
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
  return enrichWithConcurrency(pages);
}

/**
 * Compatibility adapter for the original chatbot call sites. It translates the
 * old custom content paths into Successive's standard WordPress v2 endpoints.
 */
export async function fetchSuccessive(path: string): Promise<WordPressItem[]> {
  const url = new URL(path, "https://adapter.local");
  const params = new URLSearchParams();
  const search = url.searchParams.get("search");
  if (search) params.set("search", search);

  if (url.pathname.startsWith("/pages/")) {
    params.set("slug", url.pathname.slice("/pages/".length));
    return enrichWithConcurrency(await fetchCollection("pages", params));
  }
  if (url.pathname === "/pages") return fetchCollection("pages", params);
  if (url.pathname === "/posts") return fetchCollection("posts", params);
  const requestedType = url.searchParams.get("type");
  if (requestedType === "post") return fetchCollection("posts", params);
  if (requestedType === "page") return fetchCollection("pages", params);
  return fetchAllPublishedContent();
}
