import { normalizeSearchText } from "./search-index";
import { hasDirectSubjectAuthority, isRequestedContentTypeCompatible, isShortSemanticSubject, semanticInformationalSubject, type SearchMatch } from "./search-retriever";
import type { QueryUnderstanding } from "./query-understanding";
import type { QueryRelation } from "./query-facets";

export type EvidenceStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "INSUFFICIENT_EVIDENCE"
  | "AMBIGUOUS";

export type RequestedAttribute =
  | "duration" | "guarantee" | "cost" | "staffing" | "schedule" | "private_record"
  | "partnership" | "capability" | "content_type" | "freshness"
  | "quantity" | "comparison" | "recommendation" | "availability"
  | "compatibility" | "engagement" | "support_model" | "project_requirement" | "fact";

export interface EvidenceValidation {
  status: EvidenceStatus;
  confidence: "high" | "medium" | "low" | "none";
  subject: string;
  requestedAttribute: RequestedAttribute;
  accepted: SearchMatch[];
  rejected: Array<{ title: string; reason: string }>;
  reason: string;
}

export type SafetyRelation =
  | "CURRENT_PROJECTS" | "EMPLOYEE_WORKS_ON" | "EMPLOYEE_COMPENSATION"
  | "EMPLOYEE_PRIVATE_RECORD" | "INTERNAL_ROADMAP" | "PRIVATE_CONTRACT"
  | "PRIVATE_PRICING" | "INTERNAL_MEETING" | "INTERNAL_SECURITY"
  | "PUBLIC_INFORMATION" | "UNSPECIFIED";

export interface QuerySafetyProfile {
  relation: SafetyRelation;
  timeScope: "CURRENT" | "FUTURE" | "RECENT" | "UNSPECIFIED";
  visibility: "PUBLIC" | "PRIVATE_OR_UNPUBLISHED" | "UNSPECIFIED";
  requiresPublicRelationEvidence: boolean;
}

/**
 * Classifies the information relationship, rather than blocking individual
 * words. Explicit requests for published material remain public discovery.
 */
