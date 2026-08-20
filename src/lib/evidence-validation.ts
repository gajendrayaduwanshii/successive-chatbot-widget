import { normalizeSearchText } from "./search-index";
import { isRequestedContentTypeCompatible, type SearchMatch } from "./search-retriever";
import type { QueryUnderstanding } from "./query-understanding";
import type { QueryRelation } from "./query-facets";

export type EvidenceStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "INSUFFICIENT_EVIDENCE"
  | "AMBIGUOUS";

export type RequestedAttribute =
  | "duration" | "cost" | "staffing" | "schedule" | "private_record"
  | "partnership" | "capability" | "content_type" | "freshness"
  | "quantity" | "comparison" | "recommendation" | "fact";

export interface EvidenceValidation {
  status: EvidenceStatus;
  confidence: "high" | "medium" | "low" | "none";
  subject: string;
  requestedAttribute: RequestedAttribute;
  accepted: SearchMatch[];
  rejected: Array<{ title: string; reason: string }>;
  reason: string;
}

const AUTHORITATIVE_ROLES = new Set([
  "service", "company", "global_capabilities", "partner", "partners",
  "product", "press_release", "culture", "careers", "awards",
  "case_study", "blog", "resource", "industry", "contact",
]);

function relationCompatible(match: SearchMatch, relation: QueryRelation): boolean {
  const role = match.document.role;
  const identity = normalizeSearchText(`${match.document.title} ${match.document.slug} ${match.document.service_type ?? ""}`);
  if (relation === "PARTNER_OF") return role === "partner" || role === "partners";
  if (relation === "HAS_OFFICE_IN") return role === "company" || role === "contact";
  if (relation === "HAS_CASE_STUDY") return role === "case_study";
  if (relation === "HAS_ARTICLE") return ["blog", "resource", "press_release", "editorial"].includes(role);
  if (relation === "SERVES_INDUSTRY") return role === "industry" || role === "case_study";
  if (relation === "HAS_PRODUCT") return role === "product" || /\bkagen\b/.test(identity);
  if (["SECURES", "MODERNIZES", "AUTOMATES", "INTEGRATES", "CONSULTS_ON", "OFFERS", "SUPPORTS"].includes(relation))
    return role === "service" || role === "global_capabilities" || role === "technology";
  return AUTHORITATIVE_ROLES.has(role) || role === "technology";
}

/**
 * Controlled recovery for candidates rejected by the normal relative cutoff.
 * It never changes global thresholds: an item must independently satisfy the
 * requested content type, authority, relation, and an identity/capability
 * signal produced by the corpus index.
 */
export function recoverAuthoritativeEvidence(args: {
  candidates: SearchMatch[];
  understanding: QueryUnderstanding;
  relation: QueryRelation;
}): SearchMatch[] {
  return args.candidates
    .filter((match) => isRequestedContentTypeCompatible(match.document, args.understanding.requestedContentType))
    .filter((match) => relationCompatible(match, args.relation))
    .filter((match) => !match.matchedFields.some((field) => /incidental-body-only|entity-mismatch/.test(field)))
    .filter((match) => {
      const strongIndexSignal = match.matchedFields.some((field) =>
        /exact-title|title-phrase|alias|canonical|exact-section|exact-entity-authority|capability-profile|primary-service-authority|authoritative-.*-portfolio|case-study-capability-bridge/.test(field),
      );
      const dimensions = match.scoreBreakdown;
      const strongRelationSignal = (dimensions?.entity ?? 0) >= 0.5 ||
        (dimensions?.functional ?? 0) >= 0.2 ||
        (dimensions?.topic ?? 0) >= 0.34 ||
        (dimensions?.problem ?? 0) >= 0.2;
      return strongIndexSignal || strongRelationSignal;
    })
    .sort((a, b) => b.score - a.score || b.document.contentQuality - a.document.contentQuality)
    .slice(0, 3)
    .map((match) => ({
      ...match,
      matchedFields: [...new Set([...match.matchedFields, "controlled-authority-recovery"])],
      confidence: match.confidence ?? "medium",
    }));
}

