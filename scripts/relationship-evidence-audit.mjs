import { readFileSync, writeFileSync } from "node:fs";
import { authoritativeRelationshipIds } from "./lib/relationship-evidence.mjs";

const snapshotPath = process.env.QA_SNAPSHOT ?? "SUCCESSIVE_CHATBOT_SOURCE_API_RECORDS.json";
const sourceAuditPath = process.env.QA_RESIDUAL_AUDIT ?? "SUCCESSIVE_CHATBOT_14_RESIDUAL_EVIDENCE_AUDIT.json";
const output = process.env.QA_OUTPUT ?? "SUCCESSIVE_CHATBOT_RELATIONSHIP_EVIDENCE_AUDIT_V2.json";
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const sourceAudit = JSON.parse(readFileSync(sourceAuditPath, "utf8"));
const records = snapshot.records;
const norm = (value) => String(value ?? "").toLowerCase()
  .replace(/&amp;/g, " and ").replace(/[^a-z0-9+#.]+/g, " ").trim();
const canonicalRole = (value) => {
  const role = norm(value).replaceAll("_", " ");
  if (/case/.test(role)) return "case study";
  if (/article|resource|blog|thought/.test(role)) return "editorial";
  if (/product|accelerator/.test(role)) return "accelerator";
  if (/service|capabilit/.test(role)) return "service";
  if (/industr/.test(role)) return "industry";
  if (/partner/.test(role)) return "partner";
  return role;
};
const roleCompatible = (record, wanted) => {
  const actual = canonicalRole(record?.role ?? record?.content_type ?? record?.type);
  const expected = canonicalRole(wanted);
  return actual === expected || (expected === "editorial" && ["editorial", "blog", "press release", "media"].includes(actual));
};
const byTitle = new Map(records.map((record) => [norm(record.title), record]));
const byId = new Map(records.map((record) => [String(record.id), record]));
const relationQuery = /^(?:show|find|give me|do you have|any)\s+(?:related\s+)?(services?|capabilities|case studies|customer stories|blogs?|articles?|resources?|products?|partners?|industries|accelerators?)\s+(?:related to|for|about)\s+(.+)$/i;

const cases = sourceAudit.cases.map((item) => {
  const match = norm(item.query).match(relationQuery);
  if (!match) return { ...item };
  const requestedRole = match[1];
  const base = byTitle.get(norm(match[2]).replace(/[.]+$/, ""));
  // Topic discovery (for example, articles about a generic topic) is not an
  // entity-to-entity relationship audit and retains its prior classification.
  if (!base) return { ...item };
  const relationshipIds = base ? [...authoritativeRelationshipIds(base, records)] : [];
  const targets = relationshipIds.map((id) => byId.get(id))
    .filter((record) => record && roleCompatible(record, requestedRole));
  const supported = targets.length > 0;
  return {
    ...item,
    classification: supported
      ? "VALID_PRODUCTION_FAILURE"
      : "INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP",
    corrected_relationship_evidence: {
      base_record_id: base?.id ?? null,
      requested_role: canonicalRole(requestedRole),
      authoritative_target_ids: targets.map((record) => record.id),
      authoritative_targets: targets.map((record) => ({
        id: record.id, title: record.title, role: record.role, url: record.url,
      })),
      extraction_rule: "path-aware relationship fields, structured reference objects, or canonical internal content URLs",
    },
    evidence_found: supported
      ? `Corrected path-aware extraction found ${targets.length} authoritative role-compatible relationship target(s).`
      : "Corrected path-aware extraction found no authoritative role-compatible relationship target.",
    confidence: "high",
  };
});
const summary = {
  total_cases: cases.length,
  valid_production_failures: cases.filter((item) => item.classification === "VALID_PRODUCTION_FAILURE").length,
  invalid_unsupported_expectations: cases.filter((item) => item.classification === "INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP").length,
  ambiguous: cases.filter((item) => /AMBIGUOUS/.test(item.classification)).length,
};
const artifact = {
  generated_at: new Date().toISOString(),
  audit_mode: "saved-source path-aware relationship re-audit; no chatbot requests",
  source_snapshot: snapshotPath,
  source_residual_audit: sourceAuditPath,
  summary,
  cases,
  production_files_changed: false,
};
writeFileSync(output, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ output, ...summary }, null, 2));
