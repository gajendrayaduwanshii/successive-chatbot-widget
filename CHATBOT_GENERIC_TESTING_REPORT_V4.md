# Chatbot Generic Testing Report V4

> Validation date: 12 August 2026  
> Method: current WordPress content snapshot; V3 regressions; dynamically rewritten discovery probes; 30 realistic visitor business problems; multi-constraint, content-type, exact-title, scope, and conversation tests. Awkward machine-rewritten probes are reported but excluded from the realistic business subset.  
> Grading is strict: related wording or HTTP success alone is not Accepted.

## V3 vs V4

| Metric | V3 | V4 |
| --- | ---: | ---: |
| Total semantic tests | 98 | 102 |
| Accepted | 75 | 52 |
| Partial | 11 | 28 |
| Not Accepted | 12 | 22 |
| Strict acceptance | 76.5% | 51.0% |
| Usable | 87.8% | 78.4% |
| Timeout/no payload | 0 | 0 |
| P50 | 2893 ms | 7703 ms |
| P95 | 19789 ms | 20042 ms |
| Exact-title regression | 100% | 10/10 (100%) |
| Off-topic regression | 100% | 5/5 (100%) |

V4 did not meet the 80% overall strict or 90% usable targets. The test set is substantially harder and more natural-problem-heavy than V3, but the result still shows that capability mapping and card precision need more work.

## Business-problem subset

| Metric | Result |
| --- | ---: |
| Total realistic problems | 30 |
| Accepted | 10 |
| Partial | 14 |
| Not Accepted | 6 |
| Strict | 33.3% |
| Usable | 80.0% |

The strict realistic business-problem rate is effectively flat versus V3’s 31.8% and remains far below the 75% target. Strong outcomes include FinOps, legacy modernization, cloud migration, enterprise CMS/content consolidation, Azure migration, marketplace reconciliation, media operations, and release engineering. Weak areas include onboarding automation, offline field work, cross-channel consistency, infrastructure workflow automation, and customer-support unification.

## Other subset metrics

| Subset | Result |
| --- | ---: |
| Multi-constraint strict success | 3/10 |
| Conversation topic/industry retention | 2/3 scenarios clean |
| Content-type + topic | 5/5 |
| Exact title | 10/10 |
| Off-topic scope | 5/5 |
| Irrelevant/noisy-card occurrences | 28 |

## Semantic results

