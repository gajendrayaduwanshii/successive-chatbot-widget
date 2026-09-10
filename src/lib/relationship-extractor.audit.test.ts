import { describe, expect, it } from "vitest";
// QA-only JavaScript utility used by the saved-results audit harness.
// @ts-expect-error The versioned QA script intentionally has no production TS declaration.
import { authoritativeRelationshipIds } from "../../scripts/lib/relationship-evidence.mjs";

const records = [
  { id: 10, url: "https://successive.tech/base/" },
  { id: 20, url: "https://successive.tech/services/cloud/" },
  { id: 30, url: "https://successive.tech/industries/retail/" },
  { id: 40, url: "https://successive.tech/blog/guide/" },
];
const ids = (record: object) => [
  ...authoritativeRelationshipIds({ id: 10, ...record }, records),
].sort();

describe("QA relationship evidence extraction", () => {
  it("rejects image width and height values that equal content IDs", () => {
    expect(ids({ original_metadata: { acf: { image: { sizes: { width: 20, height: 30 } } } } })).toEqual([]);
  });

  it("rejects arbitrary numeric ACF scalars that equal content IDs", () => {
    expect(ids({ original_metadata: { acf: { year: 20, count: 30, price: 40 } } })).toEqual([]);
  });

  it("accepts an explicit related-item ID", () => {
    expect(ids({ related_items: [{ id: 20, title: "Cloud", url: "https://successive.tech/services/cloud/" }] })).toEqual(["20"]);
  });

  it("accepts an explicit internal canonical content URL", () => {
    expect(ids({ original_metadata: { content: { rendered: '<a href="https://successive.tech/industries/retail/">Retail</a>' } } })).toEqual(["30"]);
  });

  it("accepts a structured post-object reference", () => {
    expect(ids({ original_metadata: { acf: { featured_content: { post_object: { ID: 40, title: "Guide", type: "post" } } } } })).toEqual(["40"]);
  });

  it("preserves multiple valid relationships", () => {
    expect(ids({ related_items: [{ id: 20 }, { id: 30 }] })).toEqual(["20", "30"]);
  });

  it("does not let metadata numbers contaminate valid related items", () => {
    expect(ids({ original_metadata: { acf: {
      related_content: [{ id: 20, title: "Cloud", url: "https://successive.tech/services/cloud/" }],
      gallery: [{ image: { width: 30, height: 40 } }],
    } } })).toEqual(["20"]);
  });

  it("does not turn media URLs or attachment metadata into content relations", () => {
    expect(ids({ original_metadata: { acf: { image: {
      id: 20,
      url: "https://successive.tech/wp-content/uploads/example.jpg",
      attachment: { record_id: 30 },
    } } } })).toEqual([]);
  });
});
