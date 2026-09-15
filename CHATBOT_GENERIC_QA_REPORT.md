# Generic Successive Chatbot — Implementation and QA Report

> Validated on 12 August 2026 against the configured live Successive WordPress content and OpenAI-compatible model. Responses below are concise summaries of the actual API responses, not replacement website claims. The full response remains traceable through its server-owned cards and sources.

## Architecture: Before vs After

| Concern | Before | After |
| --- | --- | --- |
| Query understanding | Ordered legacy intent keywords plus raw query normalization | Structured semantic interpretation separates conversational goal, topics, business problem, requested content type/action, entities, constraints, follow-up state, ambiguity, scope, and retrieval concepts |
| Topic model | Mostly query tokens and aliases | No fixed service taxonomy; every WordPress document gets a profile derived from title, slug, headings, aliases, and `service_type` |
| Problem statements | Raw words searched directly | LLM produces small general search hints; each hint is independently validated against WordPress documents |
| Retrieval | One scoring query across the eligible corpus | Candidate discovery through up to ten independent topic/problem plans, then field-aware relevance evaluation |
| About vs mention | A body occurrence could be sufficient, especially for one-token queries | Title, heading, and metadata authority is scored separately; short body-only hits receive an incidental-mention penalty |
| Content type | Primarily inferred through legacy intent | Explicit semantic content-type dimension adds compatibility bonus/penalty and can route evidence/resources without requiring exact phrases |
| Evidence | One best chunk per top lexical document | One best chunk per strongest validated plan; absolute and relative evidence thresholds remain |
| Cards | Same selected set as context; React implementation did not render cards | Higher authority threshold than context; incidental hits excluded; React and standalone widget both render server-owned cards |
| Off-topic | Weak matching content could answer an unrelated request | Semantic scope gate returns a deterministic Successive-focused boundary with no sources/cards |
| Debugging | Selected matches and a few aggregate fields | Original/normalized query, semantic plan, profiles, score components, penalties, selected/rejected status, reasons, final context/cards, confidence |
| Legacy code | Two ranking paths appeared current | Compatibility scorer/retriever explicitly marked deprecated; `/api/chat` remains on `search-retriever.ts` |

## Live QA Results

| Your Request | Chatbot Response | Your Acceptance/Feedback |
| --- | --- | --- |
| `What about AI?` | Produced a grounded AI overview and prioritized **Artificial Intelligence (AI) Development Company**, **AI/ML Model Development Services**, and **Data & Artificial Intelligence**. Shopify and Private Equity incidental mentions were excluded. | ✅ Accepted — understood a bare topic and selected authoritative AI pages. |
| `We have an old application and it is getting difficult to maintain.` | Explained application modernization and selected **Application Modernization**, **Application Modernization Services for Legacy Systems**, and a directly related modernization article. | ✅ Accepted — mapped natural problem language to website-validated modernization evidence. |
| `We have a lot of data but don't know what to do with it.` | Asked what kind of data the visitor is working with instead of returning weak random pages. | ✅ Accepted — ambiguity strategy correctly asked one useful clarification. |
| `We want something like ChatGPT for our employees.` | Selected generative-AI and AI-strategy capabilities, describing supported productivity, workflow, and intelligent-system possibilities. | ⚠️ Partially Accepted — the core intent and AI evidence were relevant, but an industry-specific healthcare page appeared ahead of more generally applicable enterprise evidence in one run. The semantic planner understood the need; ranking can still be improved when several authoritative pages share strong AI identity. |
| `Can you help banks?` | Connected banking to fintech applications, mobile banking, managed multicloud, and supported AI uses with three banking-specific sources. | ✅ Accepted — industry need was understood without requiring a page title. |
| `What technology do you work with?` | Answered from a retail digital-technology article (cloud, AI, IoT, mobile) but did not establish a complete company-wide technology view; strict card authority filtering returned no cards. | ⚠️ Partially Accepted — it stayed source-grounded and suppressed weak cards, but the question is extremely broad and the selected evidence was too retail-specific. A future corpus-level capability aggregation would improve this. |
| `Who won yesterday's cricket match?` | Returned the Successive-focused scope message with no cards or sources. | ✅ Accepted — did not use general model knowledge or misuse a cricket-themed thought-leadership article. |
| AI discussion → `Any case studies?` | Inherited AI and returned **Optimized AI Solutions for Enterprise Efficiency**, a case study about an AI document-intelligence bot. | ✅ Accepted — topic continuity and requested content type both worked. |
| AI discussion → `What about healthcare?` | Combined the recent AI subject with healthcare and returned AI-in-healthcare evidence. | ✅ Accepted — treated healthcare as a new conversational constraint, not an unrelated reset. |

