import { readFileSync, writeFileSync } from "node:fs";
const old = JSON.parse(readFileSync("/tmp/chatbot-v4-results.json", "utf8"));
const base = "http://localhost:3002";
const qs = [
  "Our customers see different product information on web and mobile. How can we make the experience consistent?",
  "Finance teams cannot tell which department owns each part of our cloud bill. What capability could help?",
  "Field workers lose access to operational data when they are offline. What would you recommend?",
  "Our legacy application takes months to change and releases keep getting delayed. Where should we start?",
  "Security reviews happen at the end of delivery and slow every release. Can Successive help?",
  "We manually review hundreds of onboarding records and decisions are inconsistent. Which capability fits?",
  "Inventory numbers differ between sellers and customers are receiving cancellations. How can we fix this?",
  "Our media planning, buying, and reporting data live in separate tools. What capability could unify operations?",
  "We need to move hundreds of servers to Azure before our data center contract ends. What service fits?",
  "Our content team maintains several brand websites separately and work is duplicated. Can this be streamlined?",
  "Our marketplace still works like a single-seller store and new vendors take too long to onboard. What should we modernize?",
  "We cannot see where field incidents are happening or prioritize crews effectively. Could location intelligence help?",
];
async function ask(query, i) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${150 + i}` },
      body: JSON.stringify({ message: query, history: [], sessionId: `v4-s-${i}` }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    return { query, group: "business-supplement", success: response.ok && payload.success, status: response.status, durationMs: Date.now() - started, answer: payload.data?.answer || payload.error?.message || "", cards: (payload.data?.cards || []).map((card) => ({ title: card.title, type: card.type })) };
  } catch (error) {
    return { query, group: "business-supplement", success: false, status: 0, durationMs: Date.now() - started, answer: String(error), cards: [] };
  }
}
const supplement = [];
for (let i = 0; i < qs.length; i++) supplement.push(await ask(qs[i], i));
const concurrency = [];
for (const level of [1, 2, 4]) {
  const values = [];
  for (let offset = 0; offset < 8; offset += level)
    values.push(...await Promise.all(qs.slice(offset, offset + level).map((query, index) => ask(query, 30 + level * 10 + offset + index))));
  const durations = values.map((item) => item.durationMs).sort((a, b) => a - b);
  concurrency.push({ level, total: values.length, successes: values.filter((item) => item.success).length, timeouts: values.filter((item) => !item.status).length, p50: durations[Math.floor(durations.length * .5)], p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] });
}
old.supplement = supplement;
old.freshConcurrency = concurrency;
const all = [...old.tests, ...old.conversations, ...supplement];
const durations = all.map((item) => item.durationMs).sort((a, b) => a - b);
old.finalPerformance = { total: all.length, successes: all.filter((item) => item.success).length, timeouts: all.filter((item) => !item.status).length, p50: durations[Math.floor(durations.length * .5)], p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] };
writeFileSync("/tmp/chatbot-v4-final.json", JSON.stringify(old, null, 2));
console.log(JSON.stringify({ supplement: supplement.map((item) => ({ query: item.query, cards: item.cards.map((card) => card.title), durationMs: item.durationMs, success: item.success })), freshConcurrency: concurrency, finalPerformance: old.finalPerformance }, null, 2));
