import { writeFileSync } from "node:fs";
import { generatedBusinessCandidates, humanBusinessProblems, multiConstraintQueries, validateBusinessProblem } from "./v5-query-set.mjs";

const base = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const malformedSamples = [
  "Our teams are struggling with accelerate delivery, productivity,. Which capability could help us?",
  "Too much time is being spent on leading aerial imagery. How could we streamline it?",
  "We need to improve together, strapi flexible, without adding more manual work.",
];
const validation = [...generatedBusinessCandidates, ...malformedSamples].map((query) => ({ query, ...validateBusinessProblem(query) }));
const dynamic = validation.filter((item) => item.accepted).slice(0, 40).map(({ query }) => ({ query, group: "generated-business" }));
if (dynamic.length < 40) throw new Error(`Only ${dynamic.length} valid generated problems; 40 required.`);
const rejected = validation.filter((item) => !item.accepted);
const content = [
  "Any case study about cloud migration?", "Show me a blog about Kubernetes.",
  "Do you have thought leadership about enterprise architecture?", "Is there a webinar specifically about generative AI?",
  "Do you have a whitepaper about application modernization?",
];
const exactTitles = [
  "GIS & GeoAI Consulting Services", "FinOps Consulting Services", "Current State Assessment & Architecture Consulting",
  "Application Modernization Services for Legacy Systems", "DevSecOps Consulting Services",
];
const scope = ["What's tomorrow's weather?", "Write a poem about summer.", "Recommend a movie.", "Who won the football match?", "What is the capital of Brazil?"];
const tests = [
  ...humanBusinessProblems.map((query) => ({ query, group: "human-business" })),
  ...dynamic,
  ...multiConstraintQueries.map((query) => ({ query, group: "multi-constraint" })),
  ...content.map((query) => ({ query, group: "content-type" })),
  ...exactTitles.map((title) => ({ query: `Tell me about ${title}`, group: "exact-title", expected: title })),
  ...scope.map((query) => ({ query, group: "off-topic" })),
];
async function ask(test, index, history = []) {
  const started = performance.now();
  try {
    const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${index % 220 + 1}` }, body: JSON.stringify({ message: test.query, history, sessionId: `v5-${index}` }), signal: AbortSignal.timeout(60000) });
    const payload = await response.json();
    return { ...test, success: response.ok && payload.success, status: response.status, durationMs: Math.round(performance.now() - started), answer: payload.data?.answer || payload.error?.message || "", cards: (payload.data?.cards || []).map(({ title, type }) => ({ title, type })) };
  } catch (error) { return { ...test, success: false, status: 0, durationMs: Math.round(performance.now() - started), answer: String(error), cards: [] }; }
}
const results = [];
for (const [index, test] of tests.entries()) results.push(await ask(test, index));
const journeys = [
  ["Tell me about headless CMS.", "What about travel companies?", "Show me a relevant case study."],
  ["We need better application performance.", "What about healthcare?", "Which capability fits both needs?"],
  ["We need cloud cost control.", "Now focus on retail commerce.", "How would this help our company?"],
];
const conversations = [];
let conversationIndex = 300;
for (const turns of journeys) { const history = []; for (const query of turns) { const result = await ask({ query, group: "conversation" }, conversationIndex++, history); conversations.push(result); history.push({ role: "user", content: query }, { role: "assistant", content: result.answer }); } }
const latencyQueries = humanBusinessProblems.slice(0, 8).map((query) => ({ query, group: "latency" }));
const controlledLatency = [];
for (const level of [1, 2, 4]) { const batch = []; for (let offset = 0; offset < latencyQueries.length; offset += level) batch.push(...await Promise.all(latencyQueries.slice(offset, offset + level).map((test, index) => ask(test, 500 + level * 20 + offset + index)))); const durations = batch.map((item) => item.durationMs).sort((a, b) => a - b); controlledLatency.push({ concurrency: level, total: batch.length, successes: batch.filter((item) => item.success).length, timeouts: batch.filter((item) => !item.status).length, p50: durations[Math.floor(durations.length * 0.5)], p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] }); }
const all = [...results, ...conversations]; const durations = all.map((item) => item.durationMs).sort((a, b) => a - b);
const output = { validTests: tests.length + conversations.length, rejectedMalformedGeneratedTests: rejected, tests: results, conversations, controlledLatency, performance: { total: all.length, successes: all.filter((item) => item.success).length, timeouts: all.filter((item) => !item.status).length, p50: durations[Math.floor(durations.length * 0.5)], p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] } };
writeFileSync("/tmp/chatbot-v5-results.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify({ validTests: output.validTests, rejectedMalformedGeneratedTests: rejected.length, groups: Object.fromEntries([...new Set(results.map((item) => item.group))].map((group) => [group, results.filter((item) => item.group === group).length])), performance: output.performance, controlledLatency }, null, 2));
