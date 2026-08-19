# Chatbot Company & Capabilities Testing Report V2

Date: 2026-08-19  
Source: configured Successive WordPress/custom API and Keka careers API only  
Public-site scraping/search: not used

## Executive result

The architecture now has a structured, API-driven company knowledge path. Company attributes, people, Global Capabilities, technologies, partners, culture, career benefits, awards, and live openings are routed to their authoritative API documents before broad search or answer generation. Production facts remain dynamic; tests use fictional fixtures.

The controlled V2 sample contained 40 requests: 30 standalone questions and 5 two-turn conversations. Manual evidence grading produced 28 Accepted, 9 Partial, and 3 Not Accepted: 70.0% strict and 92.5% usable. This is a smaller, targeted regression sample than the 125-request baseline, so percentages are directional rather than a like-for-like statistical replacement.

## Confirmed root causes and fixes

- Recursive ACF extraction flattened relationships and lost paths. Extraction now retains `path`, `label`, `value`, and semantic kind while keeping search text compatibility.
- Broad lexical ranking could prefer a blog, case study, or similarly named page. The index now assigns explicit authority roles and structured questions use canonical page endpoints.
- A company-role lookup initially selected the first matching page (for example, How We Work). Canonical slugs now win within each role.
- Person evidence was matched document-wide while an unrelated chunk was selected. Person records are now paired generically as name + designation and fuzzy matched from the current team arrays.
- Careers intent treated `application` and `role` too broadly. Employment routing now requires explicit employment context and no longer hijacks application-modernization/software-role questions.
- Rate limiting used only the shared IP. It now uses IP + session ID, preserving per-session protection without making unrelated QA/user sessions consume one bucket.
- Structured questions previously invoked semantic planning and full-corpus retrieval. They now use zero-LLM, canonical endpoint reads; latest-award lookup alone additionally loads the award collection.

## Architecture delivered

### Structured ACF and index

The extractor retains nested paths for repeaters, records, media metadata, headings, descriptions, and person records. Search documents carry these structured fields. Roles cover company, Global Capabilities, culture, careers, awards, partners, technology, service, industry, case study, blog, press release, product, contact, resource, and page fallbacks.

### Company attributes

The generic classifier recognizes overview, values, leadership, executives, board, advisors, certifications, global presence, person, capabilities, technologies, culture, career benefits, partners, and awards. Answers are composed only from current API fields. Missing evidence produces a bounded statement instead of an invented fact.

### Catalog and entity behavior

- Global Capabilities categories and their logo-repeater technologies are extracted dynamically.
- Partner categories and partner logos are extracted dynamically from the Partners & Alliances page.
- Person matching tolerates a small surname typo and returns the designation from the same API record.
- Safe visitor typo normalization is limited and generic; `valus`, `capabilites`, and similar high-confidence variants do not introduce company facts.
- Canonical page cards are emitted for structured answers; unrelated blogs/case studies are excluded.

## Controlled live test protocol

- Production build on isolated localhost port 3002
- Concurrency: 1
- Delay: 250ms after every request
- Unique session ID per standalone request
- Five two-turn conversation scenarios
- Request timeout: 65 seconds
- Raw results: `/tmp/chatbot-company-v2-live-results.json` (ephemeral local artifact)
- Repeatable runner: `scripts/company-capabilities-v2-live.mjs`

## Metrics

| Metric | Baseline report | V2 controlled sample |
| --- | ---: | ---: |
| Total | 125 | 40 |
| Accepted | 41 | 28 |
| Partial | 21 | 9 |
| Not Accepted | 63 | 3 |
| Strict | 32.8% | 70.0% |
| Usable | 49.6% | 92.5% |
| HTTP 429 | present in baseline failures | 0 |
| Errors/fetch failures | 28 combined errors | 1 fetch failure |
| Timeouts | included in baseline errors | 0 |
| P50 | 10,948ms | 88ms |
| P95 | 41,529ms | 14,508ms |
| Max | 60,001ms | 40,438ms |
| Zero-card responses | 69 | 3 |
| Irrelevant cards | 16 | 2 |
| Direct-answer-first | not recorded | 36/39 successful responses (92.3%) |

