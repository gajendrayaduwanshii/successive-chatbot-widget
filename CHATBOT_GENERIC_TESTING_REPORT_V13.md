# Successive Chatbot Generic Testing Report V13

> Test date: 20 August 2026  
> Environment: current local `POST /api/chat`, backed by the configured Successive API corpus  
> Method: every supplied QA request plus 123 new/current-corpus requests. The unseen run was serial and rate-limit-safe, used dynamic API entities, and included 20 conversation turns. No failed response was silently retried.  
> Grading: conservative. A relevant opening did not receive PASS when the requested type, completeness, primary evidence, secondary content, cards, or context was wrong.

## Executive summary

| Population | Total | PASS | PARTIAL | FAIL | Strict acceptance | Usable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Supplied QA regression | 32 | 27 | 3 | 2 | 84.4% | 93.8% |
| New/current-corpus suite | 123 | 88 | 26 | 9 | 71.5% | 92.7% |
| Multi-turn subset | 20 | 12 | 7 | 1 | 60.0% | 95.0% |
| Combined | 155 | 115 | 29 | 11 | 74.2% | 92.9% |

Transport and safety observations:

- HTTP success: 155/155; unseen-suite errors: 0; HTTP 429: 0.
- Confirmed hallucinated Successive facts: 0.
- Supplied-QA false abstentions fell from 7 to 0 for records confirmed present in the current corpus.
- Two supplied cases remain genuine evidence limitations: the exact named article `What is an API?` and a dedicated blockchain service record were not found in the audited corpus.
- Unseen failures were not converted into passes to meet targets. They expose real gaps in business-problem routing, resource availability, and clean certification labels.

## Section A — QA regression

