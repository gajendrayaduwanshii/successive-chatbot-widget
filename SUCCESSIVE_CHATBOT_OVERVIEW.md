# Successive Assistant — Technical and Functional Overview

**Current implementation reviewed:** 25 August 2026  
**Purpose:** concise project overview, demo guide, and developer handover

## 1. Project overview and motivation

Successive Assistant is a standalone, embeddable website chatbot for Successive Digital. It helps visitors discover published Successive services, capabilities, products such as Kagen, industries, case studies, articles, resources, events, company information, careers, people, partners, awards, and contact information through natural conversation.

The website contains a large, changing collection of pages and structured WordPress content. Visitors may not know the correct page name or navigation path, and may describe a business problem rather than ask for a named service. The assistant turns those questions into evidence-backed answers and useful routes into the website.

The project does not ask an LLM to recall Successive facts from its model weights. Internal model knowledge may be incomplete, outdated, or unsupported. Instead, current published Successive content is retrieved, ranked, validated, and supplied as evidence. The model's main job is to understand natural language and express the selected evidence conversationally.

The core objective is:

```text
User question
  -> understand intent, subject, constraints, and context
  -> find actual published Successive content
  -> rank and validate evidence
  -> generate a grounded answer
  -> show deterministic cards and sources
  -> offer only validated follow-up actions
```

Examples include “What AI services do you offer?”, “Can security checks be integrated into CI/CD?”, “Show a retail case study”, “Who is on the leadership team?”, “Tell me about Kagen VOICE”, “What is your culture like?”, and “How do I contact Successive?”

## 2. Technologies and architecture

| Layer | Technology / technique | Purpose |
|---|---|---|
| Web application | Next.js, React, TypeScript, Node.js runtime | Standalone chat application, embedded iframe UI, and server API |
| UI | Custom CSS/Tailwind CSS toolchain, Lucide React, React Markdown, remark-gfm | Responsive widget, icons, Markdown answers, cards, sources, and actions |
| Website widget | `successive-chat-widget.js` and CSS, iframe, `postMessage` | Add the chatbot to an external Successive page with configurable branding and placement |
| API | Next.js route handlers, JSON over HTTP, Zod | `/api/chat`, health/debug routes, request/response validation, CORS |
| Content | WordPress custom REST API (`successive-digital/v1`) and Keka careers API | Published website corpus and live job openings |
| Preparation | Recursive ACF extraction, HTML-to-text cleanup, normalization, page-role and capability profiles, overlapping chunks | Turn WordPress records into searchable documents |
| Retrieval | Exact/phrase/token/title/slug/alias matching, IDF weighting, spelling rules, controlled synonyms, query plans | High-precision lexical retrieval with paraphrase recall |
| Relationships | Internal links, parent/child IDs, section paths, taxonomy, explicit references, shared phrases/technologies/problems/outcomes | Connect related pages and provide evidence-backed navigation/boosts |
| Query routing | Deterministic intent rules plus optional LLM query understanding | Detect intent, content type, topic, entity, business problem, outcome, industry, constraints, and follow-ups |
| Ranking and safety | Weighted scores, role/type boosts, relationship bridge, thresholds, evidence validation, public/private relation rules | Select authoritative evidence and reject weak or unsupported claims |
| AI | Meta `meta/llama-3.1-8b-instruct`, NVIDIA OpenAI-compatible inference endpoint, prompt engineering, JSON outputs | Query interpretation, multilingual preparation, and grounded response generation |
| State | Browser `sessionStorage`; request-carried history and seen content; process-memory caches | Preserve a browser-tab conversation and reduce repeated work/results |
| Quality | Vitest, jsdom, TypeScript strict mode, ESLint, Prettier, build scripts and extensive QA scripts/reports | Unit, regression, widget, retrieval, evidence, and conversation verification |

Current architecture:

```text
Successive custom WordPress API + Keka jobs API
                    |
        fetch, clean, normalize, classify
                    |
       in-memory chunked search index (5 min)
                    |
 lexical scoring + aliases + corpus/structural relations
                    |
 deterministic and LLM-assisted intent/context planning
                    |
          ranking + evidence validation
                    |
     selected published evidence (maximum 5 results)
                    |
 NVIDIA OpenAI-compatible API -> Meta Llama 3.1 8B
                    |
 grounded answer + server-built cards/sources/actions
                    |
       React application / embeddable widget
```

