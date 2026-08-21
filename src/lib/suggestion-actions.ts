import type { SuggestionAction } from "./llm/schemas";
import { normalizeSearchText, type SuccessiveSearchDocument } from "./search-index";

export type ExecutableSuggestionAction = Omit<SuggestionAction, "label"> & Partial<Pick<SuggestionAction, "label">>;
type ActionExecutor = (action: ExecutableSuggestionAction) => string;
export type SuggestionContextType = "TOPIC_CONTEXT" | "INDIVIDUAL_PAGE_CONTEXT" | "CATEGORY_LISTING_CONTEXT" | "OTHER_CONTEXT";

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
  return documents.filter((document) => requested.has(documentActionKey(document)) && promisedRole(action, document));
}

function normalizeUrl(value: string): string {
  try { return new URL(value, "https://local.invalid").pathname.replace(/\/$/, "") || "/"; }
  catch { return value.replace(/[?#].*$/, "").replace(/\/$/, ""); }
}

function relationIsStrong(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument): boolean {
  if (source.id === candidate.id && source.type === candidate.type) return false;
  if (source.internalLinks.some((url) => normalizeUrl(url) === normalizeUrl(candidate.url)) ||
      candidate.internalLinks.some((url) => normalizeUrl(url) === normalizeUrl(source.url))) return true;
  const relationship = source.relatedCapabilities.find((item) => item.documentId === candidate.id) ??
    candidate.relatedCapabilities.find((item) => item.documentId === source.id);
  if (relationship && relationship.score >= 35 && relationship.evidence.some((value) =>
    ["explicit-reference", "internal-link", "phrase", "taxonomy", "distinctive-concepts"].includes(value))) return true;
  const sourceTerms = new Set(source.topicProfile.primaryTopics.filter((term) => term.length > 3));
  return candidate.topicProfile.primaryTopics.filter((term) => sourceTerms.has(term)).length >= 2;
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

function relationStrength(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument): number {
  if (!relationIsStrong(source, candidate)) return 0;
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
    const score = relationStrength(source, document);
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

function navigationRelation(source: SuccessiveSearchDocument, candidate: SuccessiveSearchDocument):
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
  if (COMPANY_NAVIGATION_ROLES.has(source.role) && COMPANY_NAVIGATION_ROLES.has(candidate.role) &&
      candidate.type === "page") return "SAME_SECTION";
  return undefined;
}

/** Structural navigation for a resolved individual page; semantic similarity
 * alone is deliberately insufficient and cross-category topic feeds are excluded. */
export function buildIndividualPageNavigationActions({ source, corpus, userSubject, excludedResultKeys = [], limit = 3 }: {
  source: SuccessiveSearchDocument;
  corpus: SuccessiveSearchDocument[];
  userSubject?: string;
  excludedResultKeys?: string[];
  limit?: number;
}): SuggestionAction[] {
  const excluded = new Set([documentActionKey(source), ...excludedResultKeys]);
  return corpus.flatMap((target): Array<{ target: SuccessiveSearchDocument; relationType: NonNullable<SuggestionAction["relationType"]> }> => {
    if (excluded.has(documentActionKey(target))) return [];
    const relationType = navigationRelation(source, target);
    return relationType ? [{ target, relationType }] : [];
  }).sort((left, right) => {
    const priority = (value: typeof left) => ({ PARENT: 8, CHILD: 7, SIBLING: 6, SAME_SECTION: 5,
      SAME_PAGE_GROUP: 4, DIRECTLY_CONNECTED: 3 }[value.relationType] ?? 0);
    const pagePriority = (value: typeof left) => value.target.type === "page" ? 1 : 0;
    return priority(right) - priority(left) || pagePriority(right) - pagePriority(left) ||
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
    return resolveEligibleActionDocuments(action, acceptedRelated).length ? [action] : [];
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
