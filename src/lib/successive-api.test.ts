import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllPublishedContent, fetchSuccessive } from "./successive-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function response(data: unknown[], totalPages = 1) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-WP-TotalPages": String(totalPages),
    },
  });
}

describe("Successive custom v1 adapter", () => {
  it("loads complete collections only through the custom content endpoint", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        requestedUrls.push(url.toString());
        const type = url.searchParams.get("type");
        if (type === "post")
          return response([
            { id: 1, type: "post", title: { rendered: "Insight" } },
          ]);
        if (type === "page")
          return response([
            {
              id: 2,
              type: "page",
              title: { rendered: "Services" },
              acf: { service_type: "Piller", description: "Complete ACF" },
            },
          ]);
        return response([]);
      }),
    );

    const items = await fetchAllPublishedContent();
    expect(items.map(({ type }) => type)).toEqual(["post", "page"]);
    expect(items[1]?.acf).toEqual({
      service_type: "Piller",
      description: "Complete ACF",
    });
    expect(fetch).toHaveBeenCalledTimes(12);
    expect(requestedUrls.every((url) => url.includes("/content?"))).toBe(true);
    expect(
      requestedUrls.every((url) => url.includes("/successive-digital/v1/")),
    ).toBe(true);
    expect(requestedUrls.some((url) => url.includes("/users"))).toBe(false);
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
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("type=post");
  });

  it("bounds paginated WordPress concurrency and uses compact pages", async () => {
    let active = 0;
    let maximumActive = 0;
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedUrls.push(String(input));
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return response([], 9);
      }),
    );
    await fetchSuccessive("/posts");
    expect(maximumActive).toBeLessThanOrEqual(4);
    expect(requestedUrls[0]).toContain("per_page=10");
  });

  it("uses the v1 page-detail route for exact slug lookup", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        requestedUrls.push(url.toString());
        return new Response(
          JSON.stringify({
            id: 2603,
            type: "page",
            slug: "full-stack-development-company",
            acf: { description2: "Complete custom ACF content" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const page = await fetchSuccessive(
      "/pages/full-stack-development-company",
    );
    expect(page[0]?.acf).toEqual({
      description2: "Complete custom ACF content",
    });
    expect(requestedUrls[0]).toBe(
      "https://successive.tech/wp-json/successive-digital/v1/pages/full-stack-development-company",
    );
  });

  it("maps custom collection paths to content type parameters", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedUrls.push(String(input));
        return response([]);
      }),
    );

    await fetchSuccessive("/content?type=page");
    await fetchSuccessive("/content?type=post");
    expect(requestedUrls[0]).toContain("/content?");
    expect(requestedUrls[0]).toContain("type=page");
    expect(requestedUrls[1]).toContain("type=post");
  });
});
