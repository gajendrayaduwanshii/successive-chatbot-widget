import { factualDocumentEvidence, normalizeSearchText, normalizeServiceSchemaType, type SuccessiveSearchDocument } from "./search-index";
import { definitionEvidencePassages, isRequestedContentTypeCompatible, isShortSemanticSubject, type SearchMatch } from "./search-retriever";
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
    (match.matchedFields.includes("embedded-direct-subject-authority") ||
      (!shortDefinitionSubject && Boolean(understanding.requestedContentType)));
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
    const explicitEditorial = ["blog", "resource", "whitepaper", "ebook", "case-study"].includes(understanding.requestedContentType ?? "");
    const capabilityAuthority = (match: SearchMatch) => {
      if (explicitEditorial) return 0;
      return ["service", "sub-service", "expertise", "technology", "product", "kagen-product", "accelerator", "industry"].includes(documentContentType(match.document)) ? 1 : 0;
    };
    return Number(exactIdentity(b, understanding)) - Number(exactIdentity(a, understanding)) ||
      capabilityAuthority(b) - capabilityAuthority(a) || b.score - a.score;
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
  if (!match?.document.url || !hasNavigableDestination(match.document.url)) return undefined;
  const category = ctaCategoryFor(match, understanding);
  if (!category) return undefined;
  const directDefinitionDestination = match.matchedFields.some((field) =>
    ["exact-title-lock", "normalized-exact-title", "near-exact-title"].includes(field),
  );
  if (understanding.answerMode === "define" && !understanding.requestedContentType &&
      !match.matchedFields.includes("embedded-structural-parent") && !directDefinitionDestination) return undefined;
  const anchor = ctaAnchorTitle(match.document.title);
  const labels: Partial<Record<CtaCategory, string>> = {
    resource: "full resource", blog: "full article", "case-study": "full case study",
    leadership: "leadership team", partner: "partnership", career: "opening", announcement: "announcement",
  };
  const link = `[${labels[category] ?? anchor}](${match.document.url})`;
  return selectCtaTemplate(category)(link);
}

/** A source host alone is not a contextual destination; root-only URLs have no page to navigate to. */
function hasNavigableDestination(value: string): boolean {
  try {
    return Boolean(new URL(value).pathname.replace(/\/+$/, ""));
  } catch {
    return false;
  }
}

type CtaCategory = "service" | "technology" | "ai-strategy" | "product" | "resource" | "blog" | "case-study" | "industry" | "leadership" | "partner" | "career" | "announcement" | "generic";
type CtaTemplate = (link: string) => string;

