import { describe, expect, it } from "vitest";
import { buildSearchIndex } from "./search-index";
import { discoverIndexedCollections, normalizeCollectionQuery, resolveCollectionResponse } from "./collection-response";
import type { WordPressItem } from "@/types/wordpress";

const site = "https://example.test";
let id = 0;
function page(title: string, slug: string, type = "page", parent?: number): WordPressItem {
  return { id: ++id, type, parent, title: { rendered: title }, slug: slug.split("/").at(-1), link: `${site}/${slug}/`,
    content: { rendered: `<p>${title} provides documented capabilities that help enterprise teams plan and deliver their work.</p>` } };
}
export function collectionFixtures() {
  const rows: WordPressItem[] = [];
  // Names used only as test data; include a previously unknown collection.
  for (const [rootSlug, type] of [["services", "page"], ["accelerators", "accelerators"], ["industries", "industries"],
    ["resources", "page"], ["case-studies", "case_study"], ["blogs", "post"], ["whitepapers", "page"],
    ["ebooks", "page"], ["events", "page"], ["webinars", "page"], ["press-release", "press-release"], ["field-guides", "field-guide"]]) {
    const root = page(rootSlug.replace(/-/g, " "), rootSlug);
    rows.push(root);
    for (let i = 1; i <= 4; i++) {
      const item = page(`Published ${rootSlug} ${i}`, `${rootSlug}/published-${i}`, type, root.id);
      if (rootSlug === "services") item.acf = { service_type: "Piller" };
      rows.push(item);
    }
  }
  rows.push(page("Unrelated Mobile Engineering", "mobile-engineering"));
  return buildSearchIndex(rows);
}

