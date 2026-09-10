import { describe, expect, it } from "vitest";
import { collapseAdjacentDuplicateTerms, retainValidatedInlineLinks } from "./response-format";

describe("collapseAdjacentDuplicateTerms", () => {
  it("removes immediately repeated normalized terms without a phrase-specific rule", () => {
    expect(collapseAdjacentDuplicateTerms("Provides end-to-end end-to-end delivery.")).toBe("Provides end-to-end delivery.");
    expect(collapseAdjacentDuplicateTerms("Cloud   cloud migration.")).toBe("Cloud migration.");
  });

  it("preserves non-adjacent and intentionally separated repetition", () => {
    expect(collapseAdjacentDuplicateTerms("Cloud migration improves reliability. Cloud migration also improves governance.")).toContain("Cloud migration also");
    expect(collapseAdjacentDuplicateTerms("Data and data quality are distinct concerns.")).toBe("Data and data quality are distinct concerns.");
  });

  it("keeps only validated inline destinations and retains readable text for invalid wrappers", () => {
    const canonical = "https://successive.tech/cloud-cost-optimization/";
    expect(retainValidatedInlineLinks(
      `See [the eBook](https://successive.tech//) and [details](${canonical}).`,
      [canonical],
    )).toBe(`See the eBook and [details](${canonical}).`);
    expect(retainValidatedInlineLinks(
      "Read [nested [link](https://successive.tech//)) for published details.",
      [canonical],
    )).not.toContain("https://successive.tech//");
  });
});
