import { normalizeSearchText, normalizeServiceSchemaType, type SuccessiveSearchDocument } from "./search-index";
import { isRequestedContentTypeCompatible, isShortSemanticSubject, type SearchMatch } from "./search-retriever";
import type { QueryUnderstanding } from "./query-understanding";

const GENERIC = new Set(["successive", "digital", "service", "services", "company", "solution", "solutions", "development", "technology", "technologies", "about", "provide", "me", "is", "are", "a", "an", "the", "all", "every", "show", "list", "latest", "newest", "recent", "current"]);

export function documentContentType(document: SuccessiveSearchDocument): string {
  const identity = normalizeSearchText(`${document.type} ${document.slug} ${document.title} ${document.service_type ?? ""}`);
  if (document.type.includes("case")) return "case-study";
  if (document.type === "post") return "blog";
  if (/\bwhite ?paper\b/.test(identity)) return "whitepaper";
  if (/\be ?book\b|\bebook\b/.test(identity)) return "ebook";
  if (/\bwebinar\b/.test(identity)) return "webinar";
  if (/\bevent\b/.test(identity)) return "event";
  if (document.type === "press-release") return "press-release";
  if (document.type === "media-coverage") return "media-coverage";
  if (document.type === "accelerators" || /\baccelerator\b/.test(identity)) return "accelerator";
  if (document.role === "awards") return "award";
  if (document.role === "partner" || document.role === "partners") return "partner";
  if (document.role === "industry") return "industry";
  if (document.role === "case_study") return "case-study";
  if (document.role === "product" || document.productLike) return /\bkagen\b/.test(identity) ? "kagen-product" : "product";
  if (document.role === "technology") return "technology";
  if (document.role === "career" || document.role === "careers" || document.role === "job_listing") return "career";
  if (document.role === "culture") return "culture";
  if (document.role === "company") return "company";
  const serviceType = normalizeServiceSchemaType(document.service_type);
  if (serviceType === "sub-service") return "sub-service";
  if (serviceType === "expertise") return "expertise";
  if (["service", "pillar"].includes(serviceType ?? "") || document.role === "service") return "service";
  if (document.role === "resource") return "resource";
  return "page";
}

function topicTerms(understanding: QueryUnderstanding): string[] {
  return [...new Set([...understanding.topics, ...understanding.entities, ...(understanding.industry ? [understanding.industry] : [])]
    .flatMap((value) => normalizeSearchText(value).split(" "))
    .filter((term) => term.length > 1 && !GENERIC.has(term)))];
}

function topicStrength(match: SearchMatch, understanding: QueryUnderstanding): number {
  const terms = topicTerms(understanding);
  if (!terms.length) return understanding.isBroadQuery ? 1 : 0;
  const primary = new Set([
    ...match.document.topicProfile.titleTerms,
    ...match.document.topicProfile.headingTerms,
    ...match.document.capabilityProfile.identityTerms,
    ...match.document.capabilityProfile.technologyTerms,
  ]);
  const overlap = terms.filter((term) => primary.has(term)).length;
  const lexical = overlap / terms.length;
  const planned = normalizeSearchText([
    ...understanding.domains,
    ...understanding.technicalSignals,
    ...understanding.retrievalConcepts,
  ].join(" "));
  const identity = normalizeSearchText(`${match.document.title} ${match.document.slug} ${match.document.capabilityProfile.identityTerms.join(" ")}`);
  const families: Array<[RegExp, RegExp]> = [
    [/\b(?:security|devsecops|secure sdlc|shift left)\b/, /\b(?:security|devsecops|secure|compliance|vulnerability)\b/],
    [/\b(?:finops|cloud cost|cloud economics)\b/, /\b(?:finops|cloud cost|cost optimization|cloud economics)\b/],
    [/\b(?:headless cms|content management|content platform)\b/, /\b(?:cms|content management|content platform|headless)\b/],
    [/\b(?:application modernization|legacy modernization)\b/, /\b(?:application modernization|legacy modernization|legacy systems)\b/],
    [/\b(?:cloud migration|workload migration)\b/, /\b(?:cloud migration|workload migration|migrate modernize)\b/],
    [/\b(?:chatbot|conversational ai|virtual assistant)\b/, /\b(?:chatbot|conversational|virtual assistant|voice agent)\b/],
  ];
  return families.some(([queryFamily, evidenceFamily]) => queryFamily.test(planned) && evidenceFamily.test(identity))
    ? 1
    : lexical;
}

