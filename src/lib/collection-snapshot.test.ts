import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { WordPressItem } from "@/types/wordpress";
import { buildSearchIndex, isServiceFamilySchemaType, type SuccessiveSearchDocument } from "./search-index";
import { resolveCollectionResponse } from "./collection-response";

const site = "https://successive.tech";
let docs: SuccessiveSearchDocument[];
beforeAll(() => {
  const snapshot = JSON.parse(readFileSync("SUCCESSIVE_CHATBOT_SOURCE_API_RECORDS.json", "utf8")) as {
    records: Array<{ original_metadata: WordPressItem }>;
  };
  docs = buildSearchIndex(snapshot.records.map(record => record.original_metadata));
}, 60_000);

describe("collection resolution against the project API export", () => {
  it.each([
    ["services", "service"], ["show me all setvices", "service"], ["Industries", "industry"],
    ["Case study", "case study"], ["Resources", "resource"], ["Blogs", "blog"], ["posts", "blog"],
    ["Whitepaper", "whitepaper"], ["Show all whitepaper", "whitepaper"], ["eBooks", "ebook"],
    ["Webinars", "webinar"], ["press release", "press release"], ["media coverage", "media coverage"],
    ["PR and news", "pr and media coverage"], ["Press Release Media Coverage", "pr and media coverage"],
  ])("resolves %s from indexed authority", (query, key) => {
    const result = resolveCollectionResponse(query, docs, site)!;
    expect(result, query).toBeDefined();
    expect(result.normalizedCollection).toBe(key);
    expect(result.children.length).toBeGreaterThan(0);
    expect(result.children.length).toBeLessThanOrEqual(3);
    expect(result.children.every(doc => docs.includes(doc))).toBe(true);
    expect(result.inlineLinks).toBe(result.children.length + Number(Boolean(result.collection.root)));
  });
  it("keeps resources separate from service pages and distinguishes lead-magnet subtypes", () => {
    const resources = resolveCollectionResponse("resources", docs, site)!;
    expect(resources.collection.members.filter(doc => isServiceFamilySchemaType(doc.service_type)).map(doc => doc.title)).toEqual([]);
    expect(resources.collection.members.some(doc => doc.slug === "human-resource-management-system")).toBe(false);
    const whitepapers = resolveCollectionResponse("whitepapers", docs, site)!;
    const ebooks = resolveCollectionResponse("ebooks", docs, site)!;
    expect(whitepapers.collection.members.some(doc => ebooks.collection.members.includes(doc))).toBe(false);
    expect(resources.collection.root?.slug).toBe("whitepapers");
  });
  it("keeps press/media separate and combines only their members", () => {
    const press = resolveCollectionResponse("press release", docs, site)!;
    const media = resolveCollectionResponse("media coverage", docs, site)!;
    const combined = resolveCollectionResponse("PR and news", docs, site)!;
    expect(press.collection.members.every(doc => doc.type === "press-release")).toBe(true);
    expect(media.collection.members.every(doc => doc.type === "media-coverage")).toBe(true);
    expect(combined.collection.members).toHaveLength(press.collection.members.length + media.collection.members.length);
    expect(combined.collection.root?.slug).toBe("pr-and-media-coverage");
    expect(new Set(combined.children.map(doc => doc.type))).toEqual(new Set(["press-release", "media-coverage"]));
  });
  it("preserves exact article, resource, service and dependent queries", () => {
    for (const title of ["Human Resource Management System", "React.js Development Company", "AI in Commerce",
      "Corent Technology 101 Guide to Cloud Modernization Platform", "more like this", "resources about React", "whitepaper benefits"]) {
      expect(resolveCollectionResponse(title, docs, site), title).toBeUndefined();
    }
  });
  it("does not invent an unsupported event collection or service landing URL", () => {
    expect(resolveCollectionResponse("events", docs, site)).toBeUndefined();
    expect(resolveCollectionResponse("services", docs, site)?.collection.root).toBeUndefined();
  });
});