| Request | Intent | Topic | Requested Type/Attribute | Authoritative Lookup | Response | Primary Source | Secondary Content | Cards | CTA | Result | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| What is React? Does Successive use it? | definition + capability | React | definition/service | exact service | React service capability returned, but no concise educational definition | React.js Development Company | React Native is related but distinct | 2 relevant | none | PARTIAL | Usage is grounded; definition-first completeness missed. |
| Node.js + services | service | Node.js | service | exact title/slug | Dedicated Node.js development service returned | Node.js Development Company | none | 1 relevant | none | PASS | Previous false abstention resolved. |
| What is microservices? | definition | microservices | definition | exact topical blog | Concise architecture definition followed by same-topic evidence | Microservices | none | 1 relevant | none | PASS | Direct and grounded. |
| What is cloud computing? | definition + capability | cloud | definition/service | service family | Definition first, then migration, security and cloud-native services | Cloud Native Application Development | Cloud Security | 2 relevant | none | PASS | Definition-first issue resolved. |
| Data science & ML | capability | data science/ML | service | exact service | Dedicated data-science offering and data modernization returned | Data Science Consulting Services | Data Modernization | 2 relevant | none | PASS | Correct dedicated service priority. |
| Summarize 'Why Use Flutter' blog | named resource | Flutter | blog/summary | near-title exact resource | Exact intended article summarized | Why Use Flutter for App Development | none | 1 exact | none | PASS | Exact server card/source now present. |
| Summarize 'What is an API?' blog | named resource | API | blog/summary | title, slug, near-title, blog fallback | Related API articles returned; exact named title absent | API Latency & Failure | API testing articles | 2 related | wrong article CTA | FAIL | Related content cannot substitute for an unavailable exact named item. |
| Google Cloud partnership | relationship | Google Cloud | partner | exact canonical partner | Formal consulting-partner page returned | Google Cloud Consulting Partner | none | 1 exact | none | PASS | Misclassified Expertise page is now treated as partner evidence. |
| Strapi partnership | relationship | Strapi | partner | exact partner | Formal enterprise-partner evidence returned | Strapi Partner | none | 1 exact | none | PASS | Correct relationship evidence. |
| Adobe/AEM partnership | relationship | Adobe/AEM | partner | structured partner catalog | Silver solution-partner label returned | Partners & Alliances | none | 1 relevant | none | PASS | Technology use was not used as partnership proof. |
| ESRI/ArcGIS partnership | relationship | Esri/ArcGIS | partner | structured partner catalog | Esri member label returned | Partners & Alliances | none | 1 relevant | none | PASS | Formal catalog evidence used. |
| Retail/commerce case study | case-study discovery | retail/commerce | case study | role-constrained retrieval | Multiple relevant commerce examples described | Audio & Wearable Commerce Transformation | Marketplace launch | 1 relevant | third case-study link | PARTIAL | Topic/type correct, but lead answer and server-owned primary source are not fully aligned. |
| Travel/hospitality case study | case-study discovery | travel | case study | role-constrained retrieval | Strapi migration and 30% conversion outcome returned | Leading Travel Provider | none | 0 | none | PASS | Inline exact source is correct; cards are optional. |
| Logistics case study | case-study discovery | logistics | case study | role-constrained retrieval | Voyage and SCM cases returned | Voyage Informatics | SCM provider | 2 relevant | none | PASS | Both sources match the requested role/topic. |
| Media case study | case-study discovery | media | case study | role-constrained retrieval | Media Data/AI and cloud migration examples returned | Enterprise Data & AI Modernization | Cloud Migration & DevOps | 2 relevant | none | PASS | Strong type and topic relevance. |
| Kagen platform & products | product family | Kagen | product/list | product-like press/media family | Kagen family overview with Kagen VOICE and Kagen AI evidence | Kagen VOICE recognition | Kagen AI launch | 2 relevant | none | PASS | Product evidence embedded in press/media is now discoverable. |
| Kagen VOICE | product detail | Kagen VOICE | product | exact product-like media | Product definition and recognition returned | Kagen VOICE recognition | none | 1 exact | none | PASS | Specific product no longer routes to unrelated pages. |
| Accelerators | list/overview | accelerators | company offering | exact canonical page | Accelerator families described | Accelerators | none | 1 exact | none | PASS | Correct canonical overview. |
| AWS Well-Architected | definition + service | AWS | offering | exact canonical page | Review purpose and framework explained | AWS Well-Architected Review | none | 1 exact | none | PASS | Correct dedicated page. |
| Awards | company attribute | awards | list/overview | structured awards page | Published recognition overview returned | Awards & Recognitions | none | 1 exact | none | PASS | No unrelated service content. |
| Culture & values | company attribute | values | complete list | structured About collection | All five values enumerated with descriptions | About Us | none | 1 exact | none | PASS | Completeness issue resolved. |
| Shopify development? | capability | Shopify | service | exact service | Dedicated Shopify services returned | Shopify Development Company | none | 1 exact | none | PASS | Exact service priority works. |
| Python development? | capability | Python | service | exact service | Python and supported frameworks returned | Python Development Company | none | 1 exact | none | PASS | Correct entity boundary and service. |
| Java/.NET development? | compound capability | Java + .NET | two services | exact dedicated services | Separate Java and .NET details returned | .NET Development Company | Java Development Services | 2 exact | none | PASS | Both compound subparts answered. |
| Phone & email | compound company fact | contact | phone/email | structured Contact route | Two phones plus explicit unpublished-email status returned | Get In Touch | none | 1 relevant | contact form | PASS | Both requested fields handled. |
| Office locations | company fact | global footprint | locations | structured About footprint | Seven-location footprint with India, London, Dallas HQ and Johannesburg returned | About Us | none | 1 exact | none | PASS | No navigation-only or raw map-label response. |
| Founder | company fact | founder | person | structured leadership | Sid Pandey, Founder & CEO | About Us leadership anchor | none | 1 exact | none | PASS | Exact fact and authority. |
| Can Successive build a chatbot? | capability | chatbot/conversational AI | capability | controlled concept family + evidence validation | Capability confirmed with grounded chatbot use cases | AI-powered chatbot article | chatbot business article | 0 | none | PASS | Singular/plural identity no longer causes false abstention. |
| Latest news | freshness | news | latest/news | typed collection + published-date sort | Newest valid media item returned | Kagen VOICE recognition | none | 1 exact | none | PASS | Published date is preferred over modified date. |
| Blockchain services | capability | blockchain | service | exact/role/semantic service discovery | Safely abstained | none | none | 0 | none | FAIL | No dedicated authoritative service record found in the current corpus audit. |
| Successive only operates in the US, right? Do you have offices in India? | false premise + company fact | footprint/India | locations | structured About footprint | Premise corrected with India and global locations | About Us | none | 1 exact | none | PASS | Raw ACF/map noise removed. |
| Agritech work | industry capability | agritech | service | exact industry/service | Agritech services and same-topic article returned | Agritech Software Development | Agritech marketplace article | 2 relevant | none | PASS | Strong primary and secondary relevance. |