const stop = new Set([
  "what", "which", "who", "where", "when", "why", "how", "does", "do",
  "can", "could", "would", "will", "is", "are", "the", "a", "an", "to",
  "for", "of", "in", "on", "with", "my", "our", "your", "successive",
  "digital", "provide", "support", "work", "use", "have", "show", "tell",
  "please", "exact", "specific", "project", "company", "information", "it",
  "build", "develop", "create", "make", "take", "deliver",
  "many", "need", "needed", "should", "plan", "we", "complete", "implement",
  "development", "engineering", "application", "solution", "solutions",
  "product", "products", "platform", "platforms", "and",
  "focus", "focused", "capability", "capabilities",
  "no", "not", "only", "cannot", "right", "correct", "unrelated",
  "serve", "industry", "industries", "career", "careers", "partner", "partners",
  "partnership", "about", "me", "you", "be", "completed", "finish",
]);
const attributeWords = new Set([
  "long", "time", "take", "timeline", "duration", "quickly", "days", "weeks",
  "months", "cost", "price", "pricing", "budget", "much", "developers",
  "people", "team", "staff", "required", "schedule", "date", "credited",
  "rating", "hike", "salary", "bonus", "appraisal", "attendance", "manager",
  "policy", "partner", "partnership", "case", "study", "blog", "article",
  "resource", "news", "announcement", "announcements", "latest", "current", "recent", "newest", "recommend",
]);

const terms = (value: string) => normalizeSearchText(value).split(" ")
  .filter((term) => term.length > 1 && !stop.has(term));

const identityTerm = (term: string) => term.length > 4
  ? term.replace(/(?:ies|es|s)$/i, (suffix) => suffix === "ies" ? "y" : "")
  : term;

function evidenceTermSet(value: string): Set<string> {
  return new Set(normalizeSearchText(value).split(" ").filter(Boolean).map(identityTerm));
}

export function requestedAttribute(message: string, understanding: QueryUnderstanding): RequestedAttribute {
  const query = normalizeSearchText(message);
  if (/\b(?:how long|timeline|duration|how quickly|how soon|guarantee .*?(?:date|timeline)|next (?:week|month|quarter|year)|this (?:week|month|quarter|year)|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen)\s*(?:days?|weeks?|months?))\b/.test(query)) return "duration";
  if (/\b(?:how much|price|pricing|budget|revenue|project cost|engagement cost|cost to|cost of (?:building|developing|implementing))\b/.test(query)) return "cost";
  if (/\b(?:how many (?:developers|engineers|people|team members)|team size|(?:developers|engineers|people) (?:are )?required)\b/.test(query)) return "staffing";
  if (/\b(?:appraisal|salary|bonus|leave|promotion|probation|notice period|attendance|employee id|my manager|personal|private|confidential|internal|absent)\b/.test(query))
    return /\b(?:my|mine|i|manager|rating|approved)\b/.test(query) ? "private_record" : "schedule";
  if (/\b(?:partner|partnership|alliance)\b/.test(query)) return "partnership";
  if (understanding.requestedContentType) return "content_type";
  if (understanding.temporalIntent || /\b(?:latest|recent|newest|today|currently)\b/.test(query)) return "freshness";
  if (/\b(?:how many|count|total|number of)\b/.test(query)) return "quantity";
  if (/\b(?:compare|comparison|versus|\bvs\b|difference)\b/.test(query)) return "comparison";
  if (understanding.intent === "recommendation") return "recommendation";
  if (/\b(?:provide|support|work with|build with|capabilit|services?|can (?:you|successive) (?:build|develop|create|implement))\b/.test(query)) return "capability";
  return "fact";
}

function contentTypeCompatible(match: SearchMatch, requested: QueryUnderstanding["requestedContentType"]): boolean {
  if (!requested) return true;
  const identity = `${match.document.type} ${match.document.role} ${match.document.slug}`;
  if (requested === "case-study") return /case/.test(identity);
  if (requested === "blog") return match.document.role === "blog" || match.document.type === "post";
  if (requested === "partner") return /partner/.test(identity);
  if (requested === "industry") return match.document.role === "industry" || match.document.type === "industries";
  if (requested === "career") return /career|job/.test(identity);
  if (requested === "service") return match.document.role === "service" || match.document.role === "global_capabilities";
  if (requested === "event") return /event|webinar/.test(identity);
  if (requested === "whitepaper") return /whitepaper|ebook|resource/.test(identity);
  if (requested === "news") return /press_release|press-release|media-coverage|editorial/.test(identity);
  return true;
}

function evidenceText(match: SearchMatch): string {
  return normalizeSearchText([
    match.document.title, ...match.document.headings,
    match.document.modified ?? "",
    ...match.selectedPassages, ...match.document.structuredFields.map((field) => `${field.label} ${field.value}`),
  ].join(" "));
}

