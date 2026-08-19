import { readFile, writeFile } from "node:fs/promises";

const baseUrl = process.env.CHATBOT_URL ?? "http://127.0.0.1:3001/api/chat";
const v6 = await readFile("CHATBOT_GENERIC_TESTING_REPORT_V6.md", "utf8");
const rows = [...v6.matchAll(/^\| (.+?) \| (.+?) \| (✅ Accepted|⚠️ Partially Accepted|❌ Not Accepted) \| (.+?) \|$/gm)]
  .map((match) => ({ query: match[1], previous: match[3], previousFeedback: match[4] }))
  .filter((row) => row.query !== "Your Request");
const v6Failures = rows.filter((row) => row.previous !== "✅ Accepted" && !row.query.startsWith("Conversation ")).slice(0, 35);
const manual = [
  "What is Flutter?", "What are Successive's core values?", "What services does Successive offer?",
  "Which industries does Successive serve?", "What is an API?", "Who won yesterday's cricket match?",
  "Since Successive only works with startups, what services for enterprises?", "Current CEO and latest award",
  "Summarize blog 'Why Use Flutter for App Development'", "AWS case study", "What is Kagen ADD?",
  "What AI/ML services?", "Does Successive provide GIS/ArcGIS?", "Phone number and email", "Show a whitepaper",
];
const unseen = [
  "Give me a concise overview of Successive Digital", "List the company's published industry verticals",
  "Which capability can improve release governance?", "How can fragmented reporting data be governed?",
  "Recommend a starting point for modernizing a monolith", "Do you support location-aware enterprise applications?",
  "Find a customer example involving Azure and migration", "Show an article on controlling cloud expenditure",
  "Is there a resource about headless content migration?", "What does an AWS well-architected review cover?",
  "How could automation reduce document-heavy operations?", "Our teams manually copy information between systems",
  "We need trustworthy analytics across disconnected departments", "Which service addresses identity risks in cloud environments?",
  "Find a retail case study with measurable operational outcomes", "What partnerships does Successive publish?",
  "Explain Successive's work with enterprise content platforms", "What is composable commerce?",
  "Define application modernization", "Summarize a published article about Flutter benefits",
  "Show a webinar related to cloud transformation", "Find thought leadership about digital engineering",
  "Do you have a whitepaper for legacy modernization?", "Which offering fits a healthcare data platform?",
  "We use Kubernetes and need safer delivery pipelines", "Our marketplace has slow vendor payout reconciliation",
  "We need satellite insights for agricultural field planning", "Which product analyzes customer feedback?",
  "Can Successive help a media company automate workflows?", "What current leadership information is published?",
  "What is the newest published recognition?", "How do I contact the India office?",
  "Is a public sales email listed?", "Assuming Successive only builds mobile apps, can it help with cloud?",
  "We need AWS security guidance and a case study", "Show a commerce article, not a service page",
  "Find an event about AI for enterprises", "Show another cloud migration example",
  "tell me abt ur data capabilites", "need help wit app modernisation",
  "Which services support both speed and compliance?", "We need an AEM platform across multiple brands",
  "Can ArcGIS support field operations for utilities?", "Which Successive service helps validate an AI idea first?",
  "Find an AWS customer story for content operations",
];
const conversations = [
  ["Tell me about application modernization.", "Show a customer example.", "Now focus on healthcare.", "How would that help us?"],
  ["We need better cloud cost control.", "Show an article about it.", "Switch to retail commerce.", "Which capability fits now?"],
  ["Explain GeoAI.", "Could it help agriculture?", "Show a case study.", "How can I contact the team?"],
  ["We use Strapi.", "Do you have relevant experience?", "Switch to AWS migration.", "Show a customer story about that."],
  ["We want onboarding automation.", "Which capability could help?", "Any healthcare example?", "How can this help our organization?"],
];
const offTopic = ["What will the weather be tomorrow?", "Write a limerick", "Recommend a TV series", "Who won today's tennis match?", "What is the capital of Japan?"];

const standalone = [
  ...manual.map((query, index) => ({ id: `TC-${String(index + 1).padStart(3, "0")}`, query, group: "manual" })),
  ...v6Failures.map((row, index) => ({ id: `V6F-${String(index + 1).padStart(2, "0")}`, query: row.query, group: "v6-failure", ...row })),
  ...unseen.map((query, index) => ({ id: `NEW-${String(index + 1).padStart(2, "0")}`, query, group: "unseen" })),
  ...offTopic.map((query, index) => ({ id: `OFF-${index + 1}`, query, group: "off-topic" })),
];

let requestSerial = 0;
async function ask(test, history = []) {
  const serial = requestSerial++;
  const started = performance.now();
  try {
    const response = await fetch(baseUrl, {
      method: "POST", headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.77.${Math.floor(serial / 250) + 1}.${serial % 250 + 1}`,
      },
      body: JSON.stringify({ message: test.query, history }), signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    const data = payload.data ?? {};
    return { ...test, statusCode: response.status, durationMs: Math.round(performance.now() - started), answer: data.answer ?? "", cards: data.cards ?? [], sources: data.sources ?? [], insufficientContext: data.insufficientContext, error: payload.error ?? null };
  } catch (error) {
    return { ...test, durationMs: Math.round(performance.now() - started), answer: "", cards: [], sources: [], error: String(error) };
  }
}

const results = [];
for (let index = 0; index < standalone.length; index += 2) {
  results.push(...await Promise.all(standalone.slice(index, index + 2).map((test) => ask(test))));
}
for (let conversation = 0; conversation < conversations.length; conversation++) {
  const history = [];
  for (let turn = 0; turn < conversations[conversation].length; turn++) {
    const query = conversations[conversation][turn];
    const result = await ask({ id: `CONV-${conversation + 1}-${turn + 1}`, query, group: "conversation" }, history);
    results.push(result);
    history.push({ role: "user", content: query }, { role: "assistant", content: result.answer });
  }
}
await writeFile("/tmp/chatbot-v7-live-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, count: results.length, results }, null, 2));
const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
console.log(JSON.stringify({ count: results.length, errors: results.filter((r) => r.error).length, zeroCards: results.filter((r) => !r.cards.length).length, p50: durations[Math.floor(durations.length * .5)], p95: durations[Math.floor(durations.length * .95)], output: "/tmp/chatbot-v7-live-results.json" }, null, 2));
