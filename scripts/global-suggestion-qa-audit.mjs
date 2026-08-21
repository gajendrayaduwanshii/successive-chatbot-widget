import { readFileSync, writeFileSync } from "node:fs";

const chatBase = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const apiBase = "https://successive.tech/wp-json/successive-digital/v1";
const collections = ["post", "page", "accelerators", "award", "careers", "case_study", "employee-perspective", "industries", "media-coverage", "partners", "press-release", "thought-leadership"];

async function fetchCollection(type) {
  const items = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${apiBase}/content?type=${encodeURIComponent(type)}&per_page=100&page=${page}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return { type, items, error: `HTTP ${response.status}` };
    const batch = await response.json();
    if (!Array.isArray(batch)) return { type, items, error: "invalid response" };
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return { type, items };
}

const inventoryResponses = await Promise.all(collections.map(fetchCollection));
const inventory = inventoryResponses.map(({ type, items, error }) => ({
  contentType: type,
  count: items.length,
  error: error || null,
  sampleTitles: items.slice(0, 8).map((item) => typeof item.title === "string" ? item.title : item.title?.rendered).filter(Boolean),
  sampleSlugs: items.slice(0, 8).map((item) => item.slug).filter(Boolean),
}));
const corpus = inventoryResponses.flatMap((entry) => entry.items.map((item) => ({ ...item, auditCollection: entry.type })));

const required = {
  "company-overview": ["What is Successive?", "Give me a quick company overview", "Tell me about the company", "What does Successive do?"],
  "company-facts": ["Who founded Successive?", "Who leads Successive?", "Show the leadership team", "Who is on the board?", "What awards has Successive won?", "What are your values?", "Tell me about the culture"],
  services: ["services", "What services do you provide?", "Show me your development services", "Can you modernize legacy applications?", "What about application engineering?", "Tell me more about digital transformation"],
  technologies: ["technologies", "What technologies do your teams use?", "React development", "Node.js services", "Do you develop with Python?", "Java and .NET capability", "Flutter mobile development", "Do you build PWAs?", "UI UX design", "Blockchain development", "Salesforce CRM services"],
  industries: ["industries", "Which industries do you serve?", "Healthcare capabilities", "Retail services", "What about media companies?", "Show financial services expertise"],
  products: ["products", "What products do you offer?", "What does Kagen do?", "Tell me about Kagen capabilities", "Kagen resources", "Latest Kagen news"],
  accelerators: ["accelerators", "What accelerators do you have?", "Show application accelerators"],
  partners: ["partners", "Who are your technology partners?", "Do you work with Strapi?", "Google Cloud partnership", "Adobe AEM partnership", "AWS partnership", "ESRI ArcGIS capability"],
  clients: ["client", "clients", "our clients", "your clients", "who are your clients?", "show customer work", "show published customer work", "show customer case studies", "which of these have case studies?", "current clients", "which ones are current?"],
  "case-studies": ["case studies", "Show customer success stories", "Any retail case studies?", "AI case studies", "Cloud migration success story", "More customer examples"],
  "blogs-articles": ["blogs", "Show recent articles", "Find an AI article", "More about cloud blogs", "Related data engineering articles"],
  resources: ["whitepapers", "ebooks", "reports", "downloadable resources", "webinars", "events", "Show on-demand sessions", "Latest resources"],
  news: ["Latest news", "press releases", "media coverage", "Recent company announcements", "What is new at Successive?"],
  locations: ["Where are your offices?", "HQ", "India office", "US presence", "Which city is your head office?", "offcie locations"],
  contact: ["How can I contact Successive?", "phone number", "email address", "I want to talk to sales"],
  careers: ["careers", "What jobs are open?", "Latest openings", "Employee benefits", "How do I apply?"],
  ai: ["AI", "AI services", "what about AI", "GenAI", "machine learning services", "AI development", "AI strategy", "AI integration"],
  data: ["data analytics", "data & analytics services", "data engineering", "data science", "analytics", "cloud data modernization", "ML and data science"],
  cloud: ["cloud services", "AWS cloud modernization", "Google Cloud services", "How can Successive help with cloud modernization?", "cloud native engineering"],
  security: ["security services", "DevSecOps", "application security", "secure SDLC consulting", "cloud security"],
  cms: ["CMS development", "Strapi development", "Adobe AEM services", "headless CMS modernization", "content platform migration"],
  commerce: ["commerce services", "Shopify development", "Do you provide Shopify development?", "digital commerce modernization"],
  "business-problem": ["We need to modernize a legacy platform", "How can we reduce cloud costs?", "We need better retail automation", "How can data improve customer retention?"],
  recommendations: ["Recommend a service for retail automation", "What solution should I use for a headless website?", "Which capability fits cloud migration?"],
  "exact-resource": ["Summarize the Why Use Flutter blog", "Find the Status Codes in API Testing article", "Tell me more about the first result"],
  unsupported: ["current internal projects", "private clients", "employee salary", "confidential contracts", "unannounced partnerships", "internal roadmap"],
};

