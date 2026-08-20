import { normalizeSearchText, type SuccessiveSearchDocument } from "./search-index";
import { isRequestedContentTypeCompatible, type SearchMatch } from "./search-retriever";
import type { QueryUnderstanding } from "./query-understanding";

const GENERIC = new Set(["successive", "digital", "service", "services", "company", "solution", "solutions", "development", "technology", "technologies", "about", "provide", "me", "is", "are", "a", "an", "the", "latest", "newest", "recent", "current"]);

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
  const serviceType = normalizeSearchText(document.service_type ?? "");
  if (serviceType === "sub service") return "sub-service";
  if (serviceType === "expertise") return "expertise";
  if (["service", "pillar", "piller"].includes(serviceType) || document.role === "service") return "service";
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
    ...match.document.topicProfile.metadataTerms,
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
  return identities.some((identity) => match.document.normalizedTitle === identity || slug === identity) ||
    match.matchedFields.some((field) => /exact-title|normalized-exact-title|exact-entity/.test(field));
}

export function selectAlignedSecondaryMatches(input: {
  matches: SearchMatch[];
  understanding: QueryUnderstanding;
  limit?: number;
}): { primary?: SearchMatch; related: SearchMatch[]; rejected: Array<{ title: string; reason: string }> } {
  const { understanding } = input;
  const rejected: Array<{ title: string; reason: string }> = [];
  const accepted = input.matches.filter((match) => {
    if (understanding.requestedContentType && !isRequestedContentTypeCompatible(match.document, understanding.requestedContentType)) {
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