There is **no embedding model, vector database, stored vector index, or cosine-similarity search in the current implementation**. “Semantic” behavior in code means LLM-assisted query interpretation, structured business concepts, controlled synonym expansion, and corpus-derived relationships. A true vector layer is therefore not part of the proven pipeline today.

## 3. Content sources and preparation

The primary knowledge source is the configured custom Successive WordPress endpoint, currently represented by `SUCCESSIVE_API_BASE_URL`. It returns editor content and complete recursive ACF data; the implementation does not scrape rendered pages and does not use the standard WordPress REST API for the main corpus.

The complete paginated corpus includes:

- posts and pages;
- accelerators, awards, careers, case studies, employee perspectives, industries, media coverage, partners, press releases, and thought leadership;
- service, expertise, pillar/sub-service, company, culture, leadership, location, contact, event/webinar, resource, whitepaper/report, technology, product/Kagen, and similar roles when their API type, slug, title, ACF structure, or content supports that classification.

Active jobs are fetched separately from Keka's public embedded-jobs API. Custom handling also extracts trusted organizations, leadership/people, capabilities, technologies, values, career benefits, partners, awards, locations, certifications, and public client facts from authoritative structured fields.

```text
Published API records
 -> paginate at up to 100 records/page (four concurrent WordPress requests)
 -> extract editor HTML and recursive ACF fields
 -> clean HTML, URLs, media, headings, descriptions, FAQs and structured fields
 -> normalize Unicode, punctuation, case and whitespace
 -> classify content role and build topic/capability profiles
 -> preserve IDs, type, title, slug, URL, image, dates, parent/menu order,
    taxonomy, internal links, service type and content quality
 -> create paragraph-preserving chunks (~1,800 characters, ~320 overlap)
 -> build the in-memory searchable corpus and relationships
```

New or updated WordPress content becomes available when the five-minute corpus/index cache revalidates. A stale corpus may be served for up to 30 minutes during a rebuild/upstream failure; canonical pages have their own five-minute cache and up-to-one-hour stale fallback. There is no webhook or persistent external index.

## 4. End-to-end query processing

```text
Widget input + recent history + seen results
 -> Zod validation, origin check, process-local rate limit
 -> greeting / structured / navigation fast paths when applicable
 -> language detection/translation (LLM only when English cannot be used directly)
 -> resolve a validated structured suggestion click or conversational follow-up
 -> deterministic understanding; optional LLM understanding for harder requests
 -> legacy content intent + detailed intent/context/content-type classification
 -> normalized retrieval query and up to 10 scoring plans
 -> lexical candidate scoring and relationship boosts
 -> content-type, role, entity, business-dimension and freshness adjustments
 -> minimum and relative cutoffs; top five matches
 -> evidence, requested-relation and public/private validation
 -> compact evidence context -> NVIDIA API -> Llama answer
 -> server builds aligned cards, sources and validated suggestion actions
 -> React/widget renders the result and stores the tab conversation
```

Simple requests may avoid the final LLM call. Greetings, contact/about navigation, collection listings, structured company facts, careers, confidential-data refusals, suggestion clicks, and safe fallbacks can use deterministic response branches. This improves reliability and avoids making the model reconstruct data the application already knows.

### Query understanding and application-level “training”

| Intent, context, or rule | Purpose | Example |
|---|---|---|
| Legacy intents: `products`, `product_detail`, `case_studies`, `blogs`, `events`, `resources`, `contact`, `about`, `page`, `general` | Fast routing for common website requests | “Show case studies” -> `case_studies` |
| Detailed intents: `explore`, `informational`, `discovery`, `solve_problem`, `recommendation`, `evidence`, `navigation`, `contact`, `resource`, `follow_up`, `off_topic` | Choose search and answer behavior | “Our cloud bill lacks ownership” -> `solve_problem` |
| Requested content types | Treat explicit service, case-study, blog, webinar, partner, industry, career, company, culture, leadership, award, Kagen product, etc. as constraints | “Show an AI case study” cannot silently become a service page |
| Query relations | Validate what the user asks the evidence to prove | `DEFINES`, `OFFERS`, `USES`, `SUPPORTS`, `PARTNER_OF`, `HAS_OFFICE_IN`, `HAS_PRODUCT`, `SERVES_INDUSTRY`, `HAS_CASE_STUDY`, `HAS_ARTICLE`, `SECURES`, `MODERNIZES`, `AUTOMATES`, `INTEGRATES`, `CONSULTS_ON`, `DESCRIBES` |
| Structured dimensions | Match problems and outcomes, not just nouns | topics, entities, domain, industry, platform, technical signals, desired outcomes, constraints |
| Answer mode/scope/time | Control definition, list, summary, recommendation, freshness, and company/entity authority | “latest press release” carries type and temporal intent |
| Conversation rules | Resolve pronouns/short follow-ups while dropping stale topics after a switch | “Any case studies?” can retain the current topic |
| Safety/evidence rules | Avoid implying private projects, prices, contracts, employee records, roadmaps, meetings, or security details from public similarity alone | Private/current client claims require explicit public evidence |
| Fallbacks | Clarify ambiguity or report that published evidence could not confirm the claim | Unsupported content does not become an invented answer |

