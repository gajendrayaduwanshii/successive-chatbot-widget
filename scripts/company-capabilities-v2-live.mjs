import { writeFileSync } from "node:fs";

const base = process.env.CHATBOT_TEST_URL ?? "http://127.0.0.1:3002";
const standalone = [
  "What is Successive Digital?", "What are Successive core values?", "How many core values does Successive have?",
  "Who leads Successive?", "Who is Sunil kumar shahoo in successive?", "Show the board of directors",
  "What certifications does Successive have?", "Where are Successive offices?", "What is Global Capabilities?",
  "What AI capabilities do you have?", "What digital experience capabilities do you have?", "What creative capabilities do you have?",
  "Which frontend technologies do you use?", "Do you use Flutter?", "Which DevOps tools do you use?",
  "What automation capabilities do you have?", "Tell me about work culture", "What employee benefits are offered?",
  "Any partnership?", "Which cloud partners do you have?", "Do you partner with AWS?",
  "What awards has Successive received?", "What is the latest award?", "How many job openings are available?",
  "Are there React jobs?", "Our manual document process is slow. How can Successive help?",
  "We need to modernize a legacy monolith", "tell me abt ur data capabilites", "core valus", "partners",
];
const conversation = [
  ["Tell me about Successive partnerships", "Which cloud partners does Successive have?"],
  ["What are Successive core values?", "What does Innovation mean in Successive core values?"],
  ["Show Successive leadership", "Who is Sunil Sahoo in Successive?"],
  ["What are Global Capabilities?", "Which frontend technologies does Successive use?"],
  ["Tell me about Successive careers", "What employee benefits does Successive offer?"],
];
const tests = standalone.map((query, index) => ({ id: `S${index + 1}`, query, history: [] }));
for (const [index, turns] of conversation.entries()) {
  const history = [];
  for (const [turn, query] of turns.entries()) {
    tests.push({ id: `C${index + 1}.${turn + 1}`, query, history: [...history] });
    history.push({ role: "user", content: query }, { role: "assistant", content: "The previous answer used current Successive API content." });
  }
}
const results = [];
for (const [index, test] of tests.entries()) {
  const started = performance.now();
  try {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: test.query, history: test.history, sessionId: `company-v2-${index}` }),
      signal: AbortSignal.timeout(65_000),
    });
    const payload = await response.json();
    results.push({ ...test, status: response.status, durationMs: Math.round(performance.now() - started), answer: payload.data?.answer ?? "", cards: payload.data?.cards ?? [], diagnostics: payload.data?.diagnostics, error: payload.error ?? null });
  } catch (error) {
    results.push({ ...test, status: 0, durationMs: Math.round(performance.now() - started), answer: "", cards: [], error: String(error) });
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const durations = results.map(({ durationMs }) => durationMs).sort((a, b) => a - b);
const output = { generatedAt: new Date().toISOString(), base, concurrency: 1, delayMs: 250, results };
writeFileSync("/tmp/chatbot-company-v2-live-results.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify({ total: results.length, errors: results.filter(({ error }) => error).length, http429: results.filter(({ status }) => status === 429).length, zeroCards: results.filter(({ cards }) => !cards.length).length, p50: durations[Math.floor(durations.length * .5)], p95: durations[Math.floor(durations.length * .95)], max: durations.at(-1) }, null, 2));
