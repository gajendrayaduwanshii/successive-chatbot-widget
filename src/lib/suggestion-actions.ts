import type { SuggestionAction } from "./llm/schemas";
import { normalizeSearchText, type SuccessiveSearchDocument } from "./search-index";
import { designationHasRole, type PersonRoleConcept } from "./person-roles";

export type ExecutableSuggestionAction = Omit<SuggestionAction, "label"> & Partial<Pick<SuggestionAction, "label">>;
type ActionExecutor = (action: ExecutableSuggestionAction) => string;
export type SuggestionContextType = "TOPIC_CONTEXT" | "INDIVIDUAL_PAGE_CONTEXT" | "CATEGORY_LISTING_CONTEXT" | "OTHER_CONTEXT";

export interface RelatedContentRequest {
  requestedRoles: SuccessiveSearchDocument["role"][];
}

const TOPICAL_DISCOVERY_ROLES = new Set<SuccessiveSearchDocument["role"]>([
  "service", "technology", "product", "industry", "case_study", "blog",
  "editorial", "resource", "whitepaper", "report", "accelerator",
]);

/** Parses only the generic action grammar used by related-content controls. */
export function parseRelatedContentRequest(message: string): RelatedContentRequest | null {
  const normalized = normalizeSearchText(message);
  const roleLabel = normalized.match(/^(?:explore|show(?: me)?|find|view|read)\s+(?:some\s+)?related\s+(.+)$/)?.[1];
  if (!roleLabel) return null;
  const mappings: Array<[RegExp, SuccessiveSearchDocument["role"][]]> = [
    [/\b(?:articles?|posts?|blogs?)\b/, ["blog", "editorial"]],
    [/\bresources?\b/, ["resource", "whitepaper", "report"]],
    [/\bcase stud(?:y|ies)\b/, ["case_study"]],
    [/\bservices?\b/, ["service"]],
    [/\bpartners?(?:hip)?(?: content| information)?\b/, ["partner", "partners"]],
    [/\bcontact(?: information| details)?\b/, ["contact", "location"]],
    [/\bpages?\b/, ["page"]],
  ];
  return mappings.map(([pattern, requestedRoles]) => pattern.test(roleLabel) ? { requestedRoles } : null)
    .find((value): value is RelatedContentRequest => Boolean(value)) ?? null;
}

export function classifySuggestionContext({ source, exactResource = false, categoryListing = false, personEntity = false }: {
  source?: SuccessiveSearchDocument;
  exactResource?: boolean;
  categoryListing?: boolean;
  personEntity?: boolean;
}): SuggestionContextType {
  if (!source) return "OTHER_CONTEXT";
  if (categoryListing) return "CATEGORY_LISTING_CONTEXT";
  if (exactResource || personEntity) return "INDIVIDUAL_PAGE_CONTEXT";
  return "TOPIC_CONTEXT";
}

const actionRegistry: Record<SuggestionAction["intent"], ActionExecutor> = {
  CUSTOMER_WORK_DISCOVERY: () => "Customer case studies",
  PUBLIC_ORGANIZATION_OVERVIEW: () => "clients",
  CONTENT_DISCOVERY: (action) => action.topic ? `Published information about ${action.topic}`
    : action.contentType === "case-study" ? "Case studies" : "Published Successive content",
  FOLLOW_UP_QUERY: (action) => {
    const query = action.query ?? "Show me related Successive information";
    const topic = action.topic?.trim();
    if (!topic || normalizeSearchText(query).includes(normalizeSearchText(topic))) return query;
    const normalizedQuery = normalizeSearchText(query);
    if (/\b(?:which|what|show|find)\b.*\bservices?\b.*\b(?:support|related|relevant|for)\b/.test(normalizedQuery))
      return `${topic} Successive services`;
    if (/\b(?:business outcomes?|benefits?|value)\b/.test(normalizedQuery))
      return `Business outcomes and value of ${topic}`;
    if (/\b(?:implement|implementation|apply|adopt)\b/.test(normalizedQuery))
      return `How Successive can implement ${topic} for a business`;
    if (/\b(?:cost|pricing|price|estimate|quote|quotation|proposal|requirements|consultation|sales)\b/.test(normalizedQuery))
      return `${query} for ${topic}`;
    return `${query} related to ${topic}`;
  },
};

/** Builds executable next-question actions, separate from evidence cards already shown. */
export function buildFollowUpQueryActions(labels: string[], limit = 3, topic?: string): SuggestionAction[] {
  const seen = new Set<string>();
  return labels.flatMap((label): SuggestionAction[] => {
    const query = label.replace(/\s+/g, " ").trim();
    const identity = normalizeSearchText(query);
    if (identity.length < 2 || seen.has(identity)) return [];
    seen.add(identity);
    return [{ id: `follow-up-${identity.replace(/\s+/g, "-")}`.slice(0, 80),
      label: query.slice(0, 160), intent: "FOLLOW_UP_QUERY", query: query.slice(0, 300),
      topic: topic?.replace(/\s+/g, " ").trim().slice(0, 200) || undefined }];
  }).slice(0, limit);
}

