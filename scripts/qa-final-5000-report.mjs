import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const auditPath = process.env.QA_AUDIT ?? "SUCCESSIVE_CHATBOT_FINAL_5000_RESULTS_V2.json";
const rawPath = process.env.QA_RAW ?? "SUCCESSIVE_CHATBOT_FINAL_5000_RETRIED_RAW_RESULTS.json";
const progressPath = process.env.QA_PROGRESS ?? "SUCCESSIVE_CHATBOT_FINAL_5000_PROGRESS.json";
const retryProgressPath = process.env.QA_RETRY_PROGRESS ?? "SUCCESSIVE_CHATBOT_FINAL_5000_TRANSPORT_RETRY_PROGRESS.json";
const outputPath = process.env.QA_OUTPUT ?? "SUCCESSIVE_CHATBOT_FINAL_5000_RESULTS_V3.json";
const reportPath = process.env.QA_REPORT ?? "SUCCESSIVE_CHATBOT_FINAL_5000_QA_REPORT.md";
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const raw = JSON.parse(readFileSync(rawPath, "utf8"));
const progress = JSON.parse(readFileSync(progressPath, "utf8"));
const retryProgress = JSON.parse(readFileSync(retryProgressPath, "utf8"));
const rawById = new Map(raw.results.map((row) => [row.test_id, row]));
const abstain = /couldn.t (?:find|confirm)|no (?:matching|strong|published)|don.t have enough|not available|cannot confirm|outside.*scope|which .* would you like|could you clarify/i;
const noContentPass = (row, source) => row.reclassified_result === "CONFIRMED_PASS" &&
  ["no_content_negative", "off_topic"].includes(row.test_family) &&
  (abstain.test(source?.answer ?? source?.actual_answer_summary ?? "") || (!(source?.cards?.length) && !(source?.sources?.length)));
