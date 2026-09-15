# Chatbot Generic Testing Report

> **Validation date:** 12 August 2026  
> **Method:** Initial testing pass only. No chatbot implementation code was changed. Topics were discovered from the configured live Successive WordPress API before queries were generated. Every row below records an actual `/api/chat` execution; where the client received no payload before its timeout, that outcome is recorded explicitly rather than replaced with a predicted answer. Long answers are represented by faithful excerpts plus the actual returned card titles.

| Your Request | Chatbot Response | Your Acceptance/Feedback |
| ------------ | ---------------- | ------------------------ |
| `Location intelligence` | “Location intelligence… helps enterprises turn location data into operational intelligence…” Card: **GIS & GeoAI Consulting Services**. | ✅ **Accepted** — short query resolved to authoritative GIS/GeoAI content, not incidental location mentions. |
| `What does Successive do with geospatial data?` | Returned an **About Us** description and no cards/sources. | ❌ **Not Accepted** — the `what does Successive` phrasing triggered company intent and suppressed the geospatial topic. |
| `Can you help us make better decisions from maps and location data?` | Explained actionable location intelligence. Card: **Turn Location Data Into Decisions With Enterprise Esri ArcGIS Solutions**. | ✅ **Accepted** — natural business wording mapped to authoritative ArcGIS evidence. |
| `FinOps` | Explained cloud cost optimization. Cards: **FinOps and Cloud Optimization Services**, **Cloud FinOps guide**, **FinOps Consulting Services**. | ✅ **Accepted** — strong short-query authority and relevant cards. |
| `Our cloud bill keeps growing and we cannot explain the spend.` | No API payload was received before the live-test timeout. | ❌ **Not Accepted** — a real visitor received no answer; the problem is infrastructure/latency rather than a judged semantic response. |
| `Do you have capabilities around infrastructure-as-code security?` | No API payload was received before timeout. | ❌ **Not Accepted** — no usable result despite live IaC posture content. |
| `Tell me about cloud identity rightsizing` | No API payload was received before timeout. | ❌ **Not Accepted** — no usable result despite a dedicated Cloud IAM rights-sizing accelerator. |
| `Can you assess our cloud security posture quickly?` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer despite CNAPP/CSPM posture content. |
| `Maritime software` | No API payload was received before timeout. | ❌ **Not Accepted** — short authoritative topic could not be evaluated because request produced no payload. |
| `We need to modernize software used by shipping operations.` | No API payload was received before timeout. | ❌ **Not Accepted** — no actual answer for a supported maritime modernization need. |
| `Headless CMS` | No API payload was received before timeout in the first broad batch. | ❌ **Not Accepted** — later controlled conversation succeeded, but this actual request did not complete. |
| `Could a decoupled content platform help our global teams?` | No API payload was received before timeout. | ❌ **Not Accepted** — business-language synonym handling was not observable due to request failure. |
| `Virtual reality` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer despite dedicated VR content. |
| `Can you build augmented-reality experiences?` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer despite dedicated AR content. |
| `What can Successive do with IoT?` | No API payload was received before timeout. | ❌ **Not Accepted** — no usable answer for a supported technology topic. |
| `Modern data architecture` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer despite an authoritative service page. |
| `We have fragmented data across systems and reporting is slow.` | No API payload was received before timeout. | ❌ **Not Accepted** — no business-problem response. |
| `Performance engineering` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer despite a dedicated service page. |
| `Our customer-facing app becomes slow during peak traffic.` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer for a performance/scalability problem. |
| `Microservices` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer despite authoritative microservices content. |
| `Our monolith is stopping teams from releasing quickly.` | No API payload was received before timeout. | ❌ **Not Accepted** — no response for a natural modernization problem. |
| `Kubernetes` | Answered with cloud-native application benefits. Cards included a cloud-native article and two case studies, but not the dedicated Kubernetes service as the lead. | ⚠️ **Partially Accepted** — topic understood, but primary authority/content prioritization was weaker than expected. |
| `Can you review whether our Kubernetes setup follows good architecture practices?` | Cards: **Kubernetes Consulting Services** and **DevOps Consulting Services**; explained deployment/support and resilient systems. | ✅ **Accepted** — direct need and supporting capability matched. |
| `Adobe Commerce` | Led with Shopify and unrelated/general commerce case studies rather than authoritative Adobe Commerce pages. | ❌ **Not Accepted** — topic identification/ranking failed despite multiple dedicated Adobe Commerce pages. |
| `We need a marketplace that can grow across many sellers and stores.` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer for a supported multi-vendor marketplace problem. |
| `Strapi` | Returned **Headless CMS Development Company**, **Headless CMS Migration**, and Umbraco content; only one generic headless CMS card. | ⚠️ **Partially Accepted** — concept was relevant, but the dedicated Strapi partner/page was not prioritized. |
| `Can you help us move from a traditional CMS to a flexible content platform?` | No API payload was received before timeout. | ❌ **Not Accepted** — natural CMS migration problem produced no result. |
| `Agriculture technology` | Explained precision farming/digital platforms. Card: **Digital Agriculture Solutions**. | ✅ **Accepted** — authoritative industry page and useful answer. |
| `Can you help forestry teams manage field operations?` | No API payload was received before timeout. | ❌ **Not Accepted** — dedicated Forest E2E/field content exists but no response completed. |
| `Our road-safety data is scattered and hard to analyze.` | No API payload was received before timeout. | ❌ **Not Accepted** — dedicated Road Safety analytics content exists but no response completed. |
| `We need smarter customer segmentation for commerce.` | No API payload was received before timeout. | ❌ **Not Accepted** — dedicated AI customer segmentation accelerator was not reached. |
| `Do you work with travel and hospitality companies?` | Answered yes with AI, automation and connected ecosystems. Cards: industry page, travel case study, travel application page. | ✅ **Accepted** — relevant industry authority and evidence. |
| `How can you help media and advertising businesses?` | No API payload was received before timeout. | ❌ **Not Accepted** — supported industry question returned no result. |
| `Show me an example from maritime operations.` | Returned two strong maritime case studies, then an unrelated **AI-Driven Media Operations Platform** card. | ⚠️ **Partially Accepted** — intent/topic understood, but third card violated relevance threshold. |
| `Do you have experience with transportation and logistics?` | Led with **Transportation & Logistics**, followed by logistics IoT and AI articles. | ✅ **Accepted** — authoritative industry page and relevant supporting sources. |
| `What services do you provide?` | No API payload was received before timeout. | ❌ **Not Accepted** — core existing services regression could not serve a response under burst conditions. |
| `How can Successive help our business?` | No API payload was received before timeout. | ❌ **Not Accepted** — no discovery answer. |
| `What do you specialize in?` | No API payload was received before timeout. | ❌ **Not Accepted** — no capability overview. |
| `I don't know which service I need.` | Asked: “What are you trying to accomplish?” No cards. | ✅ **Accepted** — one useful clarification instead of random recommendations. |
| `Which capability could help us reduce manual operations?` | Led with a healthcare transformation article and a maritime case study, then general digital transformation. | ⚠️ **Partially Accepted** — answered automation broadly, but industry-specific lead evidence was arbitrary without user industry context. |
| `Do you work with retail and commerce companies?` | No API payload was received before timeout. | ❌ **Not Accepted** — no response for a supported industry. |
| `How can you help fintech businesses?` | No API payload was received before timeout. | ❌ **Not Accepted** — no response for a supported industry. |
| `Show me examples from agriculture.` | No API payload was received before timeout. | ❌ **Not Accepted** — requested case-study-style evidence was not delivered. |
| `Have you worked with healthcare organizations?` | No API payload was received before timeout. | ❌ **Not Accepted** — no response for supported industry evidence. |
| `Any customer story about cloud migration?` | Returned three cloud-migration case studies, led by **Improving Customer Experience with Cloud Migration**. | ✅ **Accepted** — requested content type and topic both respected. |
| `Any article about Kubernetes?` | Returned Kubernetes/cloud-native blog evidence and only blog cards. | ✅ **Accepted** — article content type was respected and sources were relevant. |
| `Do you have a whitepaper about application modernization?` | Included the correct **Application Modernization** eBook, but led with unrelated **AI in Commerce** and also included **Headless CMS Migration**. | ⚠️ **Partially Accepted** — requested type was respected, topic precision and ordering were not. |
| `Any webinar related to generative AI?` | Returned the generic **Webinars** listing and claimed the “Successive Advantage webinar” covers AI-enabled solutions. | ⚠️ **Partially Accepted** — webinar type was respected, but evidence was generic and the named webinar claim was weakly grounded. |
| `Show me thought leadership about enterprise architecture.` | Returned cloud migration and CMS blog content rather than the available employee-perspective enterprise-architecture item. | ❌ **Not Accepted** — content type and authoritative topic source were both missed. |
| `Where can I read about post-quantum AI security?` | No API payload was received before timeout. | ❌ **Not Accepted** — available employee-perspective content could not be served. |
| `Tell me about Successive Digital.` | Returned Acquia, custom software, and Azure partner pages rather than the canonical About page; no cards. | ❌ **Not Accepted** — company/about regression and unsuitable evidence. |
| `What industries do you serve?` | Listed Agriculture, Healthcare, Retail/Commerce, Media/Advertising and Fintech; cards showed three authoritative industry pages. | ✅ **Accepted** — grounded industry overview, although not exhaustive. |
| `Where are your offices?` | Deterministic Contact Us response and **Get In Touch** card. | ✅ **Accepted** — safe navigation response; it did not invent office details. |
| `How can I contact someone?` | Deterministic Contact Us response and **Get In Touch** card. | ✅ **Accepted** — contact regression passed on controlled retry. |
| `Are you hiring?` | No API payload was received before timeout. | ❌ **Not Accepted** — careers regression did not produce a response. |
| `Tell me about your ESRI partnership.` | Returned maritime and Magento case studies rather than the authoritative ESRI partner page/press release. | ❌ **Not Accepted** — entity/partner topic failed badly. |
| `Do you work with AWS?` | No API payload was received before timeout. | ❌ **Not Accepted** — no response despite extensive AWS partner/content coverage. |
| `Can u help with cloud migration` | No API payload was received before timeout. | ❌ **Not Accepted** — imperfect but clear supported request produced no answer. |
| `need ecommerce platform` | No API payload was received before timeout. | ❌ **Not Accepted** — no response for an understandable commerce need. |
| `have any agritech work` | No API payload was received before timeout. | ❌ **Not Accepted** — no evidence response for a clear imperfect query. |
| `tell me abot geospatial intelligence` | No API payload was received before timeout. | ❌ **Not Accepted** — typo-tolerant topic retrieval could not be evaluated because no response completed. |
| `which service good for us` | No API payload was received before timeout. | ❌ **Not Accepted** — expected one clarification, received no result. |
| `need app devlopment` | No API payload was received before timeout. | ❌ **Not Accepted** — known typo normalization did not result in a completed response. |
| `Can you suggest where to start with our legacy platform?` | Asked: “What specific aspect of the legacy platform would you like to start with?” | ⚠️ **Partially Accepted** — safe clarification, but it could have summarized supported modernization options before asking one focused question. |
| `Which capability fits a company with uncontrolled cloud costs?` | No API payload was received before timeout. | ❌ **Not Accepted** — natural FinOps recommendation could not be served. |
| `What is GeoAI, and can it help our operations?` | No API payload was received before timeout. | ❌ **Not Accepted** — partially related question produced no grounded response. |
| `Is headless commerce useful for enterprises?` | No API payload was received before timeout. | ❌ **Not Accepted** — no grounded partial-concept answer. |
| `How could DevSecOps improve our delivery?` | No API payload was received before timeout. | ❌ **Not Accepted** — no answer despite dedicated DevSecOps content. |
| `Who is the president of the USA?` | No API payload was received before timeout. | ❌ **Not Accepted** — scope behavior was not delivered to this actual request. |
| `What's today's weather?` | Returned the Successive-focused scope boundary with no sources/cards. | ✅ **Accepted** — no general-model answer or fabricated Successive evidence. |
| `Write me a poem.` | Returned the Successive-focused scope boundary with no sources/cards. | ✅ **Accepted** — correct off-topic handling. |
| `Recommend a movie.` | Asked which movie genre the user prefers. | ⚠️ **Partially Accepted** — did not answer with a movie, but should have invoked the Successive scope boundary rather than continuing an off-topic conversation. |
| `What is the capital of France?` | No API payload was received before timeout. | ❌ **Not Accepted** — no scope response delivered. |
| Standalone `What about this?` | Asked for more context about what “this” refers to. | ✅ **Accepted** — appropriate single clarification without history. |
| Standalone `Anything else?` | No API payload was received before timeout. | ❌ **Not Accepted** — ambiguous prompt did not receive a clarification. |
| Chain 1: `Tell me about FinOps.` | Explained FinOps/cloud cost optimization. Card: **Cloud Cost Optimization**; source-backed FinOps detail. | ✅ **Accepted** — strong topic start. |
| Chain 1 follow-up: `Do you have any case studies?` | Inherited FinOps/cloud but returned Azure migration, Drupal/Kubernetes migration, and cloud migration/DevOps cases. | ⚠️ **Partially Accepted** — content type and broad cloud context worked, but direct FinOps evidence was not established. |
| Chain 1 switch: `What about retail commerce?` | Claimed retail commerce context but led with a maritime case study, then Magento/building-material cases. | ❌ **Not Accepted** — new topic constraint was not ranked cleanly; maritime was unrelated. |
| Chain 1: `How can this help my company?` | Reverted to FinOps and general transformation rather than the immediately preceding retail-commerce subject. | ❌ **Not Accepted** — pronoun resolution selected stale conversation context. |
| Chain 1: `Can I speak with someone?` | Deterministic Contact Us answer/card. | ✅ **Accepted** — contact transition passed. |
| Chain 2: `Tell me about location intelligence.` | Authoritative location-intelligence overview and page card. | ✅ **Accepted** — strong initial topic grounding. |
| Chain 2 follow-up: `Any examples?` | Inherited location intelligence and returned the noxious-weed geospatial case study. | ✅ **Accepted** — evidence intent and continuity worked. |
| Chain 2 switch: `What about agriculture?` | Shifted to agritech case studies and explained agriculture solutions. | ✅ **Accepted** — topic change was recognized. |
| Chain 2: `How would this help field teams?` | Retained agriculture/location context; used offline field access, audit trails and precision agriculture evidence. | ✅ **Accepted** — useful pronoun resolution and grounded business explanation. |
| Chain 2: `Can I contact Successive?` | Deterministic Contact Us answer/card. | ✅ **Accepted** — contact transition passed. |
| Chain 3: `Tell me about headless CMS.` | Explained headless CMS. Cards: authoritative Headless CMS and Enterprise CMS pages. | ✅ **Accepted** — strong topic authority. |
| Chain 3 resource follow-up: `Do you have something I can read about this?` | Inherited headless CMS and returned only relevant blog articles. | ✅ **Accepted** — resource intent and topic continuity worked. |
| Chain 3 switch: `What about travel companies?` | Returned two non-travel case studies before the relevant travel-provider Strapi case study. | ❌ **Not Accepted** — topic switching/industry constraint failed in ranking and cards. |
| Chain 3 recommendation: `What would you suggest?` | Recommended Strapi/headless CMS for travel, but led with a global-media case and added an unrelated loyalty case. | ⚠️ **Partially Accepted** — main recommendation was useful; evidence/card selection was noisy. |
| Chain 3: `I want to talk to someone.` | Deterministic Contact Us answer/card. | ✅ **Accepted** — contact transition passed. |