const CTA_TEMPLATES: Record<CtaCategory, CtaTemplate[]> = {
  service: [
    (link) => `Explore ${link} for a closer look at Successive's expertise and delivery approach.`,
    (link) => `Explore ${link} for more details on the services, capabilities, and approach available from Successive.`,
    (link) => `Explore ${link} to discover how Successive supports enterprise transformation in this area.`,
  ],
  technology: [
    (link) => `Explore ${link} for more on Successive's engineering expertise and implementation approach.`,
    (link) => `Explore ${link} to see how Successive helps enterprises build, modernize, and scale technology solutions.`,
    (link) => `Explore ${link} for a closer look at Successive's technical capabilities and delivery expertise.`,
  ],
  "ai-strategy": [
    (link) => `Explore ${link} for more on Successive's strategy, capabilities, and business-focused approach.`,
    (link) => `Explore ${link} for a deeper look at the strategy and enterprise expertise Successive provides.`,
    (link) => `Explore ${link} to see how Successive approaches AI strategy and enterprise transformation.`,
  ],
  product: [
    (link) => `Explore ${link} to discover its capabilities and enterprise use cases.`,
    (link) => `Explore ${link} for a closer look at its capabilities and applications.`,
    (link) => `Explore ${link} for more details on its features, use cases, and enterprise applications.`,
  ],
  resource: [
    (link) => `Explore the ${link} for deeper insights and practical guidance.`,
    (link) => `Explore the ${link} for additional perspectives and actionable guidance.`,
    (link) => `Dive into the ${link} for more detailed insights and practical takeaways.`,
  ],
  blog: [
    (link) => `Read the ${link} for additional insights and practical guidance.`,
    (link) => `Explore the ${link} for a deeper perspective on the topic.`,
    (link) => `Read the ${link} for more insights and practical context.`,
  ],
  "case-study": [
    (link) => `Explore the ${link} for more details on the solution and business impact.`,
    (link) => `Read the ${link} to see the approach, implementation, and outcomes in context.`,
    (link) => `Explore the ${link} for a closer look at the challenge, solution, and results.`,
  ],
  industry: [
    (link) => `Explore ${link} to learn more about Successive's industry expertise and solutions.`,
    (link) => `Explore ${link} for a closer look at Successive's capabilities in this industry.`,
    (link) => `Explore ${link} to see how Successive addresses business and technology needs across this industry.`,
  ],
  leadership: [
    (link) => `Explore the ${link} to learn more about Successive's leadership.`,
    (link) => `Meet the ${link} for more on the people guiding Successive.`,
  ],
  partner: [(link) => `Explore the ${link} to learn more about the collaboration and related capabilities.`],
  career: [(link) => `View the ${link} for role details and application information.`],
  announcement: [(link) => `Read the ${link} for more details.`],
  generic: [(link) => `Explore ${link} to learn more.`],
};

const lastCtaTemplate = new Map<CtaCategory, number>();

function selectCtaTemplate(category: CtaCategory): CtaTemplate {
  const templates = CTA_TEMPLATES[category];
  const previous = lastCtaTemplate.get(category);
  const eligible = templates.length > 1 && previous !== undefined
    ? templates.map((_, index) => index).filter((index) => index !== previous)
    : templates.map((_, index) => index);
  const index = eligible[Math.floor(Math.random() * eligible.length)]!;
  lastCtaTemplate.set(category, index);
  return templates[index]!;
}

export function ctaTemplateCount(category: CtaCategory): number {
  return CTA_TEMPLATES[category].length;
}

export function ctaCategoryFor(match: SearchMatch, understanding: QueryUnderstanding): CtaCategory | undefined {
  const type = documentContentType(match.document);
  const identity = normalizeSearchText(`${match.document.title} ${match.document.slug} ${understanding.topics.join(" ")}`);
  if (["service", "sub-service", "expertise"].includes(type))
    return /\b(?:ai|artificial intelligence)\b/.test(identity) && /\b(?:strategy|strategic|consulting|advisory)\b/.test(identity)
      ? "ai-strategy" : "service";
  if (type === "technology") return "technology";
  if (["product", "kagen-product", "accelerator"].includes(type)) return "product";
  if (["whitepaper", "ebook", "resource"].includes(type)) return "resource";
  if (type === "blog") return "blog";
  if (type === "case-study") return "case-study";
  if (type === "industry") return "industry";
  if (type === "partner") return "partner";
  if (type === "career") return "career";
  if (["press-release", "media-coverage"].includes(type)) return "announcement";
  if (match.document.role === "leadership") return "leadership";
  // A validated, grounded informational record can still provide useful
  // navigation even when its source taxonomy has no specialized CTA wording.
  return ["award", "certification", "recognition"].includes(type) && match.document.url
    ? "generic" : undefined;
}

const CTA_ROLE_TERMS = /\b(?:services?|solutions?|consulting|advisory|capabilit(?:y|ies)|platform|product|accelerator|engineering|operations|strategy|technology|experience|commerce)\b/i;
const CTA_ACTION_PREFIX = /^(?:transform|accelerate|enable|empower|drive|elevate|unlock|reimagine|modernize|scale|grow|improve|build)\b/i;