This is **application-level training/configuration**, not model training. It consists of prompts, schemas, intent dictionaries, spelling corrections, aliases/synonyms, page roles, semantic/capability profiles, relationships, scoring weights, thresholds, validation, fallbacks, structured suggestions, and regression scenarios. No Llama fine-tuning or modification of model weights is present.

## 5. Retrieval, relations, ranking, and evidence

### Lexical retrieval

Queries and content are normalized to lowercase ASCII-like searchable text. Common request words are removed, selected misspellings are corrected, and short aliases such as “about”, “clients”, and “careers” are expanded. Each document contains title, slug, generated aliases/acronyms, headings, descriptions, recursive ACF text, FAQs, structured fields, taxonomy, and overlapping chunks.

Scoring rewards exact title, title phrase, canonical page identity, aliases, title tokens, exact section headings, slug/metadata matches, ordered bigrams/trigrams, exact content phrases, token coverage, and IDF-weighted overlap. For example, “DevSecOps” can strongly identify **DevSecOps Consulting Services** through its title/alias and then select the best supporting passage. Controlled synonym groups (for example DevSecOps/secure SDLC/shift-left/CI-CD security) improve paraphrase recall without pretending that a synonym alone proves a capability.

### Corpus-derived lexical relation layer

The current code does not contain a manually maintained table named `RELATED_SERVICE` or `RELATED_CASE_STUDY`. Instead, `buildSearchIndex` derives a compact relationship graph from the current corpus. Non-service documents can connect to service documents when evidence includes:

| Relationship evidence type | Meaning |
|---|---|
| `explicit-reference` | The page explicitly names the service/alias |
| `internal-link` | One page links to the other |
| `phrase` | Multiple distinctive two/three-word phrases overlap |
| `technology` | A distinctive technology aligns with service identity |
| `problem-outcome` | Multiple structured problem/outcome terms overlap |
| `taxonomy` | Structured industry/business-function terms overlap |
| `distinctive-concepts` | Several non-generic capability concepts overlap |

A relationship must score at least `0.42` and include a strong signal or multiple evidence types; each analyzed non-service document retains at most three service relations. For business problems, strong case-study/editorial/resource matches can bridge back to related services when a relation score is at least `0.55` with two evidence types. This helps “secure CI/CD” connect a relevant security story to an authoritative DevSecOps service rather than promoting an incidental mention.

Important qualification: expensive deep relationship/profile analysis runs only when the corpus has at most 250 items. Larger corpora retain structural links and lexical ranking but do not build these deep `relatedCapabilities` relations.

For navigation and suggestions, actual structural relation types are `PARENT`, `CHILD`, `SIBLING`, `SAME_SECTION`, `SAME_PAGE_GROUP`, and `DIRECTLY_CONNECTED`. They are inferred from WordPress parent IDs, common parents, URL sections, taxonomy, internal links, page roles, and controlled company-page groups.

### Semantic behavior and hybrid ranking

No vector retrieval is implemented. The semantic-style components are:

- deterministic business-signal extraction and optional Llama query interpretation;
- up to ten alternative search plans derived from topics, retrieval concepts, and the business problem;
- controlled synonym expansion;
- capability profiles and corpus-derived relation bridges.

The effective hybrid rank is therefore:

```text
exact/title/phrase/token/alias score
+ content-type and page-role fit
+ topic/problem/outcome/industry/entity/functional fit
+ relationship bridge and optional freshness
- low authority, weak coverage, mismatch, legal/low-quality penalties
```

Candidates normally require a score of at least `48`; results must also remain within 65% of the best accepted score and contain a searchable passage. Exact canonical pages can narrow the result pool to that page. Evidence validation then checks subject coverage, requested attribute/relation, authoritative role, explicit content-type compatibility, and private/public scope. Controlled recovery can restore a rejected candidate only when it independently has authoritative identity/capability signals.

