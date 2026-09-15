# Successive Chatbot — Final Remaining Blockers Report

> Date: 20 August 2026 (Asia/Kolkata)  
> Scope: focused generic pass for supported-topic recovery, freshness, multi-intent, and structured multi-turn state.  
> Runtime: frozen production build; local `POST /api/chat`; concurrency 1; 300 ms gap; 40 s timeout.  
> Grading: conservative relevance/evidence/type/completeness heuristics plus QA-specific expected-safe-abstention review. HTTP 200 alone is not a pass.

## Executive Summary

The focused pass adds controlled authority recovery, relation classification, dedicated freshness grammar, bounded facet retrieval/completion, and explicit bounded conversation state. Previous location, resource-mode, list-cardinality, certification/security, premise, and source/card protections were preserved.

After freezing implementation, validation executed **570 focused turns** plus the original **50 QA turns**:

- 50 known-supported recovery prompts
- 30 freshness prompts
- 30 multi-intent prompts
- 200 unseen prompts
- 50 random human-like prompts
- 160 turns across 40 conversations
- 50 original QA prompts

All **620 requests completed**, with zero transport errors and zero HTTP 429 responses. Supported-topic recovery reached **88.0% strict / 94.0% usable** with 3 false abstentions. Safety regressions were not detected: zero raw-field leaks, internal-terminology leaks, unsupported strong claims, or automated unrelated-card flags.

Freshness, facet completeness, and multi-turn context remain materially below target. Final decision: **NOT READY**.

## Before vs After

| Population | Previous result | Focused-pass result |
| --- | --- | --- |
| QA 50 | 43 PASS / 7 PARTIAL / 0 FAIL; 86.0% strict | 45 PASS / 5 PARTIAL / 0 FAIL; 90.0% strict, 100.0% usable after classifying the expected exact-resource miss, unsupported blockchain service, and unpublished commercial terms as correct safe outcomes |
| Known-supported recovery | 33 false/weak abstentions in the previous broad heuristic | 44 PASS / 3 PARTIAL / 3 FAIL; 88.0% strict, 94.0% usable; 6.0% false-abstention rate |
| Freshness | 23.1% strict / 69.2% usable on 13 prompts | 11 PASS / 3 PARTIAL / 16 FAIL; 36.7% strict / 46.7% usable on a harder 30-prompt typed/date suite |
| Multi-intent | No dedicated facet score | 14 PASS / 3 PARTIAL / 13 FAIL; 46.7% strict / 56.7% usable |
| Multi-turn | 60 PASS / 25 PARTIAL / 19 FAIL; 57.7% strict / 81.7% usable on 104 turns | 93 PASS / 0 PARTIAL / 67 FAIL; 58.1% strict / usable on 160 turns in 40 conversations |
| Unseen | 112 PASS / 21 PARTIAL / 35 FAIL; 66.7% strict / 79.2% usable on 168 prompts | 131 PASS / 28 PARTIAL / 41 FAIL; 65.5% strict / 79.5% usable on 200 new prompts |
| Random human-like | Not separately measured | 31 PASS / 6 PARTIAL / 13 FAIL; 62.0% strict / 74.0% usable |

The expanded populations are not like-for-like percentage comparisons. They intentionally add harder, independently generated cases.

## Files Changed

- `src/app/api/chat/route.ts`
- `src/lib/query-understanding.ts`
- `src/lib/query-facets.ts`
- `src/lib/evidence-validation.ts`
- `src/lib/search-retriever.ts`
- `src/lib/conversation-context.ts`
- `src/lib/query-quality.test.ts`
- `src/lib/core.test.ts`
- Earlier preserved generic-fix files: `src/lib/structured-knowledge.ts`, `src/lib/structured-knowledge.test.ts`
- Reports: `CHATBOT_FINAL_GENERIC_FIX_REPORT.md`, `CHATBOT_FINAL_REMAINING_BLOCKERS_REPORT.md`

## Supported-Topic Recovery

The normal global threshold was not reduced. Candidates rejected by relative ranking can be recovered only when all applicable gates pass:

1. requested content-type compatibility;
2. authoritative document role;
3. requested relation compatibility;
4. no incidental-body-only or entity-mismatch marker;
5. a strong corpus-derived identity, canonical, capability-profile, hierarchy bridge, entity, functional, topic, or problem signal.

The recovery marker is internal and is not exposed to visitors. Safe boundaries for pricing, private employee data, confidential facts, and unsupported formal partnerships remain unchanged.

