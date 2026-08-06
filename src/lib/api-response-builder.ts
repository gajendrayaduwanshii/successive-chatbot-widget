import type { AssistantResponse } from "./llm/schemas";
import type { NormalizedContent } from "@/types/wordpress";

export function buildProductComparison(
  items: NormalizedContent[],
): AssistantResponse | null {
  const products = items
    .filter((item) => item.type === "product" && item.url)
    .slice(0, 6);
  if (products.length < 2) return null;

  return {
    answer: [
      "Here’s a comparison based only on the published Successive product content:",
      "",
      "| Product | Published overview |",
      "| --- | --- |",
      ...products.map(
        (item) =>
          `| [${escapeMarkdownTable(item.title)}](${item.url}) | ${escapeMarkdownTable(item.excerpt || item.plainText.slice(0, 260))} |`,
      ),
    ].join("\n"),
    cards: products.map((item) => ({
      type: "product",
      title: item.title,
      description: item.excerpt || item.plainText.slice(0, 220),
      url: item.url,
      image: item.image,
      badge: "product",
      service_type: item.service_type,
    })),
    suggestions: [
      "Explain Successive PRISM",
      "Show related case studies",
      "How can I request a demo?",
    ],
    sources: products.map((item) => ({
      title: item.title,
      url: item.url,
    })),
  };
}

export function buildContentDetail(
  items: NormalizedContent[],
  context: "product" | "about" = "product",
): AssistantResponse | null {
  const published = items.filter((item) => item.url && item.plainText);
  if (!published.length) return null;

  const primary = published[0];
  const overview = cleanApiText(
    primary.excerpt || primary.plainText.replace(primary.title, ""),
  );
  if (!overview) return null;

  return {
    answer: `## ${primary.title}\n\n${overview.slice(0, 1800)}`,
    cards: published.slice(0, 2).map((item) => ({
      type: mapCardType(item.type),
      title: item.title,
      description:
        item.excerpt ||
        cleanApiText(item.plainText.replace(item.title, "")).slice(0, 350),
      url: item.url,
      image: item.image,
      badge: item.type,
      service_type: item.service_type,
    })),
    suggestions:
      context === "about"
        ? [
            "What products does Successive offer?",
            "Show me Successive case studies",
            "How can I contact Successive?",
          ]
        : [
            "What products does Successive offer?",
            "Show related case studies",
            "How can I request a demo?",
          ],
    sources: published.slice(0, 2).map((item) => ({
      title: item.title,
      url: item.url,
    })),
  };
}

function mapCardType(
  type: string,
): "product" | "case-study" | "blog" | "event" | "page" {
  if (type === "product") return "product";
  if (type.includes("case")) return "case-study";
  if (type === "post") return "blog";
  if (type === "event") return "event";
  return "page";
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function cleanApiText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b\S+\.(?:png|jpe?g|gif|webp|svg|avif)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