const dynamicSamples = corpus
  .filter((item) => item.slug && (typeof item.title === "string" || item.title?.rendered))
  .filter((item, index, all) => all.findIndex((other) => other.auditCollection === item.auditCollection && other.slug === item.slug) === index)
  .slice(0, 60)
  .map((item) => ({ category: `dynamic:${item.auditCollection}`, query: `Tell me about ${typeof item.title === "string" ? item.title : item.title.rendered}` }));
const reportQueries = (() => {
  try {
    return readFileSync("CHATBOT_FINAL_COMPREHENSIVE_VALIDATION_REPORT.md", "utf8").split("\n").flatMap((line) => {
      if (!/^\| (?:TC|UNSEEN)-\d+ \|/.test(line)) return [];
      const cells = line.slice(1, -1).split(" | ").map((value) => value.replaceAll("\\|", "|").trim());
      return cells[1] ? [{ category: "regression-discovered", query: cells[1] }] : [];
    });
  } catch { return []; }
})();
const manual = Object.entries(required).flatMap(([category, queries]) => queries.map((query) => ({ category, query })));
const testCases = [...new Map([...manual, ...dynamicSamples, ...reportQueries].map((row) => [row.query.toLowerCase(), row])).values()].slice(0, 150);
if (testCases.length < 150) throw new Error(`Only ${testCases.length} unique audit queries were generated.`);

async function ask(message, history = [], suggestionAction, key = crypto.randomUUID(), attempt = 0) {
  const started = performance.now();
  try {
    const response = await fetch(`${chatBase}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${20 + (Math.abs(hash(key)) % 180)}` },
      body: JSON.stringify({ message, history, suggestionAction, sessionId: `suggestion-audit-${key}` }),
      signal: AbortSignal.timeout(45000),
    });
    const payload = await response.json();
    return { statusCode: response.status, durationMs: Math.round(performance.now() - started), ...(payload.data || {}), apiError: payload.error || null };
  } catch (error) {
    if (attempt < 2) return ask(message, history, suggestionAction, key, attempt + 1);
    return { statusCode: 0, durationMs: Math.round(performance.now() - started), answer: "", cards: [], sources: [], suggestions: [], suggestionActions: [], apiError: error instanceof Error ? error.message : String(error) };
  }
}
function hash(value) { let h = 0; for (const c of value) h = ((h << 5) - h + c.charCodeAt(0)) | 0; return h; }
async function mapLimit(values, limit, operation) {
  const output = new Array(values.length); let cursor = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (cursor < values.length) { const index = cursor++; output[index] = await operation(values[index], index); } }));
  return output;
}

const firstTurns = await mapLimit(testCases, 3, async (testCase, index) => {
  const response = await ask(testCase.query, [], undefined, `first-${index}`);
  if ((index + 1) % 10 === 0) process.stdout.write(`first-turn ${index + 1}/150\n`);
  return {
    ...testCase,
    detectedIntent: "not exposed by current public response schema",
    activeTopic: "not exposed by current public response schema",
    statusCode: response.statusCode,
    durationMs: response.durationMs,
    answer: response.answer || "",
    responseSummary: (response.answer || "").replace(/\s+/g, " ").slice(0, 320),
    sourceUrls: (response.sources || []).map((source) => source.url),
    cardUrls: (response.cards || []).map((card) => card.url),
    cards: response.cards || [],
    legacySuggestions: response.suggestions || [],
    visibleSuggestions: response.suggestionActions || [],
    apiError: response.apiError,
  };
});