| Query | Group | Status | Cards |
| --- | --- | --- | --- |
| We need better application performance. | regression | Accepted | Performance Engineering Services; Google Cloud Consulting Partner |
| Can you help forestry teams manage field operations? | regression | Partial | No cards |
| What is GeoAI and can it support field operations? | regression | Accepted | Enterprise GIS & GeoAI, Engineered on Esri ArcGIS; GIS & GeoAI Consulting Services |
| Our inventory is inconsistent across marketplace vendors. | regression | Partial | No cards |
| Our teams manually reconcile vendor settlements. | regression | Partial | No cards |
| Our commerce platform only supports one seller and cannot scale. | regression | Partial | Omnichannel Commerce Solutions: Enhance Shopping & Boost Growth; Adobe Commerce Cloud Partners; Maximize ROI With Adobe Commerce Marketplace Development |
| We have content spread across six brand websites. | regression | Accepted | Transform Digital Content Management with Enterprise CMS Solutions |
| Our application landscape is fragmented across critical systems. | regression | Accepted | Cloud Native Application Development Services for Enterprise Apps; Application Modernization Services for Legacy Systems |
| We need faster releases without weakening security. | regression | Accepted | Strengthen Compliance with Cloud Security Services |
| Our cloud costs keep growing and ownership is unclear. | regression | Not Accepted | Google Cloud Consulting Partner; Cloud Consulting Services Driving Business Transformation; Cloud Transformation Services for Modern Business |
| Our teams are struggling with accelerate delivery, productivity,. Which capability could help us? | business | Not Accepted | Supply Chain Management Software Development |
| We need to improve optimize spend, improve without adding more manual work. Where should we start? | business | Not Accepted | Hospital Management System Development Company |
| Our current systems make cannot afford architecture difficult to manage and scale. Can Successive help? | business | Accepted | Design and Implement Scalable Data Architecture Services; Modern Data Architecture Services |
| We lack reliable visibility into scalable, gis-powered ecosystem. What would you recommend? | business | Accepted | No cards |
| Too much time is being spent on websites, audiences, regional. How could we streamline it? | business | Not Accepted | No cards |
| Our teams are struggling with months center migrate. Which capability could help us? | business | Accepted | Migrate & Modernize with Confidence through Cloud Migration Services |
| We need to improve needed execute large-scale without adding more manual work. Where should we start? | business | Not Accepted | Cloud Transformation Services for Modern Business; Hospital Management System Development Company; DevSecOps Consulting Services |
| Our current systems make operations spanned briefs difficult to manage and scale. Can Successive help? | business | Partial | Data Modernization |
| We lack reliable visibility into application landscape included. What would you recommend? | business | Accepted | Cloud Native Application Development Services for Enterprise Apps; Application Modernization Services for Legacy Systems |
| Too much time is being spent on leading aerial imagery. How could we streamline it? | business | Not Accepted | How Much Does React Native App Development Cost?; How Much Does It Cost to Make An App?; Fraud Detection With AI Models in FinTech: Real-Time Risk Mitigation |
| Our teams are struggling with placement required minutes. Which capability could help us? | business | Not Accepted | Supply Chain Management Software Development |
| We need to improve vendor growth created without adding more manual work. Where should we start? | business | Not Accepted | Performance Marketing and Growth Marketing Services; Drive Growth with a Customer Experience Audit; Omnichannel Commerce Solutions: Enhance Shopping & Boost Growth |
| Our current systems make vendors joined marketplace, difficult to manage and scale. Can Successive help? | business | Accepted | Maximize ROI With Adobe Commerce Marketplace Development; Application Modernization Services for Legacy Systems |
| We lack reliable visibility into existing commerce infrastructure. What would you recommend? | business | Accepted | Adobe Commerce Cloud Partners; Omnichannel Commerce Solutions: Enhance Shopping & Boost Growth |
| Too much time is being spent on corent partner, modernize. How could we streamline it? | business | Accepted | No cards |
| Our teams are struggling with position decision layer,. Which capability could help us? | business | Not Accepted | Maritime Software and Solutions Engineering; Design and Implement Scalable Data Architecture Services; Hospital Management System Development Company |
| We need to improve together, strapi flexible, without adding more manual work. Where should we start? | business | Accepted | Strapi CMS Development Company |
| Our current systems make systems decades, cryptography difficult to manage and scale. Can Successive help? | business | Partial | Application Modernization Services for Legacy Systems; Build Resilient Systems with DevOps Consulting Services |
| We lack reliable visibility into architecture moving rule-based. What would you recommend? | business | Accepted | Design and Implement Scalable Data Architecture Services; Modern Data Architecture Services |
| Too much time is being spent on strategic account management. How could we streamline it? | business | Not Accepted | How Much Does React Native App Development Cost?; How Much Does It Cost to Make An App?; Fraud Detection With AI Models in FinTech: Real-Time Risk Mitigation |
| Our teams are struggling with channel partnerships evolving. Which capability could help us? | business | Not Accepted | Omnichannel Commerce Solutions: Enhance Shopping & Boost Growth; Supply Chain Management Software Development |
| We need to improve frontend development bridges without adding more manual work. Where should we start? | business | Accepted | Web App Development Company; Drupal Development Company; Virtual Reality (VR) App Development Company |
| Our current systems make mobility evolved enabler, difficult to manage and scale. Can Successive help? | business | Partial | Application Modernization Services for Legacy Systems |
| We need headless CMS capabilities for a travel company. What would you suggest? | multi | Accepted | Headless CMS Development Company |
| Which cloud migration capability fits a healthcare organization with legacy applications? | multi | Accepted | Migrate & Modernize with Confidence through Cloud Migration Services |
| Do you have a case study about improving application performance in retail? | multi | Not Accepted | Modernized Legacy Healthcare Applications on AWS Cloud; Developed a Mobile Application for a Leading Apparel Brand; Transforming Wait Times With Virtual Queue Management And Mobile Application Development |
| We use AWS and need to reduce infrastructure costs. Which service fits? | multi | Partial | Migrate & Modernize with Confidence through Cloud Migration Services; Build Resilient Systems with DevOps Consulting Services |
| Our agriculture field teams need better location visibility. Can GeoAI help? | multi | Accepted | No cards |
| We need commerce automation for a multi-vendor marketplace. | multi | Partial | Omnichannel Commerce Solutions: Enhance Shopping & Boost Growth; Maximize ROI With Adobe Commerce Marketplace Development; Mobile QA Automation & Testing Services |
| Which DevSecOps capability can help a financial services team release safely? | multi | Not Accepted | Cloud Native Application Development Services for Enterprise Apps |
| Do you have a whitepaper about modernizing cloud applications? | multi | Partial | No cards |
| We need consistent customer experiences across web and mobile in retail. | multi | Partial | eCommerce Web Development Company; Progressive Web App Development Company; Web App Development Company |
| Our media operations use disconnected planning and reporting systems. What capability fits? | multi | Not Accepted | No cards |
| Any case study about cloud migration? | content | Accepted | Cloud Migration & DevOps Consulting: How a Global Media & Advertising Leader Achieved Scalable, High-Performance Operations; Improving Customer Experience with Cloud Migration; Accelerating Azure Cloud Migration for a Time-Critical Data Center Exit |
| Show me a blog about Kubernetes. | content | Accepted | Is Kubernetes Still Just an Ops Topic?; Everything You Need to Know About Kubernetes Operator and SRE |
| Do you have thought leadership about enterprise architecture? | content | Accepted | Enterprise Architecture Is Shifting from Deterministic Systems to Probabilistic Intelligence |
| Is there a webinar specifically about generative AI? | content | Accepted | No cards |
| Do you have a whitepaper about application modernization? | content | Accepted | Application Modernization |
| Tell me about Location Intelligence for Smarter Decisions and Enterprise Advantage | exact | Accepted | Location Intelligence for Smarter Decisions and Enterprise Advantage |
| Tell me about Accelerators Turn Enterprise Priorities into Faster Execution | exact | Accepted | Accelerators Turn Enterprise Priorities into Faster Execution |
| Tell me about GIS & GeoAI Consulting Services | exact | Accepted | GIS & GeoAI Consulting Services |
| Tell me about FinOps Consulting Services | exact | Accepted | FinOps Consulting Services |
| Tell me about Current State Assessment & Architecture Consulting | exact | Accepted | Current State Assessment & Architecture Consulting |
| Tell me about Turn Location Data Into Decisions With Enterprise Esri ArcGIS Solutions | exact | Accepted | Turn Location Data Into Decisions With Enterprise Esri ArcGIS Solutions |
| Tell me about The JioMart Playbook for Speed & Scale | exact | Accepted | The JioMart Playbook for Speed & Scale |
| Tell me about Unified AWS-Powered AEM Platform for Six Agricultural Brands | exact | Accepted | No cards |
| Tell me about Accelerating Azure Cloud Migration for a Time-Critical Data Center Exit | exact | Accepted | No cards |
| Tell me about Modernizing VMware Infrastructure with Azure Stack HCI | exact | Accepted | Modernizing VMware Infrastructure with Azure Stack HCI |
| What's tomorrow's weather? | scope | Accepted | No cards |
| Write a poem about summer. | scope | Accepted | No cards |
| Recommend a movie. | scope | Accepted | No cards |
| Who won the football match? | scope | Accepted | Building a Multi-Vendor Marketplace for a Renowned Football Academy; Multi-Vendor Marketplace for a Renowned Football Academy |
| What is the capital of Brazil? | scope | Accepted | No cards |
| Our customers see different product information on web and mobile. How can we make the experience consistent? | business-supplement | Partial | Progressive Web App Development Company; Mobile QA Automation & Testing Services; Web App Development Company |
| Finance teams cannot tell which department owns each part of our cloud bill. What capability could help? | business-supplement | Not Accepted | Strengthen Compliance with Cloud Security Services; Digital Engineering Services & Solutions |
| Field workers lose access to operational data when they are offline. What would you recommend? | business-supplement | Partial | No cards |
| Our legacy application takes months to change and releases keep getting delayed. Where should we start? | business-supplement | Accepted | Application Modernization Services for Legacy Systems |
| Security reviews happen at the end of delivery and slow every release. Can Successive help? | business-supplement | Partial | Strengthen Compliance with Cloud Security Services |
| We manually review hundreds of onboarding records and decisions are inconsistent. Which capability fits? | business-supplement | Not Accepted | Maritime Software and Solutions Engineering; MVP Development Services |
| Inventory numbers differ between sellers and customers are receiving cancellations. How can we fix this? | business-supplement | Accepted | Supply Chain Management Software Development |
| Our media planning, buying, and reporting data live in separate tools. What capability could unify operations? | business-supplement | Accepted | BI & Data Visualization Company; Data Modernization; Modern Data Architecture Services |
| We need to move hundreds of servers to Azure before our data center contract ends. What service fits? | business-supplement | Accepted | Migrate & Modernize with Confidence through Cloud Migration Services |
| Our content team maintains several brand websites separately and work is duplicated. Can this be streamlined? | business-supplement | Accepted | Transform Digital Content Management with Enterprise CMS Solutions |
| Our marketplace still works like a single-seller store and new vendors take too long to onboard. What should we modernize? | business-supplement | Accepted | Maximize ROI With Adobe Commerce Marketplace Development |
| We cannot see where field incidents are happening or prioritize crews effectively. Could location intelligence help? | business-supplement | Partial | No cards |
| Tell me about headless CMS. | conversation | Accepted | Headless CMS Development Company |
| What about travel companies? | conversation | Accepted | Driving Efficiency and Growth for a Leading Travel Provider; Modernizing Travel Websites with Headless CMS: A Comprehensive Guide to Revamping Legacy Platforms; Travel and Hospitality App Development |
| What would you suggest for reducing manual content work? | conversation | Accepted | Transform Digital Content Management with Enterprise CMS Solutions |
| We need better application performance. | conversation | Partial | Cloud Native Application Development Services for Enterprise Apps; Application Modernization Services for Legacy Systems; Performance Engineering Services |
| What about healthcare? | conversation | Partial | Generative AI in Healthcare & Lifesciences |
| Show me a relevant case study. | conversation | Not Accepted | Digital Transformation: Rebuilding a Maritime Platform for High-Velocity Innovation; Commerce platform Digital Transformation with Magento; Digital Transformation for a Building Material Supplier |
| We need cloud cost control. | conversation | Not Accepted | Adobe Commerce Cloud Partners; Google Cloud Consulting Partner; Cloud Transformation Services for Modern Business |
| Now focus on retail commerce. | conversation | Accepted | Omnichannel Commerce Solutions: Enhance Shopping & Boost Growth; Adobe Commerce Development Company; Maximize ROI With Adobe Commerce Marketplace Development |
| How would this help our company? | conversation | Partial | No cards |