## Summary

- **Total queries tested:** 90 actual API executions (75 standalone requests and 15 turns across three multi-turn scenarios).
- **Accepted:** 26
- **Partially Accepted:** 10
- **Not Accepted:** 54
- **Overall strict acceptance percentage:** 28.9% (`26 / 90`).
- **Usable including partial responses:** 40.0% (`36 / 90`).
- **Number of multi-turn scenarios:** 3 (15 total turns).
- **Number of dynamically discovered website topics tested:** 31.
- **Number of natural business-problem/recommendation queries:** 18.
- **Number of completely off-topic tests:** 5.
- **No-response/time-out outcomes:** 46. These are counted as Not Accepted because a visitor received no chatbot response. The server later recovered and passed health checks, indicating burst/cold-corpus reliability rather than permanent outage.

The strict result does **not** support the target rule yet. The chatbot performs well for several authoritative topics and carefully controlled sequential conversations, but it does not yet reliably handle *any* dynamically discovered subject under realistic breadth and concurrency.

## Website Content Coverage

The test topics were derived from current API titles, slugs, ACF `service_type`, industries, accelerators, cases and editorial content—not from a fixed prompt list.

- **Services/capabilities:** GIS/GeoAI, FinOps, application modernization, cloud migration, Kubernetes, DevSecOps, performance engineering, microservices, modern data architecture, headless CMS/commerce, custom/application development, digital transformation.
- **Industries:** agriculture/agritech, travel and hospitality, retail/commerce, fintech, healthcare/life sciences, transportation/logistics, media/advertising, maritime/shipping, forestry and road safety.
- **Technologies/platforms:** ArcGIS/ESRI, AWS, Azure, Kubernetes, infrastructure as code, CNAPP/CSPM, cloud IAM, Strapi, Adobe Commerce, IoT, AR, VR and GeoAI.
- **Accelerators/business themes:** cloud cost visibility, IAM least privilege, posture assessment, Forest E2E management, road-safety analytics, customer segmentation, multi-store commerce, manual-work reduction, platform scalability, legacy modernization and content operations.
- **Content types:** pages/services, industries, accelerators, case studies, blogs/articles, eBooks/whitepapers, webinars, thought leadership/employee perspectives, partners, company/about, contact and careers.
- **Conversation dimensions:** evidence lookup, resource switching, industry/topic switching, recommendation, pronouns/vague follow-ups and contact transition.

