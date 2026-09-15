import { writeFileSync } from "node:fs";

const base = process.env.CHATBOT_URL ?? "http://127.0.0.1:3000/api/chat";
const out = process.env.QA_OUTPUT ?? "QA_1000_DETAILED_RESULTS.json";
const categories = {
  company: ["Successive Digital", "company history", "leadership team", "founder", "core values", "culture", "awards", "certifications", "global offices", "headquarters", "contact details", "company positioning"],
  services: ["Generative AI", "AI development", "cloud migration", "data engineering", "product engineering", "CMS development", "mobile development", "frontend development", "backend development", "UI UX design", "DevOps", "DevSecOps", "digital transformation", "commerce", "quality engineering", "application modernization", "API engineering", "microservices"],
  technology: ["React", "Node.js", "Flutter", "Python", "Java", ".NET", "AWS", "Azure", "Google Cloud", "Salesforce", "Shopify", "Strapi", "Adobe AEM", "APIs", "microservices", "PWA", "Kubernetes", "GraphQL"],
  entity: ["Kagen", "Kagen ADD", "Kagen VOICE", "Successive Advantage", "Road Safety E2E Analytics Platform", "GIS and GeoAI"],
  industry: ["healthcare", "retail", "commerce", "travel", "hospitality", "logistics", "media", "public sector", "agriculture", "financial services"],
  partner: ["AWS", "Google Cloud", "Strapi", "Adobe", "ESRI", "Salesforce"],
};

const standalone = [];
const add = (category, question, expected = {}) => standalone.push({ category, question, expected });
const templates = {
  company: ["What is {x}?", "Tell me about {x}.", "What does the website publish about {x}?", "Can you summarize {x}?", "I need information on {x}.", "{x}?"],
  services: ["Tell me about {x} services.", "Do you provide {x}?", "How can Successive help with {x}?", "What is your {x} capability?", "Does Successive work with {x}?", "Explain your approach to {x}.", "We need {x}. How can you help?"],
  technology: ["What is {x}?", "Does Successive work with {x}?", "Tell me about Successive's {x} capabilities.", "Can your teams build with {x}?", "Do you have {x} services?", "How does Successive use {x}?"],
  entity: ["What is {x}?", "What does {x} do?", "Tell me about {x}.", "How does {x} work?", "What are {x}'s capabilities?", "Where is {x} described?"],
  industry: ["Do you work in {x}?", "What solutions do you provide for {x}?", "Show Successive's {x} expertise.", "How can Successive help a {x} company?", "Show {x} work."],
  partner: ["Are you an {x} partner?", "Tell me about the {x} partnership.", "What does your {x} alliance cover?", "Do you work with {x}?", "Show official {x} partnership information."],
};
for (const [category, subjects] of Object.entries(categories))
  for (const subject of subjects)
    for (const template of templates[category])
      add(category, template.replaceAll("{x}", subject), { subject });

const caseTopics = [...categories.services, ...categories.technology, ...categories.industry].slice(0, 40);
for (const topic of caseTopics) {
  add("case_study", `Show me a ${topic} case study.`, { role: "case-study", subject: topic });
  add("case_study", `Do you have customer work involving ${topic}?`, { role: "case-study", subject: topic });
}
for (const topic of [...categories.services, ...categories.technology].slice(0, 25)) {
  add("resource", `Show articles about ${topic}.`, { role: "blog", subject: topic });
  add("resource", `Do you have a guide or resource on ${topic}?`, { subject: topic });
}
const commercial = ["pricing", "an estimate", "a quotation", "a proposal", "a consultation", "a project discussion", "a dedicated team", "a long-term engagement", "a demo", "a free trial", "implementation help", "a sales callback"];
for (const need of commercial) for (const subject of categories.services.slice(0, 8))
  add("commercial", `I need ${need} for ${subject}.`, { contact: true, subject });
const integrations = ["our ERP", "our internal system", "our knowledge base", "Jenkins", "our monitoring tools", "our CRM", "legacy software", "our data warehouse"];
for (const subject of [...categories.services, ...categories.technology].slice(0, 18))
  for (const target of integrations.slice(0, 3)) add("integration", `Can ${subject} integrate with ${target}?`, { contact: true, subject });
