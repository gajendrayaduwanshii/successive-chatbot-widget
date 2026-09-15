# Successive Chatbot — Final Generic Fix Report

> Date: 20 August 2026 (Asia/Kolkata)  
> Branch: `data-12-aug-4pm`  
> Runtime: fresh local production build, `POST /api/chat`, concurrency 1, 400 ms gap, 40 s timeout.  
> Grading: conservative intent/evidence/completeness heuristic; HTTP 200 alone is not a pass.

## Executive Summary

The generic patch improves exact-resource/discovery separation, structured company-location presentation, list-mode cardinality, company-certification versus security-capability routing, explicit false-premise correction, and source exposure when cards are suppressed. It does not add query-equality branches or static answers.

The fresh post-fix validation executed **322 turns**: 50 QA requests, 168 unseen requests, and 104 turns across 25 conversations. There were **0 transport errors** and **0 HTTP 429 responses**.

| Population | Before | After | Strict before → after | Usable before → after |
| --- | --- | --- | ---: | ---: |
| QA 50 | 39 PASS / 9 PARTIAL / 2 FAIL | 43 PASS / 7 PARTIAL / 0 FAIL | 78.0% → 86.0% | 96.0% → 100.0% |
| Unseen 168 | 104 PASS / 31 PARTIAL / 33 FAIL | 112 PASS / 21 PARTIAL / 35 FAIL | 61.9% → 66.7% | 80.4% → 79.2% |
| Multi-turn | 51 PASS / 2 PARTIAL / 31 FAIL (84 turns/20 conversations) | 60 PASS / 25 PARTIAL / 19 FAIL (104 turns/25 conversations) | 60.7% → 57.7% | 63.1% → 81.7% |

The populations and grading details differ for the expanded multi-turn run, so its percentage movement is directional. The release targets are **not met**. The patch is materially safer on the addressed regressions, but broad supported-topic recovery, freshness, multi-intent coverage, and conversation-state quality still need work.

## Root Causes

- Exact named-resource detection treated broad discovery grammar as an exact title.
- Evidence validation could collapse a deterministic complete collection to one item.
- Company location data was rendered as raw CMS fields instead of visitor-facing facts.
- Company certifications and security/compliance capabilities shared keywords without relation-level disambiguation.
- Negative premises were not enforced at the final answer boundary.
- Sources were coupled to card eligibility, so grounded answers could expose no source when a card was correctly suppressed.
- Natural portfolio questions such as “which industries do you serve?” were not consistently recognized as explicit collection requests.

## Files Changed

- `src/app/api/chat/route.ts`
- `src/lib/query-understanding.ts`
- `src/lib/query-quality.test.ts`
- `src/lib/structured-knowledge.ts`
- `src/lib/structured-knowledge.test.ts`
- `CHATBOT_FINAL_GENERIC_FIX_REPORT.md`

## Supported-Topic Abstention Fix

The resource-intent and structured-authority branches now preserve more authoritative evidence before normal response generation. Exact identity, deterministic collections, structured company facts, and aligned sources are handled before weak generic presentation paths.

The conservative supported-topic heuristic still found **33 false/weak abstentions**, unchanged from the same heuristic on the prior runtime. Remaining examples include product engineering, secure SDLC, DevOps/security, workflow automation, some industry combinations, and typed freshness requests. Global thresholds were not lowered to hide these failures.

## Location / Structured Field Fix

Physical-company location intent is separated from GIS, geospatial, location analytics, and Location Intelligence service intent. About/contact authority is used for physical offices. `country icon`, `footer-icon-*`, internal field labels, and historical preambles are removed from the answer.

The fresh suite detected **0 raw structured-label leaks**, compared with repeated raw `country icon`/`footer-icon` failures in final validation. Office responses now provide direct prose plus supported published addresses. A remaining limitation is that the current source payload does not reliably bind each independent address field to a country field, so ambiguous address-country pairs are not guessed.

## Overview vs List Fix