## Category grading

| Category | Tested | Accepted | Partial | Not accepted | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| About/company | 1 | 1 | 0 | 0 | Canonical About page |
| Core values | 4 | 3 | 0 | 1 | Failed typo was fixed after the run and covered by automated normalization |
| Leadership/person/board | 6 | 5 | 1 | 0 | Person designation passed; broad leadership output needed executive narrowing, fixed post-run |
| Certifications | 1 | 0 | 1 | 0 | Correct source, but API image labels are terse |
| Global presence | 1 | 0 | 0 | 1 | Transient fetch failure; no location was invented |
| Global capabilities | 4 | 4 | 0 | 0 | Canonical catalog page |
| Technologies/AI/DevOps/automation | 6 | 4 | 2 | 0 | Correct authority; some category answers were broader than requested |
| Culture | 1 | 0 | 1 | 0 | Correct page, noisy banner text remains |
| Careers/openings | 4 | 3 | 1 | 0 | Live count worked; React filtering was overly broad in one result |
| Awards | 2 | 1 | 1 | 0 | Latest record dynamic; general summary was brief |
| Partners | 6 | 5 | 1 | 0 | Correct page; direct AWS confirmation refined post-run |
| Natural business problems | 2 | 1 | 0 | 1 | Legacy modernization passed; document workflow mapped incorrectly |
| Short/vague | 1 | 1 | 0 | 0 | `partners` stayed on canonical page |
| Typo | 2 | 1 | 0 | 1 | Data-capabilities passed; core-value typo fixed post-run |
| Conversation context | 10 turns | 9 | 1 | 0 | Five conversations; careers opening turn initially used About, fixed post-run |

Counts overlap where a query validates more than one capability; overall grading does not double-count.

## Quality gates

- Automated tests: 115 passed, 9 intentionally skipped
- TypeScript: passed (`tsc --noEmit`)
- ESLint: passed
- Production build: passed
- HTTP 429 under controlled load: 0
- Static production person/partner/value fixtures: none
- Hindi in new Markdown/code comments: none

## Remaining limitations

1. Natural business-problem mapping still needs stronger evidence selection; one document-workflow query returned an unrelated healthcare system answer.
2. WordPress media labels can be filenames (`iso2`, timestamped logo names). The system preserves API truth but should add generic media-label cleanup without guessing brand/certification names.
3. One Global Presence request encountered a transient upstream fetch failure. The safe fallback did not invent locations, but retry/stale-cache resilience is still needed.
4. Some technology category questions return the correct catalog category but too much adjacent technology content.
5. Live job filtering needs a stricter skill-term test; a React query included jobs without explicit React evidence.
6. Latest-award lookup remains the slowest structured route because it loads the award collection.
7. The final post-run typo, leadership, career-authority, and direct-partner refinements passed automated checks and production build, but are identified separately from the frozen 40-request raw metrics to avoid manipulating grading.

## Files materially involved

- `src/lib/acf-extractor.ts`
- `src/lib/search-index.ts`
- `src/lib/search-retriever.ts`
- `src/lib/query-understanding.ts`
- `src/lib/structured-knowledge.ts`
- `src/lib/structured-knowledge.test.ts`
- `src/lib/careers-api.ts`
- `src/lib/careers-api.test.ts`
- `src/app/api/chat/route.ts`
- `scripts/company-capabilities-v2-live.mjs`

## Conclusion

The original failures were primarily authority and structure failures, not missing content. V2 makes authoritative page/field selection explicit and dynamic. Company and catalog questions are now fast and consistently grounded; remaining work is concentrated in generic business-problem retrieval, upstream resilience, media-label presentation, and fine-grained technology/job filtering.
