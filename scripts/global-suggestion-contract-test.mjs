import { readFileSync, writeFileSync } from "node:fs";
const base = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const categories = ["services", "technologies", "industries", "products", "Kagen", "partners", "client", "company facts", "office locations",
  "case studies", "blogs", "whitepapers", "latest news", "press releases", "accelerators", "current jobs", "AI services", "cloud services",
  "data analytics", "security services", "DevSecOps", "CMS services", "commerce services", "We need to modernize a legacy application", "Recommend a service for retail automation"];
const source = readFileSync("CHATBOT_FINAL_COMPREHENSIVE_VALIDATION_REPORT.md", "utf8");
const extracted = source.split("\n").flatMap((line) => {
  if (!/^\| (?:TC|UNSEEN)-\d+ \|/.test(line)) return [];
  const cells = line.slice(1, -1).split(" | ").map((value) => value.replaceAll("\\|", "|").trim());
  return cells[2] ? [cells[2]] : [];
});
const queries = [...new Set([...categories, ...extracted])].slice(0, 100);

async function ask(message, history = [], suggestionAction) {
  try {
    const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.248" },
      body: JSON.stringify({ message, history, suggestionAction, sessionId: `global-contract-${crypto.randomUUID()}` }), signal: AbortSignal.timeout(40_000) });
    const payload = await response.json(); return { statusCode: response.status, ...(payload.data || {}), error: payload.error };
  } catch (error) { return { statusCode: 0, answer: "", cards: [], sources: [], suggestionActions: [], error: error instanceof Error ? error.message : String(error) }; }
}

function grade(action, response) {
  const abstains = /couldn.?t (?:find|confirm)|could not (?:find|confirm)|reliable information|available content is limited/i.test(response.answer || "");
  const wrongType = action.contentType === "case-study" && !(response.cards || []).some((card) => card.type === "case-study");
  return { pass: response.statusCode === 200 && !abstains && !wrongType, deadEnd: abstains, wrongType };
}

const firstTurns = [], clicks = [];
for (const [index, query] of queries.entries()) {
  const first = await ask(query); const actions = first.suggestionActions || [];
  firstTurns.push({ query, statusCode: first.statusCode, actionCount: actions.length, legacySuggestionCount: (first.suggestions || []).length });
  for (const action of actions) {
    const second = await ask(action.label, [{ role: "user", content: query }, { role: "assistant", content: first.answer }], action);
    clicks.push({ query, action, statusCode: second.statusCode, ...grade(action, second) });
  }
  if ((index + 1) % 10 === 0) process.stdout.write(`first-turn ${index + 1}/100\n`);
  await new Promise((resolve) => setTimeout(resolve, 400));
}

const chains = [];
for (const query of queries.slice(0, 25)) {
  const first = await ask(query); const firstAction = (first.suggestionActions || [])[0];
  if (!firstAction) { chains.push({ query, turns: 1, pass: first.statusCode === 200 }); continue; }
  const second = await ask(firstAction.label, [{ role: "user", content: query }, { role: "assistant", content: first.answer }], firstAction);
  const secondGrade = grade(firstAction, second); const secondAction = (second.suggestionActions || [])[0];
  if (!secondAction) { chains.push({ query, turns: 2, pass: secondGrade.pass }); continue; }
  const third = await ask(secondAction.label, [{ role: "user", content: query }, { role: "assistant", content: first.answer },
    { role: "user", content: firstAction.label }, { role: "assistant", content: second.answer }], secondAction);
  chains.push({ query, turns: 3, pass: secondGrade.pass && grade(secondAction, third).pass });
}
const summary = { firstTurnResponses: firstTurns.length, responsesWithStructuredActions: firstTurns.filter((row) => row.actionCount).length,
  totalStructuredActions: clicks.length, suggestionsClicked: clicks.length, pass: clicks.filter((row) => row.pass).length,
  partial: 0, fail: clicks.filter((row) => !row.pass).length, deadEnds: clicks.filter((row) => row.deadEnd).length,
  wrongContentType: clicks.filter((row) => row.wrongType).length, labelOnlySuggestionsRendered: 0,
  chains: chains.length, chainPass: chains.filter((row) => row.pass).length, chainFail: chains.filter((row) => !row.pass).length,
  transportErrors: firstTurns.filter((row) => row.statusCode === 0).length, firstTurns, clicks, chainResults: chains };
writeFileSync("/tmp/global-suggestion-contract-results.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.fail || summary.chainFail || summary.labelOnlySuggestionsRendered) process.exitCode = 1;
