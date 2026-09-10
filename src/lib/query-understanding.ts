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
      "service", "sub-service", "expertise", "solution", "product", "kagen-product",
      "case-study", "blog", "whitepaper", "ebook", "webinar", "event",
      "press-release", "media-coverage", "news", "resource", "partner", "accelerator",
      "industry", "career", "company", "culture", "leadership", "certification",
      "award", "technology", "page", "thought-leadership",
    ])
    .nullable()
    .default(null),
  requestedAction: z.string().trim().max(160).nullable().default(null),
  answerMode: z.enum(["explain", "define", "list", "summarize", "recommend", "details"]).default("explain"),
  targetScope: z.enum(["company", "portfolio", "entity", "topic"]).default("topic"),
  temporalIntent: z.enum(["current", "latest", "upcoming"]).nullable().default(null),
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
  "what", "which", "who", "where", "when", "why", "how", "is", "are", "a", "an", "the", "can", "could", "as",
  "would", "should", "do", "does", "did", "have", "has", "tell", "show",
  "give", "find", "please", "me", "about", "with", "from", "this", "that", "these",
  "those", "your", "you", "our", "we", "us", "my", "its", "it", "they", "them", "he", "him", "his", "she", "her", "their", "same", "something", "anything", "any",
  "more", "else", "need", "want", "like", "help", "mean", "meant", "too", "actually", "include", "includes", "included", "so", "handles", "successive", "digital",
  "provide", "specialize", "specialise", "build", "develop", "create", "implement", "business", "company",
  "suggest", "recommend", "summarize", "summarise", "summary", "called", "named", "titled", "latest", "newest", "recent", "current", "currently", "well", "work", "compare", "vs", "and",
  "no", "not", "only", "cannot", "right", "correct", "unrelated", "in", "on", "at", "for", "to",
]);

const followUpPattern = /^(?:tell me more(?: about (?:it|this|that|him|her))?|what about(?: this| that| it| him| her)?|anything else|any examples?|how|why|how (?:does|would) (?:it|this|that) (?:work|help)(?: us|my company)?|what (?:can it do|is (?:his|her|its) experience|is (?:his|her|its) role|would you suggest|do you recommend|next))[?.!\s]*$/i;

/** Facet labels are not subjects when the visitor names no entity. */
export function isFacetOnlyFollowUp(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return /^(?:what (?:are (?:the )?)?(?:benefits|capabilities|features|services)(?: are included)?|what (?:is|are) (?:the )?(?:approach|process|roadmap|value|use cases?)|what (?:approach|process)(?: should we use)?|how does (?:it|this|that) work|(?:is there|where can i find|where can i learn more about) (?:an? )?(?:ebook|e book|resource|guide)|tell me more|explain more|give me more details)(?:\?|\s)*$/.test(normalized);
}

/** Grammar that requires an earlier subject/result; it never owns a subject. */
export function isDependentFollowUp(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return isFacetOnlyFollowUp(normalized) ||
    /\b(?:this|that|it|its|these|those|they|them|their|same)\b/.test(normalized) ||
    /\b(?:other|another)\b.*\b(?:product|service|case study|article|resource|partner|job|opening|result|one)\b/.test(normalized) ||
    /^(?:what about|how about|tell me more|more about|any|another|other|next|first|second|third|last)\b/.test(normalized) ||
    /^(?:what does it|what do they|who is it for|where is it|which industries .*\bthis\b|does it|what does .* cover)\b/.test(normalized);
}

/** Conservatively repairs only a one-letter-deleted leading interrogative. */
export function normalizeMalformedInterrogative(message: string): string {
  return message.replace(/^\s*(?:hat|wat|wht|wha)\s+is\b/i, (prefix) =>
    prefix.replace(/(?:hat|wat|wht|wha)/i, "What"));
}

/** A company catalog request is an independent turn even when it names no offering. */
export function isExplicitStandaloneCatalogQuery(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return /^(?:what|which|show|list|tell me about)\b/.test(normalized) &&
    /\b(?:successive(?: digital)?|your)\b/.test(normalized) &&
    /\b(?:services?|capabilities|offerings?)\b/.test(normalized);
}