function exactIdentity(match: SearchMatch, understanding: QueryUnderstanding): boolean {
  const identities = [...understanding.entities, ...understanding.topics].map(normalizeSearchText).filter(Boolean);
  const slug = normalizeSearchText(match.document.slug.replace(/-/g, " "));
  const shortDefinitionSubject = ["define", "explain"].includes(understanding.answerMode) &&
    identities.length === 1 && isShortSemanticSubject(identities[0] ?? "");
  const embeddedIdentity = match.matchedFields.includes("exact-embedded-entity") &&
    (!shortDefinitionSubject || match.matchedFields.includes("embedded-direct-subject-authority"));
  return identities.some((identity) => match.document.normalizedTitle === identity || slug === identity) ||
    embeddedIdentity ||
    match.matchedFields.some((field) => /exact-title|normalized-exact-title|exact-entity-authority|validated-role-relation/.test(field));
}

function renderTopicStrength(match: SearchMatch, understanding: QueryUnderstanding): number {
  const terms = topicTerms(understanding);
  if (!terms.length) return understanding.isBroadQuery ? 1 : 0;
  const text = normalizeSearchText([
    match.document.title,
    ...match.document.headings,
    ...match.selectedPassages,
  ].join(" "));
  const tokens = new Set(text.split(" ").filter(Boolean));
  const has = (term: string) => tokens.has(term) ||
    [...tokens].some((token) => term.length >= 5 && token.length >= 5 && token.slice(0, 5) === term.slice(0, 5)) ||
    (term === "ai" && /\bartificial intelligence\b/.test(text)) ||
    (term === "ml" && /\bmachine learning\b/.test(text)) ||
    (term === "api" && /\bapplication programming interface\b/.test(text)) ||
    (term === "cms" && /\bcontent management system\b/.test(text));
  return terms.filter(has).length / terms.length;
}

export function selectAlignedSecondaryMatches(input: {
  matches: SearchMatch[];
  understanding: QueryUnderstanding;
  limit?: number;
}): { primary?: SearchMatch; related: SearchMatch[]; rejected: Array<{ title: string; reason: string }> } {
  const { understanding } = input;
  const rejected: Array<{ title: string; reason: string }> = [];
  const accepted = input.matches.filter((match) => {
    const embeddedRepresentation = match.matchedFields.includes("exact-embedded-entity");
    if (understanding.requestedContentType && !embeddedRepresentation && !isRequestedContentTypeCompatible(match.document, understanding.requestedContentType)) {
      rejected.push({ title: match.document.title, reason: "content-type mismatch" }); return false;
    }
    if (match.matchedFields.includes("incidental-body-only")) {
      rejected.push({ title: match.document.title, reason: "incidental topic mention" }); return false;
    }
    const strength = topicStrength(match, understanding);
    if (!exactIdentity(match, understanding) && strength < (topicTerms(understanding).length > 1 ? 0.66 : 1)) {
      rejected.push({ title: match.document.title, reason: "not independently same-topic" }); return false;
    }
    if (!exactIdentity(match, understanding) && !["high", "medium"].includes(match.confidence ?? "low")) {
      rejected.push({ title: match.document.title, reason: "insufficient authority" }); return false;
    }
    return true;
  });
  accepted.sort((a, b) => {
    if (understanding.temporalIntent === "latest") {
      const dateDelta = Date.parse(b.document.modified ?? "") - Date.parse(a.document.modified ?? "");
      if (Number.isFinite(dateDelta) && dateDelta !== 0) return dateDelta;
    }
    return Number(exactIdentity(b, understanding)) - Number(exactIdentity(a, understanding)) || b.score - a.score;
  });
  return { primary: accepted[0], related: accepted.slice(1, input.limit ?? 3), rejected };
}