The retriever returns at most five ranked documents and one best passage per document. The LLM context is deduplicated and limited to 3,000 JSON characters (up to 320 excerpt and 900 content characters per item). The API accepts at most ten history messages; the final LLM also sees at most ten. Output schemas allow an 8,000-character answer, six cards, six sources, and four suggestions, although common UI branches present fewer.

## 6. Topic versus individual-page behavior

The suggestion system classifies a response as `TOPIC_CONTEXT`, `INDIVIDUAL_PAGE_CONTEXT`, or `CATEGORY_LISTING_CONTEXT`.

- **Topic context** (for example Security/DevSecOps) groups strongly related actual content by role, such as a service, case study, article, or accelerator. A similarity-only weak candidate is excluded.
- **Individual page context** (for example About, Culture, a named person, or a specific company page) uses structural/site-navigation relations: parent, child, sibling, direct link, same section, or a controlled complementary company group.
- **Category listing context** navigates from a resolved listing page to exact collection members.

The rule is simple: if an eligible target resolves to a current corpus identity, a suggestion may appear; if no eligible target exists, it does not. An individual About or Culture page is not treated as a commercial service, so the system avoids generic prompts such as “How can About Us help my business?” Structured actions are revalidated when clicked; labels are display text, not executable search semantics.

## 7. LLM and NVIDIA setup

The supplied environment example confirms:

```text
AI_PROVIDER=nvidia
AI_MODEL=meta/llama-3.1-8b-instruct
AI_BASE_URL=https://integrate.api.nvidia.com/v1
```

Meta provides the Llama model. NVIDIA supplies the current OpenAI-compatible inference/API endpoint. The `openai` JavaScript client calls that endpoint; the API key stays server-side.

```text
User question + conversation/query understanding
                 +
ranked, validated Successive website evidence
                 +
grounding/system instructions
                 |
     NVIDIA inference -> Meta Llama 3.1 8B
                 |
       conversational grounded answer
```

The model is not the source of Successive knowledge. Prompts instruct it to use only supplied chunks, correct supported false premises, avoid unsupported negatives and claims, preserve official names, ignore instructions embedded in website content, and return schema-compatible JSON. The server—not the model—constructs final cards and sources from WordPress records.

LLM calls use no client retry: query understanding has an 8-second timeout, language preparation 12 seconds, and answer generation 15 seconds. Deterministic understanding and deterministic safe responses cover selected provider failures or routes.

### Current Llama 3.1 8B observations

The 8B model works reasonably for direct, well-evidenced questions. More complex business problems, ambiguous wording, several simultaneous constraints, multi-turn topic retention, choosing among competing evidence, synthesizing multiple sources, detailed instruction following, and consistent response structure can be less reliable. That is a plausible current bottleneck and one reason the application repeatedly strengthens retrieval, relations, prompts, and validation.

It is not the only possible cause. A poor answer may originate in missing/weak website content, role classification, retrieval, relationship construction, ranking, context selection, prompt behavior, or model capability. Current QA reports contain both successful scenarios and remaining false abstentions/misalignment cases; they should be treated as regression evidence, not a claim that every issue is model-caused.

## 8. Answer, cards, sources, and suggestions

- **Answer:** Llama synthesizes selected evidence for general grounded requests; deterministic routes answer structured facts, navigation, collections, action clicks, and safe fallbacks.
- **Cards:** the server creates cards from accepted WordPress documents (type, title, description, URL, optional image/badge/service type). Card alignment applies additional score and identity checks.
- **Sources:** canonical titles and URLs come from accepted documents. The UI displays them in a collapsible source list.
- **Suggestions:** the server emits validated structured actions, not free-form LLM links. Key fields include `intent`, `contextType`, `sourcePageRole`, `targetContentType`, `targetResourceId`, `targetUrl`, `relationType`, `relation`, and `resultKeys`. On click, `resultKeys` resolve again against the current corpus before results render.

The standalone React UI and external widget retain the conversation and a generated session ID in `sessionStorage`, send the last ten messages and up to 500 seen content identities, offer retry/clear controls, render Markdown, and dispatch basic browser events for submissions, responses, links, and errors. There is no server-side conversation database.

## 9. Current achievement and end-to-end examples