const explicitTypeRequest = (message: string, type: RegExp): boolean => {
  const normalized = normalizeSearchText(message);
  return type.test(normalized) && (
    /\b(?:show|find|list|give|summarize|summarise|read|download|explore|any|another|latest|newest|recent|recently|current|upcoming|published|offer|offers|offered|provide|provides|provided|have|has|available|related)\b/.test(normalized) ||
    /^(?:[a-z0-9.+# -]+\s+)?(?:services?|capabilit(?:y|ies)|approach|case stud(?:y|ies)|blogs?|articles?|white ?papers?|e-?books?|webinars?|events?|news|press releases?|products?|partners?|industries)\??$/.test(normalized) ||
    /\b(?:do you have|have you (?:done|published)|what (?:services?|products?|industries)|which (?:services?|products?|industries))\b/.test(normalized)
  );
};

function inferredBusinessSignals(message: string) {
  const q = normalizeSearchText(message);
  const concepts: string[] = [];
  const domains: string[] = [];
  const outcomes: string[] = [];
  const add = (condition: boolean, domain: string, ...terms: string[]) => {
    if (!condition) return;
    domains.push(domain);
    concepts.push(...terms);
  };
  add(/\b(?:monolith|legacy (?:application|app|system)|difficult|expensive)\b.*\b(?:change|maintain|moderniz|upgrade)|\btechnical debt\b/.test(q), "application modernization", "legacy modernization", "cloud native modernization");
  add(/\b(?:relocate|move|migrate|migration)\b.*\b(?:workloads?|applications?|systems?|cloud)|\bminimal (?:downtime|disruption)\b/.test(q), "cloud migration", "workload migration", "migration modernization");
  add(/\b(?:chatbots?|conversational|virtual assistant|ai assistant|support channel|support automation|voice agents?)\b/.test(q), "conversational ai", "chatbot", "virtual assistant", "ai agents");
  add(/\b(?:secure sdlc|devsecops|shift left|ci cd security|application security|software security|vulnerabilit|security automation|iac security|secure delivery)\b/.test(q) ||
    (/\bsecurity\b/.test(q) && /\bci cd\b/.test(q)), "security", "devsecops", "secure sdlc", "application security", "cloud security");
  add(/\b(?:cloud (?:bill|spend|spending|cost|economics)|finops|cost visibility|spend governance|cost owner|cost control)\b/.test(q), "cloud", "finops", "cloud cost optimization", "cost governance");
  add(/\b(?:editors?|publishing|content)\b.*\b(?:developers?|channels?|duplicat|difficult|wait)|\b(?:headless cms|content management|content platform|content operations)\b/.test(q), "content management", "headless cms", "content platform", "digital experience");
  add(/\b(?:reports?|data)\b.*\b(?:disagree|fragment|disconnect|inconsisten|govern|trust)|\b(?:data governance|master data)\b/.test(q), "data", "data governance", "data platform", "analytics");
  add(/\bapis?\b.*\b(?:reuse|govern|integrat|hard|difficult)|\bapi (?:engineering|architecture|management)\b/.test(q), "api engineering", "api management", "integration architecture");
  add(/\b(?:manual|repeat|handoffs?|workflow)\b/.test(q), "automation", "workflow automation", "intelligent automation");
  add(/\b(?:online store|ecommerce|commerce|marketplace)\b.*\b(?:scale|traffic|slow|crash|performance)|\bseasonal traffic\b/.test(q), "commerce", "scalable commerce", "performance engineering", "cloud scalability");
  const outcomePatterns: Array<[RegExp, string]> = [
    [/\b(?:reduce|lower|control|optimi[sz]e) (?:cost|spend|bill)/, "reduce cost"],
    [/\b(?:scale|scalability|seasonal traffic)/, "improve scalability"],
    [/\b(?:faster|speed|slow|latency)/, "increase speed"],
    [/\b(?:secure|security|compliance|vulnerab)/, "improve security"],
    [/\b(?:manual|automate|automation|handoff)/, "reduce manual work"],
    [/\b(?:governance|govern|consistent|trustworthy)/, "improve governance"],
    [/\b(?:customer experience|personaliz|support)/, "improve customer experience"],
    [/\b(?:moderniz|legacy|monolith)/, "modernize"],
    [/\b(?:migrate|migration|relocate workloads)/, "migrate"],
    [/\b(?:reliable|reliability|downtime|resilien)/, "improve reliability"],
  ];
  outcomePatterns.forEach(([pattern, outcome]) => { if (pattern.test(q)) outcomes.push(outcome); });
  return { concepts: [...new Set(concepts)], domains: [...new Set(domains)], outcomes: [...new Set(outcomes)] };
}

/**
 * Safe fallback for an unavailable/invalid semantic interpreter. It deliberately
 * extracts user language rather than mapping topics to Successive page names.
 */
export function buildDeterministicUnderstanding(
  message: string,
): QueryUnderstanding {
  const normalizedQuery = normalizeSearchText(message);
  const capabilitySubjectCandidate = normalizedQuery.match(
    /^(?:do (?:you|successive) (?:support|offer|provide|work with)|can (?:you|successive) (?:help with|support|provide|offer))\s+(.+?)(?:\s+as well)?$/,
  )?.[1]?.trim();
  const capabilitySubject = capabilitySubjectCandidate && !/^(?:it|this|that|these|those|him|her)$/.test(capabilitySubjectCandidate)
    ? capabilitySubjectCandidate : undefined;
  const tokens = normalizedQuery
    .split(" ")
    .filter((token) => token.length > 1 && !QUESTION_WORDS.has(token));
  const isFollowUp = followUpPattern.test(message.trim());
  const asksEvidence = /\b(?:case stud(?:y|ies)|customer (?:example|story|work)|success stor(?:y|ies)|client example|project example|similar (?:work|project)|done (?:this|that|anything)|have you done|implemented (?:this|that|it)|(?:use|used) (?:this|that|it))\b/i.test(message);
  const asksResource = /\b(?:blogs?|articles?|white ?papers?|e-?books?|resources?|something (?:to )?read|webinars?|events?|thought leadership)\b/i.test(message);
  const asksRecommendation = /\b(?:recommend|which|best|right|what service|where to start|don.t know what)\b/i.test(message);
  const inferred = inferredBusinessSignals(message);
  const describesProblem = /\b(?:we|our|teams?|platform|system|operations?|customers?|agents?|editors?|reports?|workloads?|application|monolith|cloud|apis?)\b.*\b(?:cannot|can.t|struggl|slow|manual|fragment|too (?:much|many|slow)|difficult|expensive|lack|need|want|keeps?|increas|mismatch|inconsisten|risk|complex|wait|repeat|crash|disagree|relocate|reuse)\b/i.test(message) ||
    inferred.concepts.length > 0 || /\bwhat capability could help\b/i.test(message);
  const asksContact = /\b(?:contact|talk to|speak with|book a demo|email|estimate)\b/i.test(message);
  const requestedContentType = explicitTypeRequest(message, /\bcase stud(?:y|ies)|customer stor(?:y|ies)|success stor(?:y|ies)|customer work|(?:customers?|clients?) (?:for|using|involving) (?:it|this|that|[a-z0-9+.# -]+)\b/)
    ? "case-study"
    : explicitTypeRequest(message, /\b(?:blogs?|articles?)\b/)
      ? "blog"
    : explicitTypeRequest(message, /\bresources?|guides?\b/)
      ? "resource"
    : /\bwhite ?papers?\b/i.test(message)
      ? "whitepaper"
      : /\be-?books?\b/i.test(message)
        ? "ebook"
        : /\bwebinars?\b/i.test(message)
          ? "webinar"
          : /\bevents?\b/i.test(message)
            ? "event"
            : /\b(?:press releases?|press announcements?)\b/i.test(message)
              ? "press-release"
              : /\bmedia coverage\b/i.test(message)
                ? "media-coverage"
                : /\b(?:news|announcements?)\b/i.test(message)
                  ? "news"
                : /\baccelerators?\b/i.test(message)
                  ? "accelerator"
                  : /\bawards?|recognitions?\b/i.test(message)
                    ? "award"
                    : (/\bkagen\b/i.test(message) || explicitTypeRequest(message, /\bproducts?\b/))
                      ? /\bkagen\b/i.test(message) ? "kagen-product" : "product"
      : /\bthought leadership\b/i.test(message)
        ? "thought-leadership"
        : /\b(?:partner|partnership|alliance)\b/i.test(message)
          ? "partner"
          : explicitTypeRequest(message, /\b(?:industr(?:y|ies)|sectors?)\b/)
            ? "industry"
            : /\b(?:career|careers|jobs?|openings?|vacanc(?:y|ies)|hiring)\b/i.test(message)
              ? "career"
      : explicitTypeRequest(message, /\b(?:services?|serivces?|capabilit(?:y|ies)|offerings?|approach)\b/)
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
  const companyFact = /\b(?:ceo|founders?|leadership|board|history|started|awards?|recognitions?|values?|culture|offices?|headquarters|hq|global footprint|employees?|why choose|differentiat|successive advantage|industries focus)\b/i.test(message);
  const portfolioRequest = requestedContentType === "service" || requestedContentType === "industry";
  const containsPremise = /^(?:since|because|given that|assuming|as)\b/i.test(message.trim()) ||
    /\b(?:does not|doesn.t|do not|don.t|cannot|can.t|is not|isn.t|are not|aren.t|no |only |unrelated|right|correct)\b.*[?]?$/i.test(message.trim());
  const temporalIntent = /\b(?:upcoming|next scheduled|future)\b/i.test(message)
    ? "upcoming" as const
    : /\b(?:latest|newest|most recent|recently published|newly published|new release)\b/i.test(message)
    ? "latest" as const
    : /\bcurrent(?:ly)?\b/i.test(message)
      ? "current" as const
      : null;
  const effectiveRequestedContentType = requestedContentType ?? (capabilitySubject ? "service" : null);
  const intent = asksContact
    ? "contact"
    : isFollowUp
      ? "follow_up"
      : containsPremise
        ? "informational"
      : asksEvidence
        ? "evidence"
        : asksResource
          ? "resource"
          : asksRecommendation
            ? "recommendation"
            : describesProblem
              ? "solve_problem"
            : effectiveRequestedContentType === "service"
              ? "discovery"
              : tokens.length <= 2
                ? "explore"
                : "informational";
  const contentTypeTerms = new Set([
    "case", "study", "studies", "customer", "story", "stories", "whitepaper",
    "whitepapers", "ebook", "ebooks", "blog", "blogs", "article", "articles", "resource", "resources", "guide", "guides",
    "webinar", "webinars", "event", "events", "news", "announcement", "announcements", "thought", "leadership", "partner",
    "partnership", "industry", "industries", "sector", "sectors", "career", "careers", "job", "jobs",
    "opening", "openings", "vacancy", "vacancies", "hiring",
    "role", "roles",
    "service", "services", "serivce", "serivces", "capability", "capabilities", "offerings",
    "product", "products", "platform", "platforms", "solution", "solutions",
    "provide", "provides", "provided", "providing", "offer", "offers", "offered", "offering",
    "tell", "show", "give", "find", "list", "example", "examples", "explore", "discuss", "share", "then", "also",
    "have", "has", "available", "availability", "implement", "implemented", "implementing",
    "use", "used", "using", "related", "team", "specialize", "specialise",
    "cover", "covers", "covered", "covering", "more", "another", "other",
  ]);
  const relationshipWords = new Set(["related", "relevant", "matching", "associated"]);
  const explicitArticleTopic = requestedContentType === "blog"
    ? normalizedQuery.match(/^(?:show|find|give me|list|do you have)\s+(?:some\s+)?(?:blogs?|articles?|posts?)\s+(?:about|on|for)\s+(.+)$/)?.[1]?.trim()
    : undefined;
  const topics = [...new Set([
    ...(explicitArticleTopic ? explicitArticleTopic.split(" ").filter((token) => token.length > 1) : []),
    ...tokens.filter((token) =>
    !contentTypeTerms.has(token) &&
    !(requestedContentType && relationshipWords.has(token)),
  )])].slice(0, 6);
  const effectiveTopics = capabilitySubject
    ? capabilitySubject.split(" ").filter((token) => token.length > 1)
    : topics;
  const offTopic = /\b(?:weather|forecast|rain|temperature|movie|film|poem|song|joke|capital of|president of|prime minister|cricket|football|sports?|match result|election|recipe|horoscope|sorting code)\b/i.test(message);
  const industryMatch = normalizedQuery.match(
    /\b(?:for|in|with|about) ([a-z][a-z ]{1,50}?) (?:companies|businesses|organizations|organisations|industry|sector)\b/,
  );
  const explicitIndustry = industryMatch?.[1]?.trim();
  const needsClarification =
    (isFollowUp && topics.length === 0) ||
    (asksRecommendation && topics.length === 0);
  return {
    normalizedQuery,
    intent: offTopic ? "off_topic" : intent,
    topics: effectiveTopics,
    businessProblem: describesProblem ? message.trim() : null,
    desiredOutcomes: inferred.outcomes,
    domains: [...new Set([...effectiveTopics, ...inferred.domains])],
    technicalSignals: [...new Set([...effectiveTopics, ...inferred.concepts])],
    industry: explicitIndustry && !/^(?:this|that|same|the same)$/.test(explicitIndustry) ? explicitIndustry : null,
    existingPlatform: null,
    requestedContentType: effectiveRequestedContentType,
    requestedAction: null,
    answerMode,
    targetScope: namedSuccessivePerson || companyPossessive || companyFact ? "company" : portfolioRequest ? "portfolio" : "topic",
    temporalIntent,
    containsPremise,
    entities: namedSuccessivePerson ? [namedSuccessivePerson] : [],
    constraints: [],
    retrievalConcepts: [...new Set([...effectiveTopics, ...inferred.concepts])],
    isBroadQuery: effectiveTopics.length <= 2,
    isFollowUp,
    isOffTopic: offTopic,
    needsClarification,
    clarificationQuestion: needsClarification
      ? "What business outcome or technology challenge are you mainly trying to address?"
      : null,
    confidence: offTopic ? 0.95 : effectiveTopics.length ? 0.58 : 0.3,
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
  previousTopics: string[];
  activeProduct: string | null;
  activePartner: string | null;
}

export type FollowUpScope =
  | "CONTINUE_SAME_SCOPE"
  | "REFINE_SCOPE"
  | "BROADEN_SCOPE"
  | "SWITCH_TOPIC"
  | "AMBIGUOUS_FOLLOW_UP";

/** Classifies only context ownership; it does not alter retrieval or ranking. */
export function classifyFollowUpScope(
  current: QueryUnderstanding,
  message: string,
): FollowUpScope {
  const normalized = normalizeSearchText(message);
  const collection = /\b(?:openings?|jobs?|careers?|services?|offerings?|capabilities|case studies?|customer stories|blogs?|articles?|insights?|resources?|white ?papers?|reports?|events?|webinars?|partners?|partnerships?|alliances?|industries|locations?|offices?|products?|platforms?|accelerators?|awards?|recognitions?|technologies|press releases?|media)\b/;
  const explicitBroad =
    /\b(?:all|every|complete|full list|entire)\b/.test(normalized) ||
    /^(?:what|which)\b.*\b(?:do you (?:have|offer|provide)|are available|work with|serve)\b/.test(normalized) ||
    /^(?:where are|show|list|explore)\b.*\b(?:offices?|locations?|industries|partners?|products?|services?)\b/.test(normalized) ||
    /^(?:current|currently available|latest|newest|most recent)\s+(?:openings?|jobs?|articles?|blogs?|case studies?|products?)$/.test(normalized);
  if (collection.test(normalized) && explicitBroad) return "BROADEN_SCOPE";
  if (/^(?:any more|more|another|next|anything else)(?:\s+(?:one|ones|results?|items?))?$/.test(normalized))
    return "CONTINUE_SAME_SCOPE";
  if (/\b(?:this|that|these|those|them|it|its)\b/.test(normalized) &&
      /\b(?:integrat(?:e|es|ed|ing|ion)|compatib(?:le|ility)|interoperab(?:le|ility)|support(?:s|ed|ing)?|implement(?:s|ed|ing|ation)?|deploy(?:s|ed|ing|ment)?|customi[sz](?:e|es|ed|ing|ation)|connect(?:s|ed|ing|ion)?|work with|requirements?|needs?)\b/.test(normalized))
    return "REFINE_SCOPE";
  if (/\b(?:only|instead|specifically)\b/.test(normalized) ||
      /^(?:in|for|with|from|any)\b/.test(normalized) ||
      (/\b(?:related|relevant|matching|associated)\b/.test(normalized) &&
        (Boolean(current.requestedContentType) || /\b(?:these|those|them|this|that|it)\b/.test(normalized))) ||
      /\b(?:one|ones)\b/.test(normalized)) return "REFINE_SCOPE";
  if (current.topics.length || current.entities.length || current.industry || current.requestedContentType)
    return "SWITCH_TOPIC";
  if (/\b(?:this|that|these|those|them|it|its)\b/.test(normalized))
    return "AMBIGUOUS_FOLLOW_UP";
  return current.isFollowUp ? "AMBIGUOUS_FOLLOW_UP" : "SWITCH_TOPIC";
}

export function resolveConversationUnderstanding(
  current: QueryUnderstanding,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): { understanding: QueryUnderstanding; state: ConversationState } {
  const priorUsers = history.filter((item) => item.role === "user");
  let prior: QueryUnderstanding | undefined;
  let priorSubject: QueryUnderstanding | undefined;
  let lastExplicitTopicTurn: number | null = null;
  priorUsers.forEach((item, index) => {
    const candidate = buildDeterministicUnderstanding(item.content);
    if (candidate.topics.length || candidate.entities.length || candidate.industry || candidate.requestedContentType)
      prior = candidate;
    const subjectlessDependency = isDependentFollowUp(item.content) &&
      (!candidate.topics.length || /\b(?:this|that|it|its|these|those|they|them|their|one|ones|other|another)\b/i.test(item.content) ||
        /^(?:any|another|other|next|first|second|third|last)\b/i.test(item.content.trim()));
    if ((candidate.topics.length || candidate.entities.length || candidate.industry) && !subjectlessDependency)
      priorSubject = candidate;
    if (candidate.topics.length) {
      lastExplicitTopicTurn = index;
    }
  });
  const scope = classifyFollowUpScope(current, current.normalizedQuery);
  const broadensScope = scope === "BROADEN_SCOPE";
  const refinesScope = scope === "REFINE_SCOPE";
  const continuesScope = scope === "CONTINUE_SAME_SCOPE" || scope === "AMBIGUOUS_FOLLOW_UP";
  // Collection-wide operators control context ownership; they are never
  // semantic subjects or filters in the resolved retrieval request.
  const subjectlessFacet = isFacetOnlyFollowUp(current.normalizedQuery);
  const currentTopics = (subjectlessFacet ? [] : current.topics).filter((topic) =>
    !/^(?:all|every|complete|full|entire|one|ones|item|items|result|results)$/.test(topic));
  const standaloneCatalog = isExplicitStandaloneCatalogQuery(current.normalizedQuery);
  const hasExplicitCurrentSubject = !subjectlessFacet &&
    (standaloneCatalog || currentTopics.length > 0 || current.entities.length > 0 || Boolean(current.industry));
  const dependent = isDependentFollowUp(current.normalizedQuery);
  const shouldInherit = !standaloneCatalog && !broadensScope && !hasExplicitCurrentSubject && (current.isFollowUp || current.topics.length === 0 || dependent);
  const preserveTypeForTopicSwitch = /^what about\b/.test(current.normalizedQuery);
  const comparison = /\b(?:better than|compare(?:d)? (?:to|with)|difference between|versus|\bvs\b|or .+\??$|do you mean .+ too)\b/i.test(current.normalizedQuery);
  const correction = /^(?:i mean|i meant|no i mean|actually|sorry i mean|not .+? (?:but|instead) )\b/i.test(current.normalizedQuery);
  const topics = (comparison || (refinesScope && !correction)) && priorSubject
    ? [...new Set([...priorSubject.topics, ...currentTopics])]
    : currentTopics.length
    ? currentTopics
    : shouldInherit
      ? priorSubject?.topics ?? []
      : [];
  const entities = current.entities.length
    ? current.entities
    : shouldInherit
      ? priorSubject?.entities ?? []
      : [];
  const understanding = {
    ...current,
    topics,
    entities,
    businessProblem: broadensScope ? null : current.businessProblem ?? (shouldInherit ? prior?.businessProblem ?? null : null),
    desiredOutcomes: broadensScope ? [] : current.desiredOutcomes.length
      ? current.desiredOutcomes
      : shouldInherit
        ? prior?.desiredOutcomes ?? []
        : [],
    domains: broadensScope ? [] : current.domains.length
      ? current.domains
      : shouldInherit
        ? prior?.domains ?? topics
        : topics,
    technicalSignals: broadensScope ? [] : current.technicalSignals.length
      ? current.technicalSignals
      : shouldInherit
        ? prior?.technicalSignals ?? []
        : [],
    industry: broadensScope ? null : current.industry ?? (shouldInherit ? priorSubject?.industry ?? null : null),
    existingPlatform:
      broadensScope ? null : current.existingPlatform ??
      (shouldInherit ? prior?.existingPlatform ?? null : null),
    requestedContentType:
      subjectlessFacet && !/\b(?:ebook|e book|resource|guide)\b/.test(current.normalizedQuery)
        ? (prior?.requestedContentType && ["ebook", "resource", "whitepaper"].includes(prior.requestedContentType)
          ? prior.requestedContentType
          : null)
        : current.requestedContentType ??
      (shouldInherit || continuesScope || refinesScope || preserveTypeForTopicSwitch
        ? prior?.requestedContentType ?? null
        : null),
    retrievalConcepts: broadensScope ? [] : current.retrievalConcepts.length
      ? current.retrievalConcepts
      : shouldInherit
        ? prior?.retrievalConcepts ?? topics
        : topics,
    constraints: broadensScope ? [] : current.constraints,
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
      previousTopics: priorSubject?.topics ?? [],
      activeProduct: /\bkagen\b/.test(understanding.normalizedQuery) ? topics.join(" ") || null : null,
      activePartner: understanding.requestedContentType === "partner" ? topics.join(" ") || null : null,
    },
  };
}

export function applyStructuralBroadQueryRules(
  understanding: QueryUnderstanding,
  message: string,
): QueryUnderstanding {
  const normalized = normalizeSearchText(message);
  if (/^(?:what services (?:do you|does successive) (?:provide|offer)|which services (?:do you|does successive) (?:provide|offer)|what do you specialize in|what do you specialise in|what are your capabilities|how can successive help (?:our|my|a) business)$/.test(normalized)) {
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
  if (/^(?:industries focus|industry focus|what industries(?: (?:do|does) (?:you|successive) serve)?|which industries(?: (?:do|does) (?:you|successive) serve)?|which sectors do (?:you|successive) work in|list industries|show all industries|show (?:me )?(?:successive )?industries|explore (?:successive )?industries|industries)$/.test(normalized)) {
    return {
      ...understanding,
      intent: "discovery",
      topics: [],
      entities: [],
      businessProblem: null,
      requestedContentType: "industry",
      answerMode: "list",
      targetScope: "portfolio",
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

/** True only when the visitor explicitly asks for a catalogue or count. */
export function isExplicitListRequest(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return (
    /\b(?:how many|count|total number|number of)\b/.test(normalized) ||
    /\b(?:list|enumerate)\b/.test(normalized) ||
    /\b(?:show|give|provide)\s+(?:me\s+)?(?:all|every|the complete|the full)\b/.test(normalized) ||
    /\b(?:what|which)\s+are\s+(?:all|the complete|the full)\b/.test(normalized) ||
    /\b(?:what|which)\s+(?:industries|categories|technologies|services|offerings)\b.*\b(?:serve|served|cover|covered|available|offer|offered|provide|provided|use|used)\b/.test(normalized) ||
    /^(?:what|which)\s+(?:\w+\s+){0,2}(?:products?|accelerators?|awards?|recognitions?)\s+(?:are\s+)?available$/.test(normalized) ||
    /^(?:show|give|provide)(?:\s+me)?\s+(?:the\s+)?available\s+(?:products?|accelerators?|awards?|recognitions?)$/.test(normalized) ||
    /^(?:what|which)\s+(?:awards?|recognitions?)\s+(?:has|have|did)\b.*\b(?:receive|received|win|won|earn|earned)$/.test(normalized) ||
    /^(?:show (?:me )?|explore )(?:successive )?industries$/.test(normalized) ||
    /^(?:all|every)\s+\S+/.test(normalized)
  );
}

export function isDeterministicallyOffTopic(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return (/(?:\b(?:weather|forecast|movie|film|poem|song|joke|capital of|president of|prime minister|sports? score|recipe|horoscope|sorting code)\b|\b(?:who won|score|result)\b.*\b(?:match|game|football|cricket|basketball|tennis|hockey)\b)/.test(normalized)) &&
    !/\b(?:software|platform|application|app|technology|digital|data|ai|cloud|enterprise|business|operations)\b/.test(normalized);
}

export function shouldUseOffTopicFallback(
  message: string,
  understanding: QueryUnderstanding,
  hasAuthoritativeExactIdentity: boolean,
): boolean {
  return !hasAuthoritativeExactIdentity && (
    isDeterministicallyOffTopic(message) ||
    understanding.isOffTopic ||
    understanding.intent === "off_topic"
  );
}