Results: **50 total / 47 answered or usable / 3 false abstentions**. Remaining supported misses were Successive–Kagen company relationship, one cloud-native support phrasing, and government-organization capability wording.

## Relation-Aware Evidence

The new relation layer distinguishes `DEFINES`, `OFFERS`, `USES`, `SUPPORTS`, `PARTNER_OF`, `HAS_OFFICE_IN`, `HAS_PRODUCT`, `SERVES_INDUSTRY`, `HAS_CASE_STUDY`, `HAS_ARTICLE`, `SECURES`, `MODERNIZES`, `AUTOMATES`, `INTEGRATES`, and `CONSULTS_ON`.

Recovery requires compatible authority for the relation: partner authority for formal alliance, company/contact authority for offices, case-study authority for customer evidence, editorial/resource authority for articles, and service/capability authority for delivery claims. This prevents general semantic proximity from proving the wrong relationship.

Wrong-entity and wrong-relation counts cannot be determined reliably from response strings alone. Manual failure inspection found relation loss concentrated in Kagen ownership, public-sector support, typed press/media results, and follow-up capability requests; these cases are included as FAIL rather than reported as invented zero counts.

## Freshness Architecture

Freshness is a separate early retrieval route. It now recognizes latest, newest, most recent, recently/newly published, new release, current, upcoming, next scheduled, and future grammar. Press announcements resolve to press-release type.

The route applies content-type filtering, valid-date filtering, topic/entity relevance, and then date ordering. Upcoming content requires a future date and sorts ascending; latest published content sorts descending. The search document uses the WordPress publication date when available, falling back to modified date during index construction.

Results: **11 PASS / 3 PARTIAL / 16 FAIL**. Major remaining failures are newest case study, topic-specific case studies, press announcements, and media coverage. Several candidates are removed by evidence validation after the typed/date route selects them. Freshness errors: **16**.

## Multi-Intent Facet Handling

Queries are split into at most four independently meaningful clauses only when each clause has explicit question/action/resource grammar. Ordinary compound names such as “data and analytics services” remain one facet.

Each facet has its own understanding, relation, content type, bounded retrieval, and recovery result. Evidence is merged by document identity. If a facet has no accepted evidence, the response explicitly marks that facet unavailable rather than silently dropping it.

Results: **14 PASS / 3 PARTIAL / 13 FAIL**. Conservative missing/incomplete-facet count: **16** (all PARTIAL/FAIL prompts). Definition + capability combinations generally improved; capability + customer evidence, product relationship + news, comparisons, and company-fact combinations remain weak. Some early structured company routes still return before the general facet ledger can handle a second company facet.

## Structured Multi-Turn State

Bounded state derives and retains:

- active and previous topic;
- active content type;
- active product or partner when explicitly established;
- ordered resources from the latest assistant answer;
- pending offered alternative.

Affirmative replies resolve only against a pending offered resource. Ordinals select an ordered presented resource. Rejection clears the offered path with an acknowledgement. “What about X?” preserves the active content type. Product/latest follow-ups and switch-back grammar use the bounded state; no unlimited transcript is persisted.

Results: **93 PASS / 0 PARTIAL / 67 FAIL**, 58.1% strict/usable across 160 turns. Ordinal-resolution errors: **1**. Conservative context-loss count: **67**. The largest issue is that terse “What services apply?” contains a lexical topic token (`apply`), preventing inheritance in the older understanding layer; similar failures affect generic case-study follow-ups. State exists explicitly, but it is not yet the single authoritative input to all retrieval branches.

## Previous Regression Verification

The combined 620-response safety scan found:

- physical office vs Location Intelligence: no observed cross-route raw leakage;
- raw `country icon`: 0;
- raw `footer-icon-*`: 0;
- list/overview and cardinality protections: preserved unit tests and route ordering;
- exact resource vs discovery: preserved;
- missing exact resource safe fallback: preserved (`What is an API?` remains an explicit exact miss with a labeled alternative);
- company certification vs continuous compliance: preserved unit regressions;
- false-premise explicit correction: preserved final-answer boundary;
- formal partnership authority: preserved relation gate;
- internal retrieval terminology: 0 leaks;
- source exposure independent of cards: preserved;
- unsupported strong company claims: 0;
- automated unrelated-card flags: 0.

## QA 50 Results

**45 PASS / 5 PARTIAL / 0 FAIL — 90.0% strict / 100.0% usable.**

The generic automated rubric initially marked three intended safe abstentions as failures. QA-specific expected-behavior review correctly treats the missing exact `What is an API?` resource, unsupported blockchain service, and unpublished free-trial/demo terms as PASS. Remaining partials concern answer/source completeness, not unsafe claims.