/** Produces a concise, subject-bearing CTA anchor from a canonical page title. */
export function ctaAnchorTitle(title: string): string {
  const base = title.replace(/[\*_`]/g, "").replace(/:\s+.*$/, "").trim();
  const segments = base.split(/\s+(?:with|through|using|via)\s+/i).map((value) => value.trim()).filter(Boolean);
  if (segments.length === 2 && CTA_ACTION_PREFIX.test(segments[0]!) &&
      !CTA_ROLE_TERMS.test(segments[0]!) && CTA_ROLE_TERMS.test(segments[1]!)) {
    return segments[1]!;
  }
  return base
    .replace(/\s+(?:for|to|driving|powering|transforming|accelerating|enabling|delivering)\b.*$/i, "")
    .trim() || title;
}

/**
 * Major capability records can use additional same-record evidence. Other
 * categories deliberately retain their concise response shape.
 */
export function supportsEvidenceDrivenDepth(match: SearchMatch, understanding: QueryUnderstanding): boolean {
  // A narrow named-subject use-case request may parse as a list, but it is not
  // a broad collection and can safely use the subject's bounded evidence.
  const isNarrowList = understanding.answerMode === "list" && !understanding.isBroadQuery;
  if (!['define', 'explain', 'details', 'summarize'].includes(understanding.answerMode) && !isNarrowList) return false;
  if (['blog', 'case-study', 'whitepaper', 'webinar', 'event', 'press-release', 'media-coverage', 'career', 'company', 'leadership'].includes(documentContentType(match.document))) return false;
  const type = documentContentType(match.document);
  if (/\b(?:ebook|resource|guide)\b/i.test(`${match.document.slug} ${match.document.url}`)) return true;
  if (['service', 'sub-service', 'expertise', 'technology', 'product', 'kagen-product', 'accelerator', 'industry', 'resource', 'ebook'].includes(type) ||
      match.document.role === 'global_capabilities' || match.matchedFields.includes('exact-structured-section')) return true;
  // Some canonical solution and implementation pages are retained as generic
  // pages by the source taxonomy. Their resolved title/role, not a topic list,
  // establishes that they are substantial offerings.
  return match.document.role === 'page' && /\b(?:solution|consulting|capabilit(?:y|ies)|implementation|integration|development|engineering|platform|accelerator|modernization|transformation)\b/i.test(match.document.title);
}

/** Adds a concise visitor-subject heading only for substantial, grounded topics. */
export function ensureSubstantialTopicHeading(answer: string, match: SearchMatch | undefined, understanding: QueryUnderstanding): string {
  if (!match || !supportsEvidenceDrivenDepth(match, understanding) || /^#{1,3}\s+/m.test(answer.trim())) return answer.trim();
  const explicit = [...understanding.entities, ...understanding.topics]
    .map((value) => value.trim()).find((value) => normalizeSearchText(value).split(" ").length >= 2);
  const source = explicit ?? ctaAnchorTitle(match.document.title);
  const heading = source.replace(/\s+/g, " ").trim();
  if (!heading || heading.length > 90) return answer.trim();
  return `## ${heading}\n\n${answer.trim()}`;
}

/** Selects unique, same-record evidence for composition without crossing result or section boundaries. */
export function compositionEvidence(
  match: Pick<SearchMatch, 'document' | 'selectedPassages' | 'matchedFields' | 'localEvidence'>,
  limit = 6,
  understanding?: QueryUnderstanding,
): string[] {
  const definitionSubject = understanding && ['define', 'explain'].includes(understanding.answerMode)
    ? [...understanding.entities, ...understanding.topics].map(normalizeSearchText).find(Boolean)
    : undefined;
  if (definitionSubject) return definitionEvidencePassages(match.document, definitionSubject).slice(0, limit);
  const sectionScoped = Boolean(match.localEvidence) ||
    match.matchedFields.includes('exact-structured-section') ||
    match.matchedFields.includes('exact-embedded-entity');
  const legacyUnstructuredDocument = match.document.structuredFields.length === 0;
  const candidates = sectionScoped
    ? [...match.selectedPassages, ...(match.localEvidence?.passages ?? [])]
    : legacyUnstructuredDocument
      ? [...match.selectedPassages, ...match.document.descriptions, ...match.document.textSegments]
      : factualDocumentEvidence(match.document);
  const normalizedCandidates = candidates.map((value) => value.replace(/\s+/g, ' ').trim()).filter((value) => value.length >= 30);
  const unique: string[] = [];
  normalizedCandidates.forEach((candidate) => {
    const normalized = normalizeSearchText(candidate);
    if (!normalized || unique.some((existing) => {
      const other = normalizeSearchText(existing);
      return other.includes(normalized) || normalized.includes(other);
    })) return;
    unique.push(candidate);
  });
  return unique.slice(0, limit);
}

function firstPartySuccessiveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "successive.tech" || url.hostname.endsWith(".successive.tech"));
  } catch {
    return false;
  }
}