Response mode is determined from explicit list grammar rather than the number of retrieved documents. Ordinary “tell me about X” and “X services” prompts remain overview/detail requests. Natural complete-portfolio requests for industries, services, offerings, categories, and technologies enter collection mode only when their grammar asks for the available/served/covered set.

## List Completeness Fix

Deterministic collection results bypass per-document evidence validation that previously reduced a full collection to one card. The answer now reports either the complete total or **“Showing N of total”**, and the displayed cards/sources use the same presented set.

The broad list proxy remained **40.0% strict**, while usable improved **66.7% → 73.3%**. No cardinality mismatch was observed in the patched collection-response branch, but several catalog families still fail before reaching that branch.

## Resource Intent Fix

Quoted titles, URLs, and explicit called/named/titled grammar remain exact-resource requests. Unquoted “find/show an article about X” grammar is treated as typed discovery. Summary/explanation grammar may resolve a high-overlap descriptive partial title; missing exact resources remain clearly marked missing and can offer a related alternative without auto-substitution.

Some partial-title and typed discovery cases still abstain, including the API-status-code descriptive title and cloud-cost article discovery. This is now a retrieval/evidence-recovery limitation rather than broad discovery being labeled as an exact-title miss.

## False-Premise Fix

For a supported negative premise, the final answer boundary adds an explicit correction before the evidence-backed answer. Generated strong negatives (`does not`, `cannot`, `has no`, `only`) that conflict with accepted evidence are replaced by deterministic grounded synthesis.

False-premise strict accuracy improved **28.0% → 68.0%** on 25 post-fix premise tests. Unsupported strong-negative claims detected without evidence: **0**. Remaining failures occur when retrieval fails before a supported correction can be constructed.

## Business-Problem Routing Fix

Existing problem/outcome concepts remain separate from requested content type, preventing generic nouns such as product, application, content, cloud, and security from automatically selecting a resource class. This patch preserves those mappings and prevents compliance-capability language from being consumed by the company-certification route.

Problem-to-capability recovery remains incomplete for manual support work, delayed security reviews, marketplace scaling, and some cross-domain recommendations.

## Security/DevSecOps Fix

Continuous compliance, security automation, pipeline, SDLC, DevSecOps, application security, and cloud-security wording no longer routes to company certifications. Explicit company certification/accreditation/standards questions continue to use structured company facts. Unit regressions cover both sides of this collision.

Authoritative service discovery still false-abstains on some secure-SDLC and DevOps/security variants; this is recorded as a remaining evidence-coverage issue.

## Product/Partner Fix

Formal partnerships remain provable only from authoritative partner evidence. Product/service/news nouns remain semantic context unless request grammar explicitly asks for that content type. The patch does not infer formal alliances from ordinary technology usage.

Kagen relationship follow-ups and combined product-plus-latest-news requests remain inconsistent when retrieval loses the active product relation.

## Freshness Fix

The existing typed-latest route continues to filter for compatible content type and topical relevance before sorting by a valid modified date. Empty matching sets safely abstain rather than substituting an unrelated newest item.

Freshness usable improved **53.8% → 69.2%**, while strict remained **23.1%** across 13 freshness prompts. Current weaknesses include newest case study, press announcement, and AI media coverage discovery.

## Multi-Intent Fix

Content-type inference is more conservative, which reduces collisions where words such as product or application are merely part of the subject. However, the architecture still does not maintain an explicit per-facet completion ledger; combined capability + industry + resource and product + news prompts can answer only one facet or abstain.

## Multi-Turn Fix

Twenty-five conversations exercised topic retention, type changes, pronouns, ordinal selection, alternatives, explicit switches, product relations, business-problem switches, unsupported pivots, and show-all follow-ups. Results were **60 PASS / 25 PARTIAL / 19 FAIL**, or **57.7% strict / 81.7% usable** across 104 turns.

Usability improved, but strict context accuracy is below target. Remaining failures include terse capability follow-ups, ordinal resource selection, product relationship retention, and topic-preserving case-study switches.

## Answer/Source/Card/CTA Quality

