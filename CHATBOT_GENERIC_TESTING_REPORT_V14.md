# Chatbot Generic Testing Report V14

> Date: 20 August 2026  
> Runtime: local `POST /api/chat`; configured Successive APIs only; concurrency 1; 400 ms gap; 40 s timeout.  
> Grading: conservative intent/evidence/completeness rubric. HTTP 200 alone is not a PASS.

## Executive Summary

V14 executed **302 fresh turns**: 50 exact QA cases, 168 new unseen prompts, and 84 turns in 20 conversations. QA: **43 PASS / 7 PARTIAL / 0 FAIL** (86.0% strict, 100.0% usable). Unseen: **100 PASS / 29 PARTIAL / 39 FAIL** (59.5% strict, 76.8% usable). Multi-turn: **48 PASS / 21 PARTIAL / 15 FAIL** (57.1% strict, 82.1% usable).

The generic routing defects identified in final validation are materially reduced, especially noun/content-type collisions, PWA and chatbot discovery, company branded concepts, industry completeness, security/FinOps/CMS problem routing, latest topical retrieval, and exact-missing-resource disclosure. The release targets are not all met under conservative grading; remaining weaknesses are listed below.

## Root Causes and V14 Changes

- Content types were inferred from noun presence instead of grammatical request role. V14 requires explicit request grammar and keeps nouns such as product/application as topic or problem context.
- Retrieval discarded deterministic business signals when semantic planning ran. V14 merges controlled domains, outcomes, concepts, and technical signals.
- Problem descriptions lacked capability-family expansion. V14 adds corpus-compatible families for modernization, migration, security, FinOps, CMS, conversational AI, APIs, automation, data governance, and commerce reliability.
- Canonical company phrases could collide with person/entity and editorial routes. V14 strengthens structured company aliases and cleans structured catalog labels.
- Multi-word aliases/acronyms and topical freshness were under-ranked. V14 adds title initialisms, phrase-aware synonym activation, topical date filtering, and stricter primary/secondary alignment.
- Negative premises inherited recommendation intent and negative tokens polluted retrieval. V14 detects premise polarity, retrieves the positive subject, preserves verification intent, and prohibits unsupported strong negatives in generation.

## QA 50 Regression

Before (final validation): **37 PASS / 5 PARTIAL / 8 FAIL** (74.0% strict, 84.0% usable). V14: **43 PASS / 7 PARTIAL / 0 FAIL** (86.0% strict, 100.0% usable).

