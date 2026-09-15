# Chatbot Generic Testing Report V12

## Scope and outcome

V12 preserves the V11 evidence-sufficiency and safe-abstention architecture and adds a stricter response-boundary alignment layer. Primary evidence still passes V11 validation. User-visible secondary detail, sources, cards, and CTA destinations now require an independent same-topic, authority, specificity, relation, and explicit content-type check. When no item passes, the direct answer remains and optional content is omitted.

The implementation also separates previously collapsed types including webinar/event, whitepaper/ebook, press release/media coverage, product/Kagen product, accelerator, award, technology, company, culture, and service variants. Exact normalized title, slug, and aliases are checked before near-title matching; near matching requires at least 88% token identity.

## Confirmed root causes

1. V11 validated answer evidence, but the response route later selected cards and sources from the full accepted match set with a relative score gate. A high-scoring neighboring page could therefore accompany a correct answer.
2. Secondary items did not have to prove an independent primary-field topic match. Body relationships and multi-hop technology associations could leak into visible cards.
3. Several API content types were flattened, preventing hard type constraints (notably webinar/event and ebook/whitepaper).
4. Deterministic topic extraction retained question glue words such as `is`, `an`, and `me`, weakening topic coverage for short queries.
5. Named-resource selection allowed loose substring identity, which could select a shorter neighboring title.

## Layered regression results

| Request | Intent | Content Type | Primary Answer | Secondary Detail | Primary Source | Related Sources | Cards | CTA | Overall | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| What is an API? | educational definition | none | PASS (V11 path preserved) | PASS | PASS: API page | PASS: unrelated Node.js rejected | PASS: 0–1 exact-topic | PASS: omitted for definition | PASS | Same-topic gate rejects a Node.js page that merely mentions APIs. |
| Show me AI blogs | resource discovery | blog | PASS | PASS | PASS: AI blog | PASS | PASS: blog only | PASS: Read the full article | PASS | Service page rejected despite topic match because type is explicit. |
| Latest AI webinar | latest resource | webinar | PASS | PASS | PASS: newest dated webinar | PASS | PASS: webinar only | PASS: webinar CTA | PASS | Event record rejected; valid webinar records sorted descending by date. |
| Healthcare whitepaper | resource discovery | whitepaper | PASS | PASS | PASS | PASS | PASS: whitepaper only | PASS | PASS | Whitepaper remains distinct from ebook/blog. |
| Healthcare ebook | resource discovery | ebook | PASS | PASS | PASS | PASS | PASS: ebook only | PASS | PASS | Ebook is a first-class requested type. |
| AI event | event discovery | event | PASS | PASS | PASS | PASS | PASS: event only | PASS | PASS | Event is no longer inferred as webinar. |
| Latest press release | latest announcement | press release | PASS | PASS | PASS | PASS | PASS: press release only | PASS | PASS | Explicit type and freshness are represented independently. |
| Kagen VOICE | product lookup | Kagen product | PASS | PASS | PASS: exact product identity | PASS | PASS: Kagen only | PASS: actual product URL only | PASS | Kagen is treated as first-class product evidence. |
| Summarize the blog [exact title] | summary | blog | PASS | PASS | PASS: exact title/slug/alias | PASS | PASS | PASS: article URL | PASS | Exact identity precedes >=88% near-title fallback. |
| AI definition with no exact Successive destination | educational definition | none | PASS | PASS: omitted | PASS | PASS: omitted | PASS: omitted | PASS: omitted | PASS | Short direct answer is retained without forced promotional content. |

The table records deterministic regression coverage of selection behavior; it does not claim a fresh live-model semantic grade for generated prose. V11’s 135-turn live evidence/safety results remain the baseline for primary answer and abstention behavior.

## Metrics

### Newly measured V12 response-alignment matrix

| Metric | Result | Target | Status |
| --- | ---: | ---: | --- |
| Secondary detail relevance | 100% (10/10) | >= 95% | PASS |
| Secondary detail accuracy | 100% (10/10) | >= 95% | PASS |
| Content-type accuracy | 100% (8/8) | >= 98% | PASS |
| Primary source relevance | 100% (9/9 applicable) | >= 98% | PASS |
| Related source relevance | 100% (10/10) | >= 95% | PASS |
| Card relevance | 100% (10/10) | >= 98% | PASS |
| CTA relevance | 100% (8/8 applicable) | >= 98% | PASS |
| CTA link accuracy | 100% (8/8 applicable; URL copied from selected API record) | 100% | PASS |
| Exact-title/entity retrieval | 100% (2/2) | >= 95% | PASS |
| Latest/freshness accuracy | 100% (2/2) | >= 95% | PASS |
| Unrelated secondary-content count | 0 | 0 | PASS |
| Unrelated-card count | 0 | 0 | PASS |
| Unrelated-CTA count | 0 | 0 | PASS |

### Preserved V11 primary/safety baseline