export function documentActionKey(document: Pick<SuccessiveSearchDocument, "type" | "id">): string {
  return `${document.type}:${document.id}`;
}

function promisedRole(action: ExecutableSuggestionAction, document: SuccessiveSearchDocument): boolean {
  if (action.contentType === "case-study") return document.role === "case_study";
  if (action.contentType === "customer-work") return document.role === "case_study" ||
    (["blog", "editorial", "press_release", "resource"].includes(document.role) && /\b(?:customer|client)\b/i.test(document.combinedText));
  return !action.targetContentType || document.role === action.targetContentType;
}

/** Shared exact eligibility used by both pre-flight generation and click execution. */
export function resolveEligibleActionDocuments(
  action: ExecutableSuggestionAction,
  documents: SuccessiveSearchDocument[],
): SuccessiveSearchDocument[] {
  if (!action.resultKeys?.length) return [];
  const requested = new Set(action.resultKeys);
  const source = action.sourceContext
    ? documents.find((document) => documentActionKey(document) === action.sourceContext)
    : undefined;
  return documents.filter((document) => {
    if (!requested.has(documentActionKey(document)) || !promisedRole(action, document)) return false;
    if (action.relation !== "RELATED_TO_SOURCE") return true;
    if (!source) return false;
    const subject = action.subject ?? action.entity ?? action.topic ?? source.title;
    if (isBroadNavigationPage(document, subject)) return false;
    if (action.contextType === "INDIVIDUAL_PAGE_CONTEXT")
      return action.sourcePageRole && TOPICAL_DISCOVERY_ROLES.has(source.role)
        ? relatedActionEvidence(source, document, subject)
        : Boolean(individualPageRelation(source, document)) || relatedActionEvidence(source, document, subject);
    if (action.contextType === "CATEGORY_LISTING_CONTEXT")
      return Boolean(navigationRelation(source, document)) && relatedActionEvidence(source, document, subject);
    return relatedActionEvidence(source, document, subject) && !isBroadNavigationPage(document, subject);
  });
}