The project is already implemented end to end: live published content -> ingestion -> normalization/chunking -> lexical and relation-based retrieval -> intent/context routing -> ranking and evidence validation -> Llama through NVIDIA -> answer -> cards -> sources -> validated suggestions -> embeddable UI. The architecture is therefore proven with the current baseline model. A stronger model can be evaluated without rebuilding ingestion, retrieval, validation, response contracts, or the widget.

Representative current flows:

1. **“What AI services do you offer?”** -> products/service discovery -> normalized AI topic and service-type constraint -> authoritative service pages ranked above incidental articles -> evidence synthesis -> service cards/sources -> related validated content actions.
2. **“Can security checks be integrated into delivery pipelines?”** -> `solve_problem` / `SECURES` -> DevSecOps synonym expansion and title/phrase matching -> service-role and capability boosts -> **DevSecOps Consulting Services** evidence -> grounded explanation -> security service card/source and related content where a strong relation exists.
3. **“Who is on the leadership team?”** -> structured company/person request -> authoritative About ACF leadership fields -> deterministic published names/designations -> About source -> individual-page navigation only when structurally eligible.
4. **“What is your culture like?”** -> culture/company context -> canonical `our-culture` page and structured values -> grounded/deterministic company answer -> Culture card/source -> About/leadership/careers navigation only when controlled page relationships resolve.
5. **“Show a cloud migration customer story.”** -> evidence + case-study content constraint -> lexical/business-dimension ranking -> authoritative case-study validation -> top published story -> answer, case-study card/source, and valid evidence/related actions.

## 10. Limits, production readiness, and controlled model evaluation

### Current limitations

| Area | Current limitation |
|---|---|
| Content | Answers depend on current published API content and its structure/quality. Missing or unpublished facts cannot be confirmed. |
| Retrieval | No true embedding/vector search. Controlled synonyms and relationships may miss novel paraphrases; weak or ambiguous cross-page relationships still need tuning. Deep capability relations are skipped above 250 corpus items. |
| LLM | Llama 3.1 8B can be inconsistent on complex, multi-constraint, multi-source, multi-turn, or highly structured requests. |
| API/infrastructure | WordPress has 12-second request timeouts and one retry; LLM calls have 8/12/15-second timeouts and no retries. Account/model rate, concurrency, pricing, SLA, and production entitlement are **not confirmed from current implementation**. |
| State | History is browser-tab/session based and sent with each request; there is no durable server-side conversation store. |
| Cache/index | Process-memory caches are instance-local and rebuilt from WordPress. No hosted persistent search index exists. |
| Rate limiting | Basic limit is 20 requests/minute per IP/session in process memory; it is not distributed across serverless instances. |
| UI | The widget has client-side retry and graceful storage failure, but no streaming response protocol; answers are animated after the full JSON response arrives. |
| Operations | Health and development retrieval diagnostics exist. Centralized production monitoring, distributed rate limiting, formal production SLA/support, and deployment autoscaling configuration are **not confirmed from current implementation**. |

The current NVIDIA endpoint is suitable for the prototype shown by the repository, but its account-specific capacity and production terms cannot be inferred from code. A production-grade inference deployment may improve capacity, concurrency, reliability, monitoring, security/lifecycle support, and operational predictability. It does not automatically improve answer intelligence.

A stronger **model** may improve reasoning, ambiguous-query handling, evidence synthesis, instruction following, multi-turn understanding, and structure. Better **infrastructure** improves service capacity and reliability. These are separate decisions.

### Model comparison before major re-architecture

Freeze the current corpus snapshot, retrieval/ranking/relations, prompt, validation, and test cases. Change primarily the model and compare the current baseline with Qwen3-32B and GPT-5.6 Sol. Availability, endpoint compatibility, model identifiers, and commercial terms for the two candidates are **not confirmed from current implementation** and must be established before testing.

| Metric | Llama 3.1 8B | Qwen3-32B | GPT-5.6 Sol |
|---|---|---|---|
| Response accuracy | Test baseline | Test | Test |
| Relevance | Test baseline | Test | Test |
| Business-problem understanding | Test baseline | Test | Test |
| Complex/multi-constraint queries | Test baseline | Test | Test |
| Multi-turn context | Test baseline | Test | Test |
| Evidence selection and synthesis | Test baseline | Test | Test |
| Instruction following/structure | Test baseline | Test | Test |
| Latency | Measure | Measure | Measure |
| Cost | Compare | Compare | Compare |

If quality rises significantly with the pipeline held constant, model capability is an important bottleneck. If results remain similarly weak, retrieval/content/ranking needs more work. If failure categories differ, improve the responsible layer selectively. This controlled experiment avoids unnecessary architecture rewrites.

