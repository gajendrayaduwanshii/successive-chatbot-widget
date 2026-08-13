# Chatbot Generic Testing Report V3

> Validation date: 12 August 2026  
> Source: current repository and a fresh 59-document sample spanning pages, posts, case studies, industries, partners, thought leadership, employee perspectives, and accelerators.  
> Evaluation: 88 standalone semantic queries plus 10 conversation turns. Acceptance was judged for intent, primary authority, grounding, requested type, and card quality—not HTTP success alone.

## Executive summary

| Metric | V2 | V3 |
| --- | ---: | ---: |
| Total semantic tests | 59 comparison rows | 98 |
| Accepted | 29 | 75 |
| Partial | 20 | 11 |
| Not Accepted | 10 | 12 |
| Strict acceptance | 49.2% | 76.5% |
| Usable | 83.1% | 87.8% |
| Timeout/no payload | 0 | 0 |
| No-evidence responses | Not recorded | 1 after final exact-title correction |
| Incorrect no-evidence responses | Not recorded | 1 |
| Irrelevant-card occurrences | Not recorded | 9 |
| Exact normalized title lookup | Not measured | 28/28 (100%) |
| Business-problem capability success | Not measured | 7/22 strict; 12/22 usable |
| Conversation-switch success | 1/3 clean | 2/3 clean |
| Content-type + topic success | Mixed | 4/5 |
| Off-topic scope success | 5/5 | 5/5 (100%) |
| P50 latency | 2768 ms | 2893 ms |
| P95 latency | 11805 ms | 19789 ms |

V3 exceeds the 75% strict-acceptance target and reaches 100% exact-title and off-topic coverage in the tested sets. It does not reach the 90% usable target; natural business-problem-to-capability mapping remains the main gap. Provider/cold-load variability increased measured P95, although no additional LLM calls were introduced and no payload timed out.

## Group A — V2 Partial / Not Accepted regressions

| Query | V2 Status | V3 Status | What Changed |
| --- | --- | --- | --- |
| What does Successive do with geospatial data? | Partial | Partial | Topic is usable, but authority/topic-specific evidence is still not fully direct. |
| Tell me about cloud identity rightsizing | Partial | Partial | Topic is usable, but authority/topic-specific evidence is still not fully direct. |
| Could a decoupled content platform help our global teams? | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Kubernetes | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Can you help forestry teams manage field operations? | Partial | Not Accepted | Still maps the natural need to unrelated capability evidence. |
| Any webinar related to generative AI? | Partial | Partial | Topic is usable, but authority/topic-specific evidence is still not fully direct. |
| Show me thought leadership about enterprise architecture. | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about Successive Digital. | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about Scan | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Do you have information about Location Intelligence for Smarter Decisions and Enterprise Advantage? | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about Accelerators Turn Enterprise Priorities into Faster Execution | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Do you have information about GIS & GeoAI Consulting Services? | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| What business needs does Current State Assessment & Architecture Consulting address? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Do you have information about Turn Location Data Into Decisions With Enterprise Esri ArcGIS Solutions? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about The JioMart Playbook for Speed & Scale | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| What business needs does Corent ComPaaS Guide: Unified FinOps, AppOps, and CloudOps address? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Do you have information about What Is Corent MaaS? An Enterprise Guide to Automated Cloud Migration? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about Achieve Modernisation Through Agentic-Driven Delivery for Legacy Systems | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Do you have information about Cloud Consulting Services: Guide to Strategy, Benefits, and Implementation? | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about AWS Advanced Consulting Partner vs Standard Partner: What’s the Difference? | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Do you have information about DevOps Consulting Services for Cloud Automation and CI/CD Success? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about From Legacy Monoliths to a Cloud-Native Platform | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| What business needs does Lift-and-Shift Cloud Modernization for an Aerial Imagery Enterprise address? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about Eliminating Inventory Inconsistencies Across Multi-Vendor Ecosystems | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| What business needs does Automating Financial Governance and Vendor Settlements address? | Not Accepted | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Tell me about Travel & Hospitality | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| What business needs does Retail & Commerce Software Development Solutions address? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |
| Do you have information about Healthcare & Life Sciences? | Partial | Accepted | Primary or exact authority now selected; noisy cards removed. |

## Group B — new current-content exact resource queries

