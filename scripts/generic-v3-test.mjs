import { writeFileSync } from "node:fs";

const chatbot = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const wp = process.env.SUCCESSIVE_API_BASE_URL.replace(/\/$/, "");
const regressions = [
  "What does Successive do with geospatial data?", "Tell me about cloud identity rightsizing",
  "Could a decoupled content platform help our global teams?", "Kubernetes",
  "Can you help forestry teams manage field operations?", "Any webinar related to generative AI?",
  "Show me thought leadership about enterprise architecture.", "Tell me about Successive Digital.",
  "Tell me about Scan", "Do you have information about Location Intelligence for Smarter Decisions and Enterprise Advantage?",
  "Tell me about Accelerators Turn Enterprise Priorities into Faster Execution",
  "Do you have information about GIS & GeoAI Consulting Services?",
  "What business needs does Current State Assessment & Architecture Consulting address?",
  "Do you have information about Turn Location Data Into Decisions With Enterprise Esri ArcGIS Solutions?",
  "Tell me about The JioMart Playbook for Speed & Scale",
  "What business needs does Corent ComPaaS Guide: Unified FinOps, AppOps, and CloudOps address?",
  "Do you have information about What Is Corent MaaS? An Enterprise Guide to Automated Cloud Migration?",
  "Tell me about Achieve Modernisation Through Agentic-Driven Delivery for Legacy Systems",
  "Do you have information about Cloud Consulting Services: Guide to Strategy, Benefits, and Implementation?",
  "Tell me about AWS Advanced Consulting Partner vs Standard Partner: What’s the Difference?",
  "Do you have information about DevOps Consulting Services for Cloud Automation and CI/CD Success?",
  "Tell me about From Legacy Monoliths to a Cloud-Native Platform",
  "What business needs does Lift-and-Shift Cloud Modernization for an Aerial Imagery Enterprise address?",
  "Tell me about Eliminating Inventory Inconsistencies Across Multi-Vendor Ecosystems",
  "What business needs does Automating Financial Governance and Vendor Settlements address?",
  "Tell me about Travel & Hospitality", "What business needs does Retail & Commerce Software Development Solutions address?",
  "Do you have information about Healthcare & Life Sciences?",
];