Recommended sequence:

1. Freeze the current architecture and a dated content snapshot as the baseline.
2. Build a fixed evaluation set from real direct, business-problem, multi-constraint, multilingual, follow-up, false-premise, and unsupported/private scenarios.
3. Run identical evidence and prompts against Llama 3.1 8B, Qwen3-32B, and GPT-5.6 Sol.
4. Score accuracy, grounding, relevance, context, evidence use, structure, latency, and cost; record deterministic and model failures separately.
5. Improve only the responsible layer, then select the production model and infrastructure from measured results.

## 11. Important project files

| File | Responsibility |
|---|---|
| `src/components/chat/chat-window.tsx` | Main React chat state, API calls, history/seen content, session storage, iframe messaging |
| `src/components/chat/chat-message.tsx`, `result-card.tsx` | Markdown answers, cards, sources, validated suggestion buttons |
| `public/successive-chat-widget.js`, `.css` | External website launcher, iframe integration, configuration and session behavior |
| `src/app/api/chat/route.ts` | End-to-end request orchestration, deterministic routes, retrieval, validation, LLM, output assembly |
| `src/lib/successive-api.ts` | Complete custom WordPress API ingestion, pagination, concurrency, retry, caching/stale behavior |
| `src/lib/careers-api.ts` | Keka active-jobs integration and caching |
| `src/lib/acf-extractor.ts`, `content-normalizer.ts`, `search-index.ts` | Recursive ACF extraction, normalized records, roles, chunks, profiles and corpus relationships |
| `src/lib/search-retriever.ts` | Query normalization, synonyms, lexical scoring, query plans, hybrid ranking and thresholds |
| `src/lib/query-understanding.ts`, `intent-detector.ts`, `query-facets.ts` | Detailed/deterministic understanding, legacy routing, multi-facet relations |
| `src/lib/evidence-validation.ts`, `response-alignment.ts` | Evidence sufficiency/safety and card/CTA alignment |
| `src/lib/suggestion-actions.ts` | Topic, individual-page and category relationships; structured action creation and revalidation |
| `src/lib/structured-knowledge.ts` | Authoritative extraction/answers for company, people, clients, partners, culture, awards, etc. |
| `src/lib/llm/openai-provider.ts`, `schemas.ts`, `env.ts` | NVIDIA-compatible LLM client, prompts/timeouts, response/action schemas, configuration |
| `src/lib/related-context.ts` | Deduplicated 3,000-character LLM evidence budget |
| `src/lib/*.test.ts`, `scripts/*.mjs`, QA reports | Unit, regression, live conversation, suggestion-contract and audit coverage |

At review time, `npm test -- --run` reports **10 passing test files, 321 passing tests, and 9 skipped tests**.

## 12. Five-minute demo talk track

1. Successive Assistant is a conversational guide to published Successive services, work, resources, company information, and contact paths.
2. We built it because visitors describe needs naturally and should not have to know the site's page structure.
3. It is a Next.js/React/TypeScript application with an embeddable website widget and a server-side JSON API.
4. Its knowledge comes from the custom Successive WordPress API, recursive ACF content, and the Keka jobs feed—not from Llama's memory.
5. Content is cleaned, classified by role, split into searchable passages, and cached in an in-memory index.
6. Lexical search strongly rewards exact titles, phrases, aliases, headings, and company terminology; controlled synonyms help with paraphrases.
7. A corpus-derived relation layer uses explicit references, links, phrases, technology, problems/outcomes, and taxonomy; page navigation also uses parent/child/sibling/section relations.
8. There is no vector database today. Semantic-style recall comes from intent/query planning, synonyms, structured profiles, and relations, then combines with lexical scoring in the final rank.
9. Application-level “training” means prompts, intents, aliases, roles, rules, thresholds, validation, suggestions, and regression tests—not Llama fine-tuning.
10. Meta Llama 3.1 8B runs through NVIDIA's OpenAI-compatible API and writes answers only from the selected Successive evidence; the server creates cards, sources, and validated actions.
11. The complete architecture is working end to end, while the current 8B model, retrieval gaps, website content, and prototype infrastructure can each affect harder scenarios.
12. The next step is a controlled same-pipeline comparison of Llama 3.1 8B, Qwen3-32B, and GPT-5.6 Sol, followed by a production model/infrastructure decision based on quality, latency, reliability, and cost.
