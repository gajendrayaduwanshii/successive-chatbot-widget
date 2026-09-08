import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const runtime = process.env.CHATBOT_URL ?? "http://127.0.0.1:3000/api/chat";
const matrixPath = process.env.QA_MATRIX ?? "SUCCESSIVE_CHATBOT_5000_TEST_RESULTS.json";
const expectationPath = process.env.QA_EXPECTATIONS ?? "SUCCESSIVE_CHATBOT_FINAL_5000_EXPECTATION_AUDIT.json";
const progressPath = process.env.QA_PROGRESS ?? "SUCCESSIVE_CHATBOT_FINAL_5000_PROGRESS.json";
const journalPath = process.env.QA_JOURNAL ?? "SUCCESSIVE_CHATBOT_FINAL_5000_PROGRESS.jsonl";
const outputPath = process.env.QA_OUTPUT ?? "SUCCESSIVE_CHATBOT_FINAL_5000_RAW_RESULTS.json";
const totalExpected = 5000;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const matrixSource = JSON.parse(readFileSync(matrixPath, "utf8"));
const expectationSource = JSON.parse(readFileSync(expectationPath, "utf8"));
const expectationById = new Map(expectationSource.results.map((row) => [row.test_id, row]));
const fields = ["test_id", "conversation_id", "turn_number", "test_family", "category", "question", "expected_subject", "expected_role", "expected_behavior", "source_record_ids", "contact_us_expected"];
const tests = matrixSource.results.map((row) => Object.fromEntries(fields.map((key) => [key, row[key]])));
if (tests.length !== totalExpected || new Set(tests.map((row) => row.test_id)).size !== totalExpected)
  throw new Error(`Incompatible matrix: expected ${totalExpected} unique turns.`);

const walkFiles = (path) => {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.name === ".next" || entry.name === "node_modules" ? [] : walkFiles(join(path, entry.name)));
};
const productionFiles = ["src", "public", "package.json", "next.config.ts", "postcss.config.mjs"]
  .flatMap(walkFiles).filter((path) => statSync(path).isFile()).sort();
const fingerprintFiles = (files) => sha(files.map((path) =>
  `${relative(process.cwd(), path)}\0${sha(readFileSync(path))}`).join("\n"));
const productionFingerprint = fingerprintFiles(productionFiles);
const matrixFingerprint = sha(tests.map((row) => stable(row)).join("\n"));
const qaFingerprint = fingerprintFiles([
  "scripts/qa-final-5000-resumable.mjs",
  "scripts/lib/relationship-evidence.mjs",
  matrixPath,
  expectationPath,
]);

const completed = new Map();
if (existsSync(journalPath)) {
  for (const line of readFileSync(journalPath, "utf8").split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    completed.set(row.test_id, row);
  }
}
let runId = randomUUID();
let startedAt = new Date().toISOString();
let resumeCount = 0;
if (existsSync(progressPath)) {
  const prior = JSON.parse(readFileSync(progressPath, "utf8"));
  for (const [key, current] of Object.entries({ matrix_fingerprint: matrixFingerprint, qa_fingerprint: qaFingerprint, production_fingerprint: productionFingerprint }))
    if (prior[key] !== current) throw new Error(`INCOMPATIBLE_CHECKPOINT: ${key} differs; refusing to mix runs.`);
  runId = prior.run_id;
  startedAt = prior.started_at;
  resumeCount = Number(prior.resume_count ?? 0) + 1;
}

