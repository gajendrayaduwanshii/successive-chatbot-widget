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

type Collection = "posts" | "pages";

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

export async function fetchAllPublishedContent(): Promise<WordPressItem[]> {
  const results = await Promise.all([
    fetchCollection("posts"),
    fetchCollection("pages"),
  ]);
  return results.flat();
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
    return fetchCollection("pages", params);
  }
  if (url.pathname === "/pages") return fetchCollection("pages", params);
  if (url.pathname === "/posts") return fetchCollection("posts", params);
  const requestedType = url.searchParams.get("type");
  if (requestedType === "post") return fetchCollection("posts", params);
  if (requestedType === "page") return fetchCollection("pages", params);
  return fetchAllPublishedContent();
}
