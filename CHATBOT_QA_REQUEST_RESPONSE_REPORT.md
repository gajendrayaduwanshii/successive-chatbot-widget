# Successive Chatbot QA — Request and Response Report

## Test execution

- Test date: 20 August 2026
- Environment: current local chatbot API (`POST /api/chat`)
- Execution mode: 32 standalone requests; no conversation history unless included in the request itself
- Scope: testing and reporting only; no implementation changes were made during this QA run
- Transport result: 32/32 requests returned HTTP 200

## Result summary

| Result | Count | Percentage |
| --- | ---: | ---: |
| PASS | 17 | 53.1% |
| PARTIAL | 7 | 21.9% |
| FAIL | 8 | 25.0% |
| Usable (PASS + PARTIAL) | 24 | 75.0% |

Additional observations:

- Hallucinated Successive facts: 0 confirmed
- Possible content-mixing issue: 1 (`TC-14`)
- Broken/fabricated links: 0 observed
- False abstentions: 7 (`TC-8`, `TC-16`, `TC-17`, `TC-26`, `TC-28`, `TC-29`, `TC-30`)
- Exact named-blog retrieval failures: 2 (`TC-6` partial, `TC-7` fail)
- Previously failing Node.js request: now PASS
- Previously failing Shopify request: now PASS
- Culture values enumeration: now PASS
- False-premise handling: improved but still noisy/partially complete

## Detailed request/response results

