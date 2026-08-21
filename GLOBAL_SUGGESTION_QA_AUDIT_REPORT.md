# Global Suggestion QA Audit

Audit date: 2026-08-21

## Executive Summary

This was a read-only QA audit of the current running chatbot. No production logic, prompt, retrieval, ranking, or UI behavior was changed.

The audit executed 150 first-turn queries against the real `/api/chat` path. Four responses displayed structured suggestions in the bundled UI, producing eight independently tested button clicks. Four clicks were PASS and four were PARTIAL because the narrower customer-case-study action returned exactly the same answer, sources, and cards as its broader sibling action. There were no click failures, dead ends, wrong types, wrong relations, unrelated sources/cards, context-loss cases, loops, or raw-label execution on the structured click path.

The larger finding is coverage: 146/150 responses displayed no buttons. The API returned 353 legacy suggestion strings, but the bundled UI correctly did not render them because they had no structured action payload. Reliable visible quick actions currently exist only for generic client overview responses.

## Current Content/Category Inventory

The current public Successive API exposed 930 items across 12 configured collections:

| Current API type | Items |
|---|---:|
| post | 560 |
| page | 170 |
| case_study | 103 |
| award | 31 |
| accelerators | 24 |
| press-release | 16 |
| industries | 7 |
| employee-perspective | 6 |
| media-coverage | 6 |
| partners | 3 |
| thought-leadership | 3 |
| careers | 1 |

The page/post corpus supplied service, technology, development, product/Kagen, company, contact/location, topical capability, blog, webinar/event, and general resource material. The audit added dynamic exact-title queries from current API items in addition to the manual category suite. Full samples and slugs are preserved in `GLOBAL_SUGGESTION_QA_RESULTS.json`.

## Test Environment

- Chat path: current local running chatbot at `http://localhost:3000/api/chat`
- Content source: current public `https://successive.tech/wp-json/successive-digital/v1`
- UI contract inspected: bundled React UI renders `suggestionActions`, not legacy `suggestions`
- Transport: 150/150 first turns completed after bounded retry; final transport errors: 0
- Public response limitation: detected intent and active topic/entity are not exposed by the API schema. Those raw fields are recorded as `not exposed`, rather than inferred and presented as observed state.

## Test Methodology

The suite first enumerated and paginated all 12 current API collections. It then generated 150 unique realistic queries from required category variants, dynamic corpus titles, and existing regression cases. Queries included short, conversational, detailed, singular/plural, typo, latest, related, exact-resource, recommendation, business-problem, and unsupported/private phrasing.

For every first turn, the audit captured the answer, sources, cards, legacy strings, and visible structured actions. Every visible action was clicked from an independent copy of its matching conversation state using the actual structured-action request payload. Clicks were checked for status, abstention, promised content type/relation, sources, cards, repeated response, and follow-up actions. The same visible label was also manually typed without its payload for comparison.

## First-Turn Coverage

- First-turn queries: 150
- HTTP/API responses completed: 150
- Transport failures after retry: 0
- Required manual intent families covered: 27
- Current corpus types inventoried: 12
- Dynamic current-corpus queries included: yes

## Suggestion Coverage

| Metric | Result |
|---|---:|
| Responses with visible structured suggestions | 4 |
| Responses with zero visible suggestions | 146 |
| Total visible suggestions | 8 |
| Average visible suggestions per response | 0.0533 |
| Legacy suggestion strings returned by API | 353 |
| Label-only suggestions rendered by bundled UI | 0 |
| Categories with visible suggestions | 1 (`clients`) |
| Categories with zero visible suggestions | 26 |

Zero suggestions are not graded as failures. They show that the present UI contract is conservative, though useful quick-action coverage is narrow relative to the available corpus.

## Suggestion Click Results

| Grade | Count | Rate |
|---|---:|---:|
| PASS | 4 | 50% |
| PARTIAL | 4 | 50% |
| FAIL | 0 | 0% |
| Total clicks | 8 | 100% |

All eight clicks returned HTTP 200 with published customer-work evidence. All case-study actions returned case-study cards. The four PARTIAL results fulfilled their labels but duplicated the broad sibling action's entire result.

## Category Scorecard

