# Global Suggestion Final Fix Report

Date: 2026-08-21

## 1. Executive Summary

The chatbot now has a reusable exact-evidence structured action path beyond the client flow. Visible actions carry resolved content identities and are pre-validated against the same resolver used on click. The direct-DOM production widget was also corrected: it had still rendered legacy `suggestions[]`, which explains the reported Security/DevSecOps dead-end buttons. Both bundled UI implementations now render only `suggestionActions`.

The final 150-query audit produced 18 visible actions across 15 responses. Every action was independently clicked: 18 PASS, 0 PARTIAL, 0 FAIL. All release-blocking failure classes were zero.

## 2. Baseline Audit Findings

Baseline: 150 first turns, 4 responses with structured actions, 8 clicks, 4 PASS, 4 PARTIAL, 146 zero-action responses, and duplicate client sibling actions. The audit also counted 353 legacy strings hidden by the React UI. A later real-world Security/DevSecOps reproduction proved that the standalone direct-DOM widget still rendered those unsafe legacy strings.

## 3. Root Causes

1. Structured actions lacked enough state to identify exact evidence.
2. Availability and execution were not represented by one exact resolver.
3. Client broad/narrow sibling actions could resolve to the same top results.
4. Generic validated retrieval results were not converted into safe structured actions.
5. `public/successive-chat-widget.js` rendered `response.suggestions` and resent labels as raw messages, bypassing the React UI safety contract.

## 4. Files Changed

- `src/lib/llm/schemas.ts`
- `src/lib/suggestion-actions.ts`
- `src/lib/suggestion-actions.test.ts`
- `src/lib/structured-knowledge.ts`
- `src/lib/structured-knowledge.test.ts`
- `src/app/api/chat/route.ts`
- `src/components/chat/chat-window.tsx`
- `public/successive-chat-widget.js`
- `src/lib/widget-loader.test.ts`
- QA runner/results/resume scripts and this report

## 5. Main Answer Quality Guard

Generic actions are attached only after evidence validation and secondary-source alignment. The selected primary source must also be present in the accepted response sources. Abstentions, partial/unsupported branches, clarification responses, private queries, and failures do not receive these actions. Existing deterministic company/about/contact/location routes remain authoritative and are not weakened to increase coverage.

## 6. Global Structured Action Architecture

The payload now supports dynamic `topic`, `entity`, `relation`, `resultKeys`, and `sourceResource` alongside the existing intent/content type/context. No content names or topics are encoded in production rules. Labels are derived from the resolved document role and current document title; execution does not inspect the label.

## 7. Shared Eligibility Resolver

`resolveEligibleActionDocuments()` is shared by pre-flight generation and click execution. It requires exact `${type}:${id}` identities and enforces promised content type/customer-work role constraints. Global collection existence cannot qualify an action.

Two evidence-backed sources feed the resolver:

- accepted related documents from the validated/aligned retrieval response;
- typed collection members already accepted by deterministic collection routes.

## 8. Pre-Flight Validation

Related actions require an accepted related document plus a strong relation: explicit/internal link, sufficiently strong relationship evidence, or multiple authoritative primary-topic terms. Typed collection member actions rely on membership in the already constrained collection response. Candidate actions with no exact eligible document, repeated result identity, or recently executed identity are suppressed.

## 9. Suggestion Execution

Structured `CONTENT_DISCOVERY` clicks load the current corpus and resolve only the supplied exact identities. The response is built directly from those documents with matching sources/cards. It never passes the visible label through ordinary lexical/vector intent parsing. If content disappears between render and click, the action terminates safely with no further suggestions and does not fall through to raw label search.

## 10. Legacy Suggestion Migration

Legacy strings remain in API responses for compatibility and were not blindly migrated. React and direct-DOM widgets now both render only validated structured actions. The reported buttons `Show me relevant Successive services`, `Show me a related case study`, and `Explore Successive industries` were legacy strings; they are no longer visible in the direct-DOM widget unless independently migrated into valid structured actions.

## 11. Services Coverage

Validated service responses can expose exact related service/detail documents when strong aligned evidence exists. Final audit: 2/5 service responses had actions, 3/3 clicks passed. Zero remains valid where no strong next document was accepted.

## 12. Technologies Coverage

Technology queries use the same related-document eligibility rules. The final sample exposed zero technology actions because no accepted secondary document met the strict relation gate. No weak action was added for coverage.

## 13. Industries Coverage

Industry responses use the same architecture and carry exact document identity when eligible. The final sample exposed zero industry actions; global industry collection existence alone was deliberately insufficient.

## 14. Products/Kagen Coverage

Product identity can be carried through the generic topic/entity/result-key fields. No final-sample product/Kagen secondary evidence passed the strict action gate, so zero buttons were shown.