| ID | Request | Expected | Actual chatbot response | Cards / sources | Result | Severity | QA feedback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-1 | What is React? Does Successive use it? | React definition + Successive usage/service | Defined React and confirmed Successive uses it for React.js development. Also discussed React Native. | React.js Development Company; React Native App Development Company | PASS | LOW | Both parts answered. Primary React.js source is correct. |
| TC-2 | Node.js + services | Node.js expertise/service | Returned Node.js development services, scalability, consulting and custom web-application capability. | [Node.js Development Company](https://successive.tech/nodejs-development/) | PASS | LOW | Previous false negative is resolved. Exact topic and service-family page retrieved. |
| TC-3 | What is microservices? | Definition + relevant services | Correct microservices definition, but only a general Microservices blog was provided; no dedicated service/capability detail. | [Microservices](https://successive.tech/blog/microservices/) | PARTIAL | LOW | Definition is correct; Successive service portion is incomplete. |
| TC-4 | What is cloud computing? | Definition + cloud services | Started with unrelated AI-enabled solution language and Google Cloud positioning. Added cloud-native development and cloud-security detail, but did not define cloud computing. | Google Cloud Consulting Partner; Cloud Native Application Development Services | PARTIAL | MEDIUM | Relevant cloud sources exist, but the direct educational definition is missing and the opening drifts. |
| TC-5 | Data science & ML | Relevant services | Described AI-powered intelligence, forecasting, analytics, virtual assistants and model deployment. | [Data & Artificial Intelligence](https://successive.tech/data-artificial-intelligence/) | PARTIAL | LOW | Broadly relevant and accurate, but does not foreground the dedicated Data Science service expected by the case. |
| TC-6 | Summarize 'Why Use Flutter' blog | Exact-blog summary | Correctly summarized Flutter benefits. Included both “How to Build a Flutter App?” and the exact “Why Use Flutter…” link in the answer. Server cards and sources were empty. | Inline: How to Build a Flutter App; Why Use Flutter for App Development | PARTIAL | LOW | Summary is relevant, but exact-title source should be primary and server-owned source/card metadata should not be empty. |
| TC-7 | Summarize 'What is an API?' blog | Exact named-blog summary | Defined API using API-testing content, then linked API Latency and Status Codes in API Testing. Did not retrieve an exact blog titled “What is an API?”. | API Latency & Failure in Commerce System; Status Codes in API Testing | FAIL | MEDIUM | Named-resource intent was not satisfied. Related API blogs cannot substitute for the named title. |
| TC-8 | Google Cloud partnership | Formal partner evidence | “I couldn’t confirm the formal partnership relationship for google cloud…” | None | FAIL | MEDIUM | False abstention. A Google Cloud partner page/catalog evidence is expected. |
| TC-9 | Strapi partnership | Formal partner evidence | Confirmed Successive is a Strapi Partner and summarized CMS, commerce, integration and consulting services. | [Strapi Partner for Connected Digital Experiences](https://successive.tech/partners/strapi/) | PASS | LOW | Exact partner evidence and link returned. |
| TC-10 | Adobe/AEM partnership | Adobe partner information | Confirmed the Partners & Alliances catalog lists “Adobe Solution Partner badge Silver” under CX Partnerships. | [Partners & Alliances](https://successive.tech/partners/) | PASS | LOW | Formal catalog evidence supports the relationship. Label cleanup could still improve presentation. |
| TC-11 | ESRI/ArcGIS partnership | Formal partner evidence | Confirmed the partner catalog lists “esri partner member.” | [Partners & Alliances](https://successive.tech/partners/) | PASS | LOW | Correct formal partner evidence; raw label capitalization could be cleaner. |
| TC-12 | Retail/commerce case study | Relevant case study | Returned marketplace launch and order-orchestration commerce work with architecture and workflow details. | [Automating Order Orchestration](https://successive.tech/case-studies/order-orchestration-retail-commerce-solutions/) | PASS | LOW | Correct content type and strong retail/commerce relevance. |
| TC-13 | Travel/hospitality case study | Relevant case study | Described a travel provider’s Strapi migration and stated a 30% sales/conversion improvement. | Inline: [Driving Efficiency and Growth for a Leading Travel Provider](https://successive.tech/case-studies/transforming-business-operations-for-a-leading-travel-service-provider/) | PASS | LOW | Relevant case study and measurable outcome. Server card/source arrays were empty, but the inline source is correct. |
| TC-14 | Logistics case study | Relevant case study | Returned voyage-informatics and SCM-provider cases. Also mixed visitor-data, lead-verification and onboarding language into the logistics summary. | Voyage Informatics Platform; Improving Logistics Operations for a Leading SCM Provider | PARTIAL | MEDIUM | Correct case-study type and links, but parts of the synthesized summary appear weakly connected to logistics evidence. |
| TC-15 | Media case study | Relevant case study | Returned global media Data/AI modernization and cloud migration/DevOps case studies with published scale/outcome details. | Enterprise Data & AI Modernization; Global Media & Advertising Cloud Migration | PASS | LOW | Strong topic and content-type match. |
| TC-16 | Kagen platform & products | Kagen platform, Kagen ADD and Kagen VOICE | “I couldn't find a strongly matching Successive kagen product…” | None | FAIL | HIGH | Flagship product discovery remains a false negative. |
| TC-17 | Kagen VOICE | Define product | “I couldn't find a strongly matching Successive kagen product…” | None | FAIL | HIGH | Regression versus the supplied benchmark, which previously found Kagen VOICE evidence. |
| TC-18 | Accelerators | Accelerator overview/list | Explained accelerator coverage across Product Engineering, CMS, GIS, Commerce, Cloud and Adobe. | [Accelerators](https://successive.tech/accelerators/) | PASS | LOW | Correct accelerator page and relevant overview. |
| TC-19 | AWS Well-Architected | Definition + Successive offering | Explained the AWS Well-Architected review, framework pillars and remediation approach. | [AWS Well-Architected Review](https://successive.tech/aws-well-architected/) | PASS | LOW | Direct, accurate and source-aligned. |
| TC-20 | Awards | Awards overview | Returned an awards/recognition overview and the canonical awards page. | [Awards & Recognitions](https://successive.tech/awards/) | PASS | LOW | Correct source and intent. Response contains some generic marketing copy but remains relevant. |
| TC-21 | Culture & values | Culture plus all five values | Enumerated Value Focused, Innovation, Joy, Agility and Integrity with descriptions. | [About Us](https://successive.tech/about-us/) | PASS | LOW | Previous completeness issue is resolved; all five values are listed. |
| TC-22 | Shopify development? | Shopify expertise | Returned Shopify consultation, web, theme, app, marketplace, POS and migration services. | [Shopify Development Company](https://successive.tech/shopify-development/) | PASS | LOW | Previous false negative is resolved. Dedicated Shopify page retrieved. |
| TC-23 | Python development? | Python expertise | Returned Python development services and Flask, Django and Tornado framework evidence. | [Python Development Company](https://successive.tech/python-development/) | PASS | LOW | Dedicated Python page and relevant answer. |
| TC-24 | Java/.NET development? | Separate Java and .NET capability information | Confirmed both technologies in one sentence and cited Global Capabilities, but supplied no separate Java/.NET detail. | Inline: [Global Capabilities](https://successive.tech/global-capabilities/) | PARTIAL | LOW | Accurate but under-detailed and incomplete for the compound technology request. |
| TC-25 | Phone & email | Published phones and explicit email availability | Returned +1 (315) 818-3656 and +91 (120) 425-9482; explicitly stated no direct published email and linked the contact form. | [Get In Touch](https://successive.tech/contact/) | PASS | LOW | Both requested fields handled correctly. |
| TC-26 | Office locations | Dallas HQ and India/other office locations | Only directed the user to Contact Us and did not list office locations. | [Get In Touch](https://successive.tech/contact/) | FAIL | MEDIUM | Navigation is not a substitute for the requested location facts. |
| TC-27 | Founder | Sid Pandey | Returned “Sid Pandey — Founder & CEO.” | [About Us](https://successive.tech/about-us/#w-tabs-5-data-w-pane-1) | PASS | LOW | Exact requested fact and authoritative source. |
| TC-28 | Can Successive build a chatbot? | Conversational AI/chatbot capability | “I couldn’t confirm the requested fact for chatbot…” | None | FAIL | MEDIUM | Likely false abstention given published conversational-AI and virtual-assistant capability evidence. |
| TC-29 | Latest news | Newest valid press/news item | “I couldn’t confirm the current or latest status for news…” | None | FAIL | MEDIUM | Safe abstention avoids stale-news hallucination, but the latest-news request remains unanswered. |
| TC-30 | Blockchain services | Dedicated blockchain service/capability | “I couldn't find a strongly matching Successive service…” | None | FAIL | MEDIUM | False abstention if the expected blockchain page remains published/indexable. |
| TC-31 | Successive only operates in the US, right? Do you have offices in India? | Correct false premise + India locations | Corrected the premise by describing a global footprint and explicitly mentioned India, London, Dallas and Johannesburg. Also exposed duplicated raw map labels and unrelated leadership text. | [About Us](https://successive.tech/about-us/) | PARTIAL | MEDIUM | Premise correction now works, but response cleanup and precise India office details are incomplete. |
| TC-32 | Agritech work | Agriculture/AgriTech capability | Described farm-management, monitoring, irrigation, AI analytics, crop surveillance and related marketplace content. | [Agritech Software Development](https://successive.tech/agritech-software-development/); [Agritech marketplace blog](https://successive.tech/blog/agritech-and-e-commerce-are-driving-direct-to-farmer-marketplaces/) | PASS | LOW | Strong topic match; both service and supporting blog are directly relevant. |

## Actual response excerpts for failed cases

### TC-7 — Exact API blog

> An API, or Application Programming Interface, is an interface among software and within the software... API Latency & Failure in Commerce System... Status Codes in API Testing...

Result: the answer is about APIs, but it does not demonstrate retrieval of the requested exact blog title.

### TC-8 — Google Cloud partnership

> I couldn’t confirm the formal partnership relationship for google cloud from the available Successive content.

### TC-16 — Kagen platform and products

> I couldn't find a strongly matching Successive kagen product for this topic.

### TC-17 — Kagen VOICE

> I couldn't find a strongly matching Successive kagen product for this topic.

### TC-26 — Office locations

> Contact Successive through the official Contact Us page. We’d love to help you start exceeding your business goals.

### TC-28 — Chatbot capability

> I couldn’t confirm the requested fact for chatbot from the available Successive content.

### TC-29 — Latest news

> I couldn’t confirm the current or latest status for news from the available Successive content.

### TC-30 — Blockchain services

> I couldn't find a strongly matching Successive service for this topic.

## Priority QA findings

### High

1. Kagen and Kagen VOICE product retrieval both fail despite expected first-class product evidence.

### Medium

1. Google Cloud formal partnership is not retrieved.
2. Exact named-blog handling still substitutes related API/Flutter articles or fails to expose the exact source as primary.
3. Office-location questions return navigation rather than facts.
4. Chatbot/conversational-AI capability likely false-abstains.
5. Latest news safely abstains but does not locate and freshness-sort news records.
6. Blockchain service retrieval false-abstains.
7. False-premise correction works, but API-label cleanup is incomplete.
8. Logistics synthesis contains potentially cross-contaminated operational details.

### Low

1. Microservices definition lacks corresponding Successive service evidence.
2. Cloud-computing response needs a definition-first opening.
3. Data Science/ML should prioritize the dedicated Data Science page when available.
4. Java/.NET compound request needs separate details for both technologies.
5. Partner labels such as “esri partner member” and “Adobe Solution Partner badge Silver” need safe display cleanup.

## Acceptance conclusion

The current chatbot is usable on 24 of 32 supplied cases (75%), with 17 strict passes. The Node.js, Shopify and culture/value issues from the earlier benchmark are resolved. The main remaining acceptance blockers are first-class Kagen product discovery, exact named-resource retrieval, Google Cloud partnership evidence, office-location facts, capability false negatives, and freshness-based news retrieval.