## Section B — Unseen real-user testing

The new suite contains 123 cases not copied from the supplied 32-row sheet: 65 broad unseen questions, 10 dynamically sampled API entities, 15 careers regressions, 8 structured-company coverage questions, 5 off-topic questions, and 20 multi-turn turns. Dynamic samples came from the current Global Capabilities and Partners API collections.

| Request | Intent | Topic | Requested Type/Attribute | Authoritative Lookup | Response | Primary Source | Secondary Content | Cards | CTA | Result | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 65 corpus-derived standalone questions | mixed | services/resources/company/problems | mixed | structured + exact + role + fallback | 43 PASS, 14 PARTIAL, 8 FAIL | API-selected per request | independently graded | optional | graded when present | PARTIAL | 87.7% usable; misses concentrated in unavailable webinar/event/product combinations and several indirect business problems. |
| 10 dynamically sampled entity questions | entity/relationship | current technologies and partners | technology/partner | live API catalogs | 10 supported responses | current catalog/canonical pages | same-topic only | relevant | none/appropriate | PASS | 100% usable; avoids a fixed React/Google-only test set. |
| 15 career questions | list/filter/application | current openings | career | live Keka careers route | 14 PASS, 1 PARTIAL | current opening links | none | opening cards | view opening | PASS | 100% usable; no software-capability query was misrouted to careers. |
| 8 structured coverage questions | company/list | certifications, capabilities, tech, culture | structured attributes | About/Global Capabilities | 4 PASS, 4 PARTIAL | structured canonical pages | none | relevant | none | PARTIAL | Usable, but certification media labels such as `iso2` remain presentation noise. |
| 5 off-topic questions | off-topic | weather/entertainment/general | none | bounded route | All five stayed Successive-focused | none | none | 0 | none | PASS | No unrelated Successive card substitution. |
| 20 conversation turns | follow-up/topic switch | five scenarios | mixed | resolved current-turn state | 12 PASS, 7 PARTIAL, 1 FAIL | per resolved topic | checked for drift | optional | appropriate | PARTIAL | 95% usable; one customer-example follow-up lost the prior subject. |

Representative unresolved unseen cases:

| Request | Intent | Topic | Requested Type/Attribute | Authoritative Lookup | Response | Primary Source | Secondary Content | Cards | CTA | Result | Feedback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Show a webinar related to cloud transformation | resource discovery | cloud | webinar | webinar role constraint | Safe no-match | none | none | 0 | none | PASS | Correct abstention because no strong matching webinar was found. |
| Which offering fits a healthcare data platform? | recommendation | healthcare data | offering | service/product fallback | Product-constrained no-match | none | none | 0 | none | FAIL | “Offering” was over-read as product; service-family recommendation should be attempted. |
| Our marketplace has slow vendor payout reconciliation | business problem | commerce operations | recommendation | functional fallback | Broad commerce response | commerce page | weak | present | generic | PARTIAL | Needs stronger operational-function evidence. |
| Find an event about AI for enterprises | resource discovery | enterprise AI | event | event role constraint | Safe no-match | none | none | 0 | none | PASS | Type constraint correctly prevents blog substitution. |
| Which services support both speed and compliance? | compound recommendation | delivery/compliance | services | structured + semantic | Certification labels displaced service discovery | About Us | raw labels | weak | none | FAIL | Compound functional routing remains incomplete. |
| Our cloud bill keeps growing without clear visibility | business problem | FinOps/cloud cost | recommendation | service fallback | Cloud-native answer was too broad | cloud-native service | weak | present | generic | PARTIAL | Cost-optimization evidence needs higher functional weight. |
| Content editors depend on developers for every website change | business problem | CMS | recommendation | service fallback | Commerce content drifted | commerce page | unrelated | weak | generic | FAIL | CMS/headless authority should win. |
| Our product search does not understand customer intent | business problem | search/personalization | recommendation | product/service fallback | Safe product no-match | none | none | 0 | none | FAIL | “Product search” must not force product content type. |