function normalizeUrl(value: string): string {
  try { return new URL(value, "https://local.invalid").pathname.replace(/\/$/, "") || "/"; }
  catch { return value.replace(/[?#].*$/, "").replace(/\/$/, ""); }
}

function relationIsStrong(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument): boolean {
  if (source.id === candidate.id && source.type === candidate.type) return false;
  const relationship = source.relatedCapabilities.find((item) => item.documentId === candidate.id) ??
    candidate.relatedCapabilities.find((item) => item.documentId === source.id);
  if (relationship && relationship.score >= 0.35 && relationship.evidence.some((value) =>
    ["explicit-reference", "phrase"].includes(value))) return true;
  return validatedDirectLinkRelation(source, candidate);
}

function validatedDirectLinkRelation(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument): boolean {
  const relationship = source.relatedCapabilities.find((item) => item.documentId === candidate.id) ??
    candidate.relatedCapabilities.find((item) => item.documentId === source.id);
  if (!relationship || relationship.score < 0.35 || !relationship.evidence.includes("internal-link"))
    return false;
  if (!TOPICAL_DISCOVERY_ROLES.has(source.role))
    return false;
  if (isBroadNavigationPage(candidate, source.title)) return false;
  const pageCapabilityIdentity = normalizeSearchText(
    `${candidate.title} ${candidate.slug.replace(/[-_]+/g, " ")} ${candidate.service_type ?? ""}`,
  );
  const eligibleDestination = TOPICAL_DISCOVERY_ROLES.has(candidate.role) ||
    (candidate.role === "page" && candidate.contentQuality >= 30 &&
      /\b(?:service|services|solution|solutions|consulting|development|engineering|technology|company)\b/.test(pageCapabilityIdentity));
  if (!eligibleDestination) return false;
  // A linked capability page may use a different name from the editorial
  // source. Its authored direct link is the relationship evidence; generic
  // pages still require their own identity and navigation checks above.
  if (candidate.role === "page") return true;
  const sourceTopics = new Set([
    ...source.topicProfile.primaryTopics,
    ...source.topicProfile.secondaryTopics,
  ].filter((term) => term.length >= 4));
  return [...candidate.topicProfile.primaryTopics, ...candidate.topicProfile.secondaryTopics]
    .some((term) => term.length >= 4 && sourceTopics.has(term));
}

const SUBJECT_NOISE = new Set(["successive", "digital", "company", "service", "services", "capability", "capabilities", "development", "information", "related"]);

function subjectTerms(value: string): string[] {
  return [...new Set(normalizeSearchText(value).split(" ")
    .filter((term) => term.length >= 2 && !SUBJECT_NOISE.has(term) &&
      !["and", "for", "the", "with"].includes(term)))];
}

function containsTerm(evidence: string, term: string): boolean {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(evidence);
}

function fieldCoherentlySupportsSubject(field: string, subject: string, terms: string[]): boolean {
  const normalized = normalizeSearchText(field).slice(0, 500);
  if (!normalized) return false;
  const normalizedSubject = normalizeSearchText(subject);
  if (normalized.includes(normalizedSubject)) return true;
  if (terms.length === 1) return containsTerm(normalized, terms[0]!);
  const tokens = normalized.split(" ");
  const windowSize = Math.max(terms.length + 2, Math.ceil(terms.length * 1.5));
  return tokens.some((_, start) => {
    const window = new Set(tokens.slice(start, start + windowSize));
    return terms.every((term) => window.has(term));
  });
}

/**
 * Page discovery is deliberately stricter than typed content discovery. A
 * page must independently carry the distinguishing part of the active
 * subject; generic company/product vocabulary and link proximity cannot make
 * an otherwise broad page relevant.
 */
function directlySupportsPageSubject(candidate: SuccessiveSearchDocument, subject: string): boolean {
  const terms = subjectTerms(subject);
  if (!terms.length) return false;
  // Evaluate bounded, page-owned fields independently. This prevents separate
  // generic tokens from being assembled across unrelated headings/excerpts.
  // Full textSegments are excluded because they can include menus and footers.
  const identityFields = [candidate.title, ...candidate.headings.slice(0, 2)];
  const localizedFields = [...identityFields, ...candidate.descriptions.slice(0, 2)];
  if (terms.length === 1 && terms[0]!.length <= 3)
    return identityFields.some((field) => fieldCoherentlySupportsSubject(field, subject, terms));
  return localizedFields.some((field) => fieldCoherentlySupportsSubject(field, subject, terms));
}

function hasAuthoritativePageRelation(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument): boolean {
  const relationship = source.relatedCapabilities.find((item) => item.documentId === candidate.id) ??
    candidate.relatedCapabilities.find((item) => item.documentId === source.id);
  if (relationship && relationship.score >= 0.35 && relationship.evidence.some((value) =>
    ["explicit-reference", "taxonomy"].includes(value))) return true;
  return validatedDirectLinkRelation(source, candidate);
}

function directlySupportsSubject(candidate: SuccessiveSearchDocument, subject: string): boolean {
  const terms = normalizeSearchText(subject).split(" ")
    .filter((term) => term.length >= 2 && !SUBJECT_NOISE.has(term));
  if (!terms.length) return false;
  const identity = normalizeSearchText(`${candidate.title} ${candidate.slug.replace(/[-_]+/g, " ")} ${candidate.aliases.join(" ")}`);
  if (terms.length === 1) return containsTerm(identity, terms[0]!);
  const phrase = terms.join(" ");
  const localized = [candidate.title, candidate.slug.replace(/[-_]+/g, " "),
    ...candidate.aliases, ...candidate.headings.slice(0, 2), ...candidate.descriptions.slice(0, 2)]
    .map(normalizeSearchText);
  return localized.some((field) => field.includes(phrase)) || terms.every((term) => containsTerm(identity, term));
}

function relatedActionEvidence(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument, subject: string): boolean {
  const subjectEvidence = candidate.role === "page"
    ? directlySupportsPageSubject(candidate, subject)
    : directlySupportsSubject(candidate, subject);
  // Generic pages are commonly linked from broad indexes, footers, or sitemaps.
  // A structural link alone must not turn one into a subject-specific promise.
  if (candidate.role === "page") return subjectEvidence || hasAuthoritativePageRelation(source, candidate);
  return relationIsStrong(source, candidate) || subjectEvidence;
}

function isBroadNavigationPage(document: SuccessiveSearchDocument, subject: string): boolean {
  if (document.role !== "page") return false;
  const identity = normalizeSearchText(`${document.type} ${document.slug.replace(/[-_]+/g, " ")} ${document.title} ${document.sectionKey ?? ""}`);
  if (/\b(?:site map|site index|page index|website directory|content directory|topic directory|navigation directory|archive index|all pages)\b/.test(identity) ||
      /\b(?:sitemap|archive|directory|navigation index)\b/.test(normalizeSearchText(document.type))) return true;
  const navigationHeavy = document.internalLinks.length >= 10 &&
    document.internalLinks.length > Math.max(3, document.descriptions.length * 3);
  const routingLanguage = normalizeSearchText(`${document.title} ${document.headings.slice(0, 2).join(" ")} ${document.descriptions.slice(0, 2).join(" ")}`);
  return navigationHeavy && (/\b(?:browse|directory|index|navigation|all topics|all pages|explore topics)\b/.test(routingLanguage) ||
    !directlySupportsPageSubject(document, subject));
}

export function noRelatedContentMessage(action: ExecutableSuggestionAction): string {
  const role = action.targetContentType?.replace(/_/g, " ");
  return role
    ? `No clearly supported related ${role === "page" ? "pages" : role} were found for this topic in the available Successive content.`
    : "No clearly supported related content was found for this topic in the available Successive content.";
}

function dynamicActionLabel(document: SuccessiveSearchDocument): string {
  const verb = document.role === "case_study" ? "View case study"
    : document.role === "blog" || document.role === "editorial" ? "Read article"
      : document.role === "service" ? "Explore service"
        : document.role === "industry" ? "Explore industry"
          : document.role === "partner" || document.role === "partners" ? "View partner details"
            : document.role === "product" ? "Explore product" : "Learn more";
  return `${verb}: ${document.title}`.slice(0, 160);
}

const ROLE_LABELS: Partial<Record<SuccessiveSearchDocument["role"], string>> = {
  case_study: "case studies", blog: "articles", editorial: "articles",
  service: "services", industry: "industries", technology: "technologies",
  product: "products", resource: "resources", press_release: "news",
  partner: "partner content", partners: "partnerships", company: "company information",
  culture: "culture and values", awards: "awards", contact: "contact information",
  careers: "career information", career: "careers", job_listing: "open roles",
  global_capabilities: "capabilities", page: "pages",
  accelerator: "accelerators", leadership: "leadership information", location: "locations",
  event: "events", webinar: "webinars", whitepaper: "whitepapers", report: "reports", media: "media coverage",
};

function groupedActionLabel(role: SuccessiveSearchDocument["role"]): string {
  return `Explore related ${ROLE_LABELS[role] ?? role.replace(/_/g, " ")}`
    .replace(/\brelated\s+related\b/i, "related").slice(0, 160);
}

function relationStrength(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument, subject?: string): number {
  if (!relatedActionEvidence(source, candidate, subject || source.title)) return 0;
  let score = 0;
  if (source.internalLinks.some((url) => normalizeUrl(url) === normalizeUrl(candidate.url)) ||
      candidate.internalLinks.some((url) => normalizeUrl(url) === normalizeUrl(source.url))) score += 100;
  const relationship = source.relatedCapabilities.find((item) => item.documentId === candidate.id) ??
    candidate.relatedCapabilities.find((item) => item.documentId === source.id);
  score += relationship?.score ?? 0;
  const topics = new Set(source.topicProfile.primaryTopics);
  score += candidate.topicProfile.primaryTopics.filter((term) => topics.has(term)).length * 15;
  return score + Math.min(candidate.contentQuality / 10, 10);
}

/**
 * Corpus-wide, content-first action discovery. Each action captures the exact
 * accepted result identities; the click path revalidates those same identities.
 */
export function buildGlobalRelatedContentActions({ source, corpus, userSubject, recentActionIds = [], limit = 3 }: {
  source: SuccessiveSearchDocument;
  corpus: SuccessiveSearchDocument[];
  userSubject?: string;
  recentActionIds?: string[];
  limit?: number;
}): SuggestionAction[] {
  const recent = new Set(recentActionIds);
  const groups = new Map<SuccessiveSearchDocument["role"], Array<{ document: SuccessiveSearchDocument; score: number }>>();
  for (const document of corpus) {
    if (document.id === source.id && document.type === source.type) continue;
    if (isBroadNavigationPage(document, userSubject ?? source.title)) continue;
    const score = relationStrength(source, document, userSubject ?? source.title);
    if (!score) continue;
    const group = groups.get(document.role) ?? [];
    group.push({ document, score });
    groups.set(document.role, group);
  }
  return [...groups.entries()]
    .map(([role, values]) => ({ role, values: values.sort((a, b) => b.score - a.score).slice(0, 3) }))
    .sort((a, b) => b.values[0]!.score - a.values[0]!.score)
    .flatMap(({ role, values }): SuggestionAction[] => {
      const resultKeys = values.map(({ document }) => documentActionKey(document));
      const id = `related-${normalizeSearchText(`${documentActionKey(source)}-${role}-${resultKeys.join("-")}`).replace(/\s+/g, "-")}`.slice(0, 80);
      if (recent.has(id)) return [];
      const action: SuggestionAction = {
        id, label: groupedActionLabel(role), intent: "CONTENT_DISCOVERY",
        topic: userSubject?.trim().slice(0, 200) || source.title,
        subject: userSubject?.trim().slice(0, 200) || source.title,
        entity: userSubject?.trim().slice(0, 200) || source.title,
        relation: "RELATED_TO_SOURCE", targetContentType: role,
        contextType: "TOPIC_CONTEXT",
        resultKeys, sourceContext: documentActionKey(source).slice(0, 80), sourceResource: source.url,
      };
      return resolveEligibleActionDocuments(action, corpus).length ? [action] : [];
    })
    .slice(0, limit);
}

const COMPANY_NAVIGATION_ROLES = new Set<SuccessiveSearchDocument["role"]>([
  "company", "culture", "careers", "career", "awards", "partners",
  "global_capabilities", "contact", "leadership", "location",
]);

type PageSemanticGroup =
  | "COMPANY_OVERVIEW"
  | "CULTURE_AND_PEOPLE"
  | "LEADERSHIP"
  | "CAREERS"
  | "AWARDS_AND_RECOGNITION"
  | "PARTNERS_AND_ALLIANCES"
  | "GLOBAL_CAPABILITIES"
  | "OTHER";

const COMPLEMENTARY_GROUPS: Record<PageSemanticGroup, PageSemanticGroup[]> = {
  COMPANY_OVERVIEW: ["CULTURE_AND_PEOPLE", "LEADERSHIP", "CAREERS"],
  CULTURE_AND_PEOPLE: ["COMPANY_OVERVIEW", "LEADERSHIP", "CAREERS"],
  LEADERSHIP: ["COMPANY_OVERVIEW", "CULTURE_AND_PEOPLE"],
  CAREERS: ["CULTURE_AND_PEOPLE", "COMPANY_OVERVIEW"],
  GLOBAL_CAPABILITIES: ["COMPANY_OVERVIEW"],
  AWARDS_AND_RECOGNITION: [],
  PARTNERS_AND_ALLIANCES: [],
  OTHER: [],
};

const PERSON_NAVIGATION_GROUPS = new Set<PageSemanticGroup>([
  "LEADERSHIP", "CULTURE_AND_PEOPLE", "COMPANY_OVERVIEW",
]);

function pageSemanticGroup(document: SuccessiveSearchDocument): PageSemanticGroup {
  const identity = normalizeSearchText(`${document.title} ${document.slug.replace(/-/g, " ")} ${document.role}`);
  const section = normalizeSearchText(document.sectionKey ?? "");
  if (document.role === "awards" || document.type === "award" ||
      /\b(?:awards?|recognitions?|accreditations?)\b/.test(`${identity} ${section}`))
    return "AWARDS_AND_RECOGNITION";
  if (document.role === "partners" || document.role === "partner" ||
      /\b(?:partners?|partnerships?|alliances?)\b/.test(`${identity} ${section}`))
    return "PARTNERS_AND_ALLIANCES";
  if (document.role === "global_capabilities" || /\bglobal capabilities\b/.test(identity) ||
      section === "global capabilities")
    return "GLOBAL_CAPABILITIES";
  if (document.role === "culture" || /\b(?:culture|core values?|workplace)\b/.test(identity))
    return "CULTURE_AND_PEOPLE";
  if (document.role === "leadership" ||
      /\b(?:leadership|executive|management team|board of directors)\b/.test(identity))
    return "LEADERSHIP";
  if (document.role === "careers" || document.role === "career" || document.role === "job_listing" ||
      /\b(?:careers?|job listings?|open roles?)\b/.test(identity))
    return "CAREERS";
  if (document.role === "company" || document.role === "contact" || document.role === "location" ||
      /\b(?:about(?: us)?|company overview)\b/.test(identity))
    return "COMPANY_OVERVIEW";
  return "OTHER";
}

function isPersonPrimarySubject(userSubject: string | undefined, source: SuccessiveSearchDocument): boolean {
  const subject = normalizeSearchText(userSubject ?? "");
  if (!subject || subject === source.normalizedTitle || subject === normalizeSearchText(source.slug.replace(/-/g, " ")))
    return false;
  const tokens = subject.split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) return false;
  return !/\b(?:about|culture|career|partner|alliance|capabilities?|awards?|service|contact|company|successive|overview)\b/.test(subject);
}

function candidateMentionsSubject(candidate: SuccessiveSearchDocument, userSubject: string): boolean {
  const tokens = normalizeSearchText(userSubject).split(" ").filter((token) => token.length > 1);
  if (tokens.length < 2) return false;
  const haystack = normalizeSearchText(`${candidate.title} ${candidate.headings.slice(0, 4).join(" ")} ${candidate.descriptions.slice(0, 3).join(" ")} ${candidate.structuredFields.slice(0, 12).map(({ label, value }) => `${label} ${value}`).join(" ")}`);
  return tokens.every((token) => haystack.includes(token));
}

function structuralRelation(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument):
  "PARENT" | "CHILD" | "SIBLING" | "SAME_SECTION" | "SAME_PAGE_GROUP" | "DIRECTLY_CONNECTED" | undefined {
  if (source.parentId === candidate.id) return "PARENT";
  if (candidate.parentId === source.id) return "CHILD";
  if (source.parentId && source.parentId === candidate.parentId) return "SIBLING";
  if (source.sectionKey && source.sectionKey === candidate.sectionKey && source.type === candidate.type)
    return "SAME_SECTION";
  const sharedTaxonomy = source.taxonomyTerms.some((term) => candidate.taxonomyTerms.includes(term));
  if (sharedTaxonomy) return source.role === candidate.role ? "SAME_PAGE_GROUP" : "SAME_SECTION";
  const directlyLinked = source.internalLinks.some((url) => normalizeUrl(url) === normalizeUrl(candidate.url)) ||
    candidate.internalLinks.some((url) => normalizeUrl(url) === normalizeUrl(source.url));
  if (directlyLinked) return "DIRECTLY_CONNECTED";
  const relationship = source.relatedCapabilities.find((item) => item.documentId === candidate.id) ??
    candidate.relatedCapabilities.find((item) => item.documentId === source.id);
  if (relationship?.evidence.some((value) => ["explicit-reference", "internal-link", "taxonomy"].includes(value)))
    return source.role === candidate.role ? "SAME_PAGE_GROUP" : "SAME_SECTION";
  return undefined;
}

function navigationRelation(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument):
  "PARENT" | "CHILD" | "SIBLING" | "SAME_SECTION" | "SAME_PAGE_GROUP" | "DIRECTLY_CONNECTED" | undefined {
  const relation = structuralRelation(source, candidate);
  if (relation) return relation;
  if (COMPANY_NAVIGATION_ROLES.has(source.role) && COMPANY_NAVIGATION_ROLES.has(candidate.role) &&
      candidate.type === "page") return "SAME_SECTION";
  return undefined;
}

function individualPageRelation(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument):
  "PARENT" | "CHILD" | "SIBLING" | "SAME_SECTION" | "SAME_PAGE_GROUP" | "DIRECTLY_CONNECTED" | undefined {
  const structural = structuralRelation(source, candidate);
  if (structural === "PARENT" || structural === "CHILD" || structural === "SIBLING" ||
      structural === "DIRECTLY_CONNECTED") return structural;
  if (structural === "SAME_SECTION" && source.sectionKey && source.sectionKey === candidate.sectionKey)
    return "SAME_SECTION";
  if (structural && source.role === candidate.role) return structural;
  const sourceGroup = pageSemanticGroup(source);
  const candidateGroup = pageSemanticGroup(candidate);
  if (sourceGroup !== "OTHER" && sourceGroup === candidateGroup) return "SAME_PAGE_GROUP";
  if (COMPLEMENTARY_GROUPS[sourceGroup].includes(candidateGroup)) return "SAME_SECTION";
  return undefined;
}

const INDIVIDUAL_RELATION_PRIORITY: Record<NonNullable<SuggestionAction["relationType"]>, number> = {
  PARENT: 8, CHILD: 7, SIBLING: 6, DIRECTLY_CONNECTED: 5, SAME_SECTION: 4, SAME_PAGE_GROUP: 3,
};

export interface LeadershipSuggestionContext {
  relation: "leadership" | "executives" | "board";
  requestedRole?: PersonRoleConcept;
  resolvedPerson?: string;
  publishedRole?: string;
  teamRelation?: string;
}

const GENERIC_PERSON_ROLE_TERMS = new Set([
  "senior", "junior", "manager", "management", "head", "lead", "leader", "leadership",
  "chief", "officer", "executive", "director", "president", "vice", "associate", "principal",
  "global", "group", "business", "unit", "team", "department", "division", "and", "the", "of",
]);

function publishedRoleDomainTerms(role: string): string[] {
  return [...new Set(normalizeSearchText(role).split(" ").filter((term) =>
    term.length >= 3 && !GENERIC_PERSON_ROLE_TERMS.has(term)))];
}

function locallySupportsLeadershipContext(
  candidate: SuccessiveSearchDocument,
  context: LeadershipSuggestionContext,
): boolean {
  if (isBroadNavigationPage(candidate, context.resolvedPerson ?? context.requestedRole ?? context.relation)) return false;
  const localEvidence = normalizeSearchText([
    candidate.title,
    ...candidate.headings.slice(0, 4),
    ...candidate.descriptions.slice(0, 3),
    ...candidate.structuredFields.slice(0, 12).map(({ label, value }) => `${label} ${value}`),
  ].join(" "));
  const person = normalizeSearchText(context.resolvedPerson ?? "");
  if (person && localEvidence.includes(person)) return true;
  if (context.requestedRole && designationHasRole(localEvidence, context.requestedRole)) return true;
  const normalizedRole = normalizeSearchText(context.publishedRole ?? "");
  if (normalizedRole && localEvidence.includes(normalizedRole)) return true;
  const domainTerms = publishedRoleDomainTerms(context.publishedRole ?? "");
  if (domainTerms.length && domainTerms.every((term) => containsTerm(localEvidence, term))) return true;
  const teamRelation = normalizeSearchText(context.teamRelation ?? "");
  if (teamRelation && localEvidence.includes(teamRelation)) return true;
  if (context.relation === "board") return /\b(?:board of directors|board member|board appointment|appointed to (?:the )?board)\b/.test(localEvidence);
  if (context.relation === "executives") return /\b(?:executive management|management team|executive team)\b/.test(localEvidence);
  return /\b(?:leadership|leadership team|executive management)\b/.test(localEvidence);
}

function individualRelationStrength(
  source: SuccessiveSearchDocument,
  target: SuccessiveSearchDocument,
  relationType: NonNullable<SuggestionAction["relationType"]>,
  userSubject?: string,
): number {
  const sourceGroup = pageSemanticGroup(source);
  const targetGroup = pageSemanticGroup(target);
  let score = ({ PARENT: 100, CHILD: 90, SIBLING: 80, DIRECTLY_CONNECTED: 85,
    SAME_SECTION: source.sectionKey && source.sectionKey === target.sectionKey ? 75
      : COMPLEMENTARY_GROUPS[sourceGroup].includes(targetGroup) ? 55 : 20,
    SAME_PAGE_GROUP: sourceGroup !== "OTHER" && sourceGroup === targetGroup ? 60 : 35,
  }[relationType] ?? 0);
  if (userSubject && candidateMentionsSubject(target, userSubject)) score += 25;
  return score;
}

/** Structural navigation for a resolved individual page; semantic similarity
 * alone is deliberately insufficient and cross-category topic feeds are excluded.
 * Broad COMPANY_INFORMATION membership is not enough to render a suggestion. */
export function buildIndividualPageNavigationActions({ source, corpus, userSubject, leadershipContext, excludedResultKeys = [], limit = 3 }: {
  source: SuccessiveSearchDocument;
  corpus: SuccessiveSearchDocument[];
  userSubject?: string;
  leadershipContext?: LeadershipSuggestionContext;
  excludedResultKeys?: string[];
  limit?: number;
}): SuggestionAction[] {
  const excluded = new Set([documentActionKey(source), ...excludedResultKeys]);
  const personSubject = !leadershipContext && isPersonPrimarySubject(userSubject, source);
  const MIN_RELATION_SCORE = 50;
  return corpus.flatMap((target): Array<{ target: SuccessiveSearchDocument; relationType: NonNullable<SuggestionAction["relationType"]>; score: number }> => {
    if (excluded.has(documentActionKey(target))) return [];
    if (leadershipContext && !locallySupportsLeadershipContext(target, leadershipContext)) return [];
    const mentionsSubject = Boolean(userSubject && candidateMentionsSubject(target, userSubject));
    const relationType = individualPageRelation(source, target) ??
      (personSubject && mentionsSubject ? "DIRECTLY_CONNECTED" : undefined);
    if (!relationType) return [];
    if (!leadershipContext && !personSubject && TOPICAL_DISCOVERY_ROLES.has(source.role) &&
        !relatedActionEvidence(source, target, userSubject ?? source.title)) return [];
    const targetGroup = pageSemanticGroup(target);
    if (personSubject && !mentionsSubject && (!PERSON_NAVIGATION_GROUPS.has(targetGroup) ||
        target.role === "contact" || target.role === "location")) return [];
    if (targetGroup === "AWARDS_AND_RECOGNITION" && pageSemanticGroup(source) !== "AWARDS_AND_RECOGNITION" &&
        !mentionsSubject) return [];
    const score = individualRelationStrength(source, target, relationType, userSubject);
    return score >= MIN_RELATION_SCORE ? [{ target, relationType, score }] : [];
  }).sort((left, right) => {
    const pagePriority = (value: typeof left) => value.target.type === "page" ? 1 : 0;
    return right.score - left.score ||
      INDIVIDUAL_RELATION_PRIORITY[right.relationType] - INDIVIDUAL_RELATION_PRIORITY[left.relationType] ||
      pagePriority(right) - pagePriority(left) ||
      right.target.contentQuality - left.target.contentQuality;
  }).flatMap(({ target, relationType }): SuggestionAction[] => {
    const resultKey = documentActionKey(target);
    const action: SuggestionAction = {
      id: `navigate-${normalizeSearchText(`${documentActionKey(source)}-${resultKey}`).replace(/\s+/g, "-")}`.slice(0, 80),
      label: `Explore ${target.title}`.replace(/\bexplore\s+explore\b/i, "Explore").slice(0, 160),
      intent: "CONTENT_DISCOVERY", subject: userSubject?.trim().slice(0, 200) || source.title,
      topic: userSubject?.trim().slice(0, 200) || source.title, entity: userSubject?.trim().slice(0, 200) || source.title,
      contextType: "INDIVIDUAL_PAGE_CONTEXT", sourceContext: documentActionKey(source),
      sourcePageRole: source.role, sourceResource: source.url, targetResourceId: resultKey,
      targetUrl: target.url, targetContentType: target.role, relation: "RELATED_TO_SOURCE",
      relationType, resultKeys: [resultKey],
    };
    return resolveEligibleActionDocuments(action, corpus).length ? [action] : [];
  }).slice(0, limit);
}

/** Exact-target navigation for a resolved collection/listing page. */
export function buildCategoryNavigationActions({ source, corpus, excludedResultKeys = [], limit = 3 }: {
  source: SuccessiveSearchDocument;
  corpus: SuccessiveSearchDocument[];
  excludedResultKeys?: string[];
  limit?: number;
}): SuggestionAction[] {
  const excluded = new Set([documentActionKey(source), ...excludedResultKeys]);
  const candidates = corpus.flatMap((target): Array<{ target: SuccessiveSearchDocument; relationType: NonNullable<SuggestionAction["relationType"]> }> => {
    if (excluded.has(documentActionKey(target))) return [];
    const relationType = navigationRelation(source, target);
    const collectionMember = target.parentId === source.id ||
      (source.sectionKey && target.sectionKey === source.sectionKey) ||
      (source.role === "global_capabilities" && ["service", "technology", "page"].includes(target.role));
    if (!relationType && !collectionMember) return [];
    return [{ target, relationType: relationType ?? "SAME_PAGE_GROUP" }];
  });
  const seen = new Set<string>();
  return candidates.sort((a, b) => b.target.contentQuality - a.target.contentQuality)
    .flatMap(({ target, relationType }): SuggestionAction[] => {
      const resultKey = documentActionKey(target);
      const urlKey = normalizeUrl(target.url);
      if (seen.has(resultKey) || seen.has(urlKey)) return [];
      seen.add(resultKey); seen.add(urlKey);
      const action: SuggestionAction = {
        id: `collection-${normalizeSearchText(`${documentActionKey(source)}-${resultKey}`).replace(/\s+/g, "-")}`.slice(0, 80),
        label: `Explore ${target.title}`.replace(/\bexplore\s+explore\b/i, "Explore").slice(0, 160),
        intent: "CONTENT_DISCOVERY", subject: source.title, topic: source.title, entity: target.title,
        contextType: "CATEGORY_LISTING_CONTEXT", sourceContext: documentActionKey(source), sourcePageRole: source.role,
        sourceResource: source.url, targetResourceId: resultKey, targetUrl: target.url,
        targetContentType: target.role, relation: "COLLECTION_MEMBER", relationType, resultKeys: [resultKey],
      };
      return resolveEligibleActionDocuments(action, corpus).length ? [action] : [];
    }).slice(0, limit);
}

function exactDocumentAction(document: SuccessiveSearchDocument, source: SuccessiveSearchDocument, relation: "ANSWER_EVIDENCE" | "RELATED_TO_SOURCE" | "COLLECTION_MEMBER"): SuggestionAction {
  const resultKey = documentActionKey(document);
  return { id: `content-${normalizeSearchText(resultKey).replace(/\s+/g, "-")}`.slice(0, 80),
    label: dynamicActionLabel(document), intent: "CONTENT_DISCOVERY", topic: document.title, entity: document.title,
    relation, resultKeys: [resultKey], sourceContext: documentActionKey(source).slice(0, 80), sourceResource: source.url };
}

export function buildAnswerEvidenceActions(documents: SuccessiveSearchDocument[], limit = 2): SuggestionAction[] {
  const source = documents[0];
  if (!source) return [];
  const seen = new Set<string>();
  return documents.flatMap((document): SuggestionAction[] => {
    const action = exactDocumentAction(document, source, "ANSWER_EVIDENCE");
    const identity = resolveEligibleActionDocuments(action, documents).map(documentActionKey).sort().join("|");
    if (!identity || seen.has(identity)) return [];
    seen.add(identity); return [action];
  }).slice(0, limit);
}

export function buildCollectionMemberActions(source: SuccessiveSearchDocument, members: SuccessiveSearchDocument[], limit = 2): SuggestionAction[] {
  const seen = new Set<string>();
  return members.filter((document) => documentActionKey(document) !== documentActionKey(source)).flatMap((document): SuggestionAction[] => {
    const action = exactDocumentAction(document, source, "COLLECTION_MEMBER");
    const eligible = resolveEligibleActionDocuments(action, members);
    const identity = eligible.map(documentActionKey).sort().join("|");
    if (!identity || seen.has(identity)) return [];
    seen.add(identity); return [action];
  }).slice(0, limit);
}

export function buildEvidenceBackedSuggestionActions({ source, acceptedRelated, recentActionIds = [], limit = 2 }: {
  source: SuccessiveSearchDocument;
  acceptedRelated: SuccessiveSearchDocument[];
  recentActionIds?: string[];
  limit?: number;
}): SuggestionAction[] {
  const recent = new Set(recentActionIds);
  const actions = acceptedRelated.filter((document) => relationIsStrong(source, document)).flatMap((document): SuggestionAction[] => {
    const resultKey = documentActionKey(document);
    const id = `content-${normalizeSearchText(resultKey).replace(/\s+/g, "-")}`.slice(0, 80);
    if (recent.has(id)) return [];
    const action: SuggestionAction = exactDocumentAction(document, source, "RELATED_TO_SOURCE");
    return resolveEligibleActionDocuments(action, [source, ...acceptedRelated]).length ? [action] : [];
  });
  const seen = new Set<string>();
  return actions.filter((action) => { const identity = [...(action.resultKeys ?? [])].sort().join("|");
    if (!identity || seen.has(identity)) return false; seen.add(identity); return true; }).slice(0, limit);
}

/**
 * Resolves a validated structured action to its canonical retrieval query.
 * Display labels are deliberately excluded from execution semantics.
 */
export function resolveSuggestionAction(action: ExecutableSuggestionAction | undefined): string | undefined {
  if (!action) return undefined;
  return actionRegistry[action.intent](action);
}

export function hasSuggestionActionExecutor(intent: SuggestionAction["intent"]): boolean {
  return typeof actionRegistry[intent] === "function";
}