| Category | First turns | Responses with suggestions | Tested | PASS | PARTIAL | FAIL | Top issue |
|---|---:|---:|---:|---:|---:|---:|---|
| Company overview | 3 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Company facts | 7 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Services | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Technologies/development | 10 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Industries | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Products/Kagen | 6 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Accelerators | 2 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Partners | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Clients | 11 | 4 | 8 | 4 | 4 | 0 | Duplicate action result |
| Case studies | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Blogs/articles | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Resources | 8 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| News/press/media | 4 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Locations | 6 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Contact | 4 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Careers | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| AI/GenAI | 8 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Data/analytics | 6 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Cloud/AWS/GCP | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Security/DevSecOps | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| CMS/Strapi/AEM | 5 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Commerce/Shopify | 4 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Business problems | 4 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Recommendations | 3 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Exact resources | 3 | 0 | 0 | 0 | 0 | 0 | No visible actions |
| Unsupported/private | 6 | 0 | 0 | 0 | 0 | 0 | Correctly no visible actions |
| Regression/dynamic discovery | 10 | 0 | 0 | 0 | 0 | 0 | No visible actions |

## Failure Classification

| Failure/issue class | Count |
|---|---:|
| DEAD_END_SUGGESTION | 0 |
| UNSUPPORTED_SUGGESTION_OFFERED | 0 |
| LABEL_REPARSED_AS_QUERY | 0 |
| CONTEXT_LOSS | 0 |
| WRONG_CONTENT_TYPE | 0 |
| WRONG_RELATION | 0 |
| UNRELATED_SOURCE | 0 |
| UNRELATED_CARD | 0 |
| SUGGESTION_LOOP | 0 |
| DUPLICATE_ACTION | 4 |
| GENERIC_FALLBACK | 0 |

## P0 Failures

None observed among visible structured suggestions. No click returned unsafe claims or unrelated evidence.

## P1 Failures

None observed among visible structured suggestions. There were no abstentions, wrong topics/types/relations, context losses, or fallback responses after structured clicks.

## P2 Failures

Four sibling-action instances were semantically duplicate results.

- User query: `client` (also reproduced for `clients`, `our clients`, and `who are your clients?`)
- Visible suggestions: `Show published customer work` and `Show customer case studies`
- Click result: both returned the same three case studies, identical answer framing, sources, and cards
- Expected: the broader action should either expose a meaningfully broader eligible set or be suppressed when it collapses to the same result as the narrower action
- Classification: `DUPLICATE_ACTION`, PARTIAL

## Client Results

Eleven first-turn client queries were tested. Four generic overview variants displayed two structured actions each. All eight clicks preserved the client/customer-work relation and returned published case studies. Current/active and unsupported relationship variants exposed no visible action.

## AI Results

Eight AI/GenAI/ML variants were tested. None displayed a structured suggestion. Legacy API strings existed on some responses but were not visible buttons, so there were no AI action clicks to grade and no evidence for an AI context-loss chain.

## Data & Analytics Results

Six data, analytics, engineering, science, and cloud-data variants were tested. No visible structured actions were produced.

## Services Results

Five core service queries plus service-related dynamic/regression queries were exercised. No visible structured actions were produced.

## Technologies Results

Ten direct technology/development queries covered React, Node.js, Python, Java/.NET, Flutter, PWA, UI/UX, blockchain, and Salesforce/CRM. No visible structured actions were produced.

## Industries Results

Five industry variants plus industry-specific case-study/problem queries were included. No visible structured actions were produced.

## Products/Kagen Results

Six product/Kagen overview, capability, resource, and latest queries were tested. No visible structured actions were produced.

## Partners Results

Five manual partner queries used currently relevant entities, with further dynamic partner titles taken from the API. No visible structured actions were produced.

## Resources Results

Blogs, articles, case studies, whitepapers, ebooks, reports, webinars, events, press releases, media coverage, exact titles, latest, related, summary, and more-like-this forms were represented. No visible structured resource actions were produced.

## Company Information Results

Company overview, founder, leadership, board, awards, culture, and values queries displayed no structured actions. Consequently, no unrelated marketing button was exposed from these contexts.

## Location/Contact Results

Ten location/contact queries covered offices, HQ, India, US presence, typo wording, phone, email, and sales contact. No structured action was displayed, and therefore there was no Location Intelligence context collision at the suggestion layer.