| Query | V3 Status | Evidence |
| --- | --- | --- |
| Tell me about Webinars | Accepted | Normalized lookup selected Webinars as the primary card. |
| Do you have information about Location Intelligence for Smarter Decisions and Enterprise Advantage? | Accepted | Normalized lookup selected Location Intelligence for Smarter Decisions and Enterprise Advantage as the primary card. |
| Tell me about Accelerators Turn Enterprise Priorities into Faster Execution | Accepted | Normalized lookup selected Accelerators Turn Enterprise Priorities into Faster Execution as the primary card. |
| Do you have information about GIS & GeoAI Consulting Services? | Accepted | Normalized lookup selected GIS & GeoAI Consulting Services as the primary card. |
| Tell me about FinOps Consulting Services | Accepted | Normalized lookup selected FinOps Consulting Services as the primary card. |
| Do you have information about Current State Assessment & Architecture Consulting? | Accepted | Normalized lookup selected Current State Assessment & Architecture Consulting as the primary card. |
| Tell me about Turn Location Data Into Decisions With Enterprise Esri ArcGIS Solutions | Accepted | Normalized lookup selected Turn Location Data Into Decisions With Enterprise Esri ArcGIS Solutions as the primary card. |
| Do you have information about The JioMart Playbook for Speed & Scale? | Accepted | Normalized lookup selected The JioMart Playbook for Speed & Scale as the primary card. |
| Tell me about Corent ComPaaS Guide: Unified FinOps, AppOps, and CloudOps | Accepted | Normalized lookup selected Corent ComPaaS Guide: Unified FinOps, AppOps, and CloudOps as the primary card. |
| Do you have information about What Is Corent MaaS? An Enterprise Guide to Automated Cloud Migration? | Accepted | Normalized lookup selected What Is Corent MaaS? An Enterprise Guide to Automated Cloud Migration as the primary card. |
| Tell me about Achieve Modernisation Through Agentic-Driven Delivery for Legacy Systems | Accepted | Normalized lookup selected Achieve Modernisation Through Agentic-Driven Delivery for Legacy Systems as the primary card. |
| Do you have information about How Different Industries Use AWS Cloud Solutions to Drive Innovation?? | Accepted | Normalized lookup selected How Different Industries Use AWS Cloud Solutions to Drive Innovation? as the primary card. |
| Tell me about Cloud Consulting Services: Guide to Strategy, Benefits, and Implementation | Accepted | Normalized lookup selected Cloud Consulting Services: Guide to Strategy, Benefits, and Implementation as the primary card. |
| Do you have information about AWS Advanced Consulting Partner vs Standard Partner: What’s the Difference?? | Accepted | Normalized lookup selected AWS Advanced Consulting Partner vs Standard Partner: What’s the Difference? as the primary card. |
| Tell me about Key AWS-Native Capabilities Enterprises Must Evaluate Before Cloud Adoption | Accepted | Normalized lookup selected Key AWS-Native Capabilities Enterprises Must Evaluate Before Cloud Adoption as the primary card. |
| Do you have information about DevOps Consulting Services for Cloud Automation and CI/CD Success? | Accepted | Normalized lookup selected DevOps Consulting Services for Cloud Automation and CI/CD Success as the primary card. |
| Tell me about Beyond Lift-and-Shift: How Firms Can Move to the Cloud and Actually Move Forward | Accepted | Normalized lookup selected Beyond Lift-and-Shift: How Firms Can Move to the Cloud and Actually Move Forward as the primary card. |
| Do you have information about How Brands Can Scale Through Localization, Technology, and Marketplace Strategy? | Accepted | Normalized lookup selected How Brands Can Scale Through Localization, Technology, and Marketplace Strategy as the primary card. |
| Show me the customer story Unified AWS-Powered AEM Platform for Six Agricultural Brands | Accepted | Normalized lookup selected Unified AWS-Powered AEM Platform for Six Agricultural Brands as the primary card. |
| Show me the customer story Accelerating Azure Cloud Migration for a Time-Critical Data Center Exit | Accepted | Normalized lookup selected Accelerating Azure Cloud Migration for a Time-Critical Data Center Exit as the primary card. |
| Show me the customer story Modernizing VMware Infrastructure with Azure Stack HCI | Accepted | Normalized lookup selected Modernizing VMware Infrastructure with Azure Stack HCI as the primary card. |
| Show me the customer story AI-Driven Media Operations Platform on AWS Cloud | Accepted | Normalized lookup selected AI-Driven Media Operations Platform on AWS Cloud as the primary card. |
| Show me the customer story From Legacy Monoliths to a Cloud-Native Platform | Accepted | Normalized lookup selected From Legacy Monoliths to a Cloud-Native Platform as the primary card. |
| Show me the customer story Lift-and-Shift Cloud Modernization for an Aerial Imagery Enterprise | Accepted | Normalized lookup selected Lift-and-Shift Cloud Modernization for an Aerial Imagery Enterprise as the primary card. |
| Show me the customer story Agentic AI Onboarding Automation Platform for Healthcare Staffing | Accepted | Normalized lookup selected Agentic AI Onboarding Automation Platform for Healthcare Staffing as the primary card. |
| Show me the customer story Eliminating Inventory Inconsistencies Across Multi-Vendor Ecosystems | Accepted | Normalized lookup selected Eliminating Inventory Inconsistencies Across Multi-Vendor Ecosystems as the primary card. |
| Show me the customer story Automating Financial Governance and Vendor Settlements | Accepted | Normalized lookup selected Automating Financial Governance and Vendor Settlements as the primary card. |
| Show me the customer story Accelerating Marketplace Launch for Platform-Led Commerce Growth | Accepted | Normalized lookup selected Accelerating Marketplace Launch for Platform-Led Commerce Growth as the primary card. |