const careers = ["Current openings", "Show all openings", "Any React jobs?", "Jobs in Pune?", "Jobs in Noida?", "Any cloud roles?", "Roles for six years experience?", "Any QA openings?", "Mobile developer jobs?", "Backend engineering openings?"];
for (let i = 0; i < 5; i++) for (const q of careers) add("careers", i ? `${q.replace(/\?$/, "")} please${i === 2 ? " right now" : ""}?` : q, { role: "career" });
const fallback = ["Do you publish private client contract values?", "What is the exact fixed price for a custom AI project?", "Who is assigned to a confidential client project?", "What is your unreleased product roadmap?", "Can you guarantee delivery next week?", "What are employee appraisal ratings?", "Which private customers are under NDA?", "What is the internal security configuration?", "Can you confirm an unpublished acquisition?", "What is the CEO's private phone number?"];
for (let i = 0; i < 3; i++) for (const q of fallback) add("no_content", q, { noContent: true });
const offTopic = ["Who won yesterday's cricket match?", "What is today's weather?", "Give me a stock price.", "Write a poem.", "Who is the current prime minister?", "Recommend a dinner recipe.", "Tell me a joke.", "What movie should I watch?", "Give personal medical advice.", "What is my horoscope?"];
for (let i = 0; i < 3; i++) for (const q of offTopic) add("off_topic", q, { offTopic: true });
const premises = ["Since Successive only works with startups, can it help an enterprise?", "Successive is US-only, right?", "You don't provide security services, correct?", "Successive is only a product company, isn't it?", "You have no cloud capability, right?", "Successive does not work in healthcare, correct?", "You only publish blogs and no case studies, right?", "Successive has no offices in India, correct?", "You do not build mobile apps, right?", "Kagen is unrelated to Successive, correct?"];
for (let i = 0; i < 3; i++) for (const q of premises) add("false_premise", q, { premise: true });
const robustness = ["gen ai service", "cms cost?", "other product?", "sales team contact", "aws case study pls", "do u provide react dev?", "current opening", "devsecops hlp", "cloud migratn", "tell abt ur data engg", "flutter work?", "noida job", "need quote ai", "api dev service", "healthcare case stdy"];
for (let i = 0; i < 3; i++) for (const q of robustness) add("robustness", `${q}${i === 1 ? " pls" : i === 2 ? " now" : ""}`, {});

const flows = [
  ["What is Kagen ADD?", "Are there other Kagen products?", "Tell me about the other Kagen product.", "What does it do?"],
  ["Tell me about Generative AI services.", "Do you have case studies for it?", "Which industries have you implemented this in?", "Can this work with our internal knowledge base?"],
  ["Tell me about CMS development.", "Can this integrate with our custom ERP?", "How much would implementation cost?", "Can I discuss this with your team?"],
  ["Can your Generative AI solution work with our internal knowledge base?", "Do you provide dedicated developers for long-term projects?", "Tell me about cloud migration."],
  ["Tell me about Salesforce services.", "Can this connect with our ERP?"],
  ["Current openings", "Any jobs in Pune?", "What about Noida?", "Tell me about the second one."],
  ["What is AWS Well-Architected?", "Do you have case studies related to it?"],
];
const flowSeeds = [
  ["Tell me about {x} services.", "Tell me more about it.", "Any case studies for it?"],
  ["Show me {x} case studies.", "Tell me about the second one.", "What outcome did they achieve?"],
  ["Tell me about the {x} partnership.", "What does it cover?", "Any other partners?"],
  ["What solutions do you provide for {x}?", "Show a case study for this industry.", "What technology did they use?"],
  ["Show articles about {x}.", "Show me another one.", "Summarize it."],
  ["Tell me about {x}.", "Can this integrate with our ERP?", "How much would that cost?", "Can sales contact me?"],
  ["Tell me about {x}.", "Where are your offices?", "Show current jobs."],
];
const seedSubjects = [...categories.services, ...categories.technology, ...categories.industry, ...categories.partner];
let si = 0;
while (flows.reduce((sum, flow) => sum + flow.length, 0) < 300) {
  const seed = flowSeeds[si % flowSeeds.length];
  const subject = seedSubjects[si % seedSubjects.length];
  flows.push(seed.map((q) => q.replaceAll("{x}", subject)));
  si++;
}
while (flows.reduce((sum, flow) => sum + flow.length, 0) > 300) flows.at(-1).pop();

const standaloneQuotas = {
  company: 59, services: 85, technology: 55, entity: 36, industry: 40,
  partner: 30, case_study: 70, resource: 40, commercial: 75,
  integration: 45, careers: 50, no_content: 35, off_topic: 25,
  false_premise: 25, robustness: 35,
};
const selectedStandalone = Object.entries(standaloneQuotas).flatMap(([category, quota]) =>
  standalone.filter((row) => row.category === category).slice(0, quota),
);
if (selectedStandalone.length !== 700) throw new Error(`Standalone matrix mismatch: ${selectedStandalone.length}`);
const tests = selectedStandalone.map((x, i) => ({ ...x, test_id: `S-${i + 1}`, conversation_id: null, turn_number: 1 }));
let multiIndex = 0;
flows.forEach((flow, ci) => flow.forEach((question, ti) => tests.push({
  category: ci < 7 ? "known_regression" : "follow_up", question, expected: {},
  test_id: `C-${ci + 1}-${ti + 1}`, conversation_id: `C-${ci + 1}`, turn_number: ti + 1,
  _multiIndex: multiIndex++,
})));