| ID | Request | Response | Primary source | Cards | ms | Grade |
| --- | --- | --- | --- | --- | ---: | --- |
| TC-1 | What is React? Does Successive use it? | React is a popular open-source JavaScript library used for front-end development, making it easy for developers to create web applications that are capable of changing data without having to reload the page. It is extremely flexible and user-friendly, which makes it easy for developers to play around with state and props in React Components. Successive Digital helps clients use React's capabilities to launch scalable | React.js Development Company | React.js Development Company | 14453 | PASS |
| TC-2 | Node.js + services | Successive Digital offers Node.js development services, including Node.js consulting, custom development, migration, API integration, package development, plugin and widget development. Our team of experts helps clients navigate the development process and required components, ensuring fast and scalable custom web applications with interactive UX/UI. We rely on our technology expertise, deep industry exposure, and ma | Node.js Development Company | Node.js Development Company | 1252 | PASS |
| TC-3 | What is microservices? | Microservices is today one of the foundation components of creating a good application aimed and precise and immersive delivery of service.  Microservices are a software development approach that allows for the division of an application into smaller, independent components, each with its own capabilities and functions. This architecture enables developers to make changes to individual components without affecting th | Microservices | Microservices | 2448 | PASS |
| TC-4 | What is cloud computing? | Cloud computing is a way to deliver scalable, resilient applications for the cloud era using modern architectures, enabling faster innovation and long-term performance through cloud-native development services.  [Cloud Native Application Development Services for Enterprise Apps](https://successive.tech/cloud-native-application-development/) provides additional context: Develop scalable, resilient applications for the | None | None | 4954 | PARTIAL |
| TC-5 | Data science & ML | Successive offers advanced data science consulting services to transform complex data into actionable intelligence, fueling smarter decisions, faster innovation, and measurable growth. These services include predictive analytics, artificial intelligence, natural language processing, deep learning, data visualization, and machine learning. By partnering with Successive, businesses can apply advanced data science frame | Unlock Insights with Advanced Data Science Consulting Services | Unlock Insights with Advanced Data Science Consulting Services | 5848 | PASS |
| TC-6 | Summarize 'Why Use Flutter' blog | If you're considering building a robust mobile app that functions optimally across Android, iOS, and Web platforms, using Flutter for app development can offer several benefits, including faster and cost-effective development, cross-platform compatibility, scalability, flexibility, and seamless functioning across platforms. Flutter is a flexible cross-platform framework that allows developers to deploy an application | Why Use Flutter for App Development- Features and Benefits | Why Use Flutter for App Development- Features and Benefits | 4035 | PASS |
| TC-7 | Summarize 'What is an API?' blog | I couldn't find that exact published item in the available Successive content. Related published items include: [API Latency & Failure in Commerce System](https://successive.tech/blog/api-latency-failure-in-commerce-system/). | API Latency & Failure in Commerce System | API Latency & Failure in Commerce System | 1199 | PASS |
| TC-8 | Google Cloud partnership | Successive Digital is a Google Cloud Consulting Partner, offering expertise in cloud migration, application modernization, AI-ML services, data analytics, cloud security, cost optimization, and cloud managed services. Our partnership with Google Cloud enables enterprises to accelerate cloud adoption, achieve business goals, and drive industry transformation with customized Google Cloud solutions. We focus on customer | None | None | 1229 | PASS |
| TC-9 | Strapi partnership | Successive is a Strapi Partner for Connected Digital Experiences. We help enterprises build flexible, scalable, and connected digital experiences through our services, including Strapi CMS Consultation, Strapi Strategy and Consulting, and Strapi 5 Development. Our partnership with Strapi enables us to provide comprehensive solutions for headless platforms across mobile, commerce, and other areas.  [Strapi Partner for | Strapi Partner for Connected Digital Experiences | Strapi Partner for Connected Digital Experiences | 1065 | PASS |
| TC-10 | Adobe/AEM partnership | Yes. Successive’s current Partners & Alliances catalog lists **Adobe Solution Partner badge Silver** under **CX Partnerships**. | Partners & Alliances | Partners & Alliances | 76 | PASS |
| TC-11 | ESRI/ArcGIS partnership | Yes. Successive’s current Partners & Alliances catalog lists **esri partner member** under **Data AI / Security Partnerships**. | Partners & Alliances | Partners & Alliances | 37 | PASS |
| TC-12 | Retail/commerce case study | A retail and commerce business achieved faster order processing and improved operational visibility by automating order orchestration with Successive's scalable digital commerce solutions. The company streamlined multi-vendor fulfillment, reduced manual intervention, and delivered faster, more reliable commerce operations. Automated order splitting and fulfillment workflow orchestration accelerated order processing b | Automating Order Orchestration for Seamless Commerce Operations | Automating Order Orchestration for Seamless Commerce Operations | 1252 | PASS |
| TC-13 | Travel/hospitality case study | One notable case study for travel and hospitality is a leading travel services provider in India, which migrated its platform to a modern system. This migration enabled the company to boost conversions by 30%, provide scalability and flexibility, and improve the user experience.  [Driving Efficiency and Growth for a Leading Travel Provider](https://successive.tech/case-studies/transforming-business-operations-for-a-l | None | None | 1209 | PASS |
| TC-14 | Logistics case study | Successive has helped several logistics companies improve their operations through custom-built digital solutions. Their solutions support real-time performance monitoring, weather routing and forecasting, sensor integration, vessel tracking, monitoring, and reporting. This has led to increased operational efficiency and streamlined operations for their clients.  [Voyage informatics platform developed for global ship | Voyage informatics platform developed for global shipping and logistics company; Improving Logistics Operations for a Leading SCM Provider | Voyage informatics platform developed for global shipping and logistics company; Improving Logistics Operations for a Leading SCM Provider | 1221 | PASS |
| TC-15 | Media case study | Successive has helped various media companies achieve significant improvements through digital transformation, cloud migration, and AI-driven solutions. One notable case study is the Enterprise Data & AI Modernization of a global media group, which unified content, data, and operations at scale, improving efficiency and strengthening governance. Another example is the Cloud Migration & DevOps Consulting for a global  | Enterprise Data & AI Modernization \| How a Global Media Group Unified Content, Data, and Operations at Scale; Cloud Migration & DevOps Consulting: Ho | Enterprise Data & AI Modernization \| How a Global Media Group Unified Content, Data, and Operations at Scale; Cloud Migration & DevOps Consulting: Ho | 1884 | PASS |
| TC-16 | Kagen platform & products | Kagen is a platform that offers various products, including an enterprise AI voice agent platform called Kagen VOICE, and an AI engineering company that helps businesses transition their Generative AI applications from prototype to production. Kagen VOICE is designed to automate high-volume customer conversations across sales, service, and operations, while Kagen AI specializes in accelerating the adoption of AI acro | Successive Digital’s Kagen VOICE Recognized at the 17th Aegis Graham Bell Award; Successive Digital Launches Kagen AI to Accelerate Generative AI Adop | Successive Digital’s Kagen VOICE Recognized at the 17th Aegis Graham Bell Award; Successive Digital Launches Kagen AI to Accelerate Generative AI Adop | 1288 | PASS |
| TC-17 | Kagen VOICE | Kagen VOICE is an enterprise AI voice agent platform designed to help organizations automate high-volume customer conversations across sales, service, and operations. It enables businesses to move beyond traditional voice automation by allowing AI agents to understand customer intent, respond naturally, execute workflows, and seamlessly transfer conversations to human teams when required. This recognition marks an im | Successive Digital’s Kagen VOICE Recognized at the 17th Aegis Graham Bell Award | Successive Digital’s Kagen VOICE Recognized at the 17th Aegis Graham Bell Award | 1384 | PASS |
| TC-18 | Accelerators | Accelerators are designed to turn enterprise priorities into faster execution, reducing delivery risk and improving operational efficiency. They are built to drive measurable business outcomes and are available across various digital practices such as Product Engineering, CMS, GIS, Commerce, Cloud, and Adobe.  [Accelerators Turn Enterprise Priorities into Faster Execution](https://successive.tech/accelerators/) provi | Accelerators Turn Enterprise Priorities into Faster Execution | Accelerators Turn Enterprise Priorities into Faster Execution | 1077 | PASS |
| TC-19 | AWS Well-Architected | Successive offers an AWS Well-Architected Review that helps evaluate and identify high-risk issues in your AWS environment. Our team uses a proven framework to provide actionable recommendations or remediate systems to close gaps faster. This review also assists in finding and integrating new tools to help you efficiently observe and optimize cloud resources as your business grows.  [AWS Well-Architected Review](http | AWS Well-Architected Review | AWS Well-Architected Review | 1769 | PASS |
| TC-20 | Awards | An exclusive insight into our journey of industry recognition, milestones, and achievements, reflecting our commitment to excellence, innovation, and delivering measurable impact for our clients and partners.  Honoring a decade of excellence and accomplishments as an industry leader in digital transformation, a great employer, and a responsible company.  We design and engineer AI-enabled solutions that elevate custom | Awards & Recognitions | Awards & Recognitions | 63 | PASS |
| TC-21 | Culture & values | Successive’s current core values are: - **Value Focused** — We consistently look for innovative ways to deliver more flexible, robust, and effective solutions. It’s our fierce determination and zeal for improvement that drives us forward. - **Innovation** — Innovation is the nucleus of Successive. We value out-of-the-box thinking and the passion for solving complex problems– we strive to deliver robustness & excellen | About Us | About Us | 107 | PASS |
| TC-22 | Shopify development? | Successive Digital offers a wide range of Shopify web and app development services, including Shopify web development, Shopify theme development, Shopify app development, and more. Our Shopify website development services can help you build a feature-rich, scalable eCommerce website that can welcome any number of customers and ease the shopping process, enabling optimal website functionality and improved performance. | Shopify Development Company | Shopify Development Company | 1175 | PASS |
| TC-23 | Python development? | Successive offers comprehensive Python development services to help you harness the next-gen programming capabilities for your next enterprise app. Our developers use popular frameworks like Flask, Django, and Tornado to build apps that are easy to integrate, adapt, and scale. We build comprehensive Python solutions customized as per the business requirements. Our experts create dynamic solutions from scratch and ser | Python Development Company | Python Development Company | 1376 | PASS |
| TC-24 | Java/.NET development? | Successive offers expertise in .NET development services, including customizing apps with different .NET frameworks to support business vision and mission. They provide professional services such as .NET web app development, .NET app development, enterprise-grade .NET services, MVC .NET development, and .NET app modernization. Their team is well-versed in language interoperability, platform independence, and built-in | None | None | 1486 | PARTIAL |
| TC-25 | Phone & email | Published phone numbers: **+1 (315) 818-3656** and **+91 (120) 425-9482**. The current page does not publish a direct email address; use the official [Contact Us](https://successive.tech/contact/) form to send a message. | Get In Touch | Get In Touch | 33 | PASS |
| TC-26 | Office locations | Founded in 2012 by a small group of passionate technologists, Successive has evolved into a global digital transformation company with a team of 500+ professionals. Today, we operate across seven strategic locations, such as India, London, Dallas (HQ), and Johannesburg, serving a growing portfolio of 150+ enterprise clients worldwide. | About Us | About Us | 113 | PASS |
| TC-27 | Founder | - **Sid Pandey** — Founder & CEO | About Us | About Us | 97 | PASS |
| TC-28 | Chatbot build capability | Successive offers a unified intelligence platform that empowers enterprises with scalable, real-time AI solutions. These solutions drive smarter decisions, automation, and measurable business outcomes. They provide various services, including virtual assistants, real-time analytics, and social analytics, which can be leveraged to build a chatbot.  [Data & Artificial Intelligence](https://successive.tech/data-artifici | None | None | 6381 | PARTIAL |
| TC-29 | Latest news | Successive Digital has received recognition at the 17th Aegis Graham Bell Award for its Kagen VOICE, an enterprise AI voice agent platform designed to help organizations automate high-volume customer conversations. This recognition marks an important milestone in Successive Digital’s continued focus on building enterprise-ready AI solutions that combine intelligence, automation, and real-world business execution.  [S | Successive Digital’s Kagen VOICE Recognized at the 17th Aegis Graham Bell Award | Successive Digital’s Kagen VOICE Recognized at the 17th Aegis Graham Bell Award | 3114 | PASS |
| TC-30 | Blockchain services | I couldn't find a strongly matching Successive service for this topic. I don't want to present a generic or weakly related item as direct evidence. You can broaden the content type or ask for related Successive services and resources. | None | None | 106 | PASS |
| TC-31 | US-only? India offices? | Founded in 2012 by a small group of passionate technologists, Successive has evolved into a global digital transformation company with a team of 500+ professionals. Today, we operate across seven strategic locations, such as India, London, Dallas (HQ), and Johannesburg, serving a growing portfolio of 150+ enterprise clients worldwide. | About Us | About Us | 93 | PASS |
| TC-32 | Agritech work | Successive offers various agritech solutions to transform agricultural operations with sustainable technologies. These solutions include smart agriculture software, precision agriculture software, and dispensary agritech software. They also provide drone automation services, real-time crop monitoring, AI-driven pest detection, and automated irrigation to boost yield and optimize resources.  [Agritech Software Develop | Agritech Software Development; Agritech and E-Commerce are driving Direct-to-Farmer Marketplaces | Agritech Software Development; Agritech and E-Commerce are driving Direct-to-Farmer Marketplaces | 2509 | PASS |
| TC-33 | What is Successive? | We are a digital transformation company dedicated to helping businesses thrive in a fast-evolving tech landscape. From strategy to execution, we deliver scalable solutions that foster growth and long-term value. Our focus on efficiency and deep industry insight helps organizations move forward with confidence while redefining digital transformation through measurable outcomes. Our multidisciplinary teams blend creati | About Us | About Us | 110 | PASS |
| TC-34 | Salesforce/CRM? | Successive provides information on integrating ERP with Salesforce CRM, highlighting six benefits, including better communication, unified access, and excellent customer service. The integration enables teams to have a more valuable exchange, access data through their preferred system, and provides a coherent picture of customers. This integration is prevalent among companies, with over 53% investing in it on priorit | Six Benefits of Integrating ERP with Salesforce CRM | Six Benefits of Integrating ERP with Salesforce CRM | 4858 | PARTIAL |
| TC-35 | Successive Advantage | We design and engineer AI-enabled solutions that elevate customer experience and help enterprises accelerate growth through scalable, technology-driven innovation. | About Us | About Us | 168 | PASS |
| TC-36 | GenAI case studies | Successive has developed a GenAI-Powered Fan Engagement Platform for Sports Betting on AWS, which transforms passive sports audiences into active content creators through agentic AI workflows, real-time generation, and conversational discovery experiences. This platform enables immersive engagement, personalized content creation, and community-driven interaction, all powered by AI, creating a more dynamic, experience | GenAI-Powered Fan Engagement Platform for Sports Betting on AWS | GenAI-Powered Fan Engagement Platform for Sports Betting on AWS | 1729 | PASS |
| TC-37 | Kagen & AI products | Kagen AI is an AI engineering company launched by Successive Digital to help businesses transition their Generative AI applications from prototype to production. It specializes in accelerating the adoption of AI across industries, using AWS services and industry-specific expertise. Kagen aims to bridge the gap between ideation and full-scale production, providing customized solutions to unlock the value of AI investm | Successive Digital Launches Kagen AI to Accelerate Generative AI Adoption Across Industries | Successive Digital Launches Kagen AI to Accelerate Generative AI Adoption Across Industries | 840 | PASS |
| TC-38 | Salary range | I couldn’t confirm this employee-policy detail from Successive’s current published Culture or Careers API content. For an authoritative answer, please check with Successive HR or your internal employee policy portal. | None | None | 121 | PASS |
| TC-39 | PWA + services | Successive offers progressive web app (PWA) development services, including custom PWA development, UI-UX design, offline capabilities and performance optimization, integration services, and maintenance and support. Our PWA consultants help you create a strategic roadmap for your PWA development, aligning it with your business goals. We also design and develop custom PWAs tailored to your specific business needs, ens | Progressive Web App Development Company | Progressive Web App Development Company | 1642 | PASS |
| TC-40 | UI/UX design services | Successive offers UI/UX design services, including mobile app design, UX audits, and UX strategy. Their team of experienced designers and researchers helps companies create effective digital solutions that drive business outcomes and user happiness. They specialize in providing comprehensive UX audits for mobile apps and develop custom UX strategies that align with business goals and user needs.  [Mobile App Design C | None | None | 1500 | PARTIAL |
| TC-41 | Shopify case study | Successive developed a multivendor Shopify store for a leading art and culture marketplace, enabling direct sales of paintings from vendors to end customers and streamlining eCommerce operations. The solution helped onboard 16 vendors, processed over 200 orders, and accelerated business ROI. The client was able to enhance operational agility and achieve faster order processing.  [Enhancing Operations for a Leading Ar | Enhancing Operations for a Leading Art and Culture Marketplace | Enhancing Operations for a Leading Art and Culture Marketplace | 2077 | PASS |
| TC-42 | Programming languages | ### Digital Enterprise  Transform traditional legacy applications to modern technologies & architecture to deliver business value with our strategic approach and data-driven solutions to deliver rich functionality and flexibility.  **Technologies:** Angular, Flutter, Golang, Java, laravel, MicroSoft.net, .Netcore, Node, php, Python, React Native, selenium, Vue.js, Xamarin, redux, django, apollo  ### Artificial Intell | Global Capabilities | Global Capabilities | 119 | PASS |
| TC-43 | Great Place to Work? | Successive Digital is a Great Place to Work-Certified™ Company in 2020. This certification is a result of a rigorous assessment process where Successive excelled on various parameters. The Great Place to Work survey polled over 2 million employees from 4000+ organizations across India to determine India's Best Workplaces in 2020.  [Successive Digital is a Great Place to Work-Certified™ Company in 2020](https://succes | Successive Digital is a Great Place to Work-Certified™ Company in 2020 | Successive Digital is a Great Place to Work-Certified™ Company in 2020 | 4723 | PASS |
| TC-44 | Security/DevSecOps approach | Successive adopts a 'shift-left' DevSecOps approach, embedding security from the earliest stages of development. This involves implementing automated security testing, CI/CD pipeline integrations, and compliance checks throughout the SDLC, reducing vulnerabilities and accelerating secure deployments. Our consultants help you identify gaps and blockers within your existing security practices and guide you with a plan  | None | None | 5236 | PARTIAL |
| TC-45 | Free trials/demos? | I couldn't confirm published information about that commercial offering from the available Successive content. Availability, pricing, or commercial terms would need to be confirmed directly with Successive through the official contact channel. | None | None | 12 | PASS |
| TC-46 | Data & analytics services | Successive offers comprehensive data and analytics services that empower organizations to add value throughout the customer journey with more agile and intuitive processes. Our services help organizations use data and analytics to create new business models and revenue streams while ensuring compliance with data security, quality, and regulatory standards. We design and engineer AI-enabled solutions that elevate cust | Data Analytics Service | Data Analytics Service | 1508 | PASS |
| TC-47 | Board appointment | - **Edwina Payne** — Chair of the Board of Directors - **Grant Shih** — Member of the Board of Directors - **Brian Benn** — Member of the Board of Directors  Showing the first 3 of 4. [More](https://successive.tech/about-us/#w-tabs-5-data-w-pane-0) | About Us | About Us | 88 | PASS |
| TC-48 | HQ office | Founded in 2012 by a small group of passionate technologists, Successive has evolved into a global digital transformation company with a team of 500+ professionals. Today, we operate across seven strategic locations, such as India, London, Dallas (HQ), and Johannesburg, serving a growing portfolio of 150+ enterprise clients worldwide. | About Us | About Us | 107 | PASS |
| TC-49 | Industries focus | ## Industries  The configured Successive website API currently contains **7 published items** in industries.  1. [Digital Agriculture Solutions](https://successive.tech/industries/agriculture/) 2. [Fintech](https://successive.tech/industries/finance/) 3. [Healthcare & Life Sciences](https://successive.tech/industries/healthcare-life-sciences/) 4. [Media & Advertising](https://successive.tech/industries/media-entertai | Digital Agriculture Solutions; Fintech; Healthcare & Life Sciences; Media & Advertising; Retail & Commerce Software Development Solutions; Transportat | Digital Agriculture Solutions; Fintech; Healthcare & Life Sciences; Media & Advertising; Retail & Commerce Software Development Solutions; Transportat | 1541 | PASS |
| TC-50 | Government/public sector | Successive has experience in developing digital solutions for the government and public sector. The company collaborated with a government body in India to develop a web-based training and placement portal to support their initiatives. The portal was designed to streamline and structure industry-specific career training and skills development programs, empowering youth to seek employment opportunities and initiate th | None | None | 5338 | PARTIAL |

## Final-Validation Failure Regression

Strictly improved live examples: chatbot capability now finds AI/virtual-assistant evidence; PWA resolves its dedicated page; Successive Advantage resolves About content; programming languages use Global Capabilities with malformed labels removed; industries returns 7/7; demo/trial wording is safely bounded; application security no longer routes to Application Modernization; cloud spending routes to cloud-cost optimization; latest AI content is date-aware; missing exact API articles are explicitly labeled as unavailable before alternatives.

## Unseen Real-User Testing

Result: **100 PASS / 29 PARTIAL / 39 FAIL**; strict **59.5%**, usable **76.8%** across 168 prompts.

## Business-Problem Testing

Business-problem result: 56.2% strict / 78.1% usable (32 tests). Desired outcomes now contribute to ranking rather than topic nouns alone.

## Multi-Turn Testing

20 conversations, 84 turns: **48 PASS / 21 PARTIAL / 15 FAIL**; strict **57.1%**, usable **82.1%**.

| Conversation | Turns | PASS | PARTIAL | FAIL |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 4 | 3 | 1 | 0 |
| 2 | 5 | 2 | 2 | 1 |
| 3 | 5 | 3 | 2 | 0 |
| 4 | 5 | 2 | 0 | 3 |
| 5 | 5 | 2 | 2 | 1 |
| 6 | 4 | 2 | 2 | 0 |
| 7 | 4 | 2 | 1 | 1 |
| 8 | 4 | 2 | 2 | 0 |
| 9 | 4 | 2 | 1 | 1 |
| 10 | 4 | 3 | 1 | 0 |
| 11 | 4 | 3 | 0 | 1 |
| 12 | 4 | 3 | 0 | 1 |
| 13 | 4 | 3 | 0 | 1 |
| 14 | 4 | 3 | 1 | 0 |
| 15 | 4 | 2 | 1 | 1 |
| 16 | 4 | 2 | 2 | 0 |
| 17 | 4 | 2 | 1 | 1 |
| 18 | 4 | 3 | 0 | 1 |
| 19 | 4 | 1 | 1 | 2 |
| 20 | 4 | 3 | 1 | 0 |

## False-Premise Testing

Correction result: **40.0% strict / 100.0% usable** (25 tests). Explicit AI, commerce, AWS, cloud-security, modernization, conversational-AI and case-study corrections improved. Remaining failures include responses that provide contrary evidence but do not explicitly say the premise is false, and weak Kagen/data-engineering relation resolution.

## List / Company Attribute Testing

Company attributes: 28.6% strict / 57.1% usable. List completeness proxy: 33.3% strict / 66.7% usable. Industry focus returned the full configured 7-item catalog.

## Source/Card/CTA Testing

Source relevance proxy: 82.8% of all turns exposed a source, matching card, or inline Successive link. Same-topic secondary alignment runs before generation and presentation. Unrelated-card count detected by the conservative automated rubric: 0; zero-card grounded answers remain allowed.

## Freshness Testing

Freshness: 23.1% strict / 61.5% usable (13 tests). Type-compatible items are topic-filtered and then ordered by valid date.

## Metrics

| Metric | Result |
| --- | ---: |
| QA strict / usable | 86.0% / 100.0% |
| Unseen strict / usable | 59.5% / 76.8% |
| Business-problem strict | 56.2% |
| Company attribute strict | 28.6% |
| List completeness | 33.3% |
| False-premise correction | 40.0% |
| Multi-turn strict / usable | 57.1% / 82.1% |
| Security/DevSecOps | 40.0% |
| Location | 33.3% |
| Products/Kagen | 14.3% |
| Partners | 61.5% |
| Latest/freshness | 23.1% |
| False abstentions (supported-topic heuristic) | 32 |
| Unsupported strong-negative claims | 0 |
| Raw API label failures | 0 |
| Hallucinated private facts | 0 |
| HTTP 429 / transport errors | 0 / 0 |

## Performance

Combined P50 **2701 ms**, P95 **14914 ms**, max **27119 ms**. QA P50 was 1252 ms. Deterministic structured routes commonly finish below the 2.5 s target; semantic problem/recommendation turns remain provider-heavy.

## Quality Gates

- Automated tests: 193 passed, 9 intentionally skipped.
- TypeScript: passed.
- ESLint: passed.
- Production build: passed (Next.js 16.2.11 optimized build).
- `git diff --check`: passed.

## Remaining Limitations

- Conservative strict targets are not all reached, particularly explicit false-premise correction and source exposure on some otherwise relevant generated answers.
- Some company global-presence text confirms worldwide operations but the API does not consistently expose a normalized office-by-office address catalog.
- Salesforce/CRM authority is editorial rather than a dedicated current service page in the indexed corpus.
- Provider-backed problem/recommendation answers remain the main P95 latency contributor.
- Exact missing resources can offer clearly labeled alternatives, but cannot manufacture the requested resource.