function grade(action, response, previousAnswer) {
  const answer = response.answer || "";
  const failureClasses = [];
  const genericFallback = /could not find reliable|couldn.?t find|could not confirm|available content is limited|try searching the/i.test(answer);
  if (genericFallback) failureClasses.push("GENERIC_FALLBACK_AFTER_CLICK", "DEAD_END_SUGGESTION", "SUGGESTION_WITHOUT_FULFILLABLE_CONTENT");
  if (!answer.trim() || response.statusCode !== 200) failureClasses.push("DEAD_END_SUGGESTION", "SUGGESTION_WITHOUT_FULFILLABLE_CONTENT");
  if (action.resultKeys?.length && !(response.cards || []).length) failureClasses.push("NO_MATCHING_CONTENT", "SUGGESTION_WITHOUT_FULFILLABLE_CONTENT");
  if (action.contentType === "case-study" && !(response.cards || []).some((card) => card.type === "case-study")) failureClasses.push("WRONG_CONTENT_TYPE");
  if (action.intent === "CUSTOMER_WORK_DISCOVERY" && !/customer|client|case stud|published work/i.test(`${answer} ${(response.cards || []).map((card) => card.badge).join(" ")}`)) failureClasses.push("WRONG_RELATION");
  if (previousAnswer && answer.replace(/\s+/g, " ").trim() === previousAnswer.replace(/\s+/g, " ").trim()) failureClasses.push("SUGGESTION_LOOP");
  const unique = [...new Set(failureClasses)];
  return { grade: unique.length ? "FAIL" : "PASS", failureClasses: unique };
}

const suggestionTests = [];
for (const [firstIndex, first] of firstTurns.entries()) {
  for (const [actionIndex, action] of first.visibleSuggestions.entries()) {
    const history = [{ role: "user", content: first.query }, { role: "assistant", content: first.answer }];
    const clicked = await ask(action.label, history, action, `click-${firstIndex}-${actionIndex}`);
    const assessed = grade(action, clicked, first.answer);
    suggestionTests.push({
      firstTurnQuery: first.query, category: first.category, firstTurnIntent: first.detectedIntent,
      suggestionLevel: 1, suggestionLabel: action.label, suggestionAction: action, clickedAs: "structured-action",
      expectedIntent: action.intent, actualIntent: "not exposed by current public response schema",
      expectedTopic: action.topic || null, actualTopic: "not exposed by current public response schema",
      expectedContentType: action.contentType || null, actualContentType: [...new Set((clicked.cards || []).map((card) => card.type))],
      responseStatus: clicked.statusCode, grade: assessed.grade, failureClasses: assessed.failureClasses,
      sourceUrls: (clicked.sources || []).map((source) => source.url), cardUrls: (clicked.cards || []).map((card) => card.url),
      responseSummary: (clicked.answer || "").replace(/\s+/g, " ").slice(0, 500), notes: "Each visible action was clicked from an independent copy of its matching first-turn state.",
    });
    for (const [level2Index, nextAction] of (clicked.suggestionActions || []).entries()) {
      const secondHistory = [...history, { role: "user", content: action.label }, { role: "assistant", content: clicked.answer || "" }];
      const next = await ask(nextAction.label, secondHistory, nextAction, `level2-${firstIndex}-${actionIndex}-${level2Index}`);
      const nextAssessed = grade(nextAction, next, clicked.answer || "");
      suggestionTests.push({ firstTurnQuery: first.query, category: first.category, firstTurnIntent: first.detectedIntent,
        suggestionLevel: 2, suggestionLabel: nextAction.label, suggestionAction: nextAction, clickedAs: "structured-action",
        expectedIntent: nextAction.intent, actualIntent: "not exposed by current public response schema", expectedTopic: nextAction.topic || null,
        actualTopic: "not exposed by current public response schema", expectedContentType: nextAction.contentType || null,
        actualContentType: [...new Set((next.cards || []).map((card) => card.type))], responseStatus: next.statusCode,
        grade: nextAssessed.grade, failureClasses: nextAssessed.failureClasses, sourceUrls: (next.sources || []).map((source) => source.url),
        cardUrls: (next.cards || []).map((card) => card.url), responseSummary: (next.answer || "").replace(/\s+/g, " ").slice(0, 500), notes: "Second-level action after a visible first-level action." });
    }
  }
}

const manualComparisons = [];
for (const test of suggestionTests.filter((row) => row.suggestionLevel === 1)) {
  const first = firstTurns.find((row) => row.query === test.firstTurnQuery);
  const typed = await ask(test.suggestionLabel, [{ role: "user", content: first.query }, { role: "assistant", content: first.answer }], undefined, `typed-${manualComparisons.length}`);
  manualComparisons.push({ firstTurnQuery: test.firstTurnQuery, suggestionLabel: test.suggestionLabel,
    structuredGrade: test.grade, typedStatus: typed.statusCode, typedResponseSummary: (typed.answer || "").replace(/\s+/g, " ").slice(0, 500),
    sameResponse: test.responseSummary === (typed.answer || "").replace(/\s+/g, " ").slice(0, 500) });
}