This coverage includes content-derived subjects absent from the request examples, notably IaC posture, CNAPP/CSPM, cloud IAM rights-sizing, forestry operations, road-safety analytics, Strapi, ESRI partnerships, post-quantum AI security, maritime platforms and headless content operations.

## Common Failure Patterns

### API/infrastructure reliability

The dominant failure was missing API payloads under large mixed batches. Logs showed the live WordPress page payloads themselves exceed Next's 2 MB per-item cache ceiling (for example, page/post/accelerator responses). Full-corpus cold loading is expensive, and parallel tests created long waits or stalled processes. Successful retries prove some queries are semantically answerable, but this is still a user-visible failure pattern.

### Query understanding overriding the topic

`What does Successive do with geospatial data?` became an About request. Company phrasing overrode the actual subject. ESRI partnership similarly lost its named entity and retrieved generic transformation cases.

### Primary-topic versus incidental/adjacent content

Adobe Commerce led to Shopify/general commerce. Kubernetes led to general cloud-native pages. Strapi led to generic headless CMS/Umbraco. These are adjacent, but dedicated authoritative pages existed and should have won.

### Content-type compatibility

The application-modernization whitepaper request included unrelated whitepapers. Thought leadership about enterprise architecture returned ordinary blogs rather than the matching employee-perspective item. Generic webinar retrieval used a collection page but did not establish a directly relevant webinar item.

