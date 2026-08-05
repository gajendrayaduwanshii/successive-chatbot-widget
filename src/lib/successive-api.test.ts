import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllPublishedContent, fetchSuccessive } from "./successive-api";

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown[], totalPages = 1) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-WP-TotalPages": String(totalPages),
    },
  });
}

describe("Successive WordPress v2 adapter", () => {
  it("loads posts and pages without calling the users endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/posts"))
          return response([
            { id: 1, type: "post", title: { rendered: "Insight" } },
          ]);
        if (url.pathname.endsWith("/pages"))
          return response([
            { id: 2, type: "page", title: { rendered: "Services" } },
          ]);
        return response([]);
      }),
    );

    const items = await fetchAllPublishedContent();
    expect(items.map(({ type }) => type)).toEqual(["post", "page"]);
    expect(fetch).toHaveBeenCalledTimes(12);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes("/users")),
    ).toBe(false);
  });

  it("follows X-WP-TotalPages for complete collection data", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return response(
        [{ id: Number(url.searchParams.get("page")), type: "post" }],
        2,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await fetchSuccessive("/posts");
    expect(items.map(({ id }) => id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("translates page slugs to the standard pages endpoint", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return response([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchSuccessive("/pages/contact-us");
    expect(requestedUrls[0]).toContain("/pages?");
    expect(requestedUrls[0]).toContain("slug=contact-us");
  });
});
