import { writeFileSync } from "node:fs";

const chatbot = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const wp = process.env.SUCCESSIVE_API_BASE_URL?.replace(/\/$/, "");
const oldQueries = [
  "What does Successive do with geospatial data?", "Our cloud bill keeps growing and we cannot explain the spend.",
  "Do you have capabilities around infrastructure-as-code security?", "Tell me about cloud identity rightsizing",
  "Maritime software", "Could a decoupled content platform help our global teams?", "Virtual reality",
  "What can Successive do with IoT?", "Modern data architecture", "Our customer-facing app becomes slow during peak traffic.",
  "Microservices", "Kubernetes", "Adobe Commerce", "Strapi", "Can you help forestry teams manage field operations?",
  "What services do you provide?", "How can Successive help our business?", "What do you specialize in?",
  "Which capability could help us reduce manual operations?", "Do you have a whitepaper about application modernization?",
  "Any webinar related to generative AI?", "Show me thought leadership about enterprise architecture.",
  "Tell me about Successive Digital.", "Tell me about your ESRI partnership.", "Recommend a movie.",
];

const collections = ["pages", "posts", "case_study", "industries", "partners", "thought-leadership", "accelerators", "careers"];
async function snapshot() {
  if (!wp) return [];
  const settled = await Promise.allSettled(collections.map(async (collection) => {
    const type = collection === "pages" ? "page" : collection === "posts" ? "post" : collection;
    const response = await fetch(`${wp}/content?type=${encodeURIComponent(type)}&per_page=10&page=1`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return [];
    const items = await response.json();
    return Array.isArray(items) ? items.map((item) => ({
      title: typeof item.title === "string" ? item.title : item.title?.rendered,
      type: item.type || type,
    })).filter((item) => item.title) : [];
  }));
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

function generatedQueries(items) {
  const templates = [
    (title) => `Tell me about ${title}`,
    (title) => `What business needs does ${title} address?`,
    (title, type) => type.includes("case") ? `Show me the customer story ${title}` : `Do you have information about ${title}?`,
  ];
  const unique = [...new Map(items.map((item) => [item.title.toLowerCase(), item])).values()];
  return unique.slice(0, 34).map((item, index) => ({
    query: templates[index % templates.length](item.title, item.type),
    sourceTitle: item.title,
    sourceType: item.type,
  }));
}

async function ask(query, index, history = []) {
  const started = performance.now();
  try {
    const response = await fetch(`${chatbot}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${(index % 200) + 1}` },
      body: JSON.stringify({ message: query, history, sessionId: `v2-${index}` }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    return { query, status: response.status, durationMs: Math.round(performance.now() - started), success: response.ok && payload.success === true, answer: payload.data?.answer || payload.error?.message || "", cards: (payload.data?.cards || []).map((card) => ({ title: card.title, type: card.type })) };
  } catch (error) {
    return { query, status: 0, durationMs: Math.round(performance.now() - started), success: false, answer: error instanceof Error ? error.message : String(error), cards: [] };
  }
}

const items = await snapshot();
const fresh = generatedQueries(items);
const sequentialCases = [
  ...oldQueries.map((query) => ({ query, kind: "previous" })),
  ...fresh.map((item) => ({ ...item, kind: "new" })),
  ...["What's today's weather?", "Write me a poem.", "What is the capital of France?", "What is GeoAI and can it help our operations?", "How could DevSecOps improve delivery?"].map((query) => ({ query, kind: "scope" })),
  ...["Which capability could reduce manual data entry?", "Where should we start modernizing a legacy platform?", "What could improve release speed?", "How can we control cloud costs?", "Which capability supports customer segmentation?"].map((query) => ({ query, kind: "recommendation" })),
];
const sequential = [];
for (const [index, item] of sequentialCases.entries()) sequential.push({ ...item, ...(await ask(item.query, index)) });

const conversations = [
  ["Tell me about FinOps.", "What about retail commerce?", "How can this help my company?"],
  ["Tell me about location intelligence.", "Any examples?", "What about agriculture?", "How would this help field teams?"],
  ["Tell me about headless CMS.", "Do you have something I can read about this?", "What about travel companies?", "What would you suggest?"],
];
const conversationResults = [];
let conversationIndex = 500;
for (const turns of conversations) {
  const history = [];
  for (const query of turns) {
    const result = await ask(query, conversationIndex++, history);
    conversationResults.push(result);
    history.push({ role: "user", content: query }, { role: "assistant", content: result.answer });
  }
}

const burstQueries = oldQueries.slice(0, 8);
const concurrency = [];
for (const level of [1, 2, 4]) {
  const results = [];
  for (let offset = 0; offset < burstQueries.length; offset += level) {
    results.push(...await Promise.all(burstQueries.slice(offset, offset + level).map((query, index) => ask(query, 700 + level * 20 + offset + index))));
  }
  const durations = results.map((item) => item.durationMs).sort((a, b) => a - b);
  concurrency.push({ level, total: results.length, successes: results.filter((item) => item.success).length, timeouts: results.filter((item) => item.status === 0).length, p50: durations[Math.floor(durations.length * .5)] || 0, p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] || 0, results });
}
const durations = sequential.map((item) => item.durationMs).sort((a, b) => a - b);
const report = { generatedAt: new Date().toISOString(), snapshotItems: items.length, newQueries: fresh.length, sequential, conversations: conversationResults, concurrency, performance: { successes: sequential.filter((item) => item.success).length, total: sequential.length, timeouts: sequential.filter((item) => item.status === 0).length, p50: durations[Math.floor(durations.length * .5)] || 0, p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] || 0 } };
writeFileSync(process.env.REPORT_PATH || "/tmp/chatbot-v2-results.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ snapshotItems: report.snapshotItems, newQueries: report.newQueries, performance: report.performance, concurrency: concurrency.map((item) => ({ level: item.level, total: item.total, successes: item.successes, timeouts: item.timeouts, p50: item.p50, p95: item.p95 })) }, null, 2));