export function analyzeQuerySafety(message: string): QuerySafetyProfile {
  const q = normalizeSearchText(message);
  const publicScope = /\b(?:public|publicly|published|announced|case stud(?:y|ies)|customer stor(?:y|ies)|press release|media coverage)\b/.test(q);
  const privateScope = /\b(?:internal|private|confidential|secret|unreleased|unpublished)\b/.test(q);
  const current = /\b(?:current|currently|ongoing|active|right now|today|working on|assigned to|on leave|delayed)\b/.test(q);
  const future = /\b(?:upcoming|future|next year|will launch|roadmap)\b/.test(q);
  const recent = /\b(?:latest|recent|newest)\b/.test(q);

  let relation: SafetyRelation = "UNSPECIFIED";
  if (/\b(?:salary|compensation|pay|appraisal|performance rating|bonus|hike)\b/.test(q)) relation = "EMPLOYEE_COMPENSATION";
  else if (/\b(?:leave|attendance|employee record|employee id|employee (?:phone|email|address)|employees? (?:phone|email|address)|who is absent)\b/.test(q)) relation = "EMPLOYEE_PRIVATE_RECORD";
  else if (/\b(?:who|which (?:employee|developer|client)|team members?|assigned)\b.*\b(?:working|projects?|assigned|clients?)\b|\b(?:employees?|developers?)\b.*\b(?:working for|assigned to|which clients?)\b|\bwho is on (?:the )?.*project\b/.test(q)) relation = "EMPLOYEE_WORKS_ON";
  else if (/\b(?:contracts?|contract value|client billing|billing rate|minimum contract)\b/.test(q)) relation = /\b(?:private|confidential|active|current|billing|value)\b/.test(q) ? "PRIVATE_CONTRACT" : "PRIVATE_PRICING";
  else if (/\b(?:price|pricing|hourly rate|project worth|project cost)\b/.test(q)) relation = "PRIVATE_PRICING";
  else if (/\b(?:roadmap|future launch|upcoming .*launch)\b/.test(q)) relation = "INTERNAL_ROADMAP";
  else if (/\b(?:internal meetings?|meeting notes?|meeting minutes?)\b/.test(q)) relation = "INTERNAL_MEETING";
  else if (/\b(?:vulnerabilit|security (?:problems?|incidents?|weakness(?:es)?)|internal (?:security architecture|infrastructure (?:details?|diagram|configuration))|credentials|source code)\b/.test(q)) relation = "INTERNAL_SECURITY";
  else if (/\b(?:projects?|client engagements?|client work|customer project|what are you working on)\b/.test(q) && (current || future || privateScope)) relation = "CURRENT_PROJECTS";
  else if (publicScope) relation = "PUBLIC_INFORMATION";

  const inherentlyPrivate = !publicScope && relation !== "UNSPECIFIED" && relation !== "PUBLIC_INFORMATION";
  return {
    relation,
    timeScope: future ? "FUTURE" : current ? "CURRENT" : recent ? "RECENT" : "UNSPECIFIED",
    visibility: publicScope ? "PUBLIC" : privateScope || inherentlyPrivate ? "PRIVATE_OR_UNPUBLISHED" : "UNSPECIFIED",
    requiresPublicRelationEvidence: inherentlyPrivate,
  };
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
  "related", "relevant", "matching", "associated", "so", "handles", "handle", "improve",
]);
const attributeWords = new Set([
  "long", "time", "take", "timeline", "duration", "quickly", "days", "weeks",
  "months", "cost", "price", "pricing", "budget", "much", "developers",
  "people", "team", "staff", "required", "schedule", "date", "credited",
  "rating", "hike", "salary", "bonus", "appraisal", "attendance", "manager",
  "policy", "partner", "partnership", "case", "study", "blog", "blogs", "article", "articles",
  "resource", "resources", "news", "announcement", "announcements", "latest", "current", "recent", "newest", "recommend",
]);

const terms = (value: string) => normalizeSearchText(value).split(" ")
  .filter((term) => term.length > 1 && !stop.has(term));

const identityTerm = (term: string) => term.length > 4
  ? term.replace(/(?:ies|es|s)$/i, (suffix) => suffix === "ies" ? "y" : "")
  : term;

function evidenceTermSet(value: string): Set<string> {
  return new Set(normalizeSearchText(value).split(" ").filter(Boolean).map(identityTerm));
}

const isAttributeTerm = (term: string) =>
  attributeWords.has(term) || attributeWords.has(identityTerm(term));