const types = ["page", "post", "case_study", "industries", "partners", "thought-leadership", "employee-perspective", "accelerators"];
const clean = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/&#0*38;|&amp;/gi, "&").replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10))).replace(/\s+/g, " ").trim();
async function contentSnapshot() {
  const settled = await Promise.allSettled(types.map(async (type) => {
    const response = await fetch(`${wp}/content?type=${encodeURIComponent(type)}&per_page=10&page=1`, { signal: AbortSignal.timeout(20000) });
    const items = await response.json();
    return Array.isArray(items) ? items.map((item) => ({ ...item, cleanTitle: clean(typeof item.title === "string" ? item.title : item.title?.rendered) })) : [];
  }));
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

function exactCases(items) {
  return [...new Map(items.filter((item) => item.cleanTitle.length >= 8).map((item) => [item.cleanTitle.toLowerCase(), item])).values()]
    .slice(0, 28)
    .map((item, index) => ({
      query: item.type === "case_study" ? `Show me the customer story ${item.cleanTitle}` : index % 2 ? `Do you have information about ${item.cleanTitle}?` : `Tell me about ${item.cleanTitle}`,
      expectedTitle: item.cleanTitle,
      expectedType: item.type,
      group: "B",
      category: "exact-title",
    }));
}

function naturalCases(items) {
  const candidates = [];
  for (const item of items) {
    const acf = item.acf && typeof item.acf === "object" ? item.acf : {};
    const problem = clean(acf.challenge_sub_heading || acf.hero_description || acf.meta_description || acf.summery || "");
    if (problem.length < 45) continue;
    const sentence = problem.split(/[.!?]/)[0].split(/\s+/).slice(0, 20).join(" ");
    if (sentence.length < 35) continue;
    candidates.push({
      query: item.type === "case_study" ? `We are facing a similar challenge: ${sentence}. What capability could help?` : `Can Successive help our business with this need: ${sentence}?`,
      sourceTitle: item.cleanTitle,
      sourceType: item.type,
      group: "C",
      category: "business-problem",
    });
  }
  return candidates.slice(0, 28);
}

async function ask(test, index, history = []) {
  const started = performance.now();
  try {
    const response = await fetch(`${chatbot}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `192.0.2.${index % 220 + 1}` },
      body: JSON.stringify({ message: test.query, history, sessionId: `v3-${index}` }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    return { ...test, status: response.status, success: response.ok && payload.success === true, durationMs: Math.round(performance.now() - started), answer: payload.data?.answer || payload.error?.message || "", cards: (payload.data?.cards || []).map((card) => ({ title: card.title, type: card.type })), confidence: payload.data?.confidence };
  } catch (error) {
    return { ...test, status: 0, success: false, durationMs: Math.round(performance.now() - started), answer: error instanceof Error ? error.message : String(error), cards: [] };
  }
}

const snapshot = await contentSnapshot();
const tests = [
  ...regressions.map((query) => ({ query, group: "A", category: "regression" })),
  ...exactCases(snapshot),
  ...naturalCases(snapshot),
  ...[
    ["What's the weather tomorrow?", "off-topic"], ["Write a birthday poem.", "off-topic"],
    ["Recommend a science-fiction movie.", "off-topic"], ["Who won the football match?", "off-topic"],
    ["What is the capital of Japan?", "off-topic"], ["What is GeoAI and can it support field operations?", "partial-scope"],
    ["Could DevSecOps make releases safer?", "partial-scope"], ["Any case study about cloud migration?", "content-type"],
    ["Do you have a whitepaper about modernization?", "content-type"], ["Show me a blog about Kubernetes.", "content-type"],
  ].map(([query, category]) => ({ query, group: "C", category })),
];
const results = [];
for (const [index, test] of tests.entries()) results.push(await ask(test, index));

const conversations = [
  ["Tell me about FinOps.", "What about retail commerce?", "How can this help my company?"],
  ["Tell me about headless CMS.", "What about travel companies?", "What would you suggest?"],
  ["We need better application performance.", "Show me a case study about this.", "Now switch to cloud cost control.", "How would this help us?"],
];
let conversationIndex = 300;
const conversationResults = [];
for (const turns of conversations) {
  const history = [];
  for (const query of turns) {
    const result = await ask({ query, group: "C", category: "conversation" }, conversationIndex++, history);
    conversationResults.push(result);
    history.push({ role: "user", content: query }, { role: "assistant", content: result.answer });
  }
}

const burstQueries = results.slice(0, 8).map((item) => item.query);
const concurrency = [];
for (const level of [1, 2, 4]) {
  const levelResults = [];
  for (let offset = 0; offset < burstQueries.length; offset += level)
    levelResults.push(...await Promise.all(burstQueries.slice(offset, offset + level).map((query, index) => ask({ query, group: "performance", category: "burst" }, 500 + level * 20 + offset + index))));
  const durations = levelResults.map((item) => item.durationMs).sort((a, b) => a - b);
  concurrency.push({ level, total: levelResults.length, successes: levelResults.filter((item) => item.success).length, timeouts: levelResults.filter((item) => item.status === 0).length, p50: durations[Math.floor(durations.length * .5)] || 0, p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] || 0 });
}
const allSemantic = [...results, ...conversationResults];
const durations = allSemantic.map((item) => item.durationMs).sort((a, b) => a - b);
const output = { generatedAt: new Date().toISOString(), snapshotCount: snapshot.length, tests: results, conversations: conversationResults, concurrency, performance: { total: allSemantic.length, successes: allSemantic.filter((item) => item.success).length, timeouts: allSemantic.filter((item) => item.status === 0).length, p50: durations[Math.floor(durations.length * .5)] || 0, p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] || 0 } };
writeFileSync(process.env.REPORT_PATH || "/tmp/chatbot-v3-results.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify({ snapshotCount: output.snapshotCount, groupA: results.filter((item) => item.group === "A").length, groupB: results.filter((item) => item.group === "B").length, groupC: results.filter((item) => item.group === "C").length, conversations: conversationResults.length, performance: output.performance, concurrency }, null, 2));