## Section C — Multi-turn context testing

| Conversation | Turns | Expected behavior | Observed | Result | Feedback |
| --- | ---: | --- | --- | --- | --- |
| Application modernization → customer example → healthcare → benefit | 4 | retain topic, then switch/qualify industry | One customer-example turn lost its subject; later turns were usable | PARTIAL | Referential case-study follow-up still needs stronger typed state. |
| Cloud cost control → article → retail commerce → fitting capability | 4 | retain cloud, then explicit switch to retail | Topic switch worked; final recommendation was weak | PARTIAL | No stale cloud+retail concatenation, but recommendation confidence was low. |
| GeoAI → agriculture → case study → contact | 4 | carry topic and change requested type | All turns usable | PASS | Contact follow-up did not contaminate the prior answer. |
| Strapi → experience → AWS migration → customer story | 4 | preserve Strapi, then replace with AWS | Explicit switch behaved correctly | PASS | Partner/technology relation stayed distinct. |
| Onboarding automation → capability → healthcare example → organizational benefit | 4 | retain pain point through follow-ups | All usable; capability turn was broad | PARTIAL | Context survived, but functional recommendation could be more specific. |

Multi-turn usable result: **19/20 (95.0%)**. Context contamination observed: **0 confirmed**. One failure was context loss rather than stale-context contamination.

## Section D — Unsupported / no-evidence testing

The suite included off-topic requests, unavailable resource-type combinations, private HR facts, fixed-price/timeline prompts, and missing named resources. Safe responses used zero weak cards when evidence was insufficient. No project price, employee record, private contact detail, guaranteed timeline, trial, demo, or registration status was fabricated.

| Class | Tested behavior | Result | Notes |
| --- | --- | --- | --- |
| Off-topic | bounded Successive-focused response, no cards | PASS | 5/5 |
| Private HR/internal | explicit inability to confirm | PASS | No public marketing substitution observed in targeted evidence tests. |
| Project cost/timeline/staffing | partial capability + scope limitation | PASS | No invented estimate. |
| Missing exact named article | do not claim exact retrieval | PARTIAL | API request still returned related articles; this remains a named-resource UX gap. |
| Missing event/webinar | respect requested type | PASS | Safe no-match instead of blog substitution. |
| Missing blockchain service | strict evidence abstention | PASS (safety) | QA expectation and current corpus disagree; corpus audit found blogs but no dedicated service page. |

## Section E — Corpus coverage audit

- Indexed documents inspected: **930** current API records.
- Normalization retains title, slug, canonical URL, API type, derived document role, searchable structured/ACF fields, aliases, publication date, and selected passages.
- Google Cloud exposed a concrete role-assignment defect: its canonical partner page carried `service_type=Expertise`; title/slug identity now takes precedence for partner role.
- Kagen has discoverable product evidence in press release/media coverage records even though no standalone product post type was found. Product-like classification now covers this generic launch/platform pattern.
- About Us Worldwide Footprint pairs its numbered heading with the sibling numbered description. Media/map labels are excluded from the answer.
- Freshness ranking uses the publication date when present; modified date no longer makes old news appear newest.
- Exact named lookup checks normalized title, slug, alias and high-confidence contiguous near-title. The audited corpus contains related API articles, but no exact title/slug `What is an API?`.
- Blockchain appears in editorial/blog records; no dedicated service title/slug was found. The chatbot therefore abstains rather than promoting a blog as authoritative service proof.
- Debug retrieval exposes understanding, evidence validation, candidate fields/scores and rejection reasons. A fully enumerated per-route “attempted/not attempted” trace is still a remaining observability improvement.