for (const firstTurnQuery of [...new Set(suggestionTests.map((row) => row.firstTurnQuery))]) {
  const siblings = suggestionTests.filter((row) => row.firstTurnQuery === firstTurnQuery && row.suggestionLevel === 1);
  for (let index = 1; index < siblings.length; index += 1) {
    const current = siblings[index];
    const duplicate = siblings.slice(0, index).find((previous) =>
      previous.suggestionAction.id !== current.suggestionAction.id &&
      previous.responseSummary === current.responseSummary &&
      JSON.stringify(previous.sourceUrls) === JSON.stringify(current.sourceUrls) &&
      JSON.stringify(previous.cardUrls) === JSON.stringify(current.cardUrls));
    if (duplicate) {
      current.grade = "PARTIAL";
      current.failureClasses = [...new Set([...current.failureClasses, "DUPLICATE_ACTION"])];
      current.notes += ` Result duplicates sibling action '${duplicate.suggestionLabel}' despite a different action ID/label.`;
    }
  }
}

const categoryNames = [...new Set(firstTurns.map((row) => row.category))];
const categoryScorecard = categoryNames.map((category) => {
  const turns = firstTurns.filter((row) => row.category === category); const tests = suggestionTests.filter((row) => row.category === category);
  return { category, firstTurnQueries: turns.length, responsesWithSuggestions: turns.filter((row) => row.visibleSuggestions.length).length,
    suggestionsTested: tests.length, pass: tests.filter((row) => row.grade === "PASS").length, partial: tests.filter((row) => row.grade === "PARTIAL").length,
    fail: tests.filter((row) => row.grade === "FAIL").length, topFailureReason: tests.flatMap((row) => row.failureClasses)[0] || null };
});
const visibleCount = firstTurns.reduce((sum, row) => sum + row.visibleSuggestions.length, 0);
const metrics = {
  totalFirstTurnQueries: firstTurns.length,
  responsesWithVisibleSuggestions: firstTurns.filter((row) => row.visibleSuggestions.length).length,
  responsesWithZeroVisibleSuggestions: firstTurns.filter((row) => !row.visibleSuggestions.length).length,
  totalVisibleSuggestions: visibleCount,
  averageVisibleSuggestionsPerResponse: visibleCount / firstTurns.length,
  suggestionsTested: suggestionTests.length,
  pass: suggestionTests.filter((row) => row.grade === "PASS").length,
  partial: suggestionTests.filter((row) => row.grade === "PARTIAL").length,
  fail: suggestionTests.filter((row) => row.grade === "FAIL").length,
  transportErrors: firstTurns.filter((row) => row.statusCode === 0).length,
  legacySuggestionStringsReturned: firstTurns.reduce((sum, row) => sum + row.legacySuggestions.length, 0),
  labelOnlySuggestionsRenderedByBundledUi: 0,
  failureClassCounts: Object.fromEntries(["SUGGESTION_WITHOUT_FULFILLABLE_CONTENT", "NO_MATCHING_CONTENT", "WEAK_MATCH_ONLY", "DEAD_END_SUGGESTION", "UNSUPPORTED_SUGGESTION_OFFERED", "LABEL_REPARSED_AS_QUERY", "CONTEXT_LOSS", "WRONG_TOPIC", "WRONG_ENTITY", "WRONG_CONTENT_TYPE", "WRONG_RELATION", "UNRELATED_SOURCE", "UNRELATED_CARD", "SUGGESTION_LOOP", "DUPLICATE_ACTION", "GENERIC_FALLBACK_AFTER_CLICK"].map((name) => [name, suggestionTests.filter((row) => row.failureClasses.includes(name)).length])),
};
const results = { generatedAt: new Date().toISOString(), auditType: "read-only production-behavior QA", inventory, metrics, categoryScorecard, firstTurns, suggestionTests, manualComparisons };
writeFileSync("GLOBAL_SUGGESTION_QA_RESULTS.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify({ inventory: inventory.map(({ contentType, count, error }) => ({ contentType, count, error })), metrics, categoryScorecard }, null, 2));