All 28 normalized title lookups passed after final targeted verification. This includes HTML-entity ampersands, smart apostrophes, hyphen variants, question marks inside titles, and titles containing words such as Services, Industries, and Partner.

## Group C — natural business and scope queries

These queries were generated from current hero descriptions, case-study challenges, employee-perspective summaries, and partner descriptions without copying page titles as the query subject.

| Query | V3 Status | Assessment |
| --- | --- | --- |
| Can Successive help our business with this need: Accelerate delivery, boost productivity, and bring ideas to market faster with Kagen ADD, our AI-native platform that helps enterprises plan,? | Partial | Useful direction, but primary capability or cards remain mixed. |
| Can Successive help our business with this need: Enterprises today cannot afford architecture uncertainty? | Partial | Useful direction, but primary capability or cards remain mixed. |
| Can Successive help our business with this need: Build a scalable, GIS-powered ecosystem that turns location data into actionable insights, enabling smarter planning, faster decisions, and stronger operational? | Not Accepted | No reliable primary capability or incorrect evidence. |
| We are facing a similar challenge: The client had six brand websites, six audiences, two regional markets and one content team and there was no platform. What capability could help? | Accepted | Direct evidence and clean cards. |
| We are facing a similar challenge: The client had two months to exit its data center and migrate 300 Windows and Linux servers to Azure. What capability could help? | Accepted | Direct evidence and clean cards. |
| We are facing a similar challenge: The client needed to execute a large-scale VMware to Azure Stack HCI migration within an embedded security model. What capability could help? | Accepted | Direct evidence and clean cards. |
| We are facing a similar challenge: The client’s operations spanned briefs in documents, plans in planning tools, buying in buying tools, and reporting in dashboards –. What capability could help? | Partial | Useful direction, but primary capability or cards remain mixed. |
| We are facing a similar challenge: The enterprise application landscape included multiple mission-critical platforms supporting customer engagement, logistics operations, order visibility, ticket creation, dispatch reporting, and. What capability could help? | Not Accepted | No reliable primary capability or incorrect evidence. |
| We are facing a similar challenge: A leading aerial imagery enterprise struggled with fragmented infrastructure spanning multiple platforms (Docker, Kubernetes, Rancher) and storage systems, managing 32+. What capability could help? | Partial | Useful direction, but primary capability or cards remain mixed. |
| We are facing a similar challenge: Each placement required 15-25 minutes of manual review across OB requests, stipulations, compliance records, and recruiter notes, producing conflicting signals. What capability could help? | Not Accepted | No reliable primary capability or incorrect evidence. |
| We are facing a similar challenge: Rapid vendor growth created inventory mismatches across the marketplace, leading to cancelled orders, customer complaints, and declining trust. What capability could help? | Partial | Useful direction, but primary capability or cards remain mixed. |
| We are facing a similar challenge: As more vendors joined the marketplace, financial reconciliation became increasingly difficult to manage manually. What capability could help? | Accepted | Direct evidence and clean cards. |
| We are facing a similar challenge: Existing commerce infrastructure supported only single-seller operations, making marketplace launch complex, time-intensive, and engineering-heavy. What capability could help? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Can Successive help our business with this need: As a Corent partner, Successive Digital helps enterprises modernize applications, optimize cloud operations, and build scalable SaaS models? | Accepted | Direct evidence and clean cards. |
| Can Successive help our business with this need: We position GIS as an enterprise decision layer, not merely a mapping stack — engineering Esri ArcGIS into the systems? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Can Successive help our business with this need: Together, Strapi and Successive Digital help enterprises build flexible, scalable and connected digital experiences? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Can Successive help our business with this need: As AI systems are built to last decades, most rely on cryptography that won’t survive quantum computing? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Can Successive help our business with this need: Enterprise architecture is moving from rule-based certainty to AI-driven probabilistic intelligence? | Accepted | Direct evidence and clean cards. |
| Can Successive help our business with this need: Strategic Account Management (SAM) shifts the focus from transactional sales to long-term partnerships? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Can Successive help our business with this need: Channel partnerships are evolving from a linear, transactional model to dynamic ecosystems focused on co-innovation, shared insights, and faster market? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Can Successive help our business with this need: Frontend development bridges the gap between creativity and business outcomes by transforming design into actionable user experiences? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Can Successive help our business with this need: Enterprise mobility has evolved into a core business enabler, empowering work anytime, anywhere, with security and efficiency? | Accepted | Direct evidence and clean cards. |
| What's the weather tomorrow? | Accepted | Direct evidence and clean cards. |
| Write a birthday poem. | Accepted | Direct evidence and clean cards. |
| Recommend a science-fiction movie. | Accepted | Direct evidence and clean cards. |
| Who won the football match? | Accepted | Direct evidence and clean cards. |
| What is the capital of Japan? | Accepted | Direct evidence and clean cards. |
| What is GeoAI and can it support field operations? | Not Accepted | No reliable primary capability or incorrect evidence. |
| Could DevSecOps make releases safer? | Accepted | Direct evidence and clean cards. |
| Any case study about cloud migration? | Accepted | Direct evidence and clean cards. |
| Do you have a whitepaper about modernization? | Accepted | Direct evidence and clean cards. |
| Show me a blog about Kubernetes. | Accepted | Direct evidence and clean cards. |

