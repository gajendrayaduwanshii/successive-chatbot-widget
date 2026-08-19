import { z } from "zod";
import { normalizeSearchText } from "./search-index";

export const queryUnderstandingSchema = z.object({
  normalizedQuery: z.string().trim().min(1).max(1000),
  intent: z.enum([
    "explore",
    "informational",
    "discovery",
    "solve_problem",
    "recommendation",
    "evidence",
    "navigation",
    "contact",
    "resource",
    "follow_up",
    "off_topic",
  ]),
  topics: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  businessProblem: z.string().trim().max(500).nullable().default(null),
  desiredOutcomes: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  domains: z.array(z.string().trim().min(1).max(100)).max(8).default([]),
  technicalSignals: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  industry: z.string().trim().max(100).nullable().default(null),
  existingPlatform: z.string().trim().max(100).nullable().default(null),
  requestedContentType: z
    .enum([
      "service", "case-study", "blog", "event", "whitepaper", "page",
      "thought-leadership", "partner", "industry", "career",
    ])
    .nullable()
    .default(null),
  requestedAction: z.string().trim().max(160).nullable().default(null),
  answerMode: z.enum(["explain", "define", "list", "summarize", "recommend", "details"]).default("explain"),
  targetScope: z.enum(["company", "portfolio", "entity", "topic"]).default("topic"),
  temporalIntent: z.enum(["current", "latest"]).nullable().default(null),
  containsPremise: z.boolean().default(false),
  entities: z.array(z.string().trim().min(1).max(100)).max(8).default([]),
  constraints: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
  retrievalConcepts: z
    .array(z.string().trim().min(1).max(100))
    .max(12)
    .default([]),
  isBroadQuery: z.boolean(),
  isFollowUp: z.boolean(),
  isOffTopic: z.boolean().default(false),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().trim().max(300).nullable().default(null),
  confidence: z.number().min(0).max(1),
});

export type QueryUnderstanding = z.infer<typeof queryUnderstandingSchema>;

/**
 * Keep the extra semantic network call for requests where it materially helps.
 * Ordinary topic and content lookups already have deterministic understanding.
 */
export function shouldUseSemanticUnderstanding(
  understanding: QueryUnderstanding,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): boolean {
  if (["recommendation", "solve_problem"].includes(understanding.intent))
    return true;
  if (understanding.containsPremise || understanding.temporalIntent) return true;
  if (understanding.answerMode === "define") return true;
  if (understanding.targetScope === "company" && understanding.topics.length > 0)
    return true;
  return (
    understanding.isFollowUp &&
    history.some((item) => item.role === "user") &&
    understanding.topics.length === 0
  );
}

export function normalizeQueryUnderstanding(
  value: unknown,
  message: string,
): QueryUnderstanding {
  const fallback = buildDeterministicUnderstanding(message);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const candidate = value as Record<string, unknown>;
  const parsed = queryUnderstandingSchema.safeParse({
    ...fallback,
    ...candidate,
    normalizedQuery:
      typeof candidate.normalizedQuery === "string"
        ? candidate.normalizedQuery
        : fallback.normalizedQuery,
    topics: Array.isArray(candidate.topics) ? candidate.topics : fallback.topics,
    retrievalConcepts: Array.isArray(candidate.retrievalConcepts)
      ? candidate.retrievalConcepts
      : fallback.retrievalConcepts,
    entities: Array.isArray(candidate.entities) ? candidate.entities : [],
    constraints: Array.isArray(candidate.constraints) ? candidate.constraints : [],
  });
  return parsed.success ? parsed.data : fallback;
}

const QUESTION_WORDS = new Set([
  "what", "which", "who", "where", "when", "why", "how", "can", "could",
  "would", "should", "do", "does", "did", "have", "has", "tell", "show",
  "give", "find", "please", "about", "with", "from", "this", "that", "these",
  "those", "your", "you", "our", "we", "they", "them", "something", "anything",
  "more", "else", "need", "want", "like", "help", "successive", "digital",
  "provide", "specialize", "specialise", "business",
  "suggest", "recommend",
]);

const followUpPattern = /^(?:tell me more|what about(?: this| that)?|anything else|any examples?|how|why|how would (?:it|this|that) help(?: us|my company)?|what (?:would you suggest|do you recommend|next))[?.!\s]*$/i;

/**
 * Safe fallback for an unavailable/invalid semantic interpreter. It deliberately
 * extracts user language rather than mapping topics to Successive page names.
 */
