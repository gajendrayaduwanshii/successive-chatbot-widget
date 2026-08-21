const base = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const queries = ["client", "clients", "who are your clients?", "which companies work with you?", "tell me about your customers"];
const results = [];
for (const [index, query] of queries.entries()) {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.246" },
    body: JSON.stringify({ message: query, history: [], sessionId: `client-intro-${index}` }), signal: AbortSignal.timeout(40_000) });
  const payload = await response.json();
  const data = payload.data || {};
  results.push({ query, statusCode: response.status, answer: data.answer || "", sources: data.sources || [] });
  await new Promise((resolve) => setTimeout(resolve, 400));
}
const normalized = results.map((row) => row.answer.replace(/\s+/g, " ").trim());
const summary = {
  turns: results.length,
  uniqueAnswers: new Set(normalized).size,
  allHttp200: results.every((row) => row.statusCode === 200),
  allHomepageGrounded: results.every((row) => row.sources[0]?.url === "https://successive.tech/"),
  unsupportedActiveClaims: results.filter((row) => /(?:these are|all are) current active clients/i.test(row.answer)).length,
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.allHttp200 || !summary.allHomepageGrounded || summary.uniqueAnswers < 3 || summary.unsupportedActiveClaims) process.exitCode = 1;
