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

  it("hydrates every page and stores rendered HTML as clean paragraph text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/pages"))
          return response([
            {
              id: 20,
              type: "page",
              slug: "web-apps",
              link: "https://successive.tech/web-apps/",
              title: { rendered: "Web Apps" },
              content: { rendered: "" },
            },
          ]);
        if (url.pathname === "/web-apps/")
          return new Response(
            "<main><h1>Web Apps</h1><script>ignore()</script><p>Clean searchable content.</p><form><label>Private form label</label></form></main>",
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        return response([]);
      }),
    );

    const items = await fetchAllPublishedContent();
    expect(items[0]?.content).toEqual({
      rendered: "Web Apps\nClean searchable content.",
    });
    expect(String(items[0]?.content)).not.toContain("ignore");
    expect(JSON.stringify(items[0]?.content)).not.toContain("Private form");
  });

  it("hydrates case studies and short custom records but keeps usable post REST bodies", async () => {
    const publicRequests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/posts"))
          return response([
            {
              id: 30,
              type: "post",
              link: "https://successive.tech/blog/usable-post/",
              content: { rendered: `<p>${"REST article ".repeat(80)}</p>` },
            },
          ]);
        if (url.pathname.endsWith("/case_study"))
          return response([
            {
              id: 31,
              type: "case_study",
              link: "https://successive.tech/case-study/example/",
              content: { rendered: "REST summary" },
            },
          ]);
        if (url.pathname.endsWith("/award"))
          return response([
            {
              id: 32,
              type: "award",
              link: "https://successive.tech/award/example/",
              content: { rendered: "Short REST body" },
            },
          ]);
        if (
          url.pathname === "/case-study/example/" ||
          url.pathname === "/award/example/"
        ) {
          publicRequests.push(url.pathname);
          return new Response(
            `<main><h1>Hydrated record</h1><p>${"Complete public content ".repeat(30)}</p></main>`,
            { status: 200 },
          );
        }
        return response([]);
      }),
    );

    const items = await fetchAllPublishedContent();
    expect(publicRequests.sort()).toEqual([
      "/award/example/",
      "/case-study/example/",
    ]);
    expect(
      JSON.stringify(items.find(({ id }) => id === 31)?.content),
    ).toContain("Complete public content");
    expect(
      JSON.stringify(items.find(({ id }) => id === 32)?.content),
    ).toContain("Complete public content");
    expect(
      JSON.stringify(items.find(({ id }) => id === 30)?.content),
    ).toContain("REST article");
  });

  it("fails safely when a public page has no main section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/pages"))
          return response([
            {
              id: 40,
              type: "page",
              link: "https://successive.tech/no-main/",
              content: { rendered: "Verified REST summary" },
            },
          ]);
        if (url.pathname === "/no-main/")
          return new Response("<html><body>No main template</body></html>", {
            status: 200,
          });
        return response([]);
      }),
    );

    const items = await fetchAllPublishedContent();
    expect(items[0]?.content).toEqual({ rendered: "Verified REST summary" });
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
    await fetchSuccessive("/pages/contact");
    expect(requestedUrls[0]).toContain("/pages?");
    expect(requestedUrls[0]).toContain("slug=contact");
  });
});