/**
 * Final render gate. Each retained document must independently satisfy at
 * least one current facet, including both topic and requested content role.
 * Collection routes call this only for topical collections; unqualified
 * authoritative collections are deliberately preserved.
 */
export function selectFacetAlignedMatches(input: {
  matches: SearchMatch[];
  understandings: QueryUnderstanding[];
  preserveBroadCollection?: boolean;
}): SearchMatch[] {
  const plans = input.understandings.filter(Boolean);
  if (input.preserveBroadCollection && plans.every((plan) => topicTerms(plan).length === 0))
    return input.matches;
  return input.matches.filter((match) => plans.some((plan) => {
    const embeddedRepresentation = match.matchedFields.includes("exact-embedded-entity");
    if (plan.requestedContentType && !embeddedRepresentation &&
        !isRequestedContentTypeCompatible(match.document, plan.requestedContentType)) return false;
    if (match.matchedFields.includes("incidental-body-only")) return false;
    const terms = topicTerms(plan);
    if (!terms.length) return plan.isBroadQuery || exactIdentity(match, plan);
    if (exactIdentity(match, plan)) return true;
    const minimum = terms.length > 1 ? 0.66 : 1;
    return topicStrength(match, plan) >= minimum && renderTopicStrength(match, plan) >= minimum &&
      ["high", "medium"].includes(match.confidence ?? "low");
  }));
}

/**
 * Keeps an explicitly identified subject as the informational anchor. Broad
 * same-topic pages are useful for discovery, but must not expand an exact
 * entity answer. A case study may remain only when retrieval established an
 * explicit capability relationship rather than lexical overlap alone.
 */
