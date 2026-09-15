import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import type { SuccessiveSearchDocument } from "./search-index";
import type { WordPressItem } from "@/types/wordpress";
import { discoverIndexedCollections, resolveCollectionResponse } from "./collection-response";

const state = vi.hoisted(() => ({ documents: [] as SuccessiveSearchDocument[], site: "https://example.test", provider: vi.fn() }));
vi.mock("./search-index", async (original) => ({ ...await original<typeof import("./search-index")>(), buildSearchIndex: () => state.documents }));
vi.mock("./successive-api", () => ({ fetchAllPublishedContent: async () => [], fetchSuccessive: async () => [],
  getContentLoadDiagnostics: () => ({ cache: "hit", durationMs: 0, failedCollections: [], partial: false, itemCount: state.documents.length }) }));
vi.mock("./env", () => ({ getEnv: () => ({ SUCCESSIVE_PUBLIC_SITE_URL: state.site, SUCCESSIVE_API_BASE_URL: `${state.site}/api`,
  ALLOWED_ORIGINS: state.site, AI_API_KEY: undefined, AI_PROVIDER: "unconfigured" }) }));
vi.mock("./llm", () => ({ getLLMProvider: state.provider }));
let post: typeof import("@/app/api/chat/route").POST;

beforeAll(async () => {
  state.provider.mockImplementation(() => { throw new Error("Provider must not initialize for collections"); });
  if (process.env.COLLECTION_INDEX_SNAPSHOT) {
    state.documents = JSON.parse(readFileSync(process.env.COLLECTION_INDEX_SNAPSHOT, "utf8")).documents;
    state.site = new URL(state.documents[0]!.url).origin;
  } else {
    const rows: WordPressItem[] = [];
    let id = 0;
    for (const [slug, type] of [["services", "page"], ["accelerators", "accelerators"], ["industries", "industries"],
      ["resources", "page"], ["blogs", "post"], ["whitepapers", "page"], ["ebooks", "page"], ["events", "page"],
      ["webinars", "page"], ["case-studies", "case_study"], ["expedition-guides", "expedition-guide"]]) {
      const rootId = ++id;
      rows.push({ id: rootId, type: "page", title: slug, slug, link: `${state.site}/${slug}/`,
        content: `Our ${slug} collection brings together published options for enterprise teams to explore.` });
      for (let i = 1; i <= 3; i++) rows.push({ id: ++id, type, parent: rootId, title: `${slug} offering ${i}`,
        slug: `offering-${i}`, link: `${state.site}/${slug}/offering-${i}/`,
        content: "Published capabilities help teams assess needs, plan implementation, and improve delivery outcomes." });
    }
    const original = await vi.importActual<typeof import("./search-index")>("./search-index");
    state.documents = original.buildSearchIndex(rows);
  }
  ({ POST: post } = await import("@/app/api/chat/route"));
});

describe("zero-provider collection route audit", () => {
  it("audits requested variants and all automatically discovered collections", async () => {
    const catalog = discoverIndexedCollections(state.documents, state.site);
    const required = ["services", "all services", "show all services", "all setvices", "accelerator", "all accelerators",
      "industries", "all industries", "resources", "all resources"];
    const queries = [...new Set([...required, ...catalog.flatMap((entry) => [entry.key, `show me all ${entry.key}`]), "press", "news", "events"] )];
    const records = [];
    for (const [index, query] of queries.entries()) {
      const resolved = resolveCollectionResponse(query, state.documents, state.site);
      if (!resolved) {
        records.push({ query, status: "NOT_RESOLVED", providerInitialized: "NOT_RUN", finalComposer: "NOT_RUN", llmCalls: null });
        expect(required.includes(query), query).toBe(false);
        continue;
      }
      state.provider.mockClear();
      const response = await post(new NextRequest(`${state.site}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json", origin: state.site, "x-forwarded-for": `collection-audit-${index}` },
        body: JSON.stringify({ message: query, history: [{ role: "user", content: "Tell me about React development" }, { role: "assistant", content: "React supports component-based interfaces." }], sessionId: `collection-audit-${index}` }),
      }));
      const payload = await response.json();
      expect(response.status, query).toBe(200);
      expect(payload.data.answer, query).toBe(resolved.answer);
      expect(payload.data.cards, query).toEqual([]);
      expect(state.provider, query).not.toHaveBeenCalled();
      expect(payload.data.answer.split(/\n\n/).length).toBeGreaterThanOrEqual(2);
      expect(payload.data.answer.split(/\n\n/).length).toBeLessThanOrEqual(3);
      records.push({ query, normalizedCollection: resolved.normalizedCollection, canonicalRoot: resolved.collection.root?.url ?? null,
        selectedChildren: resolved.children.map((doc) => ({ title: doc.title, url: doc.url, type: doc.type })),
        inlineLinks: resolved.inlineLinks, unrelatedTypesExcluded: resolved.children.every((doc) => resolved.collection.members.includes(doc)),
        authority: resolved.collection.authority, providerInitialized: "NO", finalComposer: "NO", llmCalls: state.provider.mock.calls.length,
        status: "PASS", answer: resolved.answer });
    }
    const unresolvedDiscovered = catalog.filter((entry) => !resolveCollectionResponse(entry.key, state.documents, state.site)).map((entry) => entry.key);
    if (process.env.COLLECTION_AUDIT_OUTPUT) writeFileSync(process.env.COLLECTION_AUDIT_OUTPUT, JSON.stringify({
      snapshot: process.env.COLLECTION_INDEX_SNAPSHOT ?? "synthetic fixtures", indexedDocuments: state.documents.length,
      discoveredCollections: catalog.length, unresolvedDiscovered, results: records,
    }, null, 2));
    expect(unresolvedDiscovered).toEqual([]);
  }, 60_000);
});