### Conversation topic switching and stale context

The location → agriculture chain worked. FinOps → retail and headless CMS → travel did not: earlier content types/topics persisted, unrelated maritime/media cards appeared, and `this` sometimes resolved to an older topic rather than the immediately preceding constraint.

### Card relevance stricter than answer relevance

Several main answers were useful while secondary cards were unrelated: maritime included a media case; retail included maritime; travel/headless CMS included global media and loyalty. The card threshold does not fully enforce all extracted topic and industry constraints.

### Broad discovery/company coverage

The About query returned partner/service pages instead of the canonical About page. Broad service/discovery requests were particularly vulnerable to latency. The industries overview worked but was partial.

### Vague/recommendation behavior

No-context service selection correctly asked one question. Legacy-platform guidance over-clarified rather than first offering a bounded evidence-backed orientation. The off-topic movie request also asked a clarifying question instead of enforcing scope.

### Answer-generation grounding quality

Most successful answers cited actual sources, but a few generated statements stretched evidence: the webinar response named a webinar from generic listing evidence; some suggestions were phrased as direct recommendations without enough user context. No clear invented URL was observed; server-controlled URLs remained intact.

## Recommended Generic Fixes

1. **Make corpus acquisition production-safe:** cache smaller WordPress pages/chunks below platform limits, reduce `per_page`, bound upstream concurrency, deduplicate simultaneous cold loads with an in-flight promise, and consider a compact prebuilt/shared search index. Add request-level latency budgets and graceful partial-index behavior.
2. **Use dimensional routing rather than legacy intent override:** combine conversational goal, subject/entities and requested content type independently. Company-oriented phrasing should not erase a specific subject such as geospatial data or a named partner.
3. **Strengthen document authority structurally:** calculate phrase/entity coverage across title, slug, primary headings and metadata; require dedicated identity alignment when an exact named platform/partner exists. Penalize merely adjacent topics even when they share a broader category.
4. **Apply hard content-type eligibility before ranking:** for case study, whitepaper, webinar, thought-leadership and partner requests, filter candidates to the requested structural type first; use normal pages only as a clearly labeled fallback.
5. **Carry a recency-weighted conversation state:** explicitly store current subject, modifiers/industry and requested content type per turn. A new noun phrase should update/augment the subject; pronouns should resolve to the immediately preceding accepted subject, with older state decaying.
6. **Validate cards independently against every active constraint:** require topic/entity, industry and content-type compatibility, not just a percentage of top score. It is better to show one strong card than three mixed cards.
7. **Add calibrated ambiguity and scope gates:** uncertainty should consider whether the request itself is off-topic, not merely whether search terms occur in website content. Clarification should be used for business ambiguity, while sports/trivia/entertainment should deterministically enforce scope.
8. **Create content-snapshot evaluation automation:** periodically sample topic profiles across every current content type and generate authority-versus-incidental, requested-type and conversation-switch assertions. Avoid fixed IDs while retaining expected structural properties.
9. **Aggregate broad company/service answers:** build a cached, website-derived capability/industry/company summary from authoritative listing/about pages so broad questions do not rely on whichever individual page wins lexical ranking.
10. **Expose operational metrics:** measure cold/warm retrieval latency, upstream collection failures, interpreter/final-LLM duration, timeout rate, index age and partial-corpus state. The current health endpoint alone cannot detect a degraded content/LLM path.