## Multi-turn conversations

| Turn | Status | Cards/evidence |
| --- | --- | --- |
| Tell me about FinOps. | Accepted | FinOps Consulting Services; FinOps and Cloud Optimization Services: Maximize Value, Minimize Cloud Spend; Cloud FinOps: The Ultimate Guide to Cloud Cost Optimization |
| What about retail commerce? | Accepted | From Discovery to Checkouts: How AI is Reshaping Retail Customer Experience?; What are the Technical Challenges of Implementing AR/VR in Retail Customer Experience? |
| How can this help my company? | Accepted | Unified Enterprise Commerce Solutions |
| Tell me about headless CMS. | Accepted | Headless CMS Development Company |
| What about travel companies? | Partial | Headless CMS Development Company; Headless CMS: How This Global Media Leader Unified Content Operations and Cut Manual Work by 70%; Umbraco vs. Strapi: Which Should You Choose as Your Open-source Headless CMS? |
| What would you suggest? | Partial | Headless CMS Development Company; Umbraco vs. Strapi: Which Should You Choose as Your Open-source Headless CMS? |
| We need better application performance. | Partial | High-Performance Mobile Apps, Built for Every Platform; Performance Marketing and Growth Marketing Services; Performance Engineering Services |
| Show me a case study about this. | Accepted | Scalable Digital Experience Delivered by Migrating Drupal Hosting to a Cloud-Based Solution |
| Now switch to cloud cost control. | Accepted | Cloud Cost Optimization; The Ultimate Cloud Cost Optimization Strategy: 8 Practices to Cut Down Cost; Cloud FinOps: The Ultimate Guide to Cloud Cost Optimization |
| How would this help us? | Accepted | Cloud Cost Optimization; The Ultimate Cloud Cost Optimization Strategy: 8 Practices to Cut Down Cost; Cloud FinOps: The Ultimate Guide to Cloud Cost Optimization |