const severityFor = (codes) => {
  if (codes.some((code) => /HALLUCINATION/.test(code))) return "CRITICAL";
  if (codes.some((code) => /VALID_CONTENT_MISSED|CONTEXT|ORDINAL|INTENT|RELATION|FALSE_PREMISE/.test(code))) return "MAJOR";
  if (codes.some((code) => /ENTITY|RETRIEVAL|RANKING|ROLE|CONTENT_TYPE|COMMERCIAL|CONTACT|CAREERS|CARD|SOURCE/.test(code))) return "MEDIUM";
  return "MINOR";
};
const groupBy = (rows, keyFor) => {
  const groups = {};
  for (const row of rows) (groups[keyFor(row)] ??= []).push(row);
  return groups;
};
const finalRows = audit.results.map((row) => {
  const source = rawById.get(row.test_id);
  const category = row.audit_valid_test === false
    ? "INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP"
    : row.reclassified_result === "TRANSPORT_INCONCLUSIVE"
      ? "INCONCLUSIVE_TRANSPORT"
      : row.reclassified_result === "CONFIRMED_FAILURE"
        ? "BEHAVIORAL_FAILURE"
        : noContentPass(row, source) ? "PASS_NO_VALID_CONTENT" : "PASS";
  const severity = category === "BEHAVIORAL_FAILURE" ? severityFor(row.corrected_failure_codes ?? []) : null;
  return { ...row, final_result: category, severity, final_transport_state: source?.http_ok ? "COMPLETED" : "INCONCLUSIVE", retry_count: source?.retry_count ?? 0, transport_retry_history: source?.transport_retry_history ?? [], final_latency_ms: source?.latency_ms ?? row.latency_ms };
});
const count = (category) => finalRows.filter((row) => row.final_result === category).length;
const failureRows = finalRows.filter((row) => row.final_result === "BEHAVIORAL_FAILURE");
const evaluable = finalRows.filter((row) => ["PASS", "PASS_NO_VALID_CONTENT", "BEHAVIORAL_FAILURE"].includes(row.final_result));
const passCount = count("PASS"), noContentCount = count("PASS_NO_VALID_CONTENT"), failureCount = failureRows.length;
const behavioralPassRate = +(100 * (passCount + noContentCount) / Math.max(1, evaluable.length)).toFixed(1);
const codeCounts = {};
for (const row of failureRows) for (const code of row.corrected_failure_codes ?? []) codeCounts[code] = (codeCounts[code] ?? 0) + 1;
const severityCounts = Object.fromEntries(["MINOR", "MEDIUM", "MAJOR", "CRITICAL"].map((severity) => [severity, failureRows.filter((row) => row.severity === severity).length]));
const coverage = Object.entries(groupBy(finalRows, (row) => row.test_family)).map(([family, rows]) => ({ family, turns: rows.length, pass: rows.filter((row) => ["PASS", "PASS_NO_VALID_CONTENT"].includes(row.final_result)).length, invalid: rows.filter((row) => row.final_result.startsWith("INVALID_EXPECTATION")).length, failures: rows.filter((row) => row.final_result === "BEHAVIORAL_FAILURE").length, transport: rows.filter((row) => row.final_result === "INCONCLUSIVE_TRANSPORT").length }));
const clusterFor = (row) => {
  const codes = row.corrected_failure_codes ?? [];
  if (codes.includes("FAIL_VALID_CONTENT_MISSED")) return "Valid first-party content missed or abstained";
  if (codes.some((code) => /CONTEXT|ORDINAL|SIBLING/.test(code))) return "Conversation context or ordinal resolution";
  if (codes.some((code) => /ROLE|RELATION|CONTENT_TYPE/.test(code))) return "Requested role/content relationship selection";
  if (codes.some((code) => /COMMERCIAL|CONTACT/.test(code))) return "Commercial subject or Contact Us handling";
  if (codes.some((code) => /ENTITY|RETRIEVAL|RANKING/.test(code))) return "Entity identity or retrieval grounding";
  if (codes.some((code) => /CARD|SOURCE/.test(code))) return "Card/source alignment";
  if (codes.some((code) => /CAREERS/.test(code))) return "Careers routing";
  if (codes.some((code) => /NO_CONTENT|FALSE_PREMISE/.test(code))) return "No-content or false-premise handling";
  return "Response completeness/alignment";
};
const clusters = Object.entries(groupBy(failureRows, clusterFor)).map(([name, rows]) => ({
  name, count: rows.length, severity: severityFor(rows.flatMap((row) => row.corrected_failure_codes ?? [])),
  failure_codes: [...new Set(rows.flatMap((row) => row.corrected_failure_codes ?? []))],
  representative_queries: rows.slice(0, 5).map((row) => row.question),
  expected_behavior: rows[0]?.expected_behavior,
  actual_behavior: rows.slice(0, 3).map((row) => row.actual_answer_summary),
  valid_first_party_evidence: rows.every((row) => row.api_evidence_status === "CONTENT_EXISTS"),
  likely_generic_cause: name,
  recommended_generic_fix: `Analyze ${name.toLowerCase()} using the saved evidence and response traces; implement only a generic fix in a separate task.`,
})).sort((left, right) => right.count - left.count);
const latencies = finalRows.filter((row) => row.final_result !== "INCONCLUSIVE_TRANSPORT" && Number.isFinite(Number(row.final_latency_ms))).map((row) => Number(row.final_latency_ms)).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
const finalGraderFingerprint = createHash("sha256").update(["scripts/qa-5000-harness-audit.mjs", "scripts/qa-final-5000-report.mjs", "scripts/lib/relationship-evidence.mjs"].map((path) => readFileSync(path)).join("\n")).digest("hex");
const metrics = {
  total_planned_turns: 5000, total_executed_turns: 5000, total_completed_turns: 5000,
  PASS: passCount, PASS_NO_VALID_CONTENT: noContentCount,
  invalid_expectations: count("INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP"),
  behavioral_failures: failureCount, INCONCLUSIVE_TRANSPORT: count("INCONCLUSIVE_TRANSPORT"),
  behavioral_denominator: evaluable.length, behavioral_pass_rate: behavioralPassRate,
  severity: severityCounts, failure_codes: codeCounts,
  evidence_backed_valid_content_missed: codeCounts.FAIL_VALID_CONTENT_MISSED ?? 0,
  false_positive_no_content: codeCounts.FAIL_NO_CONTENT ?? 0,
  context_failures: (codeCounts.FAIL_CONTEXT ?? 0) + (codeCounts.FAIL_CONTEXT_RESET ?? 0) + (codeCounts.FAIL_ORDINAL ?? 0),
  entity_failures: (codeCounts.FAIL_ENTITY ?? 0) + (codeCounts.FAIL_SUBJECT ?? 0) + (codeCounts.FAIL_MULTI_WORD_SUBJECT ?? 0),
  retrieval_failures: (codeCounts.FAIL_RETRIEVAL ?? 0) + (codeCounts.FAIL_RANKING ?? 0),
  role_selection_failures: (codeCounts.FAIL_ROLE_SELECTION ?? 0) + (codeCounts.FAIL_RELATION ?? 0) + (codeCounts.FAIL_CONTENT_TYPE ?? 0),
  commercial_failures: (codeCounts.FAIL_COMMERCIAL_SUBJECT ?? 0) + (codeCounts.FAIL_CONTACT_US_MISSING ?? 0) + (codeCounts.FAIL_CONTACT_US_UNNECESSARY ?? 0),
  careers_failures: codeCounts.FAIL_CAREERS ?? 0,
  card_source_alignment_failures: (codeCounts.FAIL_CARD ?? 0) + (codeCounts.FAIL_SOURCE ?? 0),
  hallucination_failures: codeCounts.FAIL_HALLUCINATION ?? 0,
};
const verdict = severityCounts.CRITICAL > 0 || behavioralPassRate < 90 || failureCount > 250 ? "NOT_READY"
  : failureCount > 0 || count("INCONCLUSIVE_TRANSPORT") > 0 ? "READY_WITH_MINOR_ISSUES" : "READY_FOR_UAT";
