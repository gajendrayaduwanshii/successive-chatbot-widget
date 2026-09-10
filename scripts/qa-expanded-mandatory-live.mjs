import { writeFileSync } from "node:fs";

const base = process.env.CHATBOT_URL ?? "http://127.0.0.1:3001/api/chat";
const flows = [
  ["What is Successive Digital?", "What services does it offer?"], ["Tell me about Kagen.", "What products does it include?"],
  ["Do you offer cloud services?", "Tell me more about the migration ones."], ["What is Flutter?", "Is it better than native development?"],
  ["Tell me about a healthcare case study.", "How did they reduce onboarding time?"], ["Tell me about an AWS case study.", "How did they use Lambda and S3?"],
  ["What industries do you serve?", "Which is your biggest focus?"], ["What is Kagen ADD?", "Are there other Kagen products?"],
  ["What certifications do you hold?", "Are you ISO certified too?"], ["Where is your HQ?", "Do you have an office in India too?"],
  ["What is an API?", "What is API testing?"], ["Do you do data science?", "Do you mean data engineering too?"],
  ["What is cloud computing?", "I mean cloud security, actually."], ["Tell me about Successive.", "What about the founder?"],
  ["What is generative AI?", "Do you build GenAI solutions?"], ["Since you only work with startups...", "What services do you offer enterprises?"],
  ["Since you're a US-only company...", "Do you have offices in India?"], ["You don't do security, right?", "So who handles security?"],
  ["Is Successive a product company?", "Or a services company?"], ["Who won yesterday's cricket match?", "What's the score?"],
  ["What's the latest news about Successive?", "What happened this month?"], ["What is the stock price of Successive?", "What's its revenue?"],
  ["What are your office timings?", "Are you open on weekends?"], ["What services does Successive offer?", "What does Successive do?"],
  ["How much does a project cost?", "What is the price of a project?"], ["What industries do you serve?", "Which sectors do you work in?"],
  ["Where is your office?", "What are your locations?"],
];

async function runFlow(turns, flow) {
  const history = [];
  const results = [];
  for (const [index, message] of turns.entries()) {
    const started = Date.now();
    try {
      const response = await fetch(base, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${flow + 1}` },
        body: JSON.stringify({ message, history: history.slice(-10), sessionId: `expanded-${flow}` }), signal: AbortSignal.timeout(60000) });
      const body = await response.json();
      const data = body.data ?? {};
      results.push({ flow: flow + 1, turn: index + 1, message, status: response.status, success: response.ok && body.success,
        answer: data.answer ?? body.error?.message ?? "", cards: data.cards ?? [], sources: data.sources ?? [],
        suggestions: data.suggestions ?? [], durationMs: Date.now() - started });
      history.push({ role: "user", content: message }, { role: "assistant", content: data.answer ?? "" });
    } catch (error) {
      results.push({ flow: flow + 1, turn: index + 1, message, status: 0, success: false, answer: String(error), cards: [], sources: [], suggestions: [], durationMs: Date.now() - started });
    }
  }
  return results;
}

const selectedIds = new Set((process.env.FLOW_IDS ?? "").split(",").map(Number).filter(Boolean));
const selected = flows.map((turns, index) => ({ turns, index })).filter(({ index }) => !selectedIds.size || selectedIds.has(index + 1));
const batches = [];
for (let index = 0; index < selected.length; index += 4) {
  batches.push(...(await Promise.all(selected.slice(index, index + 4).map(({ turns, index: flow }) => runFlow(turns, flow)))).flat());
  process.stdout.write(`completed ${Math.min(index + 4, selected.length)}/${selected.length} flows\n`);
}
const output = { generatedAt: new Date().toISOString(), flows: selected.length, turns: batches.length,
  successful: batches.filter((item) => item.success).length, failed: batches.filter((item) => !item.success).length, results: batches };
writeFileSync("/tmp/qa-expanded-mandatory-live.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify({ flows: output.flows, turns: output.turns, successful: output.successful, failed: output.failed }, null, 2));