function attributeCoverage(attribute: RequestedAttribute, text: string, match: SearchMatch): number {
  const checks: Record<RequestedAttribute, RegExp> = {
    duration: /\b(?:timeline|duration|delivery time|days?|weeks?|months?|hours?|estimate)\b/,
    cost: /\b(?:cost|price|pricing|budget|fee|rate|investment|revenue)\b/,
    staffing: /\b(?:team size|developers?|engineers?|staffing|resources?)\b/,
    schedule: /\b(?:schedule|date|cycle|policy|appraisal|salary|bonus|leave|promotion|probation|notice period)\b/,
    private_record: /\b(?:rating|attendance|manager|approved|salary|bonus|leave)\b/,
    partnership: /\b(?:partner|partnership|alliance|certified)\b/,
    capability: /\b(?:service|solution|capability|expertise|build|develop|implement|consult)\b/,
    content_type: /./,
    freshness: /\b(?:20\d{2}|date|published|latest|recent|current|newest)\b/,
    quantity: /\b\d+\b/,
    comparison: /\b(?:compare|versus|difference|better|advantages?|tradeoffs?)\b/,
    recommendation: /\b(?:recommend|suitable|fit|approach|solution|service|capability)\b/,
    fact: /./,
  };
  if (attribute === "content_type") return 1;
  if (attribute === "partnership" && !/partner/.test(match.document.role)) return 0;
  if (["schedule", "private_record"].includes(attribute) && !["culture", "careers"].includes(match.document.role)) return 0;
  return checks[attribute].test(text) ? 1 : 0;
}

export function validateEvidence(args: {
  message: string;
  contextMessage?: string;
  understanding: QueryUnderstanding;
  matches: SearchMatch[];
  hasConversationSubject: boolean;
}): EvidenceValidation {
  const { message, understanding, matches } = args;
  const attribute = requestedAttribute(message, understanding);
  const queryTerms = terms(message).filter((term) => !attributeWords.has(term));
  const contextTerms = args.contextMessage &&
    normalizeSearchText(args.contextMessage) !== normalizeSearchText(message)
    ? terms(args.contextMessage).filter((term) => !attributeWords.has(term))
    : [];
  const subjectTerms = [...new Set([
    ...understanding.entities.flatMap(terms), ...understanding.topics.flatMap(terms),
    ...understanding.domains.flatMap(terms), ...queryTerms, ...contextTerms,
  ])].filter((term) => !attributeWords.has(term));
  const subject = subjectTerms.join(" ") || "the requested information";
  const ambiguous = /^(?:how long|how much|when|where|who|what about that|can you do it|tell me more|what will it cost|how quickly can you finish)[?.!\s]*$/i.test(message.trim());
  if (ambiguous && !args.hasConversationSubject) {
    return { status: "AMBIGUOUS", confidence: "none", subject, requestedAttribute: attribute, accepted: [], rejected: [], reason: "The requested subject is unresolved." };
  }

  const evaluated = matches.map((match) => {
    const text = evidenceText(match);
    const evidenceTerms = evidenceTermSet(text);
    const matchedSubject = subjectTerms.filter((term) => evidenceTerms.has(identityTerm(term)));
    const lexicalSubjectCoverage = subjectTerms.length ? matchedSubject.length / subjectTerms.length : 0.5;
    const identityText = normalizeSearchText(match.document.title);
    const identityTerms = evidenceTermSet(identityText);
    const identityMatches = subjectTerms.filter((term) => identityTerms.has(identityTerm(term)));
    const identitySubjectCoverage = subjectTerms.length ? identityMatches.length / subjectTerms.length : 0.5;
    const subjectCoverage = ["solve_problem", "recommendation"].includes(understanding.intent)
      ? Math.max(lexicalSubjectCoverage, match.scoreBreakdown?.functional ?? 0)
      : lexicalSubjectCoverage;
    const relationCoverage = attributeCoverage(attribute, text, match);
    const contentCompatible = contentTypeCompatible(match, understanding.requestedContentType);
    const authority = ["service", "company", "global_capabilities", "partner", "partners", "product", "press_release", "editorial", "culture", "careers", "awards", "case_study", "blog", "resource", "industry"].includes(match.document.role);
    const structured = match.matchedFields.some((field) => /structured|entity|exact|canonical/.test(field));
    const score = subjectCoverage * 0.45 + relationCoverage * 0.3 + (contentCompatible ? 0.15 : 0) + (authority ? 0.07 : 0) + (structured ? 0.03 : 0);
    const reason = !contentCompatible ? "requested content type mismatch"
      : relationCoverage === 0 ? `missing ${attribute} evidence`
        : subjectCoverage < 0.34 ? "weak subject coverage"
          : !authority ? "insufficient document authority" : "supported";
    return { match, score, subjectCoverage, identitySubjectCoverage, relationCoverage, contentCompatible, reason };
  });
  const explicitMetric = (item: typeof evaluated[number]) => {
    const text = evidenceText(item.match);
    if (attribute === "duration") {
      const requestedConstraint = normalizeSearchText(message).match(/\b(?:next (?:week|month|quarter|year)|this (?:week|month|quarter|year)|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen) (?:hours?|days?|weeks?|months?|years?))\b/)?.[0];
      if (/\bguarantee\b/i.test(message) && !/\bguarantee(?:d|s)?\b/.test(text)) return false;
      if (requestedConstraint && !text.includes(requestedConstraint)) return false;
      return /\b(?:\d+(?:\s*[-–]\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen)\s*(?:hours?|days?|weeks?|months?|years?)\b/.test(text);
    }
    if (attribute === "cost") return /(?:[$€£₹]\s*\d|\b\d[\d,.]*\s*(?:usd|dollars?|euros?|rupees?)\b)/.test(text);
    if (attribute === "staffing") return /\b\d+(?:\s*[-–]\s*\d+)?\s*(?:developers?|engineers?|people|members?)\b/.test(text);
    if (attribute === "recommendation") return false;
    return true;
  };
  const projectSpecific = ["duration", "cost", "staffing"].includes(attribute);
  const strongMetricIdentity = (item: typeof evaluated[number]) =>
    !projectSpecific || item.match.matchedFields.some((field) =>
      /normalized-exact-title|exact-section-heading|exact-entity|structured-field/.test(field),
    );
  const direct = evaluated.filter((item) =>
    item.score >= 0.68 && item.subjectCoverage >= 0.34 && item.relationCoverage > 0 &&
    item.contentCompatible && explicitMetric(item) && strongMetricIdentity(item) &&
    (attribute !== "capability" || item.identitySubjectCoverage >= 0.34 || item.match.document.role === "industry"),
  );
  const related = evaluated.filter((item) =>
    item.identitySubjectCoverage >= (subjectTerms.length >= 2 ? 0.66 : 1) &&
    (!projectSpecific || ["service", "global_capabilities", "page"].includes(item.match.document.role)) &&
    contentTypeCompatible(item.match, understanding.requestedContentType),
  );
  if (direct.length) return {
    status: "SUPPORTED", confidence: "high", subject, requestedAttribute: attribute,
    accepted: direct.map((item) => item.match), rejected: evaluated.filter((item) => !direct.includes(item)).map((item) => ({ title: item.match.document.title, reason: item.reason })),
    reason: "Subject, requested attribute/relation, authority, and content type are supported.",
  };
  if ((projectSpecific || attribute === "recommendation") && related.length) return {
    status: "PARTIALLY_SUPPORTED", confidence: "medium", subject, requestedAttribute: attribute,
    accepted: related.slice(0, 2).map((item) => item.match), rejected: evaluated.filter((item) => !related.includes(item)).map((item) => ({ title: item.match.document.title, reason: item.reason })),
    reason: `Related capability evidence exists, but the requested ${attribute} is not supported.`,
  };
  return {
    status: "INSUFFICIENT_EVIDENCE", confidence: "none", subject, requestedAttribute: attribute, accepted: [],
    rejected: evaluated.map((item) => ({ title: item.match.document.title, reason: item.reason })),
    reason: evaluated[0]?.reason ?? "No candidate evidence was available.",
  };
}