const documents = collectionFixtures();
describe("one indexed collection resolver", () => {
  it.each(["services", "all services", "show all services", "all setvices", "show services", "our services", "tell me services",
    "accelerator", "all accelerators", "show me all accelerator", "industries", "all industries", "resources", "all resources"])("resolves %s to concise text-only navigation", (query) => {
    const result = resolveCollectionResponse(query, documents, site);
    expect(result, query).toBeDefined();
    expect(result!.children).toHaveLength(3);
    expect(result!.collection.root).toBeDefined();
    expect(result!.answer.split(/\n\n/)).toHaveLength(3);
    expect(result!.inlineLinks).toBe(4);
    expect(result!.answer).not.toMatch(/^#|\n- |Unrelated Mobile/);
    expect(result!.children.every((child) => child.parentId === result!.collection.root!.id)).toBe(true);
  });
  it("automatically exercises every discoverable root instead of a category whitelist", () => {
    const roots = discoverIndexedCollections(documents, site).filter((entry) => entry.root);
    expect(roots.some((entry) => entry.key === "field guide")).toBe(true);
    for (const root of roots) {
      const result = resolveCollectionResponse(`show me all ${root.key}`, documents, site);
      expect(result, root.key).toBeDefined();
      expect(result!.children.every((child) => root.members.includes(child))).toBe(true);
    }
  });
  it.each(["what is cloud computing", "cloud services", "services for healthcare", "related resources", "how many services",
    "compare services and products", "show all imaginary things", "published services 1", "What is an accelerator?"])("keeps direct or unsupported queries on their existing path: %s", (query) => {
    expect(resolveCollectionResponse(query, documents, site)).toBeUndefined();
  });
  it("does not invent a root for a source-typed collection without a landing page", () => {
    const docs = buildSearchIndex([page("Novel Report One", "reports/one", "novel-report"), page("Novel Report Two", "reports/two", "novel-report")]);
    const result = resolveCollectionResponse("novel reports", docs, site)!;
    expect(result.collection.root).toBeUndefined();
    expect(result.answer.split(/\n\n/)).toHaveLength(2);
    expect(result.inlineLinks).toBe(2);
    expect(result.answer).not.toContain(`${site}/novel-report/`);
  });
  it("fails closed on ambiguous one-edit recovery", () => {
    const docs = buildSearchIndex([page("One", "catalogs/one", "catalog"), page("Two", "catalogs/two", "catalog"),
      page("Three", "cataligs/three", "catalig"), page("Four", "cataligs/four", "catalig")]);
    expect(resolveCollectionResponse("catalags", docs, site)).toBeUndefined();
  });
  it("excludes external URLs and unsafe schemes even with a matching parent", () => {
    const root = page("Solutions", "solutions");
    const child = page("Valid Solution", "solutions/valid", "page", root.id);
    const external = { ...page("Foreign Solution", "solutions/foreign", "page", root.id), link: "https://foreign.test/solutions/foreign/" };
    const unsafe = { ...page("Unsafe Solution", "solutions/unsafe", "page", root.id), link: "javascript:alert(1)" };
    const result = resolveCollectionResponse("solutions", buildSearchIndex([root, child, external, unsafe]), site)!;
    expect(result.children.map((doc) => doc.title)).toEqual(["Valid Solution"]);
  });
  it("normalizes modifiers without deleting words from the middle of a topic", () => {
    expect(normalizeCollectionQuery("show me all industries")).toBe("industry");
    expect(normalizeCollectionQuery("services for all industries")).toBe("service for all industry");
  });
});

describe("collection authority boundaries", () => {
  it("does not classify pages from category words in their titles", () => {
    const docs = buildSearchIndex([
      page("Whitepaper Consulting", "consulting-one"), page("Whitepaper Engineering", "consulting-two"),
      { ...page("Human Resource Management System", "human-resource-management-system"), acf: { service_type: "Expertise" } },
      { ...page("Resource Planning", "resource-planning"), acf: { service_type: "Piller" } },
    ]);
    expect(resolveCollectionResponse("whitepapers", docs, site)).toBeUndefined();
    expect(resolveCollectionResponse("resources", docs, site)).toBeUndefined();
    expect(resolveCollectionResponse("services", docs, site)?.children).toHaveLength(2);
  });
  it("does not add a cross-type relationship or CTA to a typed collection", () => {
    const root = page("Field Guides", "field-guides");
    const foreign = page("Unrelated Blog", "field-guides/unrelated", "post", root.id);
    root.acf = { related_pages: [{ url: foreign.link! }], hero_link: { url: foreign.link! } };
    const docs = buildSearchIndex([root, foreign,
      page("Guide One", "field-guides/one", "field-guide", root.id),
      page("Guide Two", "field-guides/two", "field-guide", root.id)]);
    expect(resolveCollectionResponse("field guides", docs, site)?.collection.members.map(d => d.type)).toEqual(["field-guide", "field-guide"]);
  });
  it("uses lead-magnet metadata for resource subtypes without a title keyword", () => {
    const rows = ["one", "two"].flatMap(name => [
      { ...page(`Planning ${name}`, `planning-${name}`), acf: { lead_magnet_heading: "Why download this whitepaper?" } },
      { ...page(`Delivery ${name}`, `delivery-${name}`), acf: { lead_magnet_heading: "Why download this eBook?" } },
    ]);
    const docs = buildSearchIndex(rows);
    expect(resolveCollectionResponse("whitepapers", docs, site)?.children.map(d => d.slug)).toEqual(["planning-one", "planning-two"]);
    expect(resolveCollectionResponse("ebooks", docs, site)?.children.map(d => d.slug)).toEqual(["delivery-one", "delivery-two"]);
    expect(resolveCollectionResponse("resources", docs, site)?.collection.members).toHaveLength(4);
  });
  it("supports an indexed aggregate without confusing incidental words with its enumeration", () => {
    const root = page("Dispatch Room", "dispatch-room");
    root.content = "Explore industry insights in our dispatch room, featuring field guides and research notes.";
    const docs = buildSearchIndex([root, ...["field-guide", "research-note", "industries"].flatMap(type =>
      [page(`${type} One`, `${type}/one`, type), page(`${type} Two`, `${type}/two`, type)])]);
    const result = resolveCollectionResponse("field guides research notes", docs, site)!;
    expect(result.collection.root?.id).toBe(root.id);
    expect(new Set(result.collection.members.map(d => d.type))).toEqual(new Set(["field-guide", "research-note"]));
    expect(resolveCollectionResponse("field guides", docs, site)?.collection.members.every(d => d.type === "field-guide")).toBe(true);
    expect(resolveCollectionResponse("field guides research notes about cloud", docs, site)).toBeUndefined();
  });
  it("serializes canonical link destinations with parentheses and keeps members lacking excerpts", () => {
    const rows = [page("Guide [One]", "guides/one_(updated)", "guide"), page("Guide Two", "guides/two", "guide")];
    rows.forEach(row => { row.content = ""; });
    const result = resolveCollectionResponse("guides", buildSearchIndex(rows), site)!;
    expect(result.children).toHaveLength(2);
    expect(result.answer).toContain("[Guide One](https://example.test/guides/one_%28updated%29/)");
    expect(result.answer).not.toContain("undefined");
  });
});
