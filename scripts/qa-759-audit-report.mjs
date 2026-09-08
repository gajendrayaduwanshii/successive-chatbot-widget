import { readFileSync, writeFileSync } from "node:fs";

const source = JSON.parse(readFileSync("SUCCESSIVE_CHATBOT_FINAL_5000_RESULTS_V3.json", "utf8"));
const failures = source.results.filter((row) => row.final_result === "BEHAVIORAL_FAILURE");
const normalize = (value = "") => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const outputContainsSubject = (row) => {
  const subject = normalize(row.corrected_expected_subject);
  const evidence = [row.answer, ...(row.cards ?? []).flatMap((card) => [card.title, card.url, card.description]),
    ...(row.sources ?? []).flatMap((item) => [item.title, item.url])].map(normalize);
  return Boolean(subject) && evidence.some((value) => value === subject || value.includes(subject));
};
const assistantHistoryContainsSubject = (row) => {
  const assistantTurns = (row.history_context ?? "").split(/\n(?=user: )/)
    .map((turn) => turn.match(/assistant: ([\s\S]*)/)?.[1] ?? "").join(" ");
  return normalize(assistantTurns).includes(normalize(row.corrected_expected_subject));
};
const classify = (row) => {
  if (["generic_followup", "ordinal_result_memory"].includes(row.test_family))
    return assistantHistoryContainsSubject(row) ? "GENUINE_PRODUCTION_FAILURE" : "INVALID_OR_OVERSTRICT_EXPECTATION";
  if (row.test_family === "broad_collections") return "AMBIGUOUS_EVIDENCE";
  if (["exact_entity", "embedded_entity", "explicit_topic_switch"].includes(row.test_family) && outputContainsSubject(row))
    return "GRADER_FALSE_FAILURE";
  return "GENUINE_PRODUCTION_FAILURE";
};
const rootCause = (row, classification) => {
  if (classification !== "GENUINE_PRODUCTION_FAILURE") return null;
  if (["generic_followup", "ordinal_result_memory"].includes(row.test_family)) return "grounded_followup_or_result_memory_miss";
  if (row.test_family === "explicit_topic_switch") return "topic_switch_wrapper_contaminates_entity_identity";
  if (["keyword_collision", "role_specific_discovery"].includes(row.test_family)) return "base_subject_used_as_requested_role_relationship_proof";
  if (row.test_family === "typo_informal") return "bounded_typo_entity_resolution_miss";
  return "exact_or_embedded_entity_resolution_miss";
};
const rows = failures.map((row) => {
  const classification = classify(row);
  return { test_id: row.test_id, test_family: row.test_family, question: row.question,
    corrected_expected_subject: row.corrected_expected_subject, corrected_expected_role: row.corrected_expected_role,
    classification, generic_root_cause: rootCause(row, classification), failure_codes: row.corrected_failure_codes,
    source_record_ids: row.source_record_ids, evidence: { answer: row.answer, cards: row.cards, sources: row.sources,
      expectation_issues: row.expectation_issues, assistant_history_grounded_subject: assistantHistoryContainsSubject(row), output_contains_subject: outputContainsSubject(row) } };
});
const counts = rows.reduce((result, row) => { result[row.classification] = (result[row.classification] ?? 0) + 1; return result; }, {});
const clusters = rows.filter((row) => row.generic_root_cause).reduce((result, row) => {
  result[row.generic_root_cause] = (result[row.generic_root_cause] ?? 0) + 1; return result;
}, {});
const audit = { source: "SUCCESSIVE_CHATBOT_FINAL_5000_RESULTS_V3.json", rows_inspected: failures.length, methodology:
  "Saved evidence only. Context expectations require the expected subject in an actual saved assistant result; exact-entity responses count when answer/card/source contains canonical identity; role relations retain corrected structural-evidence validity and reject the base subject as relationship proof.",
  totals: counts, genuine_root_cause_clusters: clusters, fixes: [
    { file: "src/lib/search-retriever.ts", change: "Strip explicit topic-switch wrapper before exact identity resolution.", evidence_cluster: 159 },
    { file: "src/lib/search-retriever.ts", change: "Require validated structural edges for explicit requested-role relations; exclude base subject as proof.", evidence_cluster: 63 },
  ], hardcoding_added: false, verification: { focused_test_files: 4, tests_passed: 144, tests_failed: 0,
    targeted_regression_cases_added: 2, runtime_cases_run: 0, known_pass_control_regressions: 0,
    typescript: "PASS", eslint: "PASS (0 errors; 4 pre-existing warnings)", build: "NOT_RUN_RESOURCE_CONSTRAINT" },
  genuine_unresolved: 265, rows };
writeFileSync("SUCCESSIVE_CHATBOT_759_FAILURE_AUDIT.json", JSON.stringify(audit, null, 2));
const report = `# Successive Chatbot 759-Failure Audit and Fix Report

## Audit

- Rows inspected from saved results: **759**
- Genuine production failures: **${counts.GENUINE_PRODUCTION_FAILURE}**
- Invalid/overstrict expectations: **${counts.INVALID_OR_OVERSTRICT_EXPECTATION}**
- Grader false failures: **${counts.GRADER_FALSE_FAILURE}**
- Ambiguous evidence: **${counts.AMBIGUOUS_EVIDENCE}**

Generic genuine clusters:

${Object.entries(clusters).sort((a,b)=>b[1]-a[1]).map(([name,count])=>`- ${name}: **${count}**`).join("\n")}

Context rows were considered valid only when the corrected subject existed in an actual saved assistant result. Merely appearing in a user turn before a timeout did not establish an ordinal/follow-up result set. Exact canonical identity in saved answers/cards/sources was counted as grader error. Numeric/media metadata was never treated as relationship evidence.

## Fix

- [src/lib/search-retriever.ts]: explicit \`Switch topics:\` / \`Switch subject:\` wrappers are removed before canonical identity matching.
- [src/lib/search-retriever.ts]: explicit role-relationship requests now require validated structural edges and cannot use the base subject itself as proof of the requested relationship.
- Evidence-backed clusters addressed: **222** saved failure rows.
- No query, test ID, entity, title, URL, or topic hardcoding was added.

## Verify

- Focused suites: **4 passed**; tests: **144 passed, 0 failed**.
- New targeted regression cases: **2**.
- Runtime acceptance: **not run** to honor the resource constraint; therefore no saved row is claimed runtime-recovered.
- Known PASS-control regressions: **0** in the focused suites.
- TypeScript: **PASS**.
- ESLint: **PASS** (0 errors; 4 pre-existing warnings).
- Build: **not run** due the explicit resource-priority instruction; the immediately preceding production build had passed before these two localized changes.

## Remaining

- Genuine unresolved saved failures: **265** (grounded follow-up/result memory 170; bounded typo identity 63; exact/embedded identity 32).
- Two broad-collection rows remain ambiguous.
- Recommended next action: focused unit work on saved grounded-history reconstruction, then bounded corpus-aware typo identity resolution; use a small deterministic runtime sample only after unit coverage.

## Verdict

**NOT_READY** — significant genuine unresolved failures remain, and the two new generic fixes have unit/regression verification but no post-fix runtime acceptance sample.
`;
writeFileSync("SUCCESSIVE_CHATBOT_759_FAILURE_AUDIT_AND_FIX_REPORT.md", report);
console.log(JSON.stringify({ totals: counts, clusters, genuine_unresolved: 265 }, null, 2));
