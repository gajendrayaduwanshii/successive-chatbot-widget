import { decodeEntities, htmlToText, safeHttpUrl } from "./html-utils";

export interface ExtractedAcfContent {
  textSegments: string[];
  headings: string[];
  descriptions: string[];
  faqItems: Array<{ question: string; answer: string }>;
  links: Array<{ title?: string; url: string }>;
  images: Array<{ url: string; alt?: string; title?: string }>;
}

const MEDIA_METADATA = new Set([
  "id",
  "filename",
  "filesize",
  "author",
  "uploaded_to",
  "date",
  "modified",
  "menu_order",
  "mime_type",
  "subtype",
  "width",
  "height",
  "sizes",
  "thumbnail-width",
  "thumbnail-height",
  "medium-width",
  "medium-height",
  "large-width",
  "large-height",
]);
const headingKey =
  /(title|heading|label|question|subtitle|sub_title|tab_title)/i;
const descriptionKey = /(description|content|answer|text|point|excerpt)/i;
const mediaKey = /(image|logo|icon|video|url|link|button)/i;

export function cleanText(value: string): string {
  let text = htmlToText(decodeEntities(value)).replace(/\s+/g, " ").trim();
  if (!text) return "";
  for (let size = 2; size <= Math.floor(text.length / 2); size++) {
    if (text.length % size === 0) {
      const phrase = text.slice(0, size);
      if (
        phrase.repeat(text.length / size).toLowerCase() === text.toLowerCase()
      ) {
        text = phrase.trim();
        break;
      }
    }
  }
  text = text.replace(/^(.{4,120}?)\1+$/i, "$1").trim();
  if (
    /^(screenshot|image)[-_ ]?from\b/i.test(text) ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(text)
  )
    return "";
  return text;
}

export function deduplicateSegments(segments: string[]): string[] {
  const result: string[] = [];
  for (const raw of segments) {
    const value = cleanText(raw);
    if (!value || !/[a-z]/i.test(value)) continue;
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (
      result.some((item) => {
        const other = item
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
        return (
          other === normalized ||
          (normalized.length > 35 &&
            (other.includes(normalized) || normalized.includes(other)))
        );
      })
    )
      continue;
    result.push(value);
  }
  return result;
}

export function segmentQuality(value: string): number {
  const text = cleanText(value);
  if (!text || !/[a-z]{3}/i.test(text)) return 0;
  let score = Math.min(100, 25 + text.length / 3);
  if (text.length < 12) score -= 25;
  if (/screenshot|filename|attachment|undefined|null/i.test(text)) score -= 45;
  if ((text.match(/[a-z]/gi)?.length ?? 0) / text.length < 0.45) score -= 35;
  return Math.max(0, Math.round(score));
}

export function extractAcfContent(value: unknown): ExtractedAcfContent {
  const headings: string[] = [],
    descriptions: string[] = [],
    textSegments: string[] = [];
  const links: ExtractedAcfContent["links"] = [],
    images: ExtractedAcfContent["images"] = [];
  const faqItems: ExtractedAcfContent["faqItems"] = [];

  const visit = (node: unknown, key = "") => {
    if (node == null || node === false || node === "") return;
    const lowerKey = key.toLowerCase();
    if (MEDIA_METADATA.has(lowerKey)) return;
    if (typeof node === "string") {
      const url = safeHttpUrl(node);
      if (url) {
        if (
          /image|logo|icon/i.test(key) ||
          /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(url)
        )
          images.push({ url });
        else links.push({ url });
        return;
      }
      const text = cleanText(node);
      if (!text || segmentQuality(text) < 20) return;
      textSegments.push(text);
      if (headingKey.test(key)) headings.push(text);
      if (descriptionKey.test(key)) descriptions.push(text);
      return;
    }
    if (typeof node === "number" || typeof node === "boolean") return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, key));
      return;
    }
    const record = node as Record<string, unknown>;
    const imageUrl = safeHttpUrl(record.url);
    if (
      imageUrl &&
      (mediaKey.test(key) || "alt" in record || "caption" in record)
    ) {
      images.push({
        url: imageUrl,
        alt: typeof record.alt === "string" ? cleanText(record.alt) : undefined,
        title:
          typeof record.title === "string"
            ? cleanText(record.title)
            : undefined,
      });
      for (const field of ["alt", "title", "caption", "description"])
        visit(record[field], field);
      return;
    }
    const linkUrl = safeHttpUrl(record.url);
    if (linkUrl && ("title" in record || /link|button/i.test(key))) {
      links.push({
        url: linkUrl,
        title:
          typeof record.title === "string"
            ? cleanText(record.title)
            : undefined,
      });
    }
    const question =
      typeof record.question === "string" ? cleanText(record.question) : "";
    const answer =
      typeof record.answer === "string" ? cleanText(record.answer) : "";
    if (
      question &&
      answer &&
      answer.toLowerCase() !== question.toLowerCase() &&
      segmentQuality(answer) >= 25
    ) {
      faqItems.push({ question, answer });
    }
    Object.entries(record).forEach(([childKey, child]) =>
      visit(child, childKey),
    );
  };
  visit(value);
  return {
    textSegments: deduplicateSegments(textSegments),
    headings: deduplicateSegments(headings),
    descriptions: deduplicateSegments(descriptions),
    faqItems: faqItems.filter(
      (faq, index, all) =>
        all.findIndex(
          (x) => x.question.toLowerCase() === faq.question.toLowerCase(),
        ) === index,
    ),
    links: links.filter(
      (link, index, all) => all.findIndex((x) => x.url === link.url) === index,
    ),
    images: images.filter(
      (image, index, all) =>
        all.findIndex((x) => x.url === image.url) === index,
    ),
  };
}