Grounded sources are now exposed independently of card acceptance: suppressing a weak/promotional card no longer automatically removes the aligned primary source. Normal cards remain capped and pass through topic/type/relation eligibility. The source/card/inline-link exposure proxy was **82.6%** post-fix versus **83.8%** before; the slight decline reflects more safe abstentions and card suppression, not detected unrelated cards.

Automated checks found **0 raw-field leaks**, **0 internal retrieval terminology leaks**, **0 unsupported strong-negative claims**, and **0 unrelated-card flags**. Thirty conversation turns had no card/source/inline link, including valid structured/unsupported answers and unresolved follow-ups. CTA correctness was inspected through alignment rules; no independent semantic CTA oracle is available, so a numeric “wrong CTA = 0” is not claimed.

## QA 50 Regression

**43 PASS / 7 PARTIAL / 0 FAIL — 86.0% strict, 100.0% usable.** This improves the final-validation result of **39 / 9 / 2 — 78.0% strict, 96.0% usable**, but remains below the requested 95% strict target.

## 150+ Unseen Results

**112 PASS / 21 PARTIAL / 35 FAIL — 66.7% strict, 79.2% usable** across 168 prompts. Before the patch, the same-size run was **104 / 31 / 33 — 61.9% strict, 80.4% usable**. More partials became decisive passes, but several cases also became safe failures rather than weakly supported partials; usable therefore decreased slightly.

## 25 Multi-Turn Conversation Results

**60 PASS / 25 PARTIAL / 19 FAIL — 57.7% strict, 81.7% usable** across 104 turns in 25 conversations. The earlier validation used only 20 conversations/84 turns, so this is an expanded and harder population rather than a controlled percentage comparison.

## Failure-Family Metrics

| Metric | Before | After |
| --- | ---: | ---: |
| Supported-topic false/weak abstentions (heuristic) | 33 | 33 |
| Raw structured-label leakage | repeated in location cases | 0 |
| False-premise strict | 28.0% | 68.0% |
| Unsupported strong negative without evidence | 0 | 0 |
| List proxy strict / usable | 40.0% / 66.7% | 40.0% / 73.3% |
| Freshness strict / usable | 23.1% / 53.8% | 23.1% / 69.2% |
| Company-attribute strict / usable | 28.6% / 52.4% | 33.3% / 57.1% |
| Source/card/inline-link exposure | 83.8% | 82.6% |
| Raw internal terminology | not separately reported | 0 |
| Unrelated cards (automated conservative flag) | 0 | 0 |
| Hallucinated private facts | 0 | 0 |

Wrong-entity, wrong-relation, wrong-primary-source, multi-intent omission, context-loss, and wrong-CTA counts require semantic human labels that the current heuristic runner does not emit reliably. Their observed cases are represented in PASS/PARTIAL/FAIL and the limitations below; inventing precise zero counts would be misleading.

## Quality Gates

- Automated tests: **240 passed, 9 intentionally skipped**.
- TypeScript (`tsc --noEmit`): **passed**.
- ESLint: **passed**.
- Production build: **passed** (required running outside the restricted sandbox because Turbopack binds an internal helper port).
- `git diff --check`: **passed**.
- Runtime: **322/322 responses completed**, 0 transport errors, 0 HTTP 429.
- Combined runtime P50: **2741 ms**; P95: **14963 ms**.

## Remaining Limitations

- Supported-topic false abstention is still the largest blocker; authoritative service/capability recovery needs relation-aware evidence validation without globally lowering thresholds.
- Freshness strict accuracy remains far below the requested 95% target.
- Multi-intent requests need explicit facet extraction and completion validation.
- Multi-turn state is reconstructed from bounded history rather than persisted as the full structured state requested in the brief.
- Partial-title uniqueness resolution needs a stronger ambiguity check.
- Several structured catalogs do not reach deterministic collection mode for all natural morphology.
- Address fields are clean but cannot always be assigned a country label without an explicit source relationship.
- The strict release targets were not achieved; this report does **not** recommend unconditional final release.