## Regression Assessment

- **Contact:** ✅ Passed on controlled requests and at the end of all three conversations. One early concurrent contact request was incorrectly clarified, showing load/model variability, but the deterministic route passed repeatedly.
- **Services/discovery:** ❌ Not reliable. Broad discovery requests timed out in the burst test; no-context recommendation clarification worked.
- **Case studies:** ⚠️ Content-type routing generally worked, but relevance was mixed for FinOps, maritime and topic switches.
- **Blogs/articles:** ✅ Kubernetes and headless-CMS article requests returned blog content and preserved topic.
- **Resources/whitepapers:** ⚠️ Correct target appeared, but unrelated whitepapers were also prioritized.
- **Events/webinars:** ⚠️ Listing-page route worked; topic-specific evidence was weak.
- **Careers:** ❌ The actual careers query timed out, so regression is not validated.
- **Company/about:** ❌ Canonical About content was not selected on controlled retry.
- **Industries:** ✅ Broad industry listing and several industry-specific prompts worked; media/retail/fintech burst requests did not complete.
- **Multilingual:** Not conclusively validated in this pass. The request set focused on content-derived generic coverage; existing automated multilingual tests were not a substitute for an actual multilingual API answer here.
- **Follow-up conversations:** ⚠️ Strong for location→agriculture and headless-CMS resource follow-up; weak for FinOps→retail and headless-CMS→travel topic switches.
- **External widget/input:** Not browser-executed in this pass. The same `/api/chat` contract was exercised, but DOM event/postMessage behavior was not revalidated here.
- **Off-topic:** ⚠️ Weather and poetry passed; movie clarification was wrong; two other requests timed out.

## Conclusion

The content-derived test confirms meaningful architectural improvement: authoritative GIS/GeoAI, FinOps, agriculture, travel, logistics, Kubernetes consulting, cloud migration evidence, headless CMS resources and several multi-turn flows work without topic-specific intents. However, the generic rule is **not yet consistently satisfied**. Reliability under broad/cold concurrent access, exact entity authority, strict content-type filtering, canonical company routing and recency-aware topic switching are the highest-impact patterns to address after this required first-pass report.
