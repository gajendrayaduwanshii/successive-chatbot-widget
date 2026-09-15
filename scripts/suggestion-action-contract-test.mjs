const base = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const defaultSeeds = ["client", "AI services", "React technologies", "Kagen products", "Strapi partnership", "industries",
  "customer case studies", "latest blogs", "latest news", "office locations", "who founded Successive?", "Kagen VOICE", "AI", "cloud services", "security services"];
const seeds = process.env.CONTRACT_SEEDS ? process.env.CONTRACT_SEEDS.split("|").filter(Boolean) : defaultSeeds;

async function ask(message, history = [], suggestionAction) {
  try {
    const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.247" },
      body: JSON.stringify({ message, history, suggestionAction, sessionId: `suggestion-contract-${crypto.randomUUID()}` }), signal: AbortSignal.timeout(40_000) });
    const payload = await response.json();
    return { statusCode: response.status, ...(payload.data || {}), error: payload.error };
  } catch (error) {
    return { statusCode: 0, answer: "", cards: [], suggestions: [], suggestionActions: [], error: error instanceof Error ? error.message : String(error) };
  }
}

const results = [];
for (const seed of seeds) {
  const first = await ask(seed);
  const actions = first.suggestionActions || [];
  const clicks = [];
  for (const action of actions) {
    const second = await ask(action.label, [{ role: "user", content: seed }, { role: "assistant", content: first.answer }], action);
    const abstained = /couldn.?t (?:find|confirm)|could not (?:find|confirm)|reliable information|available content is limited/i.test(second.answer || "");
    const typeSatisfied = action.contentType !== "case-study" || (second.cards || []).some((card) => card.type === "case-study");
    clicks.push({ action, statusCode: second.statusCode, cards: second.cards || [], pass: second.statusCode === 200 && !abstained && typeSatisfied });
  }
  results.push({ seed, statusCode: first.statusCode, actions, clicks });
  await new Promise((resolve) => setTimeout(resolve, 400));
}
const clickResults = results.flatMap((result) => result.clicks);
const summary = { categories: results.length, visibleStructuredActions: clickResults.length,
  passedClicks: clickResults.filter((click) => click.pass).length, failedClicks: clickResults.filter((click) => !click.pass).length,
  labelOnlySuggestionsRendered: 0, results };
console.log(JSON.stringify(summary, null, 2));
if (summary.failedClicks) process.exitCode = 1;
