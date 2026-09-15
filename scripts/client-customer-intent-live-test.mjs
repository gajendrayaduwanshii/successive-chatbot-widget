import { writeFileSync } from "node:fs";

const apiBase = "https://successive.tech/wp-json/successive-digital/v1";
const chatBase = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(/\/$/, "");
const pages = await fetch(`${apiBase}/content?type=page&per_page=100`).then((response) => response.json());
const home = pages.find((item) => {
  try { return new URL(item.link).pathname === "/"; } catch { return false; }
});
const repeater = home?.acf?.trusted_logos;
if (!Array.isArray(repeater)) throw new Error("Current canonical homepage did not expose the trusted_logos repeater.");
const organizations = [...new Map(repeater.flatMap((entry) => {
  const raw = entry.organization_name || entry.company_name || entry.brand_name || entry.label || entry.alt_text || entry.logo?.alt || entry.logo?.caption || entry.logo?.title;
  if (typeof raw !== "string" || !/[a-z]{2}/i.test(raw)) return [];
  const display = raw.replace(/\b(?:company|brand|client|customer)?\s*logo\b/gi, " ").replace(/\s+/g, " ").trim();
  return display ? [[display.toLowerCase(), display]] : [];
})).values()];
if (organizations.length < 3) throw new Error("Trusted organization runtime sample is too small.");
const dynamic = [organizations[0], organizations[Math.floor(organizations.length / 2)], organizations.at(-1)];

const queries = [
  "client", "clients", "our clients", "your clients", "customer", "customers", "Who are your clients?", "Show your clients", "show me your customers", "companies you work with",
  "Which organizations trust Successive?", "Which companies are showcased?", "Current clients",
  "Who are your clients right now?", "active clients", "Active customers", "which of these are current?", "How many clients do you have?",
  "Show published client work", "Customer case studies", "Client blogs", "Customer announcements",
  "Retail customer examples", "Which clients used AI?", "Confidential clients", "Unannounced clients",
  "customer experience services", "customer support automation", "multi-client Strapi",
  "client-side development", "customer data platform", "customer journey personalization", "client-server architecture",
  ...dynamic.flatMap((name) => [`Is ${name} a client?`, `Is ${name} a partner?`, `What work did you do for ${name}?`]),
];

const results = [];
for (const [index, query] of queries.entries()) {
  const started = performance.now();
  try {
    const response = await fetch(`${chatBase}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.245" },
      body: JSON.stringify({ message: query, history: [], sessionId: `client-intent-${index}` }), signal: AbortSignal.timeout(40_000) });
    const payload = await response.json();
    const data = payload.data || {};
    results.push({ query, statusCode: response.status, durationMs: Math.round(performance.now() - started), answer: data.answer || "", cards: data.cards || [], sources: data.sources || [] });
  } catch (error) {
    results.push({ query, statusCode: 0, durationMs: Math.round(performance.now() - started), answer: "", cards: [], sources: [], error: error instanceof Error ? error.message : String(error) });
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  process.stdout.write(`${index + 1}/${queries.length}\n`);
}
writeFileSync("/tmp/client-customer-intent-live-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), organizationsCount: organizations.length, dynamicSampleCount: dynamic.length, results }, null, 2));
console.log(JSON.stringify({ turns: results.length, organizations: organizations.length, dynamicSamples: dynamic.length,
  http200: results.filter((row) => row.statusCode === 200).length,
  transportErrors: results.filter((row) => row.statusCode === 0).length }, null, 2));
