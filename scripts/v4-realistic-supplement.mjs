import { readFileSync, writeFileSync } from "node:fs";
const report = JSON.parse(readFileSync("/tmp/chatbot-v4-final.json", "utf8"));
const queries = [
  "Our mobile app becomes unusable when traffic spikes during promotions. Which capability can improve scalability?",
  "Different teams keep customer data in separate systems, so reporting takes days. How can we unify it?",
  "Developers wait for manual infrastructure approvals before every deployment. Can this workflow be automated securely?",
  "Our old monolith makes small product changes risky and slow. What modernization approach should we consider?",
  "Store employees cannot see the same inventory information customers see online. How can we connect these channels?",
  "We cannot explain why cloud spending changes from month to month. Which service could improve accountability?",
  "Our content editors publish the same update separately across multiple websites and apps. What capability would reduce duplication?",
  "Field crews receive assignments on paper and managers cannot track progress. Could a digital field platform help?",
  "We need location-based insights to decide where maintenance teams should respond first. What would you recommend?",
  "Security testing happens after development is complete and creates release delays. How can we shift it earlier?",
  "New marketplace sellers take weeks to onboard because validation and approvals are manual. Which capability fits?",
  "Finance spends days matching marketplace orders, commissions, and vendor payments. How can we automate reconciliation?",
  "Our support teams search several tools before they can answer a customer question. What could create a unified view?",
  "We need to leave our data center quickly but cannot interrupt critical applications. Can Successive support the migration?",
  "Marketing cannot deliver consistent personalized content across regions and devices. Where should we start?",
  "Our healthcare application is difficult to update and must remain secure and compliant. Which modernization service fits?",
  "Media planners prepare briefs, buying plans, and reports in disconnected tools. How can we streamline operations?",
  "We want faster software releases, but production stability cannot suffer. Which engineering capability should we explore?",
];
async function ask(query, index) {
  const started = Date.now();
  try {
    const response = await fetch("http://localhost:3002/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${120 + index}` },
      body: JSON.stringify({ message: query, history: [], sessionId: `v4-real-${index}` }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    return { query, group: "business-realistic", success: response.ok && payload.success, status: response.status, durationMs: Date.now() - started, answer: payload.data?.answer || payload.error?.message || "", cards: (payload.data?.cards || []).map((card) => ({ title: card.title, type: card.type })) };
  } catch (error) {
    return { query, group: "business-realistic", success: false, status: 0, durationMs: Date.now() - started, answer: String(error), cards: [] };
  }
}
report.realisticSupplement = [];
for (let index = 0; index < queries.length; index++)
  report.realisticSupplement.push(await ask(queries[index], index));
const all = [...report.tests, ...report.conversations, ...report.supplement, ...report.realisticSupplement];
const durations = all.map((item) => item.durationMs).sort((a, b) => a - b);
report.finalPerformance = { total: all.length, successes: all.filter((item) => item.success).length, timeouts: all.filter((item) => !item.status).length, p50: durations[Math.floor(durations.length * .5)], p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] };
writeFileSync("/tmp/chatbot-v4-final.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ results: report.realisticSupplement.map((item) => ({ query: item.query, cards: item.cards.map((card) => card.title), success: item.success, durationMs: item.durationMs })), performance: report.finalPerformance }, null, 2));