/** A root URL is contextual only when the resolved record itself identifies the homepage. */
export function hasMeaningfulInlineDestination(document: Pick<SuccessiveSearchDocument, "url" | "slug" | "role">): boolean {
  if (!firstPartySuccessiveUrl(document.url)) return false;
  try {
    if (new URL(document.url).pathname.replace(/\/+$/, "")) return true;
    return document.slug === "home" || document.role === "company" && document.slug === "";
  } catch {
    return false;
  }
}

function linkableTitlePhrases(title: string): string[] {
  const phrases = [title.trim()];
  const shortened = title
    .replace(/\s+(?:services?|solutions?|company|platform|guide|consulting|development)$/i, "")
    .trim();
  if (shortened.split(/\s+/).length >= 2) phrases.push(shortened);
  return [...new Set(phrases.filter(Boolean))].sort((left, right) => right.length - left.length);
}

/** Derive short identities from a page's own slug, never from body keywords or guessed URLs. */
function canonicalPageLabels(document: SuccessiveSearchDocument): string[] {
  if (document.type !== "page" || !hasMeaningfulInlineDestination(document)) return [];
  const words = document.slug.split("-").filter(Boolean);
  while (words.length > 1 && /^(?:services?|solutions?|consulting|development|company|transformation)$/.test(words.at(-1)!)) words.pop();
  const name = words.join(" ");
  const labels = [name];
  // Accept an acronym only if the page itself explicitly uses it as a title
  // word. Automatically generated search aliases are not identity evidence.
  const acronym = words.map((word) => word[0]).join("").toUpperCase();
  if (words.length >= 2 && acronym.length >= 2 &&
      document.title.split(/[^a-z0-9]+/i).includes(acronym)) labels.push(acronym);
  return labels.filter((label) => label.length >= 3);
}