## Additional realistic business problems

| Query | Status | Cards |
| --- | --- | --- |
| Our mobile app becomes unusable when traffic spikes during promotions. Which capability can improve scalability? | Partial | iOS App Development Services; Mobile App Design Company; High-Performance Mobile Apps, Built for Every Platform |
| Different teams keep customer data in separate systems, so reporting takes days. How can we unify it? | Partial | No cards |
| Developers wait for manual infrastructure approvals before every deployment. Can this workflow be automated securely? | Not Accepted | Modernizing VMware Infrastructure with Azure Stack HCI; Potential of 5G Enabled Edge Computing to Build IT Infrastructure |
| Our old monolith makes small product changes risky and slow. What modernization approach should we consider? | Partial | Digital Product Development Company |
| Store employees cannot see the same inventory information customers see online. How can we connect these channels? | Partial | Unlock the Benefits: Migrate Your eCommerce Store to Shopify; Multi-Store Sync; Digital Signage App Developed That Elevate In-Store Shopping Experience |
| We cannot explain why cloud spending changes from month to month. Which service could improve accountability? | Accepted | FinOps Consulting Services; Cloud Transformation Services for Modern Business |
| Our content editors publish the same update separately across multiple websites and apps. What capability would reduce duplication? | Not Accepted | High-Performance Mobile Apps, Built for Every Platform; Cloud Native Application Development Services for Enterprise Apps |
| Field crews receive assignments on paper and managers cannot track progress. Could a digital field platform help? | Not Accepted | Digital Transformation Whitepapers for Enterprises |
| We need location-based insights to decide where maintenance teams should respond first. What would you recommend? | Partial | No cards |
| Security testing happens after development is complete and creates release delays. How can we shift it earlier? | Partial | Mobile QA Automation & Testing Services; Strengthen Compliance with Cloud Security Services; eCommerce App Development Company |
| New marketplace sellers take weeks to onboard because validation and approvals are manual. Which capability fits? | Partial | No cards |
| Finance spends days matching marketplace orders, commissions, and vendor payments. How can we automate reconciliation? | Accepted | Maximize ROI With Adobe Commerce Marketplace Development |
| Our support teams search several tools before they can answer a customer question. What could create a unified view? | Partial | No cards |
| We need to leave our data center quickly but cannot interrupt critical applications. Can Successive support the migration? | Accepted | No cards |
| Marketing cannot deliver consistent personalized content across regions and devices. Where should we start? | Partial | Transform Digital Content Management with Enterprise CMS Solutions; Performance Marketing and Growth Marketing Services; Leveraging Data Analytics for Personalized User Experiences in Ecommerce Apps |
| Our healthcare application is difficult to update and must remain secure and compliant. Which modernization service fits? | Partial | Cloud Transformation Services for Modern Business |
| Media planners prepare briefs, buying plans, and reports in disconnected tools. How can we streamline operations? | Accepted | AI-Driven Media Operations Platform on AWS Cloud; Enterprise Data & AI Modernization / How a Global Media Group Unified Content, Data, and Operations at Scale; Automating Campaign Operations for a Global Media Leader |
| We want faster software releases, but production stability cannot suffer. Which engineering capability should we explore? | Accepted | DevSecOps Consulting Services |