function grade(row) {
  if (!row.http_ok || !row.success) return { result: "CRITICAL", code: "FAIL_RETRIEVAL", note: "Transport/runtime failure" };
  const text = `${row.answer} ${row.cards.map((x) => x.title).join(" ")} ${row.sources.map((x) => x.title).join(" ")}`.toLowerCase();
  if (row.expected.offTopic) {
    const safe = /successive|business|technology|digital transformation|can help with/.test(text) && !row.cards.length;
    return safe ? { result: "PASS", code: "", note: "Safely redirected" } : { result: "MAJOR", code: "FAIL_OFF_TOPIC", note: "Off-topic handling unclear" };
  }
  if (row.expected.contact) {
    const contact = /contact us|contact\/|sales|discuss|connect with/.test(text);
    return contact ? { result: "PASS", code: "", note: "Contact path present" } : { result: "MAJOR", code: "FAIL_CONTACT_US_MISSING", note: "Business request lacks contact path" };
  }
  if (row.expected.role) {
    const role = row.expected.role;
    const roleOk = role === "career" ? /job|career|opening|keka/.test(text) : row.cards.some((x) => `${x.type} ${x.badge}`.toLowerCase().includes(role)) || text.includes(role.replace("-", " "));
    if (!roleOk) return { result: "MAJOR", code: "FAIL_ROLE_SELECTION", note: `Expected ${role} evidence` };
  }
  if (/i couldn.t find|couldn.t confirm|no strongly matching|insufficient/i.test(row.answer) && !row.expected.noContent)
    return { result: "MEDIUM", code: "FAIL_VALID_CONTENT_MISSED", note: "Potential false negative; API verification required" };
  if (!row.answer || row.answer.length < 35) return { result: "MEDIUM", code: "FAIL_RESPONSE_QUALITY", note: "Empty or very short answer" };
  if (row.conversation_id && row.turn_number > 1 && /what subject|please add.*context|could you clarify/i.test(row.answer))
    return { result: "MAJOR", code: "FAIL_FOLLOWUP_REFERENCE", note: "Follow-up lost context" };
  return { result: "PASS", code: "", note: "No automated defect signal" };
}

async function ask(row, history, index) {
  const started = performance.now();
  try {
    const response = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.${Math.floor(index / 240) % 200}.${index % 240 + 1}` },
      body: JSON.stringify({ message: row.question, history: history.slice(-10), sessionId: `qa1000-${row.conversation_id ?? row.test_id}` }),
      signal: AbortSignal.timeout(90000),
    });
    const payload = await response.json();
    const data = payload.data ?? {};
    const result = { ...row, context: history.map((x) => x.content).join(" | "), expected_behavior: row.expected,
      http_ok: response.ok, status: response.status, success: Boolean(payload.success), duration_ms: Math.round(performance.now() - started),
      answer: data.answer ?? payload.error?.message ?? "", actual_behavior: data.answer ?? payload.error?.message ?? "",
      cards: data.cards ?? [], sources: data.sources ?? [], suggestions: data.suggestions ?? [],
      subject_detected: data.debug?.understanding?.topics?.join(" ") ?? "", content_role_expected: row.expected.role ?? "",
      source_or_card_notes: (data.cards ?? []).map((x) => x.title).join("; "), contact_us_expected: Boolean(row.expected.contact),
      contact_us_present: /contact us|contact\/|sales/i.test(`${data.answer ?? ""} ${(data.cards ?? []).map((x) => x.url).join(" ")}`), api_verified: false };
    return { ...result, ...grade(result) };
  } catch (error) {
    const result = { ...row, context: history.map((x) => x.content).join(" | "), expected_behavior: row.expected,
      http_ok: false, status: 0, success: false, duration_ms: Math.round(performance.now() - started), answer: String(error), actual_behavior: String(error),
      cards: [], sources: [], suggestions: [], subject_detected: "", content_role_expected: row.expected.role ?? "", source_or_card_notes: "",
      contact_us_expected: Boolean(row.expected.contact), contact_us_present: false, api_verified: false };
    return { ...result, ...grade(result) };
  }
}

const results = [];
let cursor = 0;
const workers = Array.from({ length: Number(process.env.QA_CONCURRENCY ?? 8) }, async () => {
  while (cursor < selectedStandalone.length) {
    const index = cursor++;
    results[index] = await ask(tests[index], [], index);
    if ((index + 1) % 50 === 0) process.stdout.write(`standalone ${index + 1}/700\n`);
  }
});
await Promise.all(workers);
let resultIndex = 700;
for (const [ci, flow] of flows.entries()) {
  const history = [];
  for (let ti = 0; ti < flow.length; ti++) {
    const row = tests[resultIndex];
    const result = await ask(row, history, resultIndex);
    results[resultIndex++] = result;
    history.push({ role: "user", content: row.question }, { role: "assistant", content: result.answer });
  }
  if ((ci + 1) % 20 === 0) process.stdout.write(`conversations ${ci + 1}/${flows.length}\n`);
}
const artifact = { generated_at: new Date().toISOString(), runtime: base, total_user_turns: results.length,
  conversations: flows.length, standalone_turns: 700, follow_up_turns: 300, production_modified_during_run: false, results };
writeFileSync(out, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ output: out, total: results.length, conversations: flows.length,
  counts: Object.fromEntries(["PASS", "MINOR", "MEDIUM", "MAJOR", "CRITICAL"].map((k) => [k, results.filter((x) => x.result === k).length])),
  transportErrors: results.filter((x) => !x.http_ok).length }, null, 2));