const invalidExpectation = (test) => expectationById.get(test.test_id)?.audit_valid_test === false;
const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
const fallback = /couldn.t (?:find|confirm)|no (?:matching|strong|published)|don.t have enough|not available|cannot confirm|which .* would you like|could you clarify|please clarify|what .* would you like/i;
const contact = /contact us|contact\/|sales team|discuss your requirements/i;
const roleRx = { services: /service|capabilit/i, articles: /article|blog|editorial|insight/i, industries: /industr/i, products: /product|accelerator|platform/i, partners: /partner|alliance/i, accelerators: /accelerator/i, resources: /resource|guide|article|blog/i, "case studies": /case stud/i };
const preliminaryGrade = (test, response) => {
  if (invalidExpectation(test)) return { result: "INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP", severity: null, failure_codes: [] };
  if (!response.http_ok) return { result: "INCONCLUSIVE_TRANSPORT", severity: null, failure_codes: ["FAIL_TRANSPORT"] };
  const hay = norm([response.answer, ...response.cards.map((item) => `${item.title} ${item.type} ${item.badge}`), ...response.sources.map((item) => `${item.title} ${item.type}`)].join(" "));
  const codes = [];
  const expectedTerms = norm(test.expected_subject).split(" ").filter((term) => term.length > 2).slice(0, 6);
  if (fallback.test(response.answer) && test.source_record_ids?.length) codes.push("FAIL_VALID_CONTENT_MISSED");
  const requestedRole = roleRx[norm(test.expected_role)];
  if (requestedRole && test.source_record_ids?.length && !requestedRole.test(hay)) codes.push("FAIL_ROLE_SELECTION");
  if (expectedTerms.length && test.source_record_ids?.length && !expectedTerms.some((term) => hay.includes(term)) && !fallback.test(response.answer)) codes.push("FAIL_ENTITY");
  if (test.contact_us_expected && !contact.test(`${response.answer} ${response.cards.map((item) => item.url).join(" ")}`)) codes.push("FAIL_CONTACT_US_MISSING");
  if (!test.contact_us_expected && /off_topic/.test(test.test_family) && contact.test(response.answer)) codes.push("FAIL_CONTACT_US_UNNECESSARY");
  if (!test.source_record_ids?.length && fallback.test(response.answer)) return { result: "PASS_NO_VALID_CONTENT", severity: null, failure_codes: [] };
  return codes.length
    ? { result: "BEHAVIORAL_FAILURE", severity: codes.some((code) => /VALID_CONTENT|ROLE|CONTEXT|ORDINAL/.test(code)) ? "MAJOR" : "MEDIUM", failure_codes: [...new Set(codes)] }
    : { result: "PASS", severity: null, failure_codes: [] };
};

