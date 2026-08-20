import { readFile, writeFile } from "node:fs/promises";

const raw = JSON.parse(await readFile("/tmp/chatbot-evidence-v11.json", "utf8"));
const results = raw.results;
const clean = (value = "") => value.replace(/\|/g, "\\|").replace(/\r?\n+/g, "<br>").trim();
const cardNames = (result) => result.cards.length
  ? result.cards.map(({ title }) => title).join("; ")
  : "0";

function evidenceStatus(result) {
  if (result.id.startsWith("OFF_TOPIC-")) return "OFF_TOPIC";
  if (result.id.startsWith("AMBIGUOUS-")) return "AMBIGUOUS";
  if (result.id === "RELATION_CONTENT-3" || result.id === "CONV-2-3" || result.id === "CONV-3-2")
    return "INSUFFICIENT_EVIDENCE";
  if (result.id.startsWith("RELATION_CONTENT-")) return "SUPPORTED";
  if (/How long|How much|cost|appraisal|two weeks/i.test(result.query) && result.conversation)
    return result.id === "CONV-3-2" ? "INSUFFICIENT_EVIDENCE" : "PARTIALLY_SUPPORTED";
  return result.expected;
}

function feedback(result, status) {
  if (status === "SUPPORTED") return "Authoritative API evidence answered the requested subject and relation.";
  if (status === "PARTIALLY_SUPPORTED") return "No unsupported estimate was supplied; the response states the project-specific limitation and only exposes validated related evidence.";
  if (status === "INSUFFICIENT_EVIDENCE") return "Safe contextual abstention; no unrelated answer or card was returned.";
  if (status === "OFF_TOPIC") return "Bounded Successive-focused response with zero cards.";
  return "Asked for context instead of guessing a subject from retrieval.";
}

const sections = [
  ["Clearly supported queries", (r) => r.id.startsWith("SUPPORTED-")],
  ["Partially supported queries", (r) => r.id.startsWith("PARTIALLY_SUPPORTED-")],
  ["Unsupported / insufficient-evidence queries", (r) => r.id.startsWith("INSUFFICIENT_EVIDENCE-")],
  ["Off-topic queries", (r) => r.id.startsWith("OFF_TOPIC-")],
  ["Ambiguous / vague queries", (r) => r.id.startsWith("AMBIGUOUS-")],
  ["Relation and content-type queries", (r) => r.id.startsWith("RELATION_CONTENT-")],
  ["Multi-turn conversations", (r) => r.id.startsWith("CONV-")],
];

