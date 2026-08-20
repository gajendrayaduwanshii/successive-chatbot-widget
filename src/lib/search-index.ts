import {
  extractAcfContent,
  deduplicateSegments,
  segmentQuality,
} from "./acf-extractor";
import { getEnv } from "./env";
import { htmlToParagraphs, htmlToText, safeHttpUrl } from "./html-utils";
import type { WordPressItem } from "@/types/wordpress";
import { extractServiceType } from "./content-normalizer";

export interface SuccessiveSearchChunk {
  id: string;
  text: string;
  normalizedText: string;
  position: number;
}

export interface SuccessiveSearchDocument {
  id: number;
  type: string;
  slug: string;
  title: string;
  normalizedTitle: string;
  aliases: string[];
  headings: string[];
  descriptions: string[];
  faqItems: Array<{ question: string; answer: string }>;
  structuredFields: import("./acf-extractor").StructuredAcfField[];
  textSegments: string[];
  chunks: SuccessiveSearchChunk[];
  combinedText: string;
  internalLinks: string[];
  url: string;
  image?: string;
  modified?: string;
  contentQuality: number;
  productLike: boolean;
  service_type?: string;
  role:
    | "company"
    | "global_capabilities"
    | "culture"
    | "careers"
    | "awards"
    | "partners"
    | "service"
    | "technology"
    | "industry"
    | "partner"
    | "case_study"
    | "blog"
    | "press_release"
    | "resource"
    | "editorial"
    | "career"
    | "job_listing"
    | "product"
    | "contact"
    | "page";
  capabilityProfile: {
    identityTerms: string[];
    problemTerms: string[];
    outcomeTerms: string[];
    technologyTerms: string[];
    businessFunctionTerms: string[];
    industryTerms: string[];
    activityTerms: string[];
  };
  relatedCapabilities: Array<{
    documentId: number;
    score: number;
    evidence: Array<"explicit-reference" | "internal-link" | "phrase" | "technology" | "problem-outcome" | "taxonomy" | "distinctive-concepts">;
  }>;
  topicProfile: {
    titleTerms: string[];
    headingTerms: string[];
    metadataTerms: string[];
    primaryTopics: string[];
    secondaryTopics: string[];
  };
}

const rendered = (value: WordPressItem["title"] | WordPressItem["content"]) =>
  typeof value === "string" ? value : (value?.rendered ?? "");

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 320;
const PROFILE_STOPWORDS = new Set([
  "successive", "digital", "service", "services", "solution", "solutions",
  "company", "business", "technology", "technologies", "help", "using", "use",
  "new", "best", "more", "with", "from", "into", "your", "their", "about",
  "page", "learn", "read", "explore", "overview", "approach", "provide",
  "of", "to", "in", "on", "an", "as", "at", "by", "or", "and", "the",
]);
const GENERIC_RELATION_TERMS = new Set([
  ...PROFILE_STOPWORDS,
  "growth", "operations", "operation", "platform", "performance",
  "development", "management", "process", "system", "systems", "data",
  "application", "applications", "experience", "enterprise", "modern",
  "improve", "support", "team", "teams", "work", "value", "customer",
]);

function profileTerms(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .filter((term) => term.length > 1 && !PROFILE_STOPWORDS.has(term));
}

function buildTopicProfile(
  title: string,
  slug: string,
  headings: string[],
  aliases: string[],
  serviceType: string | undefined,
) {
  const titleTerms = [...new Set(profileTerms(title))];
  const headingTerms = [...new Set(headings.flatMap(profileTerms))];
  const metadataTerms = [
    ...new Set(profileTerms(`${slug.replace(/-/g, " ")} ${aliases.join(" ")} ${serviceType ?? ""}`)),
  ];
  const authority = new Map<string, number>();
  titleTerms.forEach((term) => authority.set(term, (authority.get(term) ?? 0) + 5));
  metadataTerms.forEach((term) => authority.set(term, (authority.get(term) ?? 0) + 3));
  headingTerms.forEach((term) => authority.set(term, (authority.get(term) ?? 0) + 2));
  const ranked = [...authority]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term);
  return {
    titleTerms,
    headingTerms,
    metadataTerms,
    primaryTopics: ranked.slice(0, 8),
    secondaryTopics: ranked.slice(8, 24),
  };
}