const atomicWrite = (path, value) => {
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2));
  renameSync(temp, path);
};
const counts = () => {
  const values = [...completed.values()];
  return Object.fromEntries(["PASS", "PASS_NO_VALID_CONTENT", "INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP", "BEHAVIORAL_FAILURE", "INCONCLUSIVE_TRANSPORT"]
    .map((key) => [key, values.filter((row) => row.result === key).length]));
};
const checkpoint = () => {
  const pending = tests.filter((test) => !completed.has(test.test_id));
  const ordered = tests.map((test) => completed.get(test.test_id)).filter(Boolean);
  atomicWrite(progressPath, {
    run_id: runId, started_at: startedAt, updated_at: new Date().toISOString(), resume_count: resumeCount,
    runtime, matrix_path: matrixPath, expectation_path: expectationPath, journal_path: journalPath,
    matrix_fingerprint: matrixFingerprint, qa_fingerprint: qaFingerprint, production_fingerprint: productionFingerprint,
    total_planned_turns: tests.length, completed_turn_ids: ordered.map((row) => row.test_id),
    completed_turns: ordered.length, pending_turns: pending.length, next_pending_turn: pending[0]?.test_id ?? null,
    last_completed_test_id: ordered.at(-1)?.test_id ?? null, counts: counts(),
  });
};
const save = (row) => {
  if (completed.has(row.test_id)) return;
  appendFileSync(journalPath, `${JSON.stringify(row)}\n`);
  completed.set(row.test_id, row);
  checkpoint();
  if (completed.size % 250 === 0) console.log(`checkpoint ${completed.size}/${tests.length}`);
};
const ask = async (test, history) => {
  const started = performance.now();
  let retryCount = 0;
  while (true) {
    try {
      const response = await fetch(runtime, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.18.${Math.floor(Number(test.test_id.slice(2)) / 240) % 240}.${Number(test.test_id.slice(2)) % 240 + 1}` }, body: JSON.stringify({ message: test.question, history: history.slice(-12), sessionId: `final5000-${test.conversation_id ?? test.test_id}` }), signal: AbortSignal.timeout(Number(process.env.QA_TIMEOUT_MS ?? 90000)) });
      const payload = await response.json().catch(() => ({}));
      const data = payload.data ?? {};
      const result = { test_id: test.test_id, conversation_id: test.conversation_id, turn_number: test.turn_number, test_family: test.test_family, category: test.category, question: test.question, expected_subject: test.expected_subject, expected_role: test.expected_role, expected_behavior: test.expected_behavior, source_record_ids: test.source_record_ids ?? [], contact_us_expected: Boolean(test.contact_us_expected), history_context: history.map((item) => `${item.role}: ${item.content}`).join("\n"), actual_answer_summary: data.answer ?? payload.error?.message ?? "", answer: data.answer ?? payload.error?.message ?? "", actual_cards: data.cards ?? [], cards: data.cards ?? [], actual_sources: data.sources ?? [], sources: data.sources ?? [], status_code: response.status, http_ok: response.ok && Boolean(payload.success), latency_ms: Math.round(performance.now() - started), retry_count: retryCount, transport_state: response.ok && payload.success ? "COMPLETED" : "HTTP_ERROR", completed_at: new Date().toISOString() };
      return { ...result, ...preliminaryGrade(test, result) };
    } catch (error) {
      if (retryCount < Number(process.env.QA_TRANSPORT_RETRIES ?? 1)) { retryCount++; continue; }
      const result = { test_id: test.test_id, conversation_id: test.conversation_id, turn_number: test.turn_number, test_family: test.test_family, category: test.category, question: test.question, expected_subject: test.expected_subject, expected_role: test.expected_role, expected_behavior: test.expected_behavior, source_record_ids: test.source_record_ids ?? [], contact_us_expected: Boolean(test.contact_us_expected), history_context: history.map((item) => `${item.role}: ${item.content}`).join("\n"), actual_answer_summary: String(error), answer: String(error), actual_cards: [], cards: [], actual_sources: [], sources: [], status_code: 0, http_ok: false, latency_ms: Math.round(performance.now() - started), retry_count: retryCount, transport_state: "INCONCLUSIVE", completed_at: new Date().toISOString() };
      return { ...result, ...preliminaryGrade(test, result) };
    }
  }
};

checkpoint();
const standalone = tests.filter((test) => !test.conversation_id && !completed.has(test.test_id));
let standaloneCursor = 0;
await Promise.all(Array.from({ length: Number(process.env.QA_CONCURRENCY ?? 6) }, async () => {
  while (standaloneCursor < standalone.length) {
    const test = standalone[standaloneCursor++];
    save(await ask(test, []));
  }
}));
const conversations = new Map();
for (const test of tests.filter((item) => item.conversation_id)) {
  if (!conversations.has(test.conversation_id)) conversations.set(test.conversation_id, []);
  conversations.get(test.conversation_id).push(test);
}
const flows = [...conversations.values()];
let flowCursor = 0;
await Promise.all(Array.from({ length: Number(process.env.QA_CONVERSATION_CONCURRENCY ?? 4) }, async () => {
  while (flowCursor < flows.length) {
    const flow = flows[flowCursor++].sort((left, right) => left.turn_number - right.turn_number);
    const history = [];
    for (const test of flow) {
      const prior = completed.get(test.test_id);
      const result = prior ?? await ask(test, history);
      if (!prior) save(result);
      history.push({ role: "user", content: test.question }, { role: "assistant", content: result.answer });
    }
  }
}));
checkpoint();
if (completed.size !== tests.length) throw new Error(`Run incomplete: ${completed.size}/${tests.length}`);
const currentProductionFingerprint = fingerprintFiles(productionFiles);
if (currentProductionFingerprint !== productionFingerprint) throw new Error("Production fingerprint changed during the run.");
const orderedResults = tests.map((test) => completed.get(test.test_id));
atomicWrite(outputPath, { generated_at: new Date().toISOString(), run_id: runId, runtime, total_user_turns: tests.length, matrix_fingerprint: matrixFingerprint, qa_fingerprint: qaFingerprint, production_fingerprint_before: productionFingerprint, production_fingerprint_after: currentProductionFingerprint, production_modified_during_run: false, checkpoint: progressPath, journal: journalPath, counts: counts(), results: orderedResults });
console.log(JSON.stringify({ output: outputPath, completed: completed.size, counts: counts(), production_unchanged: true }, null, 2));
