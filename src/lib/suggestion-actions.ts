import type { SuggestionAction } from "./llm/schemas";
import { normalizeSearchText, type SuccessiveSearchDocument } from "./search-index";

export type ExecutableSuggestionAction = Omit<SuggestionAction, "label"> & Partial<Pick<SuggestionAction, "label">>;
type ActionExecutor = (action: ExecutableSuggestionAction) => string;

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
  return true;
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
  try { const url = new URL(value); return `${url.origin}${url.pathname.replace(/\/$/, "")}`; }
  catch { return value.replace(/\/$/, ""); }
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