export function normalizeSearchText(value: string): string {
  return htmlToText(value)
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function documentRole(item: WordPressItem, slug: string, serviceType?: string): SuccessiveSearchDocument["role"] {
  const type = item.type ?? "page";
  const identity = normalizeSearchText(`${typeof item.title === "string" ? item.title : item.title?.rendered ?? ""} ${slug}`);
  const normalizedService = normalizeSearchText(serviceType ?? "");
  const acf = item.acf && typeof item.acf === "object" && !Array.isArray(item.acf)
    ? item.acf as Record<string, unknown>
    : {};
  if (Array.isArray(acf.core_values) || Array.isArray(acf.executive_management)) return "company";
  if (Array.isArray(acf.capabilities_categories)) return "global_capabilities";
  if (Array.isArray(acf.partnerships_repeater)) return "partners";
  if (Array.isArray(acf.advantage_slider)) return "careers";
  if (slug === "our-culture") return "culture";
  if (slug === "awards") return "awards";
  if (slug === "contact") return "contact";
  if (type.includes("case")) return "case_study";
  if (type === "post") return "blog";
  if (type === "page" && /\b(?:partner|partnership|alliance)\b/.test(identity)) return "partner";
  if (type === "press-release") return "press_release";
  if (type === "product") return "product";
  if (type === "award") return "awards";
  if (type === "industries") return "industry";
  if (type === "partners") return "partner";
  if (type === "careers" || slug === "careers") return "career";
  if (["post", "thought-leadership", "employee-perspective", "press-release", "media-coverage"].includes(type))
    return "editorial";
  if (/whitepaper|ebook|webinar|event|resource/.test(`${type} ${slug}`)) return "resource";
  if (["service", "sub service", "pillar", "piller", "expertise"].includes(normalizedService)) return "service";
  if (["about", "about-us", "home"].includes(slug)) return "company";
  return "page";
}

function capabilityProfile(
  title: string,
  slug: string,
  headings: string[],
  descriptions: string[],
  serviceType?: string,
) {
  const identityTerms = [...new Set(profileTerms(`${title} ${slug.replace(/-/g, " ")} ${serviceType ?? ""} ${headings.slice(0, 8).join(" ")}`))];
  const problemText = descriptions.filter((value) => /\b(?:challenge|problem|struggl|reduce|improve|moderniz|slow|cost|risk|manual|scale|secure|visibility|fragment|legacy|complex|inefficien)/i.test(value)).join(" ");
  const outcomeText = descriptions.filter((value) => /\b(?:benefit|outcome|accelerat|optimi|automat|efficien|growth|performance|scalab|resilien|agility|experience|visibility|saving)/i.test(value)).join(" ");
  return {
    identityTerms,
    problemTerms: [...new Set(profileTerms(problemText))].slice(0, 80),
    outcomeTerms: [...new Set(profileTerms(outcomeText))].slice(0, 80),
    technologyTerms: [],
    businessFunctionTerms: [],
    industryTerms: [],
    activityTerms: [],
  };
}

function structuredProfileTerms(item: WordPressItem) {
  const result = {
    identityTerms: [] as string[], problemTerms: [] as string[],
    outcomeTerms: [] as string[], technologyTerms: [] as string[],
    businessFunctionTerms: [] as string[], industryTerms: [] as string[],
    activityTerms: [] as string[],
  };
  const visit = (value: unknown, key = "") => {
    if (value == null || value === false || value === "") return;
    if (typeof value === "string") {
      if (/^(?:https?:|\d+$)/i.test(value.trim())) return;
      const terms = profileTerms(value);
      if (!terms.length) return;
      if (/challenge|problem|pain|issue|gap|risk|constraint/i.test(key)) result.problemTerms.push(...terms);
      if (/benefit|outcome|impact|result|value|advantage|goal/i.test(key)) result.outcomeTerms.push(...terms);
      if (/technolog|platform|tool|stack|framework|integration/i.test(key)) result.technologyTerms.push(...terms);
      if (/industry|sector|vertical|market/i.test(key)) result.industryTerms.push(...terms);
      if (/function|operation|workflow|process|department|team/i.test(key)) result.businessFunctionTerms.push(...terms);
      if (/solution|service|capabilit|implementation|approach|method|deliver|use.case/i.test(key)) result.activityTerms.push(...terms);
      if (/title|heading|badge|meta|hero/i.test(key)) result.identityTerms.push(...terms);
      return;
    }
    if (Array.isArray(value)) return value.forEach((child) => visit(child, key));
    if (typeof value === "object")
      Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(item.acf);
  return Object.fromEntries(
    Object.entries(result).map(([key, terms]) => [key, [...new Set(terms)].slice(0, 120)]),
  ) as typeof result;
}

function splitLongParagraph(value: string): string[] {
  if (value.length <= CHUNK_TARGET_CHARS) return [value];
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [value];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (current && current.length + clean.length + 1 > CHUNK_TARGET_CHARS) {
      parts.push(current);
      current = "";
    }
    // Extremely long rich-text runs still need a bounded word-safe fallback.
    if (clean.length > CHUNK_TARGET_CHARS) {
      const words = clean.split(/\s+/);
      for (const word of words) {
        if (current && current.length + word.length + 1 > CHUNK_TARGET_CHARS) {
          parts.push(current);
          current = "";
        }
        current += `${current ? " " : ""}${word}`;
      }
    } else {
      current += `${current ? " " : ""}${clean}`;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Builds paragraph-preserving chunks with overlap. The overlap is intentionally
 * copied from whole trailing paragraphs/sentences so query evidence is not cut
 * at arbitrary character offsets.
 */
export function buildSearchChunks(
  documentId: number,
  segments: string[],
): SuccessiveSearchChunk[] {
  const units = deduplicateSegments(segments)
    .flatMap(splitLongParagraph)
    .filter((text) => text.length >= 20);
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join("\n"));
    const overlap: string[] = [];
    let overlapLength = 0;
    for (let index = current.length - 1; index >= 0; index--) {
      const unit = current[index]!;
      overlap.unshift(unit);
      overlapLength += unit.length + 1;
      if (overlapLength >= CHUNK_OVERLAP_CHARS) break;
    }
    current = overlap;
    length = overlapLength;
  };
  for (const unit of units) {
    if (current.length && length + unit.length + 1 > CHUNK_TARGET_CHARS)
      flush();
    // Avoid adding the overlap unit twice when duplicated source fields occur.
    if (current[current.length - 1] === unit) continue;
    current.push(unit);
    length += unit.length + 1;
  }
  if (current.length) chunks.push(current.join("\n"));
  const seen = new Set<string>();
  return chunks
    .filter((text) => {
      const normalized = normalizeSearchText(text);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map((text, position) => ({
      id: `${documentId}:${position}`,
      text,
      normalizedText: normalizeSearchText(text),
      position,
    }));
}

export function normalizeWordPressUrl(value: string): string {
  const url = safeHttpUrl(value);
  if (!url) return "";
  const env = getEnv();
  try {
    const source = new URL(url);
    const api = new URL(env.SUCCESSIVE_API_BASE_URL);
    const publicSite = new URL(env.SUCCESSIVE_PUBLIC_SITE_URL);
    const apiSitePath = api.pathname.split("/wp-json/")[0].replace(/\/$/, "");
    const sourceSiteBase = `${api.origin}${apiSitePath}`;
    if (
      source.href === sourceSiteBase ||
      source.href.startsWith(`${sourceSiteBase}/`)
    ) {
      const suffix = source.href.slice(sourceSiteBase.length);
      return `${publicSite.href.replace(/\/$/, "")}${suffix}`;
    }
    return source.toString();
  } catch {
    return "";
  }
}

export function buildSearchDocument(
  item: WordPressItem,
  deepAnalysis = true,
): SuccessiveSearchDocument {
  const extracted = extractAcfContent(item.acf);
  const acfSectionLabels = item.acf && typeof item.acf === "object" && !Array.isArray(item.acf)
    ? Object.entries(item.acf).flatMap(([key, value]) => {
        if (!Array.isArray(value) || value.length === 0) return [];
        if (/^(?:image|logo|icon|video|gallery|slider|banner|cta|button)/i.test(key))
          return [];
        const label = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
        return label.length >= 3 ? [label] : [];
      })
    : [];
  const title = htmlToText(rendered(item.title)) || "Untitled";
  const editor = deduplicateSegments([
    ...htmlToParagraphs(rendered(item.excerpt)),
    ...htmlToParagraphs(rendered(item.content)),
  ]);
  const headings = deduplicateSegments([
    ...acfSectionLabels,
    ...extracted.headings,
  ]);
  const descriptions = deduplicateSegments([
    ...editor,
    ...extracted.descriptions,
  ]).filter(
    (text) =>
      segmentQuality(text) >= 30 &&
      !/your browser does not support the video tag/i.test(text),
  );
  const faqText = extracted.faqItems.flatMap((faq) => [
    faq.question,
    faq.answer,
  ]);
  const textSegments = deduplicateSegments([
    ...editor,
    ...extracted.textSegments,
    ...faqText,
  ]).filter(
    (text) =>
      segmentQuality(text) >= 25 &&
      !/your browser does not support the video tag/i.test(text),
  );
  const normalizedTitle = normalizeSearchText(title);
  const titleTokens = normalizedTitle.split(" ");
  const successiveIndex = titleTokens.indexOf("successive");
  const named =
    successiveIndex >= 0 ? titleTokens[successiveIndex + 1] : undefined;
  const acronym = titleTokens
    .filter(
      (token) =>
        token.length > 3 &&
        ![
          "successive",
          "platform",
          "enterprise",
          "agentic",
          "driven",
          "delivery",
        ].includes(token),
    )
    .map((token) => token[0])
    .join("");
  const titleAcronyms = titleTokens.flatMap((_, start) =>
    Array.from({ length: Math.min(5, titleTokens.length - start) - 1 }, (__, offset) =>
      titleTokens.slice(start, start + offset + 2).map((token) => token[0]).join(""),
    ),
  ).filter((value) => value.length >= 3 && value.length <= 5);
  const explicitAcronyms = headings
    .flatMap((text) => text.match(/\b[A-Z]{3,6}\b/g) ?? [])
    .filter((value) => !["FAQ", "HTML", "HTTPS"].includes(value));
  const aliases = deduplicateSegments([
    normalizedTitle,
    normalizeSearchText(item.slug ?? ""),
    named ? `successive ${named}` : "",
    named ?? "",
    acronym.length >= 3 && acronym.length <= 6 ? acronym : "",
    ...titleAcronyms,
    ...explicitAcronyms,
  ]).map(normalizeSearchText);
  const fieldNames =
    item.acf && typeof item.acf === "object" && !Array.isArray(item.acf)
      ? Object.keys(item.acf).join(" ")
      : "";
  const combinedText = normalizeSearchText(
    [title, item.slug, ...headings, ...descriptions, ...textSegments].join(" "),
  );
  const internalLinks = deepAnalysis
    ? [rendered(item.content), JSON.stringify(item.acf ?? {})]
        .flatMap((value) => value.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [])
        .map((value) => {
          try { return new URL(value.replace(/&amp;/g, "&")).pathname.replace(/\/$/, ""); }
          catch { return ""; }
        })
        .filter(Boolean)
    : [];
  // Title/headings lead the first chunk, while every editor and recursive ACF
  // text segment remains searchable in the subsequent overlapping chunks.
  const chunks = buildSearchChunks(item.id, [
    title,
    ...headings.map((heading) =>
      heading.length < 20 && !/^[A-Z0-9]{2,6}$/.test(heading)
        ? `Content section: ${heading}`
        : heading,
    ),
    ...textSegments,
  ]);
  const productLike =
    item.type === "product" ||
    ((item.type === "press-release" || item.type === "media-coverage") &&
      (/\b(?:launches?|unveils?|introduces?)\b/.test(normalizedTitle) ||
        /\b(?:product|platform)\b/.test(combinedText))) ||
    (item.type === "page" &&
      (/product|platform/i.test(`${title} ${item.slug} ${fieldNames}`) ||
        /content intelligence platform/i.test(combinedText)));
  const qualityValues = [...headings, ...descriptions, ...textSegments].map(
    segmentQuality,
  );
  const contentQuality = qualityValues.length
    ? Math.round(
        qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length,
      )
    : 0;
  const featured =
    typeof item.featured_image === "string"
      ? item.featured_image
      : (item.featured_image?.url ?? item.featured_image?.source_url);
  const serviceType = extractServiceType(item.acf);
  const role = documentRole(item, item.slug ?? "", serviceType);
  const structured = deepAnalysis
    ? structuredProfileTerms(item)
    : {
        identityTerms: [], problemTerms: [], outcomeTerms: [],
        technologyTerms: [], businessFunctionTerms: [], industryTerms: [],
        activityTerms: [],
      };
  return {
    id: item.id,
    type: item.type ?? "page",
    slug: item.slug ?? "",
    title,
    normalizedTitle,
    aliases,
    headings,
    descriptions,
    faqItems: extracted.faqItems,
    structuredFields: extracted.structuredFields,
    textSegments,
    chunks,
    combinedText,
    internalLinks: [...new Set(internalLinks)],
    url: normalizeWordPressUrl(item.link ?? ""),
    image:
      normalizeWordPressUrl(featured ?? extracted.images[0]?.url ?? "") ||
      undefined,
    modified: item.date ?? item.modified,
    contentQuality,
    productLike,
    service_type: serviceType,
    role,
    capabilityProfile: (() => {
      const profile = deepAnalysis
        ? capabilityProfile(
            title,
            item.slug ?? "",
            headings,
            descriptions,
            serviceType,
          )
        : {
            identityTerms: [...new Set(profileTerms(
              `${title} ${(item.slug ?? "").replace(/-/g, " ")} ${serviceType ?? ""}`,
            ))],
            problemTerms: [], outcomeTerms: [], technologyTerms: [],
            businessFunctionTerms: [], industryTerms: [], activityTerms: [],
          };
      return {
        identityTerms: [...new Set([...profile.identityTerms, ...structured.identityTerms])],
        problemTerms: [...new Set([...profile.problemTerms, ...structured.problemTerms])],
        outcomeTerms: [...new Set([...profile.outcomeTerms, ...structured.outcomeTerms])],
        technologyTerms: structured.technologyTerms,
        businessFunctionTerms: structured.businessFunctionTerms,
        industryTerms: structured.industryTerms,
        activityTerms: structured.activityTerms,
      };
    })(),
    relatedCapabilities: [],
    topicProfile: buildTopicProfile(
      title,
      item.slug ?? "",
      deepAnalysis ? headings : [],
      deepAnalysis ? aliases : [],
      serviceType,
    ),
  };
}

export function buildSearchIndex(
  items: WordPressItem[],
): SuccessiveSearchDocument[] {
  // Deep cross-document analysis is valuable for focused datasets, but doing
  // it synchronously for the full WordPress corpus blocks the Node event loop.
  const deepAnalysis = items.length <= 250;
  const documents = items
    .map((item) => buildSearchDocument(item, deepAnalysis))
    .filter((doc) => doc.url && doc.title !== "Untitled");
  if (!deepAnalysis) return documents;
  const services = documents.filter((document) => document.role === "service");
  const meaningful = (terms: string[]) => new Set(
    terms.filter((term) => term.length > 3 && !GENERIC_RELATION_TERMS.has(term)),
  );
  const phrases = (document: SuccessiveSearchDocument) => {
    const source = normalizeSearchText([
      document.title,
      ...document.headings.slice(0, 10),
      ...document.descriptions.slice(0, 12),
    ].join(" ")).split(" ");
    const result = new Set<string>();
    for (const size of [2, 3]) {
      for (let index = 0; index <= source.length - size; index++) {
        const words = source.slice(index, index + size);
        if (words.some((word) => GENERIC_RELATION_TERMS.has(word) || word.length < 3)) continue;
        result.add(words.join(" "));
      }
    }
    return result;
  };
  const serviceProfiles = new Map(services.map((service) => {
    const problemOutcomeTerms = meaningful([
      ...service.capabilityProfile.problemTerms,
      ...service.capabilityProfile.outcomeTerms,
    ]);
    const taxonomyTerms = meaningful([
      ...service.capabilityProfile.industryTerms,
      ...service.capabilityProfile.businessFunctionTerms,
    ]);
    return [service.id, {
      service,
      phrases: phrases(service),
      terms: meaningful([
        ...service.capabilityProfile.identityTerms,
        ...service.capabilityProfile.problemTerms,
        ...service.capabilityProfile.outcomeTerms,
        ...service.capabilityProfile.technologyTerms,
        ...service.capabilityProfile.activityTerms,
      ]),
      technologyTerms: meaningful(service.capabilityProfile.technologyTerms),
      problemOutcomeTerms,
      taxonomyTerms,
      identity: ` ${service.normalizedTitle} ${service.aliases.join(" ")} `,
      path: normalizeSearchText(service.slug),
    }];
  }));
  const servicesByTerm = new Map<string, Set<number>>();
  serviceProfiles.forEach(({ terms }, serviceId) => {
    terms.forEach((term) => {
      const matches = servicesByTerm.get(term) ?? new Set<number>();
      matches.add(serviceId);
      servicesByTerm.set(term, matches);
    });
  });
  for (const document of documents) {
    if (document.role === "service") continue;
    const evidenceTerms = meaningful([
      ...document.capabilityProfile.identityTerms,
      ...document.capabilityProfile.problemTerms,
      ...document.capabilityProfile.outcomeTerms,
      ...document.capabilityProfile.technologyTerms,
      ...document.capabilityProfile.activityTerms,
    ]);
    const candidateIds = new Set<number>();
    evidenceTerms.forEach((term) =>
      servicesByTerm.get(term)?.forEach((serviceId) => candidateIds.add(serviceId)),
    );
    const documentPhrases = phrases(document);
    const documentTechnologyTerms = meaningful(document.capabilityProfile.technologyTerms);
    const documentProblemOutcomeTerms = meaningful([
      ...document.capabilityProfile.problemTerms,
      ...document.capabilityProfile.outcomeTerms,
    ]);
    const documentTaxonomyTerms = meaningful([
      ...document.capabilityProfile.industryTerms,
      ...document.capabilityProfile.businessFunctionTerms,
    ]);
    document.relatedCapabilities = [...candidateIds]
      .map((serviceId) => serviceProfiles.get(serviceId)!)
      .map(({ service, phrases: servicePhrases, terms: serviceTerms, technologyTerms, problemOutcomeTerms, taxonomyTerms, identity: serviceIdentity, path: servicePath }) => {
        const evidence: SuccessiveSearchDocument["relatedCapabilities"][number]["evidence"] = [];
        const documentIdentity = ` ${document.normalizedTitle} ${document.aliases.join(" ")} `;
        const explicitReference = service.aliases.some((alias) => alias.split(" ").length >= 2 && document.combinedText.includes(alias));
        if (explicitReference || documentIdentity.includes(` ${service.normalizedTitle} `)) evidence.push("explicit-reference");
        const linked = document.internalLinks.some((link) => {
          const normalizedLink = normalizeSearchText(link);
          return normalizedLink === servicePath || normalizedLink.endsWith(` ${servicePath}`);
        });
        if (linked) evidence.push("internal-link");
        const sharedPhrases = [...documentPhrases].filter((phrase) => servicePhrases.has(phrase));
        if (sharedPhrases.length >= 2) evidence.push("phrase");
        const technologyOverlap = [...documentTechnologyTerms]
          .filter((term) => technologyTerms.has(term));
        if (technologyOverlap.length && technologyOverlap.some((term) => serviceIdentity.includes(` ${term} `))) evidence.push("technology");
        const problemOutcomeOverlap = [...documentProblemOutcomeTerms]
          .filter((term) => problemOutcomeTerms.has(term));
        if (problemOutcomeOverlap.length >= 3) evidence.push("problem-outcome");
        const taxonomyOverlap = [...documentTaxonomyTerms]
          .filter((term) => taxonomyTerms.has(term));
        if (taxonomyOverlap.length >= 2) evidence.push("taxonomy");
        const distinctiveOverlap = [...evidenceTerms].filter((term) => serviceTerms.has(term));
        if (distinctiveOverlap.length >= 4) evidence.push("distinctive-concepts");
        let score = 0;
        if (evidence.includes("explicit-reference")) score += 0.48;
        if (evidence.includes("internal-link")) score += 0.42;
        if (evidence.includes("phrase")) score += Math.min(0.3, sharedPhrases.length * 0.06);
        if (evidence.includes("technology")) score += 0.25;
        if (evidence.includes("problem-outcome")) score += Math.min(0.22, problemOutcomeOverlap.length * 0.04);
        if (evidence.includes("taxonomy")) score += 0.12;
        if (evidence.includes("distinctive-concepts")) score += Math.min(0.16, distinctiveOverlap.length * 0.025);
        return { documentId: service.id, score: Math.min(1, Math.round(score * 1000) / 1000), evidence };
      })
      .filter((relation) => relation.score >= 0.42 && (
        relation.evidence.includes("explicit-reference") ||
        relation.evidence.includes("internal-link") ||
        relation.evidence.includes("technology") ||
        relation.evidence.length >= 2
      ))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }
  return documents;
}
