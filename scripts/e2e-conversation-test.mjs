const base = (process.env.CHATBOT_TEST_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

const journeys = [
  ["Hi", "I need some help for my business.", "I am not sure what service I need.", "We want to improve our digital products.", "What would you recommend?", "Tell me more about the first one.", "How can I contact your team?"],
  ["I work in healthcare.", "We are trying to improve hospital operations.", "Can AI help us as well?", "What services do you have for this?", "Do you have any example of similar work?", "Any article or webinar I can check before contacting you?"],
  ["We need to build a new enterprise application.", "What can Successive do for us?", "We also need cloud support.", "Which option would be better?", "Have you done something similar?", "Show me another example."],
  ["I want to use AI in my company.", "But I don't know where to start.", "What AI services do you provide?", "I want to understand AI first.", "Any webinar?", "Okay, now which service would you recommend for me?"],
  ["We are an ecommerce company.", "Our customers are not finding the right products.", "Can AI improve this?", "Do you have anything I can read?", "What about development services?", "Do you have a case study?"],
  ["We are planning to move our applications to cloud.", "We have AWS and Azure environments.", "What approach do you recommend?", "What are the risks?", "Do you have any detailed guide?", "Can your team help implement this?"],
  ["Do you have any events?", "I am interested in AI.", "What about cloud?", "Which one should I attend?", "Where can I register?"],
  ["I want to learn something about digital transformation.", "Any webinar?", "That sounds useful.", "Do you also provide services for this?", "How do I speak with someone?"],
  ["We want to use location data for better business decisions.", "What kind of problems can it solve?", "Which industries can use this?", "Do you have a success story?", "Can I talk to an expert?"],
  ["Need help", "for company", "technology", "AI maybe", "what you have", "any example"],
  ["what servies you provid", "need ai sulution for helthcare", "any webniar for cloud", "show case stduy", "we need app devlopment", "want migrate aws", "any event releted ai", "what u suggest for retail"],
  ["AI ke liye kya services hai?", "Healthcare ke liye kya solutions provide karte ho?", "Koi webinar hai AI ka?", "Cloud migration ke liye help chahiye.", "Koi case study dikhao.", "Retail business ke liye kya suggest karoge?"],
  ["Show me AI services.", "Any case studies?", "Actually I am more interested in cloud.", "Any webinar?", "What services do you have?"],
  ["Tell me about full-stack development.", "Tell me more about it.", "What about that one?", "Show me another one.", "Any case study for this?", "Can your team implement it?"],
  ["Do you provide blockchain gaming metaverse consulting?"],
  ["Which industries does Successive serve?"],
  ["We're considering AI for healthcare.", "I want to understand what you can do and see some examples.", "Any article or webinar around this?"],
  ["I think this service could work for us.", "What should I do next?", "I want to talk to an expert."],
];

const results = [];
const expectedTypes = new Map([
  ["7:0", "page"], ["7:1", "page"], ["7:2", "page"], ["7:3", "page"], ["7:4", "page"],
  ["8:1", "page"], ["8:3", "page"], ["8:4", "page"],
  ["9:3", "case-study"], ["9:4", "page"], ["10:5", "case-study"],
  ["11:2", "page"], ["11:3", "case-study"], ["11:6", "page"],
  ["12:2", "page"], ["12:4", "case-study"],
  ["13:1", "case-study"], ["13:3", "page"], ["13:4", "page"],
  ["14:4", "case-study"], ["18:1", "page"], ["18:2", "page"],
]);
const journeyFrom = Math.max(1, Number(process.env.JOURNEY_FROM || 1));
const journeyTo = Math.min(
  journeys.length,
  Number(process.env.JOURNEY_TO || journeys.length),
);
for (
  let journeyIndex = journeyFrom - 1;
  journeyIndex < journeyTo;
  journeyIndex++
) {
  const history = [];
  for (const [turnIndex, message] of journeys[journeyIndex].entries()) {
    let response;
    let payload;
    try {
      response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `198.51.100.${journeyIndex + 1}`,
        },
        body: JSON.stringify({
          message,
          history: history.slice(-10),
          sessionId: `e2e-journey-${journeyIndex + 1}`,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      payload = await response.json();
    } catch (error) {
      results.push({
        journey: journeyIndex + 1,
        message,
        status: 0,
        pass: false,
        error: error instanceof Error ? error.message : String(error),
        storyCards: 0,
      });
      continue;
    }
    const data = payload.data;
    const answer = data?.answer || payload.error?.message || "";
    const cards = data?.cards || [];
    const expectedType = expectedTypes.get(`${journeyIndex + 1}:${turnIndex}`);
    const structuralPass =
      response.ok &&
      payload.success === true &&
      Boolean(answer) &&
      !/content service is temporarily unavailable/i.test(answer) &&
      cards.every(
        (card) => card.title && card.description && /^https?:\/\//.test(card.url),
      );
    const semanticPass =
      !expectedType || cards.some((card) => card.type === expectedType);
    const pass = structuralPass && semanticPass;
    results.push({
      journey: journeyIndex + 1,
      message,
      status: response.status,
      pass,
      structuralPass,
      semanticPass,
      expectedType,
      insufficientContext: data?.insufficientContext,
      contentTypes: [...new Set(cards.map((card) => card.type))],
      topResults: cards.map((card) => card.title),
      storyCards: cards.length,
      hasGroundedLinks: /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(answer),
      answer: answer.replace(/\s+/g, " ").slice(0, 300),
    });
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: answer });
  }
}

const failed = results.filter((result) => !result.pass);
const report = {
      base,
      journeys: journeyTo - journeyFrom + 1,
      journeyFrom,
      journeyTo,
      turns: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      failures: failed,
      results,
    };
const serialized = JSON.stringify(report, null, 2);
if (process.env.REPORT_PATH) writeFileSync(process.env.REPORT_PATH, serialized);
console.log(serialized);
process.exitCode = failed.length ? 1 : 0;
import { writeFileSync } from "node:fs";
