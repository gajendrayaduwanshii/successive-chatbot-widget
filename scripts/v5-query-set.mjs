export const humanBusinessProblems = [
  "Our AWS bill keeps increasing and finance can't tell which team is responsible.",
  "Security checks happen at the end of every release and keep delaying us.",
  "We manually review hundreds of customer onboarding records.",
  "Our customers see different product information on our website and mobile app.",
  "Our field teams lose access to important information when they are offline.",
  "Our marketplace was built for one seller but now we need hundreds of vendors.",
  "Our content team manages multiple brand websites separately.",
  "Our old monolith makes small product changes risky and slow.",
  "Different departments keep customer data in separate systems, so reporting takes days.",
  "Developers wait for manual infrastructure approvals before every deployment.",
  "Store employees cannot see the same inventory information customers see online.",
  "We cannot explain why our cloud spending changes from month to month.",
  "Field crews receive assignments on paper and managers cannot track progress.",
  "We need location insights to decide which maintenance incidents to handle first.",
  "New marketplace sellers take weeks to onboard because approvals are manual.",
  "Finance spends days matching marketplace orders, commissions, and vendor payments.",
  "Our support agents search several tools before they can answer a customer question.",
  "We must leave our data center quickly without interrupting critical applications.",
  "Marketing cannot deliver consistent personalized content across regions and devices.",
  "Our healthcare application is difficult to update but must remain secure and compliant.",
  "Media planners prepare briefs, buying plans, and reports in disconnected tools.",
  "We want faster software releases without sacrificing production stability.",
  "Our mobile app becomes unusable when traffic spikes during promotions.",
  "Inventory numbers differ between sellers and customers are receiving cancellations.",
  "We cannot see where field incidents are happening or prioritize crews effectively.",
  "Our legacy application takes months to change and every release is delayed.",
  "We have lots of business data but are not getting useful insights from it. How can Successive help?",
  "Can Successive help us make our software development process more secure?",
  "Our website becomes very slow when traffic increases. What would you recommend?",
  "What services can Successive provide for my business?",
];

// These were authored from recurring problems and outcomes in the current
// website corpus. They are intentionally full visitor utterances—not extracted
// title words or mechanically concatenated fragments.
export const generatedBusinessCandidates = [
  "Our cloud teams lack a consistent way to identify waste and assign spending to product owners.",
  "We need to modernize a legacy application without losing critical business rules.",
  "Our release process relies on manual handoffs and takes too long to recover from failures.",
  "We need security controls built into delivery instead of a review just before launch.",
  "Our applications slow down under peak demand and we cannot find the bottleneck quickly.",
  "We want to migrate workloads to Azure while keeping customer-facing systems available.",
  "Our VMware environment is expensive to maintain and difficult to scale.",
  "Teams use different cloud accounts and finance has no reliable view of ownership.",
  "Our data is spread across operational systems and leaders cannot get timely insights.",
  "Analysts spend most of their time preparing data instead of answering business questions.",
  "We need a governed data architecture that can support analytics and artificial intelligence.",
  "Our reports disagree because departments define the same business metrics differently.",
  "We want to use generative AI but do not know which use cases are safe and valuable.",
  "Customer service teams need faster answers from a large collection of internal documents.",
  "We manually classify incoming documents and route them to the right operations team.",
  "Our forecasting process cannot respond quickly when demand patterns change.",
  "We manage content separately for every country website and mobile experience.",
  "Editors need to reuse approved content across brands without copying every update.",
  "Our legacy CMS makes it difficult to deliver content to new digital channels.",
  "Customers receive inconsistent product details across commerce channels.",
  "Our commerce site cannot support the number of sellers we plan to onboard.",
  "Vendor approvals, commissions, and settlements require too much manual reconciliation.",
  "We need a reliable inventory view across stores, marketplaces, and our website.",
  "Our checkout experience fails during major campaigns and creates abandoned orders.",
  "Field teams cannot see asset locations or current work orders while they are on site.",
  "Managers need a map-based view to prioritize incidents and deploy crews efficiently.",
  "Our forestry operations need current geospatial information for planning field work.",
  "We have aerial imagery but no efficient way to turn it into operational decisions.",
  "Healthcare staff use disconnected systems and repeat the same administrative work.",
  "Our patient-facing application must be modernized without weakening privacy or compliance.",
  "Travel customers expect consistent booking experiences across web and mobile.",
  "Our travel websites are difficult to update and cannot personalize content effectively.",
  "Media teams plan campaigns and prepare reports in separate tools with duplicate data entry.",
  "Campaign operations rely on spreadsheets, making status and performance difficult to track.",
  "Our support organization lacks a unified view of customer history and open issues.",
  "We need to connect customer information across sales, service, and digital channels.",
  "Our infrastructure provisioning process is slow because approvals and configuration are manual.",
  "Engineering teams need reusable cloud environments with security policies applied automatically.",
  "We need to reduce release lead time while improving reliability and auditability.",
  "Our mobile workforce needs secure access to operational information without a network connection.",
  "We want to replace a fragile monolith with services that teams can change independently.",
  "Our products use different integration patterns and changes often break downstream systems.",
  "We need better observability to understand why customer transactions are failing.",
  "Our digital product roadmap moves slowly because design and engineering work in silos.",
  "We need to validate a new product idea before investing in a full-scale build.",
];

export const multiConstraintQueries = [
  "Which AWS service can reduce cloud costs for a healthcare organization?",
  "We need a headless CMS for a travel company with several regional websites.",
  "Show me a retail case study about improving application performance.",
  "Which DevSecOps capability helps financial-services teams release safely?",
  "We need GeoAI for agriculture crews that work without reliable connectivity.",
  "Do you have a whitepaper about modernizing cloud applications?",
  "Our Azure workloads need better cost accountability and ownership.",
  "We need commerce automation for onboarding and paying marketplace vendors.",
  "Show me a blog about Kubernetes operations and application reliability.",
  "Which data capability can help a media company unify planning and reporting?",
  "We need secure mobile access to field data in the utilities industry.",
  "Do you have a cloud migration case study from the media industry?",
];

export function validateBusinessProblem(query) {
  const value = String(query || "").trim();
  const words = value.split(/\s+/);
  const broken = /\b(?:struggling with|improve|visibility into|spent on)\s+(?:[a-z]+[, ]+){1,3}(?:which|without|what|how)\b/i.test(value);
  const malformedPunctuation = /,\s*[.?!]|\s{2,}|\b(?:with|and|of|to),[.?!]?$/i.test(value);
  const hasProblem = /\b(?:cannot|can't|lack(?:s)?|need|slow(?:ly)?|manual(?:ly)?|difficult|expensive|inconsistent|different|disconnected|fail(?:s|ing)?|risk|delay|waste|spread|separate(?:ly)?|unreliable|fragile|disagree|spend(?:s)?|do not know|no (?:reliable|efficient)|without)\b/i.test(value);
  const sentenceLike = /^[A-Z]/.test(value) && /[.?!]$/.test(value) && words.length >= 8 && words.length <= 45;
  return { accepted: sentenceLike && hasProblem && !broken && !malformedPunctuation, reason: !sentenceLike ? "not a complete human-sized sentence" : broken || malformedPunctuation ? "broken or mechanically joined phrase" : !hasProblem ? "does not express a business or technical problem" : undefined };
}
