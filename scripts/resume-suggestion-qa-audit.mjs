import { readFileSync, writeFileSync } from "node:fs";
const path = "GLOBAL_SUGGESTION_QA_RESULTS.json";
const base = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const results = JSON.parse(readFileSync(path, "utf8"));
async function ask(message, history = [], suggestionAction, attempt = 0) {
  try {
    const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.219" },
      body: JSON.stringify({ message, history, suggestionAction, sessionId: `audit-resume-${crypto.randomUUID()}` }), signal: AbortSignal.timeout(60000) });
    const payload = await response.json(); return { statusCode: response.status, ...(payload.data || {}), apiError: payload.error || null };
  } catch (error) { if (attempt < 2) return ask(message, history, suggestionAction, attempt + 1);
    return { statusCode: 0, answer: "", cards: [], sources: [], suggestions: [], suggestionActions: [], apiError: String(error) }; }
}
for (const first of results.firstTurns.filter((row) => row.statusCode === 0)) {
  const response = await ask(first.query);
  Object.assign(first, { statusCode: response.statusCode, answer: response.answer || "", responseSummary: (response.answer || "").replace(/\s+/g, " ").slice(0, 320),
    sourceUrls: (response.sources || []).map((source) => source.url), cardUrls: (response.cards || []).map((card) => card.url), cards: response.cards || [],
    legacySuggestions: response.suggestions || [], visibleSuggestions: response.suggestionActions || [], apiError: response.apiError });
  for (const action of first.visibleSuggestions) {
    const clicked = await ask(action.label, [{ role: "user", content: first.query }, { role: "assistant", content: first.answer }], action);
    const answer = clicked.answer || ""; const failureClasses = [];
    if (/could not find reliable|couldn.?t find|could not confirm|available content is limited|try searching the/i.test(answer))
      failureClasses.push("GENERIC_FALLBACK_AFTER_CLICK", "DEAD_END_SUGGESTION", "SUGGESTION_WITHOUT_FULFILLABLE_CONTENT");
    if (!answer || clicked.statusCode !== 200) failureClasses.push("DEAD_END_SUGGESTION", "SUGGESTION_WITHOUT_FULFILLABLE_CONTENT");
    if (action.contentType === "case-study" && !(clicked.cards || []).some((card) => card.type === "case-study")) failureClasses.push("WRONG_CONTENT_TYPE");
    results.suggestionTests.push({ firstTurnQuery: first.query, category: first.category, firstTurnIntent: first.detectedIntent, suggestionLevel: 1,
      suggestionLabel: action.label, suggestionAction: action, clickedAs: "structured-action", expectedIntent: action.intent,
      actualIntent: "not exposed by current public response schema", expectedTopic: action.topic || null,
      actualTopic: "not exposed by current public response schema", expectedContentType: action.contentType || null,
      actualContentType: [...new Set((clicked.cards || []).map((card) => card.type))], responseStatus: clicked.statusCode,
      grade: failureClasses.length ? "FAIL" : "PASS", failureClasses: [...new Set(failureClasses)],
      sourceUrls: (clicked.sources || []).map((source) => source.url), cardUrls: (clicked.cards || []).map((card) => card.url),
      responseSummary: answer.replace(/\s+/g, " ").slice(0, 500), notes: "Resumed after first-turn transport timeout; independently clicked from matching state." });
  }
}
const tests = results.suggestionTests;
const visible = results.firstTurns.reduce((sum, row) => sum + row.visibleSuggestions.length, 0);
Object.assign(results.metrics, { responsesWithVisibleSuggestions: results.firstTurns.filter((row) => row.visibleSuggestions.length).length,
  responsesWithZeroVisibleSuggestions: results.firstTurns.filter((row) => !row.visibleSuggestions.length).length,
  totalVisibleSuggestions: visible, averageVisibleSuggestionsPerResponse: visible / results.firstTurns.length,
  suggestionsTested: tests.length, pass: tests.filter((row) => row.grade === "PASS").length,
  partial: tests.filter((row) => row.grade === "PARTIAL").length, fail: tests.filter((row) => row.grade === "FAIL").length,
  transportErrors: results.firstTurns.filter((row) => row.statusCode === 0).length,
  legacySuggestionStringsReturned: results.firstTurns.reduce((sum, row) => sum + row.legacySuggestions.length, 0) });
for (const name of Object.keys(results.metrics.failureClassCounts))
  results.metrics.failureClassCounts[name] = tests.filter((row) => row.failureClasses.includes(name)).length;
for (const score of results.categoryScorecard) { const turns = results.firstTurns.filter((row) => row.category === score.category);
  const categoryTests = tests.filter((row) => row.category === score.category); score.responsesWithSuggestions = turns.filter((row) => row.visibleSuggestions.length).length;
  score.suggestionsTested = categoryTests.length; score.pass = categoryTests.filter((row) => row.grade === "PASS").length;
  score.partial = categoryTests.filter((row) => row.grade === "PARTIAL").length; score.fail = categoryTests.filter((row) => row.grade === "FAIL").length;
  score.topFailureReason = categoryTests.flatMap((row) => row.failureClasses)[0] || null; }
writeFileSync(path, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.metrics, null, 2));
