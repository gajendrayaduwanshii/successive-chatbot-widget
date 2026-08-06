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
  textSegments: string[];
  chunks: SuccessiveSearchChunk[];
  combinedText: string;
  url: string;
  image?: string;
  modified?: string;
  contentQuality: number;
  productLike: boolean;
  service_type?: string;
}

const rendered = (value: WordPressItem["title"] | WordPressItem["content"]) =>
  typeof value === "string" ? value : (value?.rendered ?? "");

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 320;

export function normalizeSearchText(value: string): string {
  return htmlToText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
): SuccessiveSearchDocument {
  const extracted = extractAcfContent(item.acf);
  const title = htmlToText(rendered(item.title)) || "Untitled";
  const editor = deduplicateSegments([
    ...htmlToParagraphs(rendered(item.excerpt)),
    ...htmlToParagraphs(rendered(item.content)),
  ]);
  const headings = deduplicateSegments(extracted.headings);
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
  const explicitAcronyms = [...headings, ...descriptions, ...textSegments]
    .flatMap((text) => text.match(/\b[A-Z]{3,6}\b/g) ?? [])
    .filter((value) => !["FAQ", "HTML", "HTTPS"].includes(value));
  const aliases = deduplicateSegments([
    normalizedTitle,
    normalizeSearchText(item.slug ?? ""),
    named ? `successive ${named}` : "",
    named ?? "",
    acronym.length >= 3 && acronym.length <= 6 ? acronym : "",
    ...explicitAcronyms,
  ]).map(normalizeSearchText);
  const fieldNames =
    item.acf && typeof item.acf === "object" && !Array.isArray(item.acf)
      ? Object.keys(item.acf).join(" ")
      : "";
  const combinedText = normalizeSearchText(
    [title, item.slug, ...headings, ...descriptions, ...textSegments].join(" "),
  );
  // Title/headings lead the first chunk, while every editor and recursive ACF
  // text segment remains searchable in the subsequent overlapping chunks.
  const chunks = buildSearchChunks(item.id, [
    title,
    ...headings,
    ...textSegments,
  ]);
  const productLike =
    item.type === "product" ||
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
    textSegments,
    chunks,
    combinedText,
    url: normalizeWordPressUrl(item.link ?? ""),
    image:
      normalizeWordPressUrl(featured ?? extracted.images[0]?.url ?? "") ||
      undefined,
    modified: item.modified ?? item.date,
    contentQuality,
    productLike,
    service_type: extractServiceType(item.acf),
  };
}

export function buildSearchIndex(
  items: WordPressItem[],
): SuccessiveSearchDocument[] {
  return items
    .map(buildSearchDocument)
    .filter((doc) => doc.url && doc.title !== "Untitled");
}