export function inlineLinkMatches(matches: SearchMatch[], corpus: SuccessiveSearchDocument[], answer: string): SearchMatch[] {
  const evidence = matches.flatMap(({ document, localEvidence, selectedPassages, matchedFields }) =>
    localEvidence?.passages ?? (matchedFields.includes("exact-embedded-entity") || matchedFields.includes("embedded-structural-parent")
      ? selectedPassages : factualDocumentEvidence(document))).join(" ");
  const visible = (name: string) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`, "iu");
    return pattern.test(answer) && pattern.test(evidence);
  };
  const candidates = corpus.flatMap((document) => {
    const labels = [document.title, ...canonicalPageLabels(document)].filter(visible);
    return labels.map((title) => ({ document, title, authority:
      normalizeSearchText(title) === normalizeSearchText(document.title) ? 3 :
      normalizeSearchText(title) === normalizeSearchText(document.slug.replace(/-/g, " ")) ? 2 :
      normalizeServiceSchemaType(document.service_type) === "pillar" ? 1 : 0 }));
  });
  // Single-word category labels are navigational in an enumeration, not in
  // incidental prose such as "a cloud platform". Require displayed casing.
  const categoryNames = new Set(candidates.filter(({ title }) =>
    new RegExp(`(?:^|[\\s,])${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[,;]|,? and )`, "i").test(answer))
    .map(({ title }) => title.toLowerCase()));
  const authorityByLabel = new Map<string, number>();
  for (const candidate of candidates) authorityByLabel.set(candidate.title.toLowerCase(),
    Math.max(authorityByLabel.get(candidate.title.toLowerCase()) ?? -1, candidate.authority));
  const additional = candidates.flatMap(({ document, title, authority }): SearchMatch[] => {
    if (authority < authorityByLabel.get(title.toLowerCase())!) return [];
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mention = answer.match(new RegExp(`\\b${escaped}\\b`, "i"))?.[0];
    if (title.split(/\s+/).length === 1 && (categoryNames.size < 2 || !mention || !/^[A-Z]/.test(mention))) return [];
    return [{ document: { ...document, title }, score: 0, confidence: "high",
      matchedFields: ["validated-inline-identity"], selectedPassages: [] }];
  });
  const authored = matches.flatMap((match) => match.document.structuredLinks.flatMap((link): SearchMatch[] => {
    const title = link.title?.trim();
    if (!title || /^(?:learn more|read more|explore|view|click here|contact us|connect with us)$/i.test(title)) return [];
    const target = corpus.find((document) => document.url === link.url);
    return target ? [{ ...match, document: { ...target, title } }] : [];
  }));
  return [...matches, ...additional, ...authored];
}

/** Link each unambiguous identity once, preserving Markdown and visible casing. */
export function enrichAnswerWithValidatedInlineLinks(answer: string, matches: SearchMatch[]): string {
  const destinations = new Map<string, Set<string>>();
  for (const { document } of matches) {
    if (!hasMeaningfulInlineDestination(document)) continue;
    for (const phrase of linkableTitlePhrases(document.title)) {
      const key = phrase.toLowerCase();
      const urls = destinations.get(key) ?? new Set<string>();
      urls.add(document.url);
      destinations.set(key, urls);
    }
  }
  const phrases = [...destinations.keys()].filter((key) => destinations.get(key)!.size === 1)
    .sort((a, b) => b.length - a.length);
  if (!phrases.length) return answer;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${phrases.map(escape).join("|")})(?![\\p{L}\\p{N}_-])`, "giu");
  const linked = new Set([...answer.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)].map((match) => match[1]));
  // Existing links/images, code, raw URLs, and HTML are not prose.
  return answer.split(/(!?\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\[[^\]]*\]|```[\s\S]*?```|`[^`]*`|https?:\/\/[^\s<>]+|<[^>]*>)/g)
    .map((part, index) => index % 2 ? part : part.replace(expression, (label) => {
      const url = [...destinations.get(label.toLowerCase())!][0]!;
      if (linked.has(url)) return label;
      linked.add(url);
      return `[${label}](${url})`;
    })).join("");
}

/** A heading destination labels the topic; a body link is a substantive navigation choice. */
export function hasCanonicalBodyLink(answer: string, canonicalUrl: string): boolean {
  const withoutLeadingHeading = answer.trim().replace(/^#{1,3}\s+[^\n]*(?:\n|$)/, "").trim();
  return withoutLeadingHeading.includes(`](${canonicalUrl})`);
}

/** Eligible substantial composition owns a final CTA even when navigation is already linked in prose. */
export function shouldAppendFinalCta(composerEligible: boolean, hasBodyCanonicalLink: boolean): boolean {
  return composerEligible || !hasBodyCanonicalLink;
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
  // The selected role remains available in cards/sources and the contextual
  // link. Avoid prepending a result-style label that merely repeats it.
  return answer;
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