- FinOps → retail commerce → “this” retained retail as the newest subject.
- Headless CMS → travel → recommendation retained headless CMS but applied the travel constraint inconsistently.
- Application performance → case study → cloud cost control → “this” switched cleanly to FinOps/cloud cost.

## Controlled reliability

| Concurrency | Success | Timeouts | P50 | P95 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 8/8 | 0 | 12214 ms | 22519 ms |
| 2 | 8/8 | 0 | 10512 ms | 22805 ms |
| 4 | 8/8 | 0 | 25866 ms | 27321 ms |

Reliability is preserved: 98/98 semantic turns and 24/24 controlled burst requests returned payloads. The existing 10-item pagination, bounded concurrency, shared in-flight builds, stale fallback, partial index, index reuse, and no-randomization behavior remain unchanged.

## Architecture changes

### Canonical normalization

The same normalization now applies to queries and indexed identity fields: HTML/numeric entities, Unicode normalization, curly quotes, apostrophes, smart dashes, ampersand/and equivalence, diacritics, whitespace, punctuation, and case.

### Document authority and roles

Every indexed document receives a structural role: company, service, industry, partner, case study, resource, editorial, career, or general page. Ranking distinguishes exact title/slug/alias/entity identity, primary service authority, headings, structured metadata, and body-only mentions.

### Exact resource mode

Detail-shaped queries perform normalized title/slug/alias lookup before semantic expansion. Exact identity overrides content-type words that are part of the title; genuinely explicit prefixes such as show me a customer story still enforce type compatibility.

### Website-derived capability profiles

Service and capability profiles derive identity, problem, and outcome terms from titles, slugs, service type, hero/H1/H2/ACF headings, descriptions, challenges, solutions, outcomes, industry, and metadata. Business-problem ranking boosts service-role evidence and demotes editorial/case-study evidence as the primary recommendation.

### Company/About authority

Pure company discovery uses the current canonical /pages/about-us API document. The answer and card are generated from that page, not a hardcoded company description. Company phrasing with a strong subject continues through subject retrieval.

### Content type and topic

Hard type filtering is activated only by explicit visitor wording. LLM-inferred types cannot silently exclude exact content. Thought-leadership requests can use the actual thought-leadership and employee-perspective structures. Topic authority is still required; a generic webinar listing does not count as proof of a topic webinar.

### Conversation and cards

Follow-up recognition includes recommendation phrasing, newest explicit subjects win, and query-plan expansion is penalized so inferred concepts cannot overpower the original subject. LLM context may use medium evidence; cards require high confidence or strong medium authority and are never padded.

## Root-cause status

| Root cause | Status | Evidence |
| --- | --- | --- |
| Primary authority | Improved | Kubernetes now leads with the dedicated consulting card; some natural needs remain noisy. |
| Exact title normalization | Fixed | 28/28 current-content exact lookups. |
| Business-problem mapping | Improved | 12/22 usable, but only 7/22 strict. |
| Company/About authority | Fixed | Canonical API-derived About route; subject-bearing company phrasing remains topical. |
| Content type + topic | Improved | 4/5; topic-specific webinar remains transparent but listing-card behavior is still imperfect. |
| Conversation switching | Improved | 2/3 clean scenarios. |
| Card relevance | Improved | Strict confidence gate; 9 noisy-card occurrences remain, concentrated in natural problems. |
| No-evidence accuracy | Improved | Exact false negatives removed; one natural capability false negative remains. |
| Reliability | Preserved | Zero no-payload/timeouts in semantic and controlled-burst runs. |

## Automated verification

- Unit/integration tests: 86 passed, 9 skipped.
- TypeScript: passed.
- ESLint: passed.
- Production Next.js build: passed.
- Live semantic tests: 98/98 returned payloads.
- Controlled concurrency: 24/24 returned payloads.

## Remaining limitations

- Natural business needs expressed through long operational narratives still sometimes select broad or adjacent services, especially when website service pages do not use the same problem language.
- Industry constraints can be weaker than an inherited technology topic in recommendation follow-ups.
- Topic-specific webinar discovery is limited by the current API representation: the listing page does not itself prove a matching webinar.
- Nine responses still included at least one materially adjacent/noisy card under strict review.
- P95 was 19.8 seconds in the full semantic run and up to 27.3 seconds at concurrency four. No extra LLM pass was added; provider latency and cold/warm runtime variation remain material.
- In-memory index/cache state is per runtime instance rather than a shared durable prebuilt index.

