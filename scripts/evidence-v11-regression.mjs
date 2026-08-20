import { readFile, writeFile } from "node:fs/promises";

const base = process.env.CHATBOT_URL ?? "http://127.0.0.1:3003/api/chat";
const groups = {
  SUPPORTED: [
    "What does Successive do?", "What are Successive core values?", "Who leads Successive?", "Show the board of directors",
    "What AI capabilities do you have?", "What are your Global Capabilities?", "Which frontend technologies do you use?",
    "Which backend technologies do you use?", "Which DevOps tools do you use?", "What automation capabilities do you have?",
    "Do you work with Flutter?", "Do you use React?", "Can Successive build using Node?", "Who are your partners?",
    "Which cloud partners do you have?", "Are you an AWS partner?", "What is the culture like?", "What career benefits are published?",
    "Any open jobs?", "How many current openings are available?", "Are you hiring React developers?", "Show jobs in Noida",
    "What awards has Successive received?", "What is the latest award?", "What industries does Successive serve?",
    "What cloud services does Successive provide?", "What application modernization services are available?", "What data capabilities do you have?",
    "Does Successive provide digital engineering?", "What customer experience capabilities are available?", "How can Successive help with DevOps?",
    "Can Successive help modernize a legacy application?", "Does Successive support cloud migration?", "What is Generative AI?",
    "Show Successive services", "Tell me about Successive partnerships", "What is life at Successive like?", "Who is Amit Halder?",
    "What certifications does Successive publish?", "What creative capabilities does Successive have?",
  ],
  PARTIALLY_SUPPORTED: [
    "How long does application modernization take?", "How much does AI development cost?", "How many developers will my AI project need?",
    "Can Successive migrate my application next month?", "Can you modernize our platform in two weeks?", "What budget should we plan for cloud migration?",
    "How quickly can you build an enterprise mobile app?", "How many engineers are needed for a data platform?", "What will a DevOps transformation cost?",
    "Can an AI proof of concept be delivered in 15 days?", "How long does ecommerce modernization take?", "What is the price of a customer experience redesign?",
    "How many people are required for an AWS migration?", "Can Successive complete automation next month?", "What does a Flutter application cost?",
    "How quickly can Successive implement analytics?", "Can you guarantee a cloud migration date?", "Which AI solution should I choose?",
    "Which cloud service is right for our legacy system?", "What technology should we use for a new mobile product?", "Can Successive estimate our modernization timeline?",
    "How much should we spend on DevOps automation?", "How many developers will our commerce project require?", "Can you finish our data migration this quarter?",
    "What would an application modernization engagement cost?",
  ],
  INSUFFICIENT_EVIDENCE: [
    "How long will it take to build a chatbot project?", "When is appraisal?", "When is salary credited?", "How much hike will employees get?",
    "What is my appraisal rating?", "What is Successive exact chatbot project cost?", "Can you deliver my unspecified project in exactly 15 days?",
    "What is the CEO personal phone number?", "What will Successive revenue be next year?", "Who approved my leave?", "What is today's attendance?",
    "Who is my manager?", "When is the bonus date?", "What salary will I receive next month?", "What is my employee ID?",
    "What is the private home address of the CEO?", "How many confidential clients are under contract today?", "What will the stock price be next year?",
    "What is Successive internal profit forecast?", "Give me an exact fixed price for an undefined project", "Guarantee my promotion date",
    "What is the unpublished 2027 hiring budget?", "Share an employee appraisal rating", "What is the confidential sales pipeline?",
    "Which employee is absent today?",
  ],
  OFF_TOPIC: [
    "Who won yesterday's cricket match?", "What is the weather tomorrow?", "Write Python sorting code", "Who is the Prime Minister?",
    "Tell me a joke", "Recommend a movie", "Give me a pasta recipe", "What is the capital of France?", "Write a poem", "What is my horoscope?",
  ],
  AMBIGUOUS: ["How long?", "How much?", "When?", "Where?", "Who?", "What about that?", "Can you do it?", "Tell me more", "What will it cost?", "How quickly can you finish?"],
  RELATION_CONTENT: [
    "Do you use AWS?", "Are you an AWS partner?", "Do you work with healthcare companies?", "Do you have a healthcare case study?",
    "Do you use AI?", "Do you provide AI consulting?", "Show me AI services", "Show me AI case studies", "Show me AI blogs", "Show me AI resources",
  ],
};
const conversations = [
  ["Tell me about AI.", "How long does it take?", "What about healthcare?"],
  ["Tell me about application modernization.", "How much does it cost?", "Show me a case study."],
  ["Tell me about your careers.", "When is appraisal?", "Any open roles?"],
  ["Who are your partners?", "Do you use AWS?", "Are you an AWS partner?"],
  ["Tell me about DevOps.", "Can you automate delivery?", "Can it be completed in two weeks?"],
];
const tests = Object.entries(groups).flatMap(([expected, queries]) => queries.map((query, index) => ({ id: `${expected}-${index + 1}`, query, expected, history: [] })));
for (const [conversationIndex, turns] of conversations.entries()) {
  const history = [];
  for (const [turnIndex, query] of turns.entries()) {
    tests.push({ id: `CONV-${conversationIndex + 1}-${turnIndex + 1}`, query, expected: turnIndex === 1 && /long|cost|appraisal|two weeks/i.test(query) ? "PARTIALLY_SUPPORTED" : "SUPPORTED", history: [...history], conversation: true });
    history.push({ role: "user", content: query }, { role: "assistant", content: "Previous answer was grounded in Successive content." });
  }
}

const outputPath = "/tmp/chatbot-evidence-v11.json";
const saved = await readFile(outputPath, "utf8").then(JSON.parse).catch(() => ({ results: [] }));
const results = saved.results ?? [];
const completed = new Set(results.map((result) => result.id));
const persist = () => writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), base, concurrency: 1, delayMs: 300, results }, null, 2));
for (const [index, test] of tests.entries()) {
  if (completed.has(test.id)) continue;
  const started = performance.now();
  try {
    const response = await fetch(base, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: test.query, history: test.history, sessionId: `evidence-v11-${index}` }),
      signal: AbortSignal.timeout(35_000),
    });
    const payload = await response.json();
    results.push({ ...test, statusCode: response.status, durationMs: Math.round(performance.now() - started), answer: payload.data?.answer ?? "", cards: payload.data?.cards ?? [], sources: payload.data?.sources ?? [], insufficientContext: payload.data?.insufficientContext, error: payload.error ?? null });
  } catch (error) {
    results.push({ ...test, statusCode: 0, durationMs: Math.round(performance.now() - started), answer: "", cards: [], sources: [], error: String(error) });
  }
  await persist();
  await new Promise((resolve) => setTimeout(resolve, 300));
}
await persist();
const durations = results.map((result) => result.durationMs).sort((a,b) => a-b);
console.log(JSON.stringify({ count: results.length, errors: results.filter((result) => result.error).length, http429: results.filter((result) => result.statusCode === 429).length, p50: durations[Math.floor(durations.length*.5)], p95: durations[Math.floor(durations.length*.95)], max: durations.at(-1), outputPath }, null, 2));