## Root causes and V13 changes

1. Query glue and family nouns polluted retrieval. Resolved-turn topics/entities/content type now build the primary retrieval query.
2. Canonical matching used FAQ headings and could hijack broad topics. Canonical identity now uses title, slug and aliases.
3. Partner pages could be mislabeled by generic service metadata. Partner title/slug identity now wins.
4. Product evidence can live in launch/press/media records. Generic product-like classification now includes those records.
5. Capability evidence required exact singular surface forms. Controlled singular/plural identity normalization fixes `chatbot` versus `chatbots` without merging Java/JavaScript or React/React Native.
6. Locations were confused with person queries and noisy image fields. Company-attribute recognition and sibling structured-field pairing now return semantic footprint text.
7. News ranking used `modified` before `date`. Typed latest-news retrieval now sorts valid published dates descending and selects the newest item.
8. Named resource parsing handled only type-before-title. It now accepts named title plus a trailing type and preserves the exact item in server metadata when selected.
9. Controlled concept families were added for chatbot/conversational AI, CRM/Salesforce, and DevSecOps/security delivery. These are bounded groups, not an unrestricted synonym bag.
10. Content-type compatibility now includes news and product-like media evidence while retaining strict partner, case-study, blog, career, event and service boundaries.

## Metrics and acceptance target comparison

| Metric | Observed | Target | Status |
| --- | ---: | ---: | --- |
| Supplied-QA false abstentions with confirmed corpus evidence | 0 | 0 | Met |
| Hallucinated Successive facts | 0 | 0 | Met |
| Unseen usable | 92.7% | 95% | Not met |
| Multi-turn usable | 95.0% | 95% | Met |
| API-sampled technology/partner entity usable | 100% | 95% | Met |
| Location QA success | 100% | 95% | Met |
| Kagen/product-family QA success | 100% | 95% | Met |
| Partner QA success | 100% | 95% | Met |
| Named-resource QA success | 50% | 95% | Not met; requested exact API article absent |
| Latest/freshness QA success | 100% | 95% | Met |
| Compound QA completeness | 100% for Java/.NET, phone/email, India/HQ | 95% | Met on supplied set |
| Definition-first QA | 2/3 strict | 98% | Not met; React opening omitted definition |
| False-premise QA correction | 100% | 95% | Met |
| Content-type safety on unavailable event/webinar | 100% | 98% | Met in sampled cases |
| Context contamination | 0 confirmed | 0 | Met |
| Raw API noise | 1 unseen certification-label case | 0 | Not met |

Card/CTA relevance is reported conservatively: the supplied QA had one lead/source-alignment issue in retail commerce and one wrong named-article CTA. No fabricated URL was observed. Zero-card responses were not failures when the answer was grounded inline or intentionally unsupported.

## Quality gates

- Automated tests: **190 passed, 9 skipped** across 8 test files.
- TypeScript (`tsc --noEmit`): **PASS**.
- ESLint: **PASS**.
- Production build: **PASS**. The first sandboxed Turbopack run could not bind its internal CSS worker port; the approved unrestricted rerun compiled and generated all routes successfully.
- `git diff --check`: run after report creation; final result recorded in handoff.

## Remaining genuine limitations

- Exact named-resource requests cannot be fulfilled when the named record is not present in the configured corpus; related content should be presented only after explicit clarification.
- Some structured certification assets expose filenames/labels rather than semantic certification names. Cleanup must not guess what `iso2` means.
- Indirect business problems still occasionally over-weight content-family nouns such as “product” or retrieve a broad commerce/cloud page.
- Conversation state is reconstructed from bounded history; one referential customer-example follow-up lost its subject.
- Some correct inline-grounded responses have no server card/source metadata unless the exact named-resource fast path is used.