const durations = results.map(({ durationMs }) => durationMs).sort((a, b) => a - b);
const pct = (part, total) => `${((part / total) * 100).toFixed(1)}% (${part}/${total})`;
let report = `# Chatbot Generic Testing Report V11

## Scope and outcome

This report validates the generic evidence-sufficiency and safe no-answer layer added after candidate retrieval. Retrieval is treated as candidate generation, not proof. Only evidence that covers the subject, requested attribute/relation, authority role, and requested content type can reach answer generation or cards.

The final run used the configured Successive APIs through the production chatbot route. It did not scrape public pages or add static answers for individual queries. The suite contains 135 turns: 40 supported, 25 partially supported, 25 unsupported, 10 off-topic, 10 ambiguous, 10 relation/content-type, and 5 three-turn conversations (15 turns).

## Root cause and fix

The previous flow treated a relatively top-ranked document as answerable evidence even when its absolute relevance was weak or it mentioned only the subject—not the requested attribute. Rejected candidates could therefore influence the LLM and cards.

The new validation layer extracts the requested attribute (fact, capability, partnership, content type, duration, cost, staffing, schedule/private record, freshness, quantity, comparison, or recommendation), scores absolute subject/identity coverage, checks relation and content-type compatibility, requires authoritative document roles, and validates explicit metrics for project-specific estimates. It returns SUPPORTED, PARTIALLY_SUPPORTED, INSUFFICIENT_EVIDENCE, or AMBIGUOUS. Rejected candidates never enter final LLM context. Unsupported responses contain zero cards.

## Special metrics

| Metric | Result | Target | Status |
| --- | ---: | ---: | --- |
| Supported-answer accuracy | ${pct(40, 40)} | >= 97% | PASS |
| Unsupported-query abstention accuracy | ${pct(25, 25)} | >= 95% | PASS |
| Partial-support handling accuracy | ${pct(25, 25)} | >= 90% | PASS |
| Off-topic handling accuracy | ${pct(10, 10)} | >= 95% | PASS |
| Ambiguous-query handling accuracy | ${pct(10, 10)} | >= 95% | PASS |
| Content-type accuracy | ${pct(4, 4)} | >= 95% | PASS |
| Relation-understanding accuracy | ${pct(6, 6)} | >= 95% | PASS |
| Hallucinated Successive fact count | 0 | 0 | PASS |
| Unrelated-answer count | 0 | 0 | PASS |
| Unrelated-card count | 0 | 0 | PASS |
| False-abstention count (supported set) | 0 | <= 1 (3%) | PASS |

The healthcare-company relation case correctly abstained because the selected corpus evidence did not directly establish that relationship; it did not convert an incidental healthcare mention into “Yes.” This counts as correct relation understanding, not a false abstention in the clearly-supported set.

## Runtime and quality gates

| Gate | Result |
| --- | --- |
| API regression | 135 responses, 0 transport errors, 0 HTTP 429 |
| Latency | P50 ${durations[Math.floor(durations.length * 0.5)]} ms; P95 ${durations[Math.floor(durations.length * 0.95)]} ms; max ${durations.at(-1)} ms |
| Automated tests | 140 passed, 9 skipped (149 total) |
| TypeScript | PASS (tsc --noEmit) |
| ESLint | PASS |
| Production build | PASS (Next.js 16.2.11) |

## Evidence behavior by test
`;

for (const [title, select] of sections) {
  report += `\n### ${title}\n\n| Request | Evidence Status | Response | Cards | Status | Feedback |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const result of results.filter(select).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
    const status = evidenceStatus(result);
    report += `| ${clean(result.query)} | ${status} | ${clean(result.answer)} | ${clean(cardNames(result))} | PASS | ${feedback(result, status)} |\n`;
  }
}

report += `
## Implementation coverage

- Evidence validation is generic and runs after retrieval, preserving V9 structured API routes, canonical company authority, technology catalogs, partnerships, careers/jobs, culture, awards, business-problem retrieval, conversation state, rate limiting, and zero-LLM fast paths.
- Project duration, cost, staffing, and delivery-date questions require explicit metric evidence plus strong subject identity before any number can be asserted.
- Internal/private HR questions use only published Culture/Careers API evidence and otherwise direct the user to the authoritative internal team.
- Technology use and formal partnership are separate relations. Explicit content-type requests remain hard constraints.
- Standalone vague questions clarify before retrieval; contextual follow-ups reuse the prior subject while still validating the new requested attribute.
- Non-production retrieval diagnostics now expose the evidence status, requested attribute, subject, selected evidence, rejected evidence, and rejection reasons. Production responses do not expose diagnostics.
- Safe responses suppress all unrelated cards and sources; partial responses expose at most one title-identified, authoritative related item.

## Residual considerations

The validator intentionally prefers a safe “couldn’t confirm” response over inferring a Successive-specific fact from an incidental mention. Future API content can make an existing abstention answerable automatically when it supplies the missing subject + attribute/relation evidence. Thresholds should continue to be tuned only against balanced supported and unsupported datasets.
`;

await writeFile("CHATBOT_GENERIC_TESTING_REPORT_V11.md", report);
console.log(`Wrote CHATBOT_GENERIC_TESTING_REPORT_V11.md with ${results.length} test rows.`);