## 15. Partners Coverage

Partner content is eligible only as its actual document role and exact identity. No partner-to-client relationship is inferred. No partner action passed the final sample gate.

## 16. Clients/Customers Coverage

Dynamic homepage organization extraction and current/active-client caution are unchanged. Duplicate broad/narrow actions are suppressed based on executable result behavior: when published customer work would collapse to case studies, only the case-study action is retained. Final audit: 6 client responses with actions, 6/6 clicks passed, duplicate count zero.

## 17. Blogs/Resources Coverage

Blog and case-study collection members now produce exact structured detail actions. Final audit: blogs/articles 2/2 clicks passed; case studies 1/1 passed. Other resource types remain zero unless their route supplies accepted eligible evidence.

## 18. Company Information Coverage

Existing authoritative company/home/about/structured sources remain the main-answer gate. Company-fact actions were not fabricated; none passed the evidence/action gate in the final sample.

## 19. Locations/Contact Coverage

Physical location and canonical contact routes remain deterministic. No Location Intelligence action is inferred from office context. Final sample showed zero structured actions because no additional exact next step passed validation.

## 20. AI/Data/Cloud/Security Coverage

These remain dynamic topics, not hardcoded action categories. AI produced 3 validated actions and 3/3 clicks passed. Data, cloud, and security exposed zero actions in the final sample when no accepted next document met the strict relation gate.

## 21. Duplicate Suppression

Actions are deduplicated by exact eligible result identity, not label. Client broad/narrow execution was additionally corrected so identical case-study results no longer produce two sibling buttons. Final `DUPLICATE_ACTION`: 0.

## 22. Loop Prevention

Exact action executors return no immediate follow-up actions. Recent structured action IDs are excluded when generic actions are generated. Final `SUGGESTION_LOOP`: 0.

## 23. Cloud Security Regression

`Cloud Security Services` was tested after implementation. The main answer remained grounded in Cloud Security content. No accepted Cloud Security case study existed in the response context, so no related-case-study structured action was displayed. The legacy dead-end label is hidden in both current widget implementations.

## 24. Client Regression

`client` returned the dynamic organization list, natural non-defensive generic wording, canonical homepage link, and one validated customer case-study action. Its click returned three published case-study cards. No duplicate broad customer-work sibling was displayed.

## 25. 150+ Global QA Results

| Metric | Baseline | Final |
|---|---:|---:|
| First turns | 150 | 150 |
| Responses with structured suggestions | 4 | 15 |
| Zero-suggestion responses | 146 | 135 |
| Visible suggestions/clicks | 8 | 18 |
| PASS | 4 | 18 |
| PARTIAL | 4 | 0 |
| FAIL | 0 | 0 |
| PASS rate | 50% | 100% |
| Transport errors | 0 | 0 |

Final visible-action categories: services, clients, case studies, blogs/articles, AI, and dynamically discovered regression content. Coverage increased 125% by click count without enabling legacy strings.

## 26. Multi-Turn Results

All 18 available independent two-turn paths were executed. Fulfilled exact actions deliberately returned no second action, so no three-turn chains were available. The requested target of 20 was not fabricated; actual possible count was 18.

## 27. Before vs After Metrics

Duplicate client siblings dropped from four PARTIAL instances to zero. Structured-action response coverage rose from 2.67% to 10%. Zero-action responses remain common (90%), reflecting the strict no-content/no-action rule rather than a forced-button strategy.

## 28. Remaining Limitations

- Many early deterministic branches still expose zero structured actions.
- Technology, industry, product/Kagen, partner, company, location/contact, data/cloud/security, business-problem, recommendation, and several resource samples had no qualifying next action.
- The public API does not expose resolved intent/topic/entity diagnostics to the audit.
- Exact actions are intentionally terminal to prevent loops; deeper multi-turn exploration remains limited.
- A content item removed after render can still become unavailable before click; that race is handled safely but cannot be precluded.

## 29. Quality Gates

- Automated tests: 304 passed, 9 skipped
- TypeScript: passed
- ESLint: passed
- Production build: passed
- `git diff --check`: passed
- Live global audit: 150/150 completed; 18/18 action clicks passed

## 30. Final Acceptance Status

PASS for the hard visible-action contract:

- `SUGGESTION_WITHOUT_FULFILLABLE_CONTENT`: 0
- dead-end visible suggestions: 0
- generic fallback after structured click: 0
- wrong topic/entity/type/relation: 0
- unrelated sources/cards: 0
- label reparsed for structured click: 0
- duplicate actions: 0
- loops: 0

The fix improves useful global coverage while preserving zero suggestions whenever exact evidence and an implemented executor are unavailable.