## Unsupported/Private Query Results

Six queries covered internal projects, private clients, salary, confidential contracts, unannounced partnerships, and internal roadmap. None displayed a structured suggestion. No button promised private or unavailable information.

## Multi-Turn Results

Eight independent two-turn action paths were possible and executed. The successful click responses returned zero second-level actions. Therefore zero three-turn suggestion chains were possible, and the requested target of 30 was not fabricated. There were no failure-response suggestions to recurse into.

## Manually Typed vs Structured Click Results

All eight structured clicks passed the core relation/type contract. Manually typing `Show customer case studies` produced the same result as the structured click in 4/4 comparisons. Manually typing `Show published customer work` differed in 4/4 comparisons: normal query parsing selected a specific AEM/AWS case study excerpt, while the structured click deterministically returned the three-item customer-work collection.

This difference demonstrates that the actual button is not being reparsed as raw label text. It also exposes a normal typed-query weakness for the broad label, but that is not a structured suggestion-click failure.

## Dead-End Suggestions

None. No visible click abstained or returned a generic failure.

## Context-Loss Cases

None observable for current visible actions. The client relation survived all structured clicks. Topic/entity fields are not exposed publicly, and no topic-bearing AI/data/service buttons were displayed, so those dimensions could not be action-tested.

## Wrong-Type / Wrong-Relation Cases

None. All `case-study` actions returned case-study cards. All `customer-work` actions returned published customer case studies, which satisfy the broader requested relation.

## Source/Card Relevance Issues

None observed in structured click results. Each answer's three sources matched its three cards and used `/case-studies/` URLs relevant to published customer work.

## Loop/Duplicate Issues

No sequential loop occurred because fulfilled actions generated no further buttons. Four duplicate sibling-action instances were observed as documented under P2.

## Suggestions That Should Not Have Been Displayed

No visible suggestion was wholly unsupported. However, when broad customer work resolves to exactly the same eligible results as customer case studies, one of the two sibling actions is redundant and should be reviewed for suppression or differentiated execution.

## Suggestions That Worked Correctly

- `Show published customer work`: four structured clicks, all relevant and evidence-backed
- `Show customer case studies`: four structured clicks, all typed correctly as case studies; graded PARTIAL only because each duplicated its sibling's complete result

## Global Metrics

- First turns: 150
- Visible buttons shown/clicked: 8/8
- PASS: 4 (50%)
- PARTIAL: 4 (50%)
- FAIL: 0 (0%)
- Dead ends: 0
- Visible-action categories: 1
- Zero-visible-action responses: 146 (97.33%)
- Hidden legacy strings observed: 353
- Transport errors: 0

## Recommended Fix Areas

Recommendations only; nothing was implemented during this audit:

1. Add duplicate-action suppression based on resolved eligible result identity, not label identity.
2. Decide whether broad customer-work should intentionally include other validated published resource types; otherwise keep only the clearer case-study action.
3. Migrate high-value legacy suggestions category by category only after availability, typed-route, state, and click-contract validation exists.
4. Add explicit topic/entity/relation observability to non-production QA metadata so future context-loss audits can compare expected and actual state directly.
5. Add evidence-aware structured actions for service, technology, industry, resource, company, location, product, and partner contexts before attempting a 30-chain test.
6. Review normal manually typed handling of `Show published customer work`; it diverges from the structured action and returns a narrower AEM/AWS result.

## Remaining Unknowns

- No visible actions existed outside clients, so click reliability for all other categories remains untested rather than passed.
- No response exposed a second-level action, so loop and context preservation beyond turn two could not be exercised.
- Public API responses do not expose detected intent or resolved active topic/entity.
- LLM wording and live corpus can vary between runs; the raw file records this run's exact responses, sources, cards, and actions.
- Legacy clients that still render `suggestions: string[]` were outside the bundled-UI audit and may behave differently.

## Audit Artifacts

- Machine-readable results: `GLOBAL_SUGGESTION_QA_RESULTS.json`
- Reproducible runner: `scripts/global-suggestion-qa-audit.mjs`
- Duplicate-result finalizer used for this captured run: `scripts/finalize-suggestion-qa-results.mjs`