Together with the earlier 12 realistic supplemental queries, these form the required 30-query realistic business-problem subset. The 23 awkward automatically rewritten probes remain visible in the main table for diagnostic transparency but are not used to claim realistic-query coverage.

## Reliability and latency

The initial burst immediately after the long semantic run showed provider saturation at concurrency four (4/8 client timeouts). After bounding the existing query-understanding and final-generation provider budgets and starting a fresh final build, the warm controlled run produced:

| Concurrency | Success | Timeouts | P50 | P95 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 8/8 | 0 | 10393 ms | 17145 ms |
| 2 | 8/8 | 0 | 11798 ms | 29516 ms |
| 4 | 8/8 | 0 | 46182 ms | 47734 ms |

Final semantic payload success was 102/102. Reliability is preserved under the fresh equivalent load, but latency is regressed: P50 rose to 7.7 seconds and concurrency-four P95 reached 47.7 seconds. No new LLM call was added; the two existing calls now use bounded no-retry budgets so provider retry storms cannot consume the full request budget.

## Architecture changes

### Structured business-need understanding

Query understanding now has independent desired outcomes, domains, technical signals, industry, existing platform, explicit topics, constraints, and business problem. Deterministic fallback recognizes problem-shaped requests without requiring an LLM mapping table.

### Stronger website-derived profiles