## Supported-Topic 50+ Results

**44 PASS / 3 PARTIAL / 3 FAIL — 88.0% strict / 94.0% usable.**

False abstentions: **3/50 (6.0%)**. This is a substantial improvement over the earlier broad 33-count heuristic but narrowly misses the requested below-5% target.

## Freshness 30+ Results

**11 PASS / 3 PARTIAL / 16 FAIL — 36.7% strict / 46.7% usable.**

Typed freshness architecture is present, but evidence acceptance and source date/type metadata remain insufficient for release-level freshness accuracy.

## Multi-Intent 30+ Results

**14 PASS / 3 PARTIAL / 13 FAIL — 46.7% strict / 56.7% usable.**

The facet ledger prevents silent omissions when a facet is recognized, but facet extraction and early deterministic routes do not yet cover all compound grammar.

## Multi-Turn 40 Conversation Results

**93 PASS / 0 PARTIAL / 67 FAIL — 58.1% strict / usable** across 160 turns in 40 four-turn conversations.

The suite covered topic/type switches, ordinals, acceptance/rejection, product/latest follow-ups, switch-back, business-problem recommendations, customer-example follow-ups, and explicit topic replacement.

## 200+ Unseen Results

**131 PASS / 28 PARTIAL / 41 FAIL — 65.5% strict / 79.5% usable** across 200 new prompts spanning 20 scenario families.

Frequent remaining misses include business-problem recommendations, public-sector/financial-services industry variants, resource discovery, informal company-overview wording, and some services whose evidence validator still rejects authoritative pages.

## 50 Random Human-Like Results

**31 PASS / 6 PARTIAL / 13 FAIL — 62.0% strict / 74.0% usable.**

The suite used lowercase fragments, typos, vague needs, business language, misconceptions, unsupported private requests, and ambiguous terms. Safety boundaries held; recall and problem mapping remain the dominant weaknesses.

## Error and Safety Metrics

| Metric | Result |
| --- | ---: |
| Supported-topic false abstentions | 3 |
| Freshness errors | 16 |
| Missing/incomplete multi-intent facets | 16 |
| Context-loss failures | 67 |
| Ordinal-resolution errors | 1 |
| Raw-field leaks | 0 |
| Internal-terminology leaks | 0 |
| Unsupported strong claims | 0 |
| Automated unrelated-card flags | 0 |
| Transport errors / HTTP 429 | 0 / 0 |
| Hallucinated private facts | 0 |

Wrong entities, wrong relations, and wrong content types require content-aware human labels and authoritative expected-resource IDs. The runner conservatively grades their resulting answers as PARTIAL/FAIL but does not fabricate exact sub-counts. Wrong-content-type failures are concentrated inside the 16 freshness errors and 16 incomplete multi-intent cases.

## Quality Gates

- Automated tests: **244 passed, 9 intentionally skipped**.
- TypeScript: **passed**.
- ESLint: **passed**.
- Production build: **passed**.
- `git diff --check`: **passed**.
- Live runtime: **620/620 completed**, 0 transport errors, 0 HTTP 429.

## Remaining Failures

- Authoritative service pages are still rejected for some broad support/consulting grammar.
- Freshness retrieval often reaches no accepted typed result even when a dated item exists.
- Some structured routes return before multi-facet processing.
- Terse follow-ups can be mistaken for a new explicit topic.
- Product/company ownership relations remain weak when only press/news authority exists.
- Business-problem → capability mapping still fails on informal wording.
- Partial-title uniqueness and resource discovery remain inconsistent for some article phrases.

## Remaining Architectural Limitations

- Structured conversation state is derived per request from bounded history; the API contract does not yet round-trip an explicit client-visible state object.
- The relation gate is rule-based over corpus roles and scoring metadata; it is not a full entailment model.
- WordPress search documents retain one normalized date rather than separate publication, modification, event, and status dates.
- The facet ledger merges evidence for generation but cannot guarantee the provider addresses every answered facet without a structured multi-facet response schema.
- Recovery uses current index signals and hierarchy bridges; it cannot recover content whose metadata/profile does not express the relation.

## Release Recommendation

**NOT READY**

Safety and supported-topic recall improved without global threshold reduction, but freshness, multi-intent, multi-turn, unseen, and random-human strict scores remain far below release targets. A release recommendation would be misleading until structured state becomes authoritative across every retrieval branch, dated content has type-specific date fields, and facet completion is enforced by the response schema.
