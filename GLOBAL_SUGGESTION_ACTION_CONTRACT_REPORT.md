# Global Suggestion Action Contract Report

Date: 2026-08-21

## 1. Root cause

The API had many legacy `suggestions: string[]` producers. The bundled UI rendered those labels as buttons and sent the visible text back through normal query understanding. A label therefore looked like an executable promise without carrying a typed route, relation, content type, or evidence requirement.

## 2. Global action architecture

The primary React/iframe UI now renders only `suggestionActions`. Legacy strings remain in the API for backward compatibility but are classified as `LEGACY_UNVALIDATED` and are never buttons in the bundled UI. This rule is response-wide and does not depend on intent or category.

Flow: answer -> evidence-aware action generation -> structured payload -> UI click -> registry resolver -> canonical query/collection path -> normal evidence and response safety.

## 3. Action registry

`src/lib/suggestion-actions.ts` is the central resolver. Every currently accepted action intent has an executor:

| Intent | Canonical execution |
|---|---|
| `CUSTOMER_WORK_DISCOVERY` | customer-work/case-study collection path |
| `PUBLIC_ORGANIZATION_OVERVIEW` | public client overview path |
| `CONTENT_DISCOVERY` | typed published-content discovery path |

The resolver does not inspect `label`. Unit tests deliberately change visible wording while asserting identical execution.

## 4. Structured payload schema

The validated payload contains `id`, `label`, `intent`, optional `contentType`, and optional `sourceContext`. The click request excludes presentation text and transmits only executable state. The existing architecture does not yet require topic/entity/relation/time fields because no visible action currently promises those dimensions.

## 5. Availability validation

Client actions are emitted only after the live WordPress corpus is loaded. Customer-work is available only when eligible case studies or explicitly customer-related published content exist; the case-study action is emitted only when the case-study collection is non-empty. When this cannot be proven, zero actions are displayed.

## 6. Action execution

Structured payload is authoritative. The route resolves it before ordinary typed-message follow-up parsing. A manually typed phrase still follows normal query understanding, while a UI click follows the registry route. Content type is applied before ranking; a case-study action cannot silently substitute blogs or general pages.

## 7. State preservation

`sourceContext` and `contentType` survive the UI click and request boundary. The existing client overview state is preserved. Generic topic/entity/relation state is reserved work: no button requiring those fields is exposed yet.

## 8. Lexical/vector/hybrid integration

The action first selects its eligible typed collection. Ranking is downstream of type/relation filtering. Global similarity search is not used to decide whether a promised action is available.

## 9. Legacy migration

All legacy `suggestions` producers remain API-compatible but are globally non-renderable in the bundled UI. The only rendered producer is structured and availability-backed. This prevents unsupported greetings, service, location, resource, abstention, and LLM-generated strings from becoming clickable controls.

## 10. Categories migrated

The global rendering and request contract applies to services, technologies, industries, products/Kagen, partners, clients, company facts, locations, all resource types, careers, accelerators, topical capabilities, problems, recommendations, latest requests, and unsupported/private responses. Client/customer discovery currently has useful visible structured actions; every other category safely exposes zero until an evidence-aware producer is added.

## 11. Categories with zero valid actions

In the 100-query run, services, technologies, industries, products, Kagen, partners, company facts, locations, case studies, blogs/resources, news/press, accelerators, careers, AI, cloud, data, security, DevSecOps, CMS, commerce, business problems, and recommendations emitted zero structured buttons. Their legacy strings were returned only for compatibility and hidden. This is intentionally conservative, not evidence that these categories lack content.

## 12. 100-query contract test

Command: `CHATBOT_TEST_URL=http://localhost:3000 node scripts/global-suggestion-contract-test.mjs`

The run covered 100 first-turn queries, including all 25 required category groups. There were zero transport failures.

## 13. Action-click results

| Metric | Result |
|---|---:|
| First-turn responses | 100 |
| Responses with visible structured actions | 1 |
| Visible structured actions | 2 |
| Actions independently clicked | 2 |
| PASS | 2 |
| PARTIAL | 0 |
| FAIL | 0 |
| Click PASS rate | 100% |
| Dead ends | 0 |
| Wrong content type | 0 |
| Wrong topic/entity/relation | 0 |
| Unrelated source | 0 |
| Context loss | 0 |
| Repeated loop | 0 |
| Label-only buttons rendered | 0 |

Both `Show published customer work` and `Show customer case studies` returned relevant published evidence. The typed case-study action returned case-study cards only.

## 14. Multi-turn action-chain results

Twenty-five category seeds were exercised from matching fresh state. Twenty-four ended safely at turn one because they exposed no structured action. The client seed reached turn two and passed. Its result intentionally exposed no further action, so no artificial/circular turn-three button was generated. Consequently, this run proves 25 safe chain attempts, but only one actionable two-turn chain and no three-turn chain; it must not be represented as 25 fully actionable three-turn journeys.

## 15. Loop prevention

Fulfilled client discovery returns no repeat action. Duplicate action IDs are not generated, and hidden legacy labels cannot form loops in the bundled UI.

## 16. Source/card validation

The customer-work executor filters by relation and role before ranking. Cards and sources are built only from the same eligible documents. Public-organization responses use the dynamically discovered canonical homepage URL as their primary source.

## 17. Regression results

- Focused action and structured-knowledge tests: 112 passed
- TypeScript typecheck: passed
- ESLint: passed
- Production build: passed (required unrestricted rerun because Turbopack's CSS worker could not bind its internal port inside the sandbox)
- Live global contract: 100 responses, 2/2 visible-action clicks passed, 0 transport failures

## 18. Remaining limitations

This change enforces the hard safety contract globally, but it does not claim that every category now has useful quick actions. Most legacy suggestion producers still need evidence-aware structured equivalents before they may become visible. Generic topic/entity/relation/time-state executors, exact-resource actions, latest-content actions, and real three-turn action chains remain future migration work. Until then the safe behavior is zero buttons, never an unvalidated button.

## Acceptance result

For every suggestion actually visible in the bundled UI: an implemented resolver exists, the action was availability-backed, the label was not parsed as execution input, click PASS was 100%, and no label-only suggestion rendered.