export function buildDeterministicUnderstanding(
  message: string,
): QueryUnderstanding {
  const normalizedQuery = normalizeSearchText(message);
  const tokens = normalizedQuery
    .split(" ")
    .filter((token) => token.length > 1 && !QUESTION_WORDS.has(token));
  const isFollowUp = followUpPattern.test(message.trim());
  const asksEvidence = /\b(?:case stud(?:y|ies)|examples?|similar (?:work|project)|done (?:this|that))\b/i.test(message);
  const asksResource = /\b(?:blogs?|articles?|white ?papers?|e-?books?|resources?|something (?:to )?read|webinars?|events?|thought leadership)\b/i.test(message);
  const asksRecommendation = /\b(?:recommend|which|best|right|what service|where to start|don.t know what)\b/i.test(message);
  const describesProblem = /\b(?:we|our|teams?|platform|system|operations?)\b.*\b(?:cannot|can.t|struggl|slow|manual|fragment|too (?:much|many|slow)|difficult|lack|need better|keeps?|increas|mismatch|inconsisten|risk|complex)\b/i.test(message) ||
    /\bwhat capability could help\b/i.test(message);
  const asksContact = /\b(?:contact|talk to|speak with|book a demo|email|estimate)\b/i.test(message);
  const requestedContentType = /\bcase stud(?:y|ies)\b/i.test(message)
    ? "case-study"
    : /\b(?:white ?papers?|e-?books?)\b/i.test(message)
      ? "whitepaper"
      : /\bthought leadership\b/i.test(message)
        ? "thought-leadership"
        : /\b(?:partner|partnership|alliance)\b/i.test(message)
          ? "partner"
          : /\bindustr(?:y|ies)\b/i.test(message)
            ? "industry"
            : /\b(?:career|careers|jobs?)\b/i.test(message)
              ? "career"
      : /\b(?:blogs?|articles?)\b/i.test(message)
        ? "blog"
        : /\b(?:webinars?|events?)\b/i.test(message)
          ? "event"
          : /\b(?:services?|capabilit(?:y|ies)|offerings?)\b/i.test(message)
            ? "service"
            : null;
  const answerMode = /^(?:what|who)\s+(?:is|are)\b/i.test(message)
    ? "define" as const
    : /\b(?:summarize|summarise|summary)\b/i.test(message)
      ? "summarize" as const
      : /\b(?:recommend|best|right|where to start|which (?:service|capability))\b/i.test(message)
        ? "recommend" as const
        : /\b(?:all|list|which|what)\b.*\b(?:services?|capabilities|industries|offerings)\b/i.test(message)
          ? "list" as const
          : "explain" as const;
  const namedSuccessivePerson = normalizedQuery.match(
    /^who is ([a-z][a-z.' -]{2,80}?) (?:at|in|from|of) successive(?: digital)?[?.!]*$/,
  )?.[1]?.trim();
  const companyPossessive = /\b(?:successive(?: digital)?(?:'s|s')|your)\s+[a-z]/i.test(message);
  const companyFact = /\b(?:ceo|founders?|leadership|awards?|recognitions?|values?|culture|offices?|headquarters|employees?)\b/i.test(message);
  const portfolioRequest = requestedContentType === "service" || requestedContentType === "industry";
  const containsPremise = /^(?:since|because|given that|assuming|as)\b/i.test(message.trim());
  const temporalIntent = /\blatest\b/i.test(message)
    ? "latest" as const
    : /\bcurrent(?:ly)?\b/i.test(message)
      ? "current" as const
      : null;
  const intent = asksContact
    ? "contact"
    : isFollowUp
      ? "follow_up"
      : asksEvidence
        ? "evidence"
        : asksResource
          ? "resource"
          : asksRecommendation
            ? "recommendation"
            : describesProblem
              ? "solve_problem"
            : requestedContentType === "service"
              ? "discovery"
              : tokens.length <= 2
                ? "explore"
                : "informational";
  const contentTypeTerms = new Set([
    "case", "study", "studies", "customer", "story", "stories", "whitepaper",
    "whitepapers", "ebook", "ebooks", "blog", "blogs", "article", "articles",
    "webinar", "webinars", "event", "events", "thought", "leadership", "partner",
    "partnership", "industry", "industries", "career", "careers", "job", "jobs",
    "service", "services", "capability", "capabilities", "offerings",
    "provide", "specialize", "specialise",
  ]);
  const topics = [...new Set(tokens.filter((token) => !contentTypeTerms.has(token)))].slice(0, 6);
  const offTopic = /\b(?:weather|forecast|movie|film|poem|song|capital of|president of|sports? score|recipe|horoscope)\b/i.test(message);
  const industryMatch = normalizedQuery.match(
    /\b(?:for|in|with|about) ([a-z][a-z ]{1,50}?) (?:companies|businesses|organizations|organisations|industry|sector)\b/,
  );
  const needsClarification =
    (isFollowUp && topics.length === 0) ||
    (asksRecommendation && topics.length === 0);
  return {
    normalizedQuery,
    intent: offTopic ? "off_topic" : intent,
    topics,
    businessProblem: describesProblem ? message.trim() : null,
    desiredOutcomes: [],
    domains: topics,
    technicalSignals: topics,
    industry: industryMatch?.[1]?.trim() ?? null,
    existingPlatform: null,
    requestedContentType,
    requestedAction: null,
    answerMode,
    targetScope: namedSuccessivePerson || companyPossessive || companyFact ? "company" : portfolioRequest ? "portfolio" : "topic",
    temporalIntent,
    containsPremise,
    entities: namedSuccessivePerson ? [namedSuccessivePerson] : [],
    constraints: [],
    retrievalConcepts: topics,
    isBroadQuery: topics.length <= 2,
    isFollowUp,
    isOffTopic: offTopic,
    needsClarification,
    clarificationQuestion: needsClarification
      ? "What business outcome or technology challenge are you mainly trying to address?"
      : null,
    confidence: offTopic ? 0.95 : topics.length ? 0.58 : 0.3,
  };
}

export interface ConversationState {
  activeTopics: string[];
  activeEntity: string | null;
  activeIndustry: string | null;
  requestedContentType: QueryUnderstanding["requestedContentType"];
  businessProblem: string | null;
  lastExplicitTopicTurn: number | null;
  lastIntent: QueryUnderstanding["intent"];
}

export function resolveConversationUnderstanding(
  current: QueryUnderstanding,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): { understanding: QueryUnderstanding; state: ConversationState } {
  const priorUsers = history.filter((item) => item.role === "user");
  let prior: QueryUnderstanding | undefined;
  let lastExplicitTopicTurn: number | null = null;
  priorUsers.forEach((item, index) => {
    const candidate = buildDeterministicUnderstanding(item.content);
    if (candidate.topics.length) {
      prior = candidate;
      lastExplicitTopicTurn = index;
    }
  });
  const shouldInherit = current.isFollowUp ||
    (/\b(?:this|that|it|these|those|them)\b/i.test(current.normalizedQuery) && current.topics.length === 0);
  const topics = current.topics.length
    ? current.topics
    : shouldInherit
      ? prior?.topics ?? []
      : [];
  const entities = current.entities.length
    ? current.entities
    : shouldInherit
      ? prior?.entities ?? []
      : [];
  const understanding = {
    ...current,
    topics,
    entities,
    businessProblem: current.businessProblem ?? (shouldInherit ? prior?.businessProblem ?? null : null),
    desiredOutcomes: current.desiredOutcomes.length
      ? current.desiredOutcomes
      : shouldInherit
        ? prior?.desiredOutcomes ?? []
        : [],
    domains: current.domains.length
      ? current.domains
      : shouldInherit
        ? prior?.domains ?? topics
        : topics,
    technicalSignals: current.technicalSignals.length
      ? current.technicalSignals
      : shouldInherit
        ? prior?.technicalSignals ?? []
        : [],
    industry: current.industry ?? (shouldInherit ? prior?.industry ?? null : null),
    existingPlatform:
      current.existingPlatform ??
      (shouldInherit ? prior?.existingPlatform ?? null : null),
    requestedContentType:
      current.requestedContentType ?? (shouldInherit ? prior?.requestedContentType ?? null : null),
    retrievalConcepts: current.retrievalConcepts.length
      ? current.retrievalConcepts
      : shouldInherit
        ? prior?.retrievalConcepts ?? topics
        : topics,
  };
  return {
    understanding,
    state: {
      activeTopics: topics,
      activeEntity: entities[0] ?? null,
      activeIndustry: understanding.industry ??
        (understanding.requestedContentType === "industry" ? topics[0] ?? null : null),
      requestedContentType: understanding.requestedContentType,
      businessProblem: understanding.businessProblem,
      lastExplicitTopicTurn: current.topics.length ? priorUsers.length : lastExplicitTopicTurn,
      lastIntent: understanding.intent,
    },
  };
}

export function applyStructuralBroadQueryRules(
  understanding: QueryUnderstanding,
  message: string,
): QueryUnderstanding {
  const normalized = normalizeSearchText(message);
  if (/^(?:what services do you provide|what do you specialize in|what do you specialise in|what are your capabilities|how can successive help (?:our|my|a) business)$/.test(normalized)) {
    return {
      ...understanding,
      intent: "discovery",
      topics: [],
      entities: [],
      businessProblem: null,
      requestedContentType: "service",
      retrievalConcepts: [],
      isBroadQuery: true,
      needsClarification: false,
      clarificationQuestion: null,
      confidence: Math.max(understanding.confidence, 0.95),
    };
  }
  return understanding;
}

export function buildRetrievalQuery(understanding: QueryUnderstanding): string {
  return [...new Set([
    ...understanding.topics,
    ...understanding.retrievalConcepts,
    ...understanding.entities,
    ...understanding.desiredOutcomes,
    ...understanding.domains,
    ...understanding.technicalSignals,
    ...(understanding.industry ? [understanding.industry] : []),
    ...(understanding.existingPlatform ? [understanding.existingPlatform] : []),
    ...(understanding.businessProblem ? [understanding.businessProblem] : []),
  ])]
    .join(" ")
    .trim();
}

export function isDeterministicallyOffTopic(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return (/(?:\b(?:weather|forecast|movie|film|poem|song|capital of|president of|sports? score|recipe|horoscope)\b|\b(?:who won|score|result)\b.*\b(?:match|game|football|cricket|basketball|tennis|hockey)\b)/.test(normalized)) &&
    !/\b(?:software|platform|application|app|technology|digital|data|ai|cloud|enterprise|business|operations)\b/.test(normalized);
}