## Automated Quality Set

`src/lib/query-quality-cases.ts` contains reusable behavioral cases spanning:

- AI, cloud, healthcare, commerce, data, and security;
- natural discovery and business-problem descriptions;
- recommendations, evidence, resources, comparisons, and follow-ups;
- messy phrasing and unsupported/off-topic requests;
- `mustPrefer`/`mustNotPrefer` structural expectations rather than fixed WordPress IDs.

The accompanying tests prove the generic authority invariant for AI, Cloud, Healthcare, Commerce, Security, and Automation: a document whose title/headings/metadata identify the topic must outrank a document that only mentions it in body text.

## Files Changed

| File | Change |
| --- | --- |
| `src/lib/query-understanding.ts` | New schema, resilient normalization, deterministic fallback, and retrieval-plan builder |
| `src/lib/llm/types.ts` | Added structured query-understanding contract and answer-plan input |
| `src/lib/llm/openai-provider.ts` | Added batched semantic interpreter and supplied the validated plan to grounded generation |
| `src/lib/search-index.ts` | Added website-derived topic profiles |
| `src/lib/search-retriever.ts` | Added multi-plan ranking, authority/field scoring, content-type compatibility, incidental penalties, and diagnostics |
| `src/app/api/chat/route.ts` | Integrated interpretation, scope/clarification handling, semantic retrieval, and stricter card selection |
| `src/app/api/debug/retrieval/route.ts` | Expanded non-production explainability output |
| `src/components/chat/chat-message.tsx` | Connected existing result-card UI to React chat responses |
| `src/lib/content-retriever.ts`, `src/lib/relevance-score.ts` | Marked non-chat compatibility path deprecated |
| `src/lib/query-quality-cases.ts` | Added reusable real-user evaluation dataset |
| `src/lib/query-quality.test.ts` | Added semantic-plan and generic authority tests |

## Validation Results

- `npm run typecheck`: passed.
- `npm test -- --run`: 4 files passed; 79 tests passed and 9 skipped.
- `npm run lint`: passed.
- `npm run build`: passed after rerunning outside the restricted sandbox, which initially prevented Turbopack from binding a local port.
- Live API QA: broad topic, problem statement, ambiguity, industry, off-topic, evidence follow-up, and constraint follow-up scenarios executed against configured services.

## Remaining Limitations

- The configured lightweight model can vary in query-plan quality; tolerant normalization falls back safely, but semantic quality is still model-dependent.
- Very broad questions such as “What technology do you work with?” need a website-derived corpus summary/aggregation to avoid over-relying on one authoritative but narrow page.
- Topic profiles are lexical and website-derived; there is still no embedding model or learned reranker.
- One best chunk per document remains the evidence unit, so a long page can have useful secondary evidence outside the selected chunk.
- The WordPress corpus is too large for one Next 2 MB cache entry. The implementation now relies on per-page five-minute `fetch` caching plus the in-process five-minute derived index; production can still consider a compact prebuilt index or external shared index to improve cold starts.
- The query interpreter adds one LLM call for non-greeting requests; the final grounded response remains the second and last normal LLM call.
- Multilingual input can currently require language preparation plus interpretation plus response generation; combining translation and interpretation is a future latency optimization.

## Acceptance Summary

The key failure is resolved architecturally: `what about ai` now prefers documents that identify themselves as AI content and excludes Shopify/Private Equity pages where AI is incidental. The same authority rule is tested across unrelated topics, business-problem language is expanded only as search hints, all Successive claims remain bounded by WordPress evidence, content-type follow-ups inherit conversation topics, weak cards are suppressed, and unrelated questions stay inside the assistant's scope.