export function requestedAttribute(message: string, understanding: QueryUnderstanding): RequestedAttribute {
  const query = normalizeSearchText(message);
  if (/\b(?:guarantee|guaranteed|commit|committed)\b.*\b(?:delivery|date|timeline|duration|time|outcome|result|performance)\b/.test(query)) return "guarantee";
  if (/\b(?:free trials?|trial availability|free demos?|demo availability|available in (?:our|my|the) (?:region|country|market|location))\b/.test(query)) return "availability";
  if (/\b(?:integrat(?:e|es|ed|ing|ion)|compatib(?:le|ility)|interoperab(?:le|ility)|work with|connect(?:s|ed|ing|ion)?)\b/.test(query)) return "compatibility";
  if (/\b(?:dedicated(?: [a-z0-9+.#-]+){0,3} (?:developers?|engineers?|team)|engagement model|long term (?:project|engagement)|staff(?:ing| augmentation))\b/.test(query)) return "engagement";
  if (/\b(?:post launch support|after implementation|post implementation|ongoing (?:support|maintenance))\b/.test(query)) return "support_model";
  if (/\b(?:custom|specific|particular) (?:project |business )?(?:need|requirement|use case)\b/.test(query)) return "project_requirement";
  if (/\b(?:how long|timeline|duration|how quickly|how soon|guarantee .*?(?:date|timeline)|next (?:week|month|quarter|year)|this (?:week|month|quarter|year)|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen)\s*(?:days?|weeks?|months?))\b/.test(query)) return "duration";
  if (/\b(?:how much|price|pricing|budget|project cost|engagement cost|cost to|cost of (?:building|developing|implementing))\b/.test(query)) return "cost";
  if (/\b(?:how many (?:developers|engineers|people|team members)|team size|(?:developers|engineers|people) (?:are )?required)\b/.test(query)) return "staffing";
  if (/\b(?:appraisal|salary|bonus|leave|promotion|probation|notice period|attendance|employee id|my manager|personal|private|confidential|internal|absent)\b/.test(query))
    return /\b(?:my|mine|i|manager|rating|approved)\b/.test(query) ? "private_record" : "schedule";
  if (/\b(?:partner|partnership|alliance)\b/.test(query)) return "partnership";
  if (understanding.requestedContentType) return "content_type";
  if (understanding.temporalIntent || /\b(?:latest|recent|newest|today|currently)\b/.test(query)) return "freshness";
  if (/\b(?:how many|count|total|number of)\b/.test(query)) return "quantity";
  if (/\b(?:compare|comparison|versus|\bvs\b|difference|better than|worse than)\b/.test(query)) return "comparison";
  if (understanding.intent === "recommendation") return "recommendation";
  if (/\b(?:provide|support|work with|build with|capabilit|services?|who (?:handles|supports|can help with)|can (?:you|successive) (?:build|develop|create|implement))\b/.test(query)) return "capability";
  return "fact";
}

function contentTypeCompatible(match: SearchMatch, requested: QueryUnderstanding["requestedContentType"]): boolean {
  if (isRequestedContentTypeCompatible(match.document, requested)) return true;
  // An exact named entity can be represented by a descriptive first-party
  // section even when the containing page has a different document role.
  // Keep this match-scoped: a mention does not reclassify the whole page.
  if (requested && match.matchedFields.includes("exact-embedded-entity")) return true;
  if (requested === "case-study") return match.document.role === "case_study";
  if (requested === "blog") return match.document.role === "blog";
  if (requested === "partner") return ["partner", "partners"].includes(match.document.role);
  if (requested === "industry") return match.document.role === "industry";
  if (requested === "career") return ["career", "careers"].includes(match.document.role);
  if (requested === "service") return ["service", "global_capabilities"].includes(match.document.role);
  if (requested === "resource") return match.document.role === "resource";
  return false;
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
    guarantee: /\b(?:guarantee|guaranteed|commitment|committed|service level agreement|sla)\b/,
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
    availability: /\b(?:free trial|trial availability|free demo|demo availability|available in|regional availability)\b/,
    compatibility: /\b(?:integrat(?:e|es|ed|ing|ion)|compatib(?:le|ility)|interoperab(?:le|ility)|work with|connect(?:s|ed|ing|ion)?)\b/,
    engagement: /\b(?:dedicated(?: [a-z0-9+.#-]+){0,3} (?:developers?|engineers?|team)|engagement model|long term|staff(?:ing| augmentation))\b/,
    support_model: /\b(?:post launch support|after implementation|post implementation|ongoing (?:support|maintenance))\b/,
    project_requirement: /\b(?:custom|specific|particular) (?:project |business )?(?:need|requirement|use case)\b/,
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
  authoritativeSubject?: string | null;
}): EvidenceValidation {
  const { message, understanding, matches } = args;
  const safety = analyzeQuerySafety(message);
  const attribute = requestedAttribute(message, understanding);
  const authoritativeSubjectTerms = args.authoritativeSubject?.trim()
    ? terms(args.authoritativeSubject).filter((term) => !isAttributeTerm(term)) : [];
  const queryTerms = authoritativeSubjectTerms.length
    ? [] : terms(message).filter((term) => !isAttributeTerm(term));
  const contextTerms = args.contextMessage &&
    !authoritativeSubjectTerms.length &&
    normalizeSearchText(args.contextMessage) !== normalizeSearchText(message)
    ? terms(args.contextMessage).filter((term) => !isAttributeTerm(term))
    : [];
  const explicitTopicTerms = new Set(understanding.topics.flatMap(terms));
  const subjectTerms = [...new Set([
    ...(authoritativeSubjectTerms.length ? authoritativeSubjectTerms : [
      ...understanding.entities.flatMap(terms), ...understanding.topics.flatMap(terms),
      ...understanding.domains.flatMap(terms), ...queryTerms, ...contextTerms,
    ]),
  ])].filter((term) => !isAttributeTerm(term) ||
    (attribute === "content_type" && explicitTopicTerms.has(term)));
  const subject = subjectTerms.join(" ") || "the requested information";
  const shortDefinitionSubject = attribute === "fact" &&
    ["define", "explain"].includes(understanding.answerMode) &&
    subjectTerms.length === 1 && isShortSemanticSubject(semanticInformationalSubject(subject));
  const ambiguous = /^(?:how long|how much|when|where|who|what about that|can you do it|tell me more|what will it cost|how quickly can you finish)[?.!\s]*$/i.test(message.trim());
  if (ambiguous && !args.hasConversationSubject) {
    return { status: "AMBIGUOUS", confidence: "none", subject, requestedAttribute: attribute, accepted: [], rejected: [], reason: "The requested subject is unresolved." };
  }

  if (safety.requiresPublicRelationEvidence) {
    return {
      status: "INSUFFICIENT_EVIDENCE", confidence: "none", subject,
      requestedAttribute: attribute, accepted: [],
      rejected: matches.map((match) => ({
        title: match.document.title,
        reason: safety.visibility === "PRIVATE_OR_UNPUBLISHED"
          ? "private or unpublished relation is not supported by public evidence"
          : "semantically related content does not support the requested relation and time scope",
      })),
      reason: `The requested ${safety.relation.toLowerCase().replace(/_/g, " ")} relation is private, unpublished, or not established by authoritative public evidence.`,
    };
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
    const directSubjectAuthority = !shortDefinitionSubject ||
      hasDirectSubjectAuthority(match.document, subject) ||
      match.matchedFields.includes("embedded-direct-subject-authority");
    const contentCompatible = contentTypeCompatible(match, understanding.requestedContentType);
    const authority = ["service", "company", "global_capabilities", "partner", "partners", "product", "press_release", "editorial", "culture", "careers", "awards", "case_study", "blog", "resource", "industry"].includes(match.document.role) ||
      match.matchedFields.includes("exact-embedded-entity");
    const structured = match.matchedFields.some((field) => /structured|entity|exact|canonical/.test(field));
    const score = subjectCoverage * 0.45 + relationCoverage * 0.3 + (contentCompatible ? 0.15 : 0) + (authority ? 0.07 : 0) + (structured ? 0.03 : 0);
    const reason = !contentCompatible ? "requested content type mismatch"
      : relationCoverage === 0 ? `missing ${attribute} evidence`
        : !directSubjectAuthority ? "short definition subject lacks direct document authority"
        : subjectCoverage < 0.34 ? "weak subject coverage"
          : !authority ? "insufficient document authority" : "supported";
    return { match, score, subjectCoverage, identitySubjectCoverage, relationCoverage, contentCompatible, directSubjectAuthority, reason };
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
    if (attribute === "compatibility") {
      if (attributeCoverage(attribute, text, item.match) === 0) return false;
      const target = normalizeSearchText(message).match(
        /\b(?:with|to) (?:our |my |the )?(?:existing |custom |internal )?([a-z0-9+#.-]+)(?: (?:system|platform|pipeline))?/,
      )?.[1];
      return !target || /^(?:system|platform|pipeline|environment|technology)$/.test(target) ||
        new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
    }
    if (["availability", "engagement", "support_model", "project_requirement"].includes(attribute))
      return attributeCoverage(attribute, text, item.match) > 0;
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
    item.contentCompatible && item.directSubjectAuthority && explicitMetric(item) && strongMetricIdentity(item) &&
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
    duration: "timeline or delivery duration", guarantee: "guarantee or delivery commitment", cost: "project-specific cost or pricing", staffing: "required team size",
    schedule: "schedule or policy", private_record: "private employee information", partnership: "formal partnership relationship",
    capability: "capability", content_type: "requested content type", freshness: "current or latest status",
    quantity: "requested quantity", comparison: "requested comparison", recommendation: "recommendation",
    availability: "requested availability", compatibility: "requested compatibility", engagement: "engagement model",
    support_model: "support model", project_requirement: "project-specific requirement", fact: "requested fact",
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

export function answerAddressesRequestedAttribute(
  answer: string,
  message: string,
  attribute: RequestedAttribute,
): boolean {
  const text = normalizeSearchText(answer);
  if (attribute === "availability") return /\b(?:free trial|trial availability|free demo|demo availability|available in|regional availability)\b/.test(text);
  if (attribute === "engagement") return /\b(?:dedicated(?: [a-z0-9+.#-]+){0,3} (?:developers?|engineers?|team)|engagement model|long term|staff(?:ing| augmentation))\b/.test(text);
  if (attribute === "support_model") return /\b(?:post launch support|after implementation|post implementation|ongoing (?:support|maintenance))\b/.test(text);
  if (attribute === "project_requirement") return /\b(?:custom|specific|particular) (?:project |business )?(?:need|requirement|use case)\b/.test(text);
  if (attribute !== "compatibility") return true;
  if (!/\b(?:integrat(?:e|es|ed|ing|ion)|compatib(?:le|ility)|interoperab(?:le|ility)|work with|connect(?:s|ed|ing|ion)?)\b/.test(text)) return false;
  const target = normalizeSearchText(message).match(
    /\b(?:with|to) (?:our |my |the )?(?:existing |custom |internal )?([a-z0-9+#.-]+)(?: (?:system|platform|pipeline))?/,
  )?.[1];
  return !target || /^(?:system|platform|pipeline|environment|technology)$/.test(target) ||
    new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
}

export function safeUnsupportedQueryResponse(message: string): string | null {
  const profile = analyzeQuerySafety(message);
  if (!profile.requiresPublicRelationEvidence) return null;
  const subject = profile.relation === "EMPLOYEE_COMPENSATION" || profile.relation === "EMPLOYEE_PRIVATE_RECORD" || profile.relation === "EMPLOYEE_WORKS_ON"
    ? "that employee-specific information"
    : profile.relation === "PRIVATE_PRICING" || profile.relation === "PRIVATE_CONTRACT"
      ? "those commercial or contract details"
      : profile.relation === "INTERNAL_SECURITY"
        ? "that internal security information"
        : profile.relation === "INTERNAL_ROADMAP"
          ? "that internal roadmap information"
          : profile.relation === "INTERNAL_MEETING"
            ? "those internal meeting details"
            : "Successive’s current internal projects or active confidential engagements";
  const alternative = profile.relation === "CURRENT_PROJECTS" || profile.relation === "EMPLOYEE_WORKS_ON"
    ? " I can instead show you Successive’s published case studies or publicly announced customer work."
    : profile.relation === "PRIVATE_PRICING" || profile.relation === "PRIVATE_CONTRACT"
      ? " You can contact Successive for authoritative commercial information."
      : "";
  return `I couldn’t confirm ${subject} from the available public content. This information is not published in the available evidence.${alternative}`;
}