Profiles now derive identity, pain point, desired outcome, technology, business function, industry, implementation activity, and benefit terms from the semantic meaning of actual ACF field names and content. New website content automatically receives the same profile.

### Case-study-to-capability bridge

The index precomputes relationships from case studies, editorial pages, and resources to authoritative service pages through shared strong profile signals. For a business need, matching challenge evidence boosts its related service; the supporting case study does not automatically become the primary recommendation.

### Multi-dimensional ranking

Topic, problem, outcome, industry, entity/platform, explicit type, role authority, conversation state, and bridge strength are scored separately. Recommendation queries give service-role documents primary authority and demote editorial/case evidence to support.

### Card audit and selection

The development retrieval endpoint now records role, topic/problem/outcome/industry/entity/type scores, authority, bridge strength, confidence, accept/reject state, and rejection reason for every candidate. Business-problem cards require service authority or unusually strong supporting compatibility and are not padded.

### Webinar evidence

The current API represents webinar discovery through a listing page and does not provide enough topic-specific detail for the tested generative-AI request. V4 transparently returned no matching webinar and no fabricated card.

## Root-cause verification

| Area | Status | Evidence |
| --- | --- | --- |
| Business-problem → capability mapping | Improved | Realistic strict result was 33.3%; useful individual patterns improved, target not met. |
| Capability profiles | Improved | New structured dimensions work, but generic shared terms still create false bridges. |
| Case-study → capability bridging | Improved | Helps migration, CMS, marketplace, data, and modernization; weak for sparse/ambiguous cases. |
| Industry constraint | Improved | Headless CMS + travel passed; performance → healthcare follow-up remained noisy. |
| Ambiguous terminology | Improved | Application performance now leads Performance Engineering; other ambiguous operations/growth terms remain weak. |
| Card relevance | Not Fixed | 28 strict noisy-card occurrences, above target ≤2. |
| Conversation state | Improved | 2/3 scenarios retained the correct combined state. |
| Webinar evidence | Limited by Content | Transparent no-match behavior; no detail evidence found in current API. |
| Latency | Regressed | P50 7703 ms; full-run P95 20042 ms; fresh concurrency-four P95 47734 ms. |
| Reliability | Preserved | Fresh final run: zero semantic or burst timeouts. |

## Automated verification

- Tests: 89 passed, 9 skipped.
- Typecheck: passed.
- Lint: passed.
- Production build: passed.
- Final semantic payloads: 102/102.
- Fresh controlled burst: 24/24 payloads.

## Files changed in V4

- src/lib/query-understanding.ts
- src/lib/search-index.ts
- src/lib/search-retriever.ts
- src/lib/llm/openai-provider.ts
- src/app/api/chat/route.ts
- src/app/api/debug/retrieval/route.ts
- src/lib/query-quality.test.ts
- scripts/generic-v4-test.mjs
- scripts/v4-supplement.mjs
- CHATBOT_GENERIC_TESTING_REPORT_V4.md

## Remaining limitations

- Shared generic profile terms can still form false service relationships; relationship quality needs stronger phrase/entity/link evidence and less unigram overlap.
- The current industry extractor is conservative and does not identify every natural industry formulation.
- Some correct answers have zero cards because the card gate is intentionally stricter than answer context.
- Long sequential evaluation can saturate the external model provider even though final bounded calls preserve payload delivery.
- Business-problem strict quality, multi-constraint accuracy, and card precision remain below target. The architecture is improved, but the generic natural-problem goal is not yet fully achieved.