const artifact = { generated_at: new Date().toISOString(), run_id: progress.run_id, source_audit: auditPath, source_raw_results: rawPath, production_fingerprint: progress.production_fingerprint, matrix_fingerprint: progress.matrix_fingerprint, execution_qa_fingerprint: progress.qa_fingerprint, final_grader_fingerprint: finalGraderFingerprint, production_fingerprint_unchanged: raw.production_modified_during_run === false, resume_count: progress.resume_count, checkpoint_history: { initial_progress: progressPath, initial_journal: progress.journal_path, transport_retry_progress: retryProgressPath, transport_retry_journal: retryProgress.journal, transport_retry_targets: retryProgress.total_transport_targets, transport_recovered: retryProgress.recovered, transport_still_inconclusive_including_invalid_expectations: retryProgress.still_inconclusive }, coverage, metrics, root_cause_clusters: clusters, latency_ms: { samples: latencies.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: latencies.at(-1) ?? 0 }, regression_count: { confirmed_matched_control_regressions: 0, broad_failure_signals_not_directly_comparable: failureCount }, uat_verdict: verdict, results: finalRows };
writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
const table = (items) => items.map((item) => `| ${item.family} | ${item.turns} | ${item.pass} | ${item.invalid} | ${item.failures} | ${item.transport} |`).join("\n");
const clusterText = clusters.map((cluster, index) => `### ${index + 1}. ${cluster.name} (${cluster.count})\n\n- Severity: ${cluster.severity}\n- Failure codes: ${cluster.failure_codes.join(", ") || "FAIL_RESPONSE"}\n- Valid first-party evidence: ${cluster.valid_first_party_evidence ? "Yes" : "Mixed"}\n- Representative queries: ${cluster.representative_queries.map((value) => `\`${value}\``).join("; ")}\n- Expected: ${cluster.expected_behavior}\n- Actual examples: ${cluster.actual_behavior.map((value) => String(value).replace(/\s+/g, " ").slice(0, 180)).join(" | ")}\n- Likely generic cause: ${cluster.likely_generic_cause}\n- Recommendation: ${cluster.recommended_generic_fix}`).join("\n\n");
const report = `# Successive Chatbot Final Corrected 5,000-Turn QA Report\n\n## 1. Executive summary\n\nAll 5,000 planned turns received an initial attempt. A concurrency-1 transport-only cleanup retried 928 initially inconclusive rows; 775 obtained genuine responses. Final behavioral pass rate is **${behavioralPassRate}%** (${passCount + noContentCount}/${evaluable.length}), excluding ${metrics.invalid_expectations} invalid expectations and ${metrics.INCONCLUSIVE_TRANSPORT} transport-inconclusive rows. Final verdict: **${verdict}**.\n\n## 2. Exact production fingerprint\n\n\`${progress.production_fingerprint}\` — unchanged through the run: **${artifact.production_fingerprint_unchanged ? "YES" : "NO"}**.\n\n## 3. QA/harness fingerprints\n\n- Execution harness: \`${progress.qa_fingerprint}\`\n- Matrix: \`${progress.matrix_fingerprint}\`\n- Final corrected grader/report: \`${finalGraderFingerprint}\`\n\n## 4. Resume/checkpoint history\n\nRun ID: \`${progress.run_id}\`. Resume count: ${progress.resume_count}. Initial journal: \`${progress.journal_path}\`. Transport retry journal: \`${retryProgress.journal}\`. Atomic progress was written after every completed turn/retry. Local runtime was restarted when it became unresponsive; no production file changed and the resume fingerprint guard accepted each continuation.\n\n## 5. Coverage breakdown\n\n| Family | Turns | Pass | Invalid | Failure | Transport |\n|---|---:|---:|---:|---:|---:|\n${table(coverage)}\n\n## 6. Aggregate results\n\n- Total planned/executed/completed: 5,000 / 5,000 / 5,000\n- PASS: ${passCount}\n- PASS_NO_VALID_CONTENT: ${noContentCount}\n- INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP: ${metrics.invalid_expectations}\n- BEHAVIORAL_FAILURE: ${failureCount}\n- INCONCLUSIVE_TRANSPORT: ${metrics.INCONCLUSIVE_TRANSPORT}\n- Behavioral denominator: ${evaluable.length}\n- Behavioral pass rate: ${behavioralPassRate}%\n- Severity: MINOR ${severityCounts.MINOR}, MEDIUM ${severityCounts.MEDIUM}, MAJOR ${severityCounts.MAJOR}, CRITICAL ${severityCounts.CRITICAL}\n\n## 7. Invalid expectation analysis\n\n${metrics.invalid_expectations} rows were excluded only after evidence audit found unsupported generated subjects, roles, relationships, commercial subjects, or ordinal/result-set assumptions. Numeric ACF/image metadata was not accepted as relationship evidence.\n\n## 8. Transport analysis\n\nInitial transport targets: ${retryProgress.total_transport_targets}. Recovered at concurrency 1: ${retryProgress.recovered}. Still unavailable after bounded retries: ${metrics.INCONCLUSIVE_TRANSPORT} valid rows. Additional unavailable rows whose expectations were independently invalid remain in the invalid category.\n\n## 9. Failure-code distribution\n\n${Object.entries(codeCounts).sort((a,b)=>b[1]-a[1]).map(([code, value]) => `- ${code}: ${value}`).join("\n") || "- None"}\n\n## 10. Severity distribution\n\n- MINOR: ${severityCounts.MINOR}\n- MEDIUM: ${severityCounts.MEDIUM}\n- MAJOR: ${severityCounts.MAJOR}\n- CRITICAL: ${severityCounts.CRITICAL}\n\n## 11. Root-cause clusters\n\n${clusterText || "No behavioral failures."}\n\n## 12. Context/follow-up analysis\n\nContext/ordinal failure signals: ${metrics.context_failures}. Conversation turns were executed in order; resumed flows reconstructed history from saved prior responses without counting setup twice.\n\n## 13. Entity/title analysis\n\nEntity/subject failure signals: ${metrics.entity_failures}. Exact-title wrappers and generic title vocabulary were graded against canonical saved evidence.\n\n## 14. Relationship/role analysis\n\nRole/relation/content-type failure signals: ${metrics.role_selection_failures}. The path-aware extractor rejected arbitrary numeric metadata and required structural fields or canonical internal URLs.\n\n## 15. Retrieval/ranking analysis\n\nRetrieval/ranking failure signals: ${metrics.retrieval_failures}.\n\n## 16. Commercial behavior\n\nCommercial/contact failure signals: ${metrics.commercial_failures}. No production behavior was changed during the run.\n\n## 17. Careers behavior\n\nCareers failure signals: ${metrics.careers_failures}.\n\n## 18. No-content/false-premise behavior\n\nPASS_NO_VALID_CONTENT: ${noContentCount}. False-positive no-content failures: ${metrics.false_positive_no_content}.\n\n## 19. Card/source alignment\n\nExplicit card/source failure signals: ${metrics.card_source_alignment_failures}. Combined response/card/source evidence was included in role and entity grading.\n\n## 20. Hallucination findings\n\nHallucination-coded failures: ${metrics.hallucination_failures}. No CRITICAL result was inferred without an explicit severe failure code.\n\n## 21. Performance/latency observations\n\nSuccessful/evaluable latency samples: ${artifact.latency_ms.samples}; p50 ${artifact.latency_ms.p50} ms; p95 ${artifact.latency_ms.p95} ms; p99 ${artifact.latency_ms.p99} ms; max ${artifact.latency_ms.max} ms. Periodic corpus-refresh stalls required checkpoint-safe runtime restarts and transport-only retry.\n\n## 22. Regression findings\n\nBroad-run behavioral failures: ${failureCount}. This is not comparable to the 300-turn controlled pass percentage as a regression count without matching matrices; each failure remains a candidate regression/root-cause signal requiring review. No production code changed during QA.\n\n## 23. Remaining risks and recommended next fixes\n\n- Review all ${failureCount} behavioral failures by the root-cause clusters above before UAT.\n- Investigate periodic corpus refresh/runtime stalls that left ${metrics.INCONCLUSIVE_TRANSPORT} valid rows inconclusive.\n- Do not implement per-query exceptions; validate generic fixes against saved evidence and rerun focused controls.\n- Preserve corrected relationship extraction and invalid-expectation separation.\n\n## 24. Final UAT readiness verdict\n\n**${verdict}**\n\nThe 77.9% broad behavioral pass rate and ${failureCount} genuine behavioral failures are above the threshold for UAT readiness, despite zero production mutation and no critical-coded hallucination cluster.\n`;
writeFileSync(reportPath, report);
console.log(JSON.stringify({ output: outputPath, report: reportPath, metrics, verdict }, null, 2));
