import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const runtime = process.env.CHATBOT_URL ?? "http://127.0.0.1:3000/api/chat";
const inputPath = process.env.QA_INPUT ?? "SUCCESSIVE_CHATBOT_FINAL_5000_RAW_RESULTS.json";
const progressPath = process.env.QA_RETRY_PROGRESS ?? "SUCCESSIVE_CHATBOT_FINAL_5000_TRANSPORT_RETRY_PROGRESS.json";
const journalPath = process.env.QA_RETRY_JOURNAL ?? "SUCCESSIVE_CHATBOT_FINAL_5000_TRANSPORT_RETRY_PROGRESS.jsonl";
const outputPath = process.env.QA_OUTPUT ?? "SUCCESSIVE_CHATBOT_FINAL_5000_RETRIED_RAW_RESULTS.json";
const source = JSON.parse(readFileSync(inputPath, "utf8"));
const retryTargets = source.results.filter((row) => row.result === "INCONCLUSIVE_TRANSPORT");
const completed = new Map();
if (existsSync(journalPath)) for (const line of readFileSync(journalPath, "utf8").split("\n").filter(Boolean)) {
  const row = JSON.parse(line); completed.set(row.test_id, row);
}
const atomicWrite = (path, value) => {
  const temp = `${path}.tmp`; writeFileSync(temp, JSON.stringify(value, null, 2)); renameSync(temp, path);
};
const checkpoint = () => {
  const pending = retryTargets.filter((row) => !completed.has(row.test_id));
  atomicWrite(progressPath, {
    run_id: source.run_id, source_results: inputPath, production_fingerprint: source.production_fingerprint_before,
    total_transport_targets: retryTargets.length, completed_retry_ids: [...completed.keys()],
    completed_retries: completed.size, pending_retries: pending.length,
    next_pending_retry: pending[0]?.test_id ?? null,
    recovered: [...completed.values()].filter((row) => row.http_ok).length,
    still_inconclusive: [...completed.values()].filter((row) => !row.http_ok).length,
    updated_at: new Date().toISOString(), journal: journalPath,
  });
};
const historyFor = (row) => {
  if (!row.conversation_id) return [];
  return source.results.filter((candidate) => candidate.conversation_id === row.conversation_id && candidate.turn_number < row.turn_number)
    .sort((left, right) => left.turn_number - right.turn_number)
    .flatMap((candidate) => [{ role: "user", content: candidate.question }, { role: "assistant", content: candidate.answer ?? candidate.actual_answer_summary ?? "" }]);
};
const retry = async (row) => {
  const history = historyFor(row);
  const attempts = [];
  const maxAttempts = Number(process.env.QA_RETRY_ATTEMPTS ?? 2);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = performance.now();
    try {
      const response = await fetch(runtime, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.19.0.${Number(row.test_id.slice(2)) % 240 + 1}` }, body: JSON.stringify({ message: row.question, history: history.slice(-12), sessionId: `final5000-retry-${row.conversation_id ?? row.test_id}` }), signal: AbortSignal.timeout(Number(process.env.QA_TIMEOUT_MS ?? 90000)) });
      const payload = await response.json().catch(() => ({}));
      const data = payload.data ?? {};
      const entry = { attempt, status_code: response.status, http_ok: response.ok && Boolean(payload.success), latency_ms: Math.round(performance.now() - started), completed_at: new Date().toISOString(), answer: data.answer ?? payload.error?.message ?? "", cards: data.cards ?? [], sources: data.sources ?? [] };
      attempts.push(entry);
      if (entry.http_ok) return { ...row, ...entry, actual_answer_summary: entry.answer, actual_cards: entry.cards, actual_sources: entry.sources, transport_state: "RECOVERED", retry_count: Number(row.retry_count ?? 0) + attempt, transport_retry_history: attempts };
    } catch (error) {
      attempts.push({ attempt, status_code: 0, http_ok: false, latency_ms: Math.round(performance.now() - started), completed_at: new Date().toISOString(), error: String(error) });
    }
  }
  return { ...row, transport_state: "INCONCLUSIVE_AFTER_RETRY", retry_count: Number(row.retry_count ?? 0) + maxAttempts, transport_retry_history: attempts };
};

checkpoint();
for (const row of retryTargets) {
  if (completed.has(row.test_id)) continue;
  const result = await retry(row);
  appendFileSync(journalPath, `${JSON.stringify(result)}\n`);
  completed.set(row.test_id, result);
  checkpoint();
  if (completed.size % 100 === 0) console.log(`transport retry ${completed.size}/${retryTargets.length}`);
}
const merged = source.results.map((row) => completed.get(row.test_id) ?? row);
atomicWrite(outputPath, { ...source, generated_at: new Date().toISOString(), source_initial_results: inputPath, transport_retry_progress: progressPath, transport_retry_targets: retryTargets.length, transport_recovered: [...completed.values()].filter((row) => row.http_ok).length, transport_still_inconclusive: [...completed.values()].filter((row) => !row.http_ok).length, results: merged });
console.log(JSON.stringify({ output: outputPath, targets: retryTargets.length, recovered: [...completed.values()].filter((row) => row.http_ok).length, still_inconclusive: [...completed.values()].filter((row) => !row.http_ok).length }, null, 2));