| Metric | Result | Target | Status |
| --- | ---: | ---: | --- |
| Primary answer relevance | 100% (40/40 V11 supported set) | >= 98% | PASS |
| Primary answer accuracy | 100% (40/40 V11 supported set) | >= 98% | PASS |
| Primary answer completeness | Not separately measured in V11 | >= 95% | NOT CLAIMED |
| Compound-question completeness | Covered by existing structured tests; no fresh live percentage | >= 95% | NOT CLAIMED |
| False-premise correction | Prompt/semantic path preserved; no fresh live percentage | >= 95% | NOT CLAIMED |
| Overall usable | 100% (135/135 V11 live turns) | — | BASELINE PASS |
| Overall strict acceptance | Not recomputed against the new 14-layer rubric | — | NOT CLAIMED |
| Hallucination count | 0 (V11 live baseline) | 0 | PASS |
| False-abstention count | 0 (V11 supported set) | <= 1 | PASS |

Percentages are not invented for dimensions that were not independently graded. A fresh live V12 corpus/model run is still required to claim compound completeness, false-premise correction, and overall strict acceptance under the expanded rubric.

## Behavior by content family

- Services/sub-services/expertise/solutions: explicit service requests accept service-family records; the strongest exact topic capability is primary. A service CTA requires the selected record URL.
- Blogs/articles: `post` records only; named titles use exact normalized title/slug/alias first. CTA is “Read the full article.”
- Case studies: case-study records only. Neighboring blogs/services cannot substitute.
- Industries: industry records are first-class; supporting records still need direct industry-topic coverage.
- Whitepapers/ebooks: represented and filtered separately.
- Webinars/events: represented and filtered separately. `latest` sorts valid selected records by descending API date. CTA avoids fabricated status-specific verbs; without explicit status metadata it uses “Learn more.”
- Products/Kagen: product-like API records are first-class; Kagen requests additionally require Kagen identity.
- Partners: partner/alliance records remain distinct from technology usage.
- Technology: exact technology identity remains required; company capability catalogs are permitted evidence for usage questions.
- Company/culture/careers/awards/accelerators: each is represented separately and retains structured V11 authority paths.
- Press/media: press release and media coverage are separate types.

## Files changed for V12

- `src/lib/query-understanding.ts` — expanded content-type vocabulary and cleaned deterministic topics.
- `src/lib/search-retriever.ts` — hard compatibility rules for newly separated types.
- `src/lib/response-alignment.ts` — independent secondary relevance, exact identity, freshness ordering, and CTA derivation.
- `src/app/api/chat/route.ts` — applies alignment before sources/cards/CTA and tightens named-resource matching.
- `src/lib/llm/openai-provider.ts` — instructs semantic interpretation to preserve explicit content types as hard constraints.
- `src/lib/response-alignment.test.ts` — generic unseen alignment regressions.

Other modified files in the worktree predate V12 and were preserved.

## Quality gates

| Gate | Result |
| --- | --- |
| Automated tests | PASS — 168 passed, 9 skipped (177 total) |
| TypeScript | PASS — `tsc --noEmit` |
| ESLint | PASS — `eslint .` |
| Production build | PASS — Next.js 16.2.11; sandboxed attempt could not bind Turbopack’s internal port, approved rerun succeeded |
| Diff whitespace validation | PASS — `git diff --check` |

## V11 vs V12

V11 decides whether evidence is sufficient to answer and keeps rejected evidence away from the LLM. V12 leaves that decision intact and adds a second, stricter decision for what may be shown after the direct answer. Consequently, a document can remain useful during candidate generation or primary synthesis yet still be excluded from related sources, cards, and CTAs.

## Remaining limitations

- Webinar/event status verbs such as “Register” or “Watch on demand” require reliable structured status/date metadata. V12 deliberately uses a neutral “Learn more” CTA when status is not proven.
- The current UI schema has cards and sources rather than a separate CTA object; V12 renders a validated CTA as an inline Markdown link derived from the selected API record.
- A fresh live V12 evaluation against the configured model and current API is still needed for new percentages on primary completeness, compound questions, false premises, and overall strict acceptance.
- Lexical primary-field topic matching is intentionally conservative and can omit a genuinely related secondary item; this is preferable to visible drift and does not weaken V11 primary answer validation.

## Explicit topic-switch follow-up

Conversation retrieval now resolves context by information need rather than concatenating recent user messages:

- A current turn with one or more explicit topics is retrieved independently and replaces stale topic-specific state.
- A current turn with no explicit topic inherits only the latest explicit subject, including content-type-only requests such as “Any case studies?”
- Multiple topics explicitly present in the current turn are preserved together for comparisons and relationships.
- Current deterministic topic dimensions override history-influenced semantic dimensions before ranking, preventing stale topics from re-entering through the semantic plan.

Regression coverage spans technology→technology, service→service, industry→industry/case study, product→product, partner→partner, service→blog, topic→whitepaper, five contextual follow-up forms, and four multi-topic relation forms. No named technology, service, industry, product, or partner allowlist was introduced.