export function anchorExactSubjectMatches(
  matches: SearchMatch[],
  understanding: QueryUnderstanding,
): SearchMatch[] {
  const exact = matches.filter((match) => exactIdentity(match, understanding));
  const authority = (match: SearchMatch) => {
    const type = documentContentType(match.document);
    if (["service", "sub-service", "expertise", "technology", "product", "kagen-product"].includes(type)) return 3;
    if (type === "case-study") return 2;
    if (["partner", "blog", "resource"].includes(type)) return 0;
    return 1;
  };
  const terms = topicTerms(understanding);
  const identityAffinity = (match: SearchMatch) => {
    const title = match.document.normalizedTitle;
    const phrase = terms.join(" ");
    const startsWithSubject = Boolean(phrase) && (title === phrase || title.startsWith(`${phrase} `));
    const requestedService = ["service", "sub-service", "expertise", "solution"].includes(understanding.requestedContentType ?? "");
    const relationTitle = requestedService && /\b(?:partners?|alliances?|case stud(?:y|ies)|guide|article|blog)\b/.test(title);
    return Number(startsWithSubject) * 3 - Number(relationTitle) * 2;
  };
  if (!exact.length) {
    const identityAligned = terms.length ? matches.filter((match) => {
      const identity = normalizeSearchText(`${match.document.title} ${match.document.slug.replace(/[-_]+/g, " ")} ${match.document.aliases.join(" ")}`);
      return terms.every((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(identity));
    }).sort((left, right) => identityAffinity(right) - identityAffinity(left) ||
      authority(right) - authority(left) || right.score - left.score) : [];
    return identityAligned.length ? [identityAligned[0]!] : matches;
  }
  const anchor = [...exact].sort((left, right) =>
    identityAffinity(right) - identityAffinity(left) || authority(right) - authority(left) || right.score - left.score ||
    right.document.contentQuality - left.document.contentQuality,
  )[0]!;
  const supportingCase = matches.find((match) =>
    match !== anchor && documentContentType(match.document) === "case-study" &&
    match.matchedFields.includes("case-study-capability-bridge"));
  return supportingCase ? [anchor, supportingCase] : [anchor];
}

export function alignedCta(match: SearchMatch | undefined, understanding: QueryUnderstanding): string | undefined {
  if (!match?.document.url) return undefined;
  const type = documentContentType(match.document);
  const labels: Record<string, string> = {
    service: "Explore the service", "sub-service": "Explore the service", expertise: "Explore the capability",
    blog: "Read the full article", "case-study": "Explore the full case study", whitepaper: "Read the whitepaper",
    ebook: "Explore the ebook", webinar: "Learn more about the webinar", event: "Learn more about the event",
    product: `Explore ${match.document.title}`, "kagen-product": `Explore ${match.document.title}`,
    partner: "Explore the partnership", career: "View the opening", "press-release": "Read the announcement",
    "media-coverage": "View media coverage", accelerator: "Explore the accelerator",
  };
  const label = labels[type];
  if (!label) return undefined;
  if (understanding.answerMode === "define" && !understanding.requestedContentType) return undefined;
  return `[${label}](${match.document.url})`;
}

/** Keeps an explicitly requested, validated content role visible in prose. */
export function ensureRequestedRoleFraming(
  answer: string,
  match: SearchMatch | undefined,
  requested: QueryUnderstanding["requestedContentType"],
): string {
  if (!match || !requested || !isRequestedContentTypeCompatible(match.document, requested)) return answer;
  const labels: Partial<Record<NonNullable<QueryUnderstanding["requestedContentType"]>, string>> = {
    service: "service", "sub-service": "service", expertise: "capability",
    blog: "article", "case-study": "case study", industry: "industry",
    product: "product", "kagen-product": "product", accelerator: "accelerator",
    partner: "partner", whitepaper: "whitepaper", ebook: "ebook",
    webinar: "webinar", event: "event", "press-release": "press release",
    "media-coverage": "media coverage", resource: "resource",
  };
  const label = labels[requested];
  if (!label || new RegExp(`\\b${label.replace(" ", "\\s+")}\\b`, "i").test(answer)) return answer;
  return `Related ${label}: **${match.document.title}**.\n\n${answer}`;
}

const ANSWER_ALIGNMENT_NOISE = new Set([
  ...GENERIC, "also", "from", "with", "into", "that", "this", "their", "your", "which",
  "more", "provides", "helps", "using", "through", "business", "context", "related",
]);

const alignmentTerms = (value: string) => new Set(normalizeSearchText(value).split(" ")
  .filter((term) => term.length >= 4 && !ANSWER_ALIGNMENT_NOISE.has(term)));

/** Rejects generated prose that is not supported by the match used for cards/sources. */
export function isAnswerAlignedWithMatch(answer: string, match: SearchMatch | undefined): boolean {
  if (!match || !answer.trim()) return false;
  const normalizedAnswer = normalizeSearchText(answer);
  if (normalizedAnswer.includes(match.document.normalizedTitle)) return true;
  const foreignUrls = [...answer.matchAll(/https?:\/\/[^\s)]+/g)]
    .map(([url]) => url.replace(/[.,]+$/, "").replace(/\/$/, ""))
    .filter((url) => url !== match.document.url.replace(/\/$/, ""));
  if (foreignUrls.length) return false;
  const answerTerms = alignmentTerms(answer);
  const evidenceTerms = alignmentTerms([
    match.document.title, ...match.selectedPassages,
    ...match.document.descriptions.slice(0, 3), ...match.document.textSegments.slice(0, 5),
  ].join(" "));
  const overlap = [...answerTerms].filter((term) => evidenceTerms.has(term)).length;
  return overlap >= 3 && overlap / Math.max(1, Math.min(answerTerms.size, evidenceTerms.size)) >= 0.18;
}
