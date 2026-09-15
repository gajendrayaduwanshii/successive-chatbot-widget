# Chatbot Generic Testing Report V5

> Validation date: 12 August 2026  
> Method: production build, current WordPress snapshot, 30 fixed human-authored problems, 40 validated website-theme-derived problems, multi-constraint, exact-title, content-type, conversation, scope, and controlled latency tests. Grading was manual and strict. Malformed candidates are excluded from every quality percentage.

## Executive result

V5 is a stabilization improvement in test validity, relationship safety, deterministic precomputation, and card selectivity. It does **not** meet the requested semantic or reliability targets on this run. The long sequential run encountered 12 client timeouts/upstream `EPIPE` failures; the separate controlled latency run completed 24/24 requests without a timeout.

| Metric | V4 | V5 |
| --- | ---: | ---: |
| Valid semantic tests | 102 (included 23 awkward probes) | 106 |
| Rejected malformed generated tests | Not enforced | 5 |
| Accepted | 52 | 45 |
| Partial | 28 | 27 |
| Not Accepted | 22 | 34 |
| Strict acceptance | 51.0% | 42.5% |
| Usable | 78.4% | 67.9% |
| Business-problem strict | 33.3% | 25/70 (35.7%) |
| Multi-constraint strict | 3/10 (30.0%) | 5/12 (41.7%) |
| Noisy-card occurrences | 28 | 26 |
| Exact-title success | 10/10 | 5/5 (100%) |
| Explicit content type | 5/5 | 2/5 (3 timed out) |
| Conversation success | 2/3 scenarios clean | 3/9 turns Accepted |
| Off-topic success | 5/5 | 5/5 (100%) |
| Timeout/no payload | 0 | 12 |
| P50 | 7703 ms | 11024 ms |
| P95 | 20042 ms | 60001 ms |

The V5 semantic percentages must not be interpreted as an improvement claim. Test quality is much better, but relevance remains below target and the long run was affected by provider/content transport failures.

## A. Realistic human-like business problems

| Metric | Result |
| --- | ---: |
| Tests | 30 |
| Accepted | 12 |
| Partial | 10 |
| Not Accepted | 8 |
| Strict | 40.0% |
| Usable | 73.3% |

Good direct mappings included multi-brand CMS, legacy monolith modernization, fragmented data architecture, field operations, Azure/data-center migration, media operations, and marketplace inventory. Weak mappings remained for infrastructure approvals, unified support data, field-incident prioritization, generic cloud accountability, and traffic-related website performance. Six user-reported/fixed-set requests timed out in the sequential run, including three of the four explicitly reported failures; the website-traffic query returned Sitecore rather than the stronger generic performance capability.

## B. Dynamically generated and validated business problems

| Metric | Result |
| --- | ---: |
| Accepted candidates used | 40 |
| Rejected malformed candidates | 5 |
| Accepted | 13 |
| Partial | 11 |
| Not Accepted | 16 |
| Strict | 32.5% |
| Usable | 60.0% |

Generation no longer extracts arbitrary nouns or concatenates title fragments. Candidates are complete visitor utterances expressing an identifiable problem. Validation rejects incomplete sentences, broken joins, malformed punctuation, implausible length, and candidates that do not express a business or technical problem.

The strongest generated-query areas were application modernization, CMS/content reuse, marketplace operations, data architecture, and cloud governance. Remaining false mappings included generic unigram/body matches in data preparation, metric governance, document classification, field prioritization, forestry, healthcare operations, and campaign operations.

## C. Multi-constraint queries

| Metric | Result |
| --- | ---: |
| Tests | 12 |
| Accepted | 5 |
| Partial | 4 |
| Not Accepted | 3 |
| Strict | 41.7% |
| Usable | 75.0% |

Scoring now tracks topic, problem, outcome, entity/platform, industry, and requested content type independently. Unsatisfied explicit dimensions add a contradiction penalty, and a card is rejected if any explicit constraint is unsatisfied. Headless CMS + travel, GeoAI + agriculture, data + media, Azure + accountability, and media + cloud-migration evidence were useful. Retail performance evidence, utilities field access, and financial-services DevSecOps still require better corpus-derived profile coverage.

