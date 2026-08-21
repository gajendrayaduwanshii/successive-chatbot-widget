import { readFileSync, writeFileSync } from "node:fs";

const path = "GLOBAL_SUGGESTION_QA_RESULTS.json";
const results = JSON.parse(readFileSync(path, "utf8"));
for (const query of [...new Set(results.suggestionTests.map((row) => row.firstTurnQuery))]) {
  const siblings = results.suggestionTests.filter((row) => row.firstTurnQuery === query && row.suggestionLevel === 1);
  for (let index = 1; index < siblings.length; index += 1) {
    const current = siblings[index];
    const duplicate = siblings.slice(0, index).find((previous) =>
      previous.suggestionAction.id !== current.suggestionAction.id &&
      previous.responseSummary === current.responseSummary &&
      JSON.stringify(previous.sourceUrls) === JSON.stringify(current.sourceUrls) &&
      JSON.stringify(previous.cardUrls) === JSON.stringify(current.cardUrls));
    if (!duplicate) continue;
    current.grade = "PARTIAL";
    current.failureClasses = [...new Set([...current.failureClasses, "DUPLICATE_ACTION"])];
    current.notes += ` Result duplicates sibling action '${duplicate.suggestionLabel}' despite a different action ID/label.`;
  }
}
results.metrics.pass = results.suggestionTests.filter((row) => row.grade === "PASS").length;
results.metrics.partial = results.suggestionTests.filter((row) => row.grade === "PARTIAL").length;
results.metrics.fail = results.suggestionTests.filter((row) => row.grade === "FAIL").length;
results.metrics.failureClassCounts.DUPLICATE_ACTION = results.suggestionTests.filter((row) => row.failureClasses.includes("DUPLICATE_ACTION")).length;
for (const score of results.categoryScorecard) {
  const tests = results.suggestionTests.filter((row) => row.category === score.category);
  score.pass = tests.filter((row) => row.grade === "PASS").length;
  score.partial = tests.filter((row) => row.grade === "PARTIAL").length;
  score.fail = tests.filter((row) => row.grade === "FAIL").length;
  score.topFailureReason = tests.flatMap((row) => row.failureClasses)[0] || null;
}
writeFileSync(path, JSON.stringify(results, null, 2));