export function safeEvidenceResponse(validation: EvidenceValidation): string {
  const labels: Record<RequestedAttribute, string> = {
    duration: "timeline or delivery duration", cost: "project-specific cost or pricing", staffing: "required team size",
    schedule: "schedule or policy", private_record: "private employee information", partnership: "formal partnership relationship",
    capability: "capability", content_type: "requested content type", freshness: "current or latest status",
    quantity: "requested quantity", comparison: "requested comparison", recommendation: "recommendation", fact: "requested fact",
  };
  if (validation.status === "AMBIGUOUS") return "What subject or project are you asking about? Please add a little context so I can check the relevant Successive information.";
  if (validation.status === "PARTIALLY_SUPPORTED") {
    const related = validation.accepted[0];
    return `I couldn’t confirm a specific ${labels[validation.requestedAttribute]} for ${validation.subject} from the available Successive content. Successive does publish related information in **${related.document.title}**, but an exact answer depends on project requirements and would need a scoped assessment.`;
  }
  const nextStep = ["schedule", "private_record"].includes(validation.requestedAttribute)
    ? "Please check with the relevant HR or internal team for the authoritative information."
    : ["duration", "cost", "staffing"].includes(validation.requestedAttribute)
      ? "A reliable estimate would require the project scope, integrations, constraints, and delivery requirements."
      : "You can clarify the subject or ask about a related published Successive capability.";
  return `I couldn’t confirm the ${labels[validation.requestedAttribute]} for ${validation.subject} from the available Successive content. ${nextStep}`;
}