## D. Exact-title regressions

5/5 passed. Canonical title normalization and exact lookup remain intact.

## E. Content-type regressions

2/5 completed successfully; the webinar no-match was transparent and the application-modernization whitepaper was correct. The first three requests timed out during the saturated sequential run, so the required 100% result was not demonstrated in this run.

## F. Conversation scenarios

Three of nine turns were strictly Accepted. Topic retention remains inconsistent when a follow-up combines an earlier performance problem with a newly introduced industry, and evidence follow-ups can drift away from the active topic. This remains a material limitation.

## G. Off-topic regressions

5/5 passed with no cards, including the football-result query. Scope behavior remains intact.

## False-bridge stabilization

The old bridge used one flat unigram intersection with a 0.12 threshold. V5 relationships are precomputed during cached index construction and require evidence from explicit service references, internal links, repeated strong multi-word phrases, exact technology identity, problem/outcome compatibility, structured taxonomy, or repeated distinctive concepts.

Generic relation terms—including growth, operations, platform, performance, development, business, digital, solution, and management—contribute no relationship evidence by themselves. A relationship must score at least 0.42 and contain a high-quality evidence class or multiple independent classes. Request-time bridge promotion additionally requires score 0.55 plus two evidence classes, and its ranking contribution is capped at 28 points.

## Card gating

Card selection now uses an independent reusable eligibility function rather than answer-context thresholds. It enforces requested content type, topic authority, business-problem compatibility, relative score, all explicit constraints, and service authority for recommendation/problem prompts. Editorial and case-study documents can support the generated answer but are not primary business-recommendation cards. Card count is never padded.

The development diagnostic reports constraint totals, satisfied constraints, contradictions, and the exact card rejection reason. Despite this, the measured noisy-card count was 26, above the target of 2. The final deterministic intent-preservation correction was added after this semantic sample so obviously problem-shaped prompts cannot be weakened to informational intent by semantic interpretation; it passed automated verification but requires another full live quality run before claiming a new noisy-card metric.

## Latency audit

No LLM call was added. Timings now isolate query understanding, index load, relationship scoring, ranking/retrieval, context construction, final generation, and total duration. Profile extraction and document relationships are constructed once in the five-minute cached index. Only matching a small set of precomputed evidence relationships remains request-time work.

| Concurrency | Success | Timeouts | P50 | P95 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 8/8 | 0 | 10136 ms | 14578 ms |
| 2 | 8/8 | 0 | 25015 ms | 26456 ms |
| 4 | 8/8 | 0 | 28939 ms | 30235 ms |

The deterministic relationship work is bounded and cached; observed latency is dominated by the existing query-understanding and final-generation provider calls. Provider contention remains visible as concurrency rises. The full sequential run's P95 of 60001 ms reflects 12 client timeouts and is not a healthy latency measurement.

## Verification

- Automated tests: 91 passed, 9 skipped.
- Typecheck: passed.
- Lint: passed.
- Production build: passed (sandboxed Turbopack could not bind its worker port; the approved unrestricted build passed).
- Valid semantic cases: 106.
- Controlled latency payloads: 24/24.
- Full semantic payloads: 94/106; 12 timeouts.

## Files changed in V5

- `src/lib/search-index.ts`
- `src/lib/search-retriever.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/debug/retrieval/route.ts`
- `src/lib/query-quality.test.ts`
- `scripts/v5-query-set.mjs`
- `scripts/generic-v5-test.mjs`
- `CHATBOT_GENERIC_TESTING_REPORT_V5.md`

## Remaining limitations

- Natural business-problem strict quality remains far below 75%.
- Some source pages have sparse structured problem, outcome, industry, or platform metadata, making strict multi-constraint satisfaction conservative.
- Answer context can still select a plausible but non-authoritative editorial page when no service profile is strong enough, even though card gating is stricter.
- Conversation constraint retention remains inconsistent.
- The external provider/content path can fail under long sequential evaluation; timeout/no-payload was not preserved in the full run.
- The final intent-preservation adjustment needs a fresh full live semantic run before its impact can be quantified.
