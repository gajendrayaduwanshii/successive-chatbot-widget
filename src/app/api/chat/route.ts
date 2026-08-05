import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { corsHeaders } from "@/lib/cors";
import { greetingResponse, isGreeting } from "@/lib/conversation";
import { detectIntent } from "@/lib/intent-detector";
import { getEnv } from "@/lib/env";
import { fetchSuccessive } from "@/lib/successive-api";
import { getLLMProvider } from "@/lib/llm";
import { assistantResponseSchema } from "@/lib/llm/schemas";
import { rateLimit } from "@/lib/rate-limit";
import {
  canUseEnglishQueryDirectly,
  prepareEnglishQuery,
} from "@/lib/query-language";
import {
  buildSearchDocument,
  type SuccessiveSearchDocument,
} from "@/lib/search-index";
import { retrieveFromIndex } from "@/lib/search-retriever";
import type { NormalizedContent } from "@/types/wordpress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(2, "Please enter at least 2 characters.")
    .max(1000, "Please keep your message under 1,000 characters."),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
  sessionId: z.string().max(100).optional(),
});
const error = (
  status: number,
  code: string,
  message: string,
  headers: Record<string, string>,
) =>
  NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers },
  );

export async function OPTIONS(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  if (!cors.isAllowed)
    return error(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed.",
      cors.headers,
    );
  return new NextResponse(null, { status: 204, headers: cors.headers });
}
export async function POST(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  if (!cors.isAllowed)
    return error(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed.",
      cors.headers,
    );
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const limit = rateLimit(ip);
  if (!limit.allowed)
    return error(
      429,
      "RATE_LIMITED",
      "Too many messages. Please wait a moment and try again.",
      { ...cors.headers, "Retry-After": String(limit.retryAfter) },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(
      400,
      "INVALID_REQUEST",
      "Please send a valid JSON request.",
      cors.headers,
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success)
    return error(
      400,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Invalid request.",
      cors.headers,
    );
  if (isGreeting(parsed.data.message)) {
    return NextResponse.json(
      { success: true, data: greetingResponse() },
      { headers: { ...cors.headers, "Cache-Control": "no-store" } },
    );
  }
  let preparedQuery;
  if (canUseEnglishQueryDirectly(parsed.data.message)) {
    preparedQuery = prepareEnglishQuery(parsed.data.message);
  } else {
    try {
      preparedQuery = await getLLMProvider().prepareMultilingualQuery(
        parsed.data.message,
      );
    } catch {
      if (!getEnv().AI_API_KEY) {
        return error(
          503,
          "AI_NOT_CONFIGURED",
          "The AI provider is not configured. Add AI_API_KEY to the server environment and restart the application.",
          cors.headers,
        );
      }
      return error(
        503,
        "AI_TRANSLATION_UNAVAILABLE",
        "The query language could not be processed safely. Please try again.",
        cors.headers,
      );
    }
  }
  const effectiveMessage = preparedQuery.englishQuery;
  const intent = detectIntent(effectiveMessage);
  // Contact is a deterministic navigation intent. Fetch only the published
  // Contact Us page and return one API-backed card; never run broad retrieval
  // that can mix in unrelated posts, case studies, or privacy content.
  if (intent === "contact") {
    try {
      const item = (await fetchSuccessive("/pages/contact-us"))[0];
      if (!item) throw new Error("Contact page is unavailable");
      const document = buildSearchDocument(item);
      const description =
        document.textSegments.find(
          (segment) => segment.toLowerCase() !== document.title.toLowerCase(),
        ) ?? "Open the official Successive Contact Us page.";
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: buildContactAnswer(
              preparedQuery.contactAnswer,
              document.url,
              description,
            ),
            cards: [
              {
                type: "page",
                title: document.title,
                description,
                url: document.url,
                image: document.image,
                badge: "page",
              },
            ],
            sources: [],
            suggestions: [],
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    } catch {
      return error(
        503,
        "CONTENT_UNAVAILABLE",
        "Successive’s contact page is temporarily unavailable.",
        cors.headers,
      );
    }
  }
  // Collection-specific branches below are retained for compatibility with a
  // custom WordPress namespace. Successive's standard wp/v2 API is searched
  // through the complete posts/pages index instead.
  const usesCustomContentNamespace =
    !getEnv().SUCCESSIVE_API_BASE_URL.includes("/wp-json/wp/v2");
  if (usesCustomContentNamespace && /\bproducts?\b/i.test(effectiveMessage)) {
    try {
      const [listingItems, productItems] = await Promise.all([
        fetchSuccessive("/pages/products"),
        fetchSuccessive("/content?type=product&per_page=100"),
      ]);
      const listing = listingItems[0]
        ? buildSearchDocument(listingItems[0])
        : undefined;
      const products = productItems
        .filter((item) => item.type === "product")
        .map(buildSearchDocument)
        .sort(
          (a, b) => Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""),
        )
        .slice(0, 5);
      if (!listing || !products.length) {
        throw new Error("Product collection is unavailable");
      }
      const documents = [listing, ...products];
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: await buildCollectionStory(
              "products",
              { title: listing.title, url: listing.url },
              products,
              effectiveMessage,
              preparedQuery.responseLanguage,
              preparedQuery.fallbackAnswer,
              parsed.data.history,
            ),
            cards: documents.map((document, index) => ({
              type: index === 0 ? "page" : "product",
              title: document.title,
              description: (
                document.descriptions[0] ??
                document.textSegments[0] ??
                document.title
              ).slice(0, 500),
              url: document.url,
              image: document.image,
              badge: index === 0 ? "products" : "product",
            })),
            sources: documents.map((document) => ({
              title: document.title,
              url: document.url,
            })),
            suggestions: [],
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    } catch {
      return error(
        503,
        "CONTENT_UNAVAILABLE",
        "Successive’s product collection is temporarily unavailable.",
        cors.headers,
      );
    }
  }
  // Case-study collection requests must never fall through to keyword-based
  // global retrieval, where blog posts mentioning "case studies" can outrank
  // the actual collection. Return the listing page followed by the five most
  // recently modified published case studies.
  if (
    usesCustomContentNamespace &&
    intent === "case_studies" &&
    /\bcase\s+stud(?:y|ies)\b/i.test(effectiveMessage)
  ) {
    try {
      const [listingItems, caseStudyItems] = await Promise.all([
        fetchSuccessive("/pages/case-studies"),
        fetchSuccessive("/content?type=case-studies&per_page=100"),
      ]);
      const listing = listingItems[0]
        ? buildSearchDocument(listingItems[0])
        : undefined;
      const caseStudies = caseStudyItems
        .filter((item) => item.type?.includes("case"))
        .map(buildSearchDocument)
        .sort(
          (a, b) => Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""),
        )
        .slice(0, 5);
      if (!listing || !caseStudies.length) {
        throw new Error("Case-study collection is unavailable");
      }
      const documents = [listing, ...caseStudies];
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: await buildCollectionStory(
              "case studies",
              { title: listing.title, url: listing.url },
              caseStudies,
              effectiveMessage,
              preparedQuery.responseLanguage,
              preparedQuery.fallbackAnswer,
              parsed.data.history,
            ),
            cards: documents.map((document, index) => ({
              type: index === 0 ? "page" : "case-study",
              title: document.title,
              description: (
                document.descriptions[0] ??
                document.textSegments[0] ??
                document.title
              ).slice(0, 500),
              url: document.url,
              image: document.image,
              badge: index === 0 ? "case studies" : "case study",
            })),
            sources: documents.map((document) => ({
              title: document.title,
              url: document.url,
            })),
            suggestions: [],
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    } catch {
      return error(
        503,
        "CONTENT_UNAVAILABLE",
        "Successive’s case-study collection is temporarily unavailable.",
        cors.headers,
      );
    }
  }
  // A request for blogs means the published collection, not a keyword search
  // for the word "blog". This also handles conversational multilingual queries
  // asking for information about the published blog collection.
  if (intent === "blogs" && /\bblogs?\b/i.test(effectiveMessage)) {
    try {
      const [listingItems, postItems] = await Promise.all([
        fetchSuccessive("/pages/blog").catch(() => []),
        fetchSuccessive("/content?type=post&per_page=100"),
      ]);
      const listing = listingItems[0]
        ? buildSearchDocument(listingItems[0])
        : undefined;
      const posts = postItems
        .filter((item) => item.type === "post")
        .map(buildSearchDocument)
        .sort(
          (a, b) => Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""),
        )
        .slice(0, 5);
      if (!posts.length) throw new Error("Blog collection is unavailable");
      const listingCard = listing
        ? {
            type: "page" as const,
            title: listing.title,
            description: (
              listing.descriptions[0] ??
              listing.textSegments[0] ??
              listing.title
            ).slice(0, 500),
            url: listing.url,
            image: listing.image,
            badge: "blogs",
          }
        : {
            type: "page" as const,
            title: "Blogs",
            description: "Explore Successive's published blog articles.",
            url: `${getEnv().SUCCESSIVE_PUBLIC_SITE_URL.replace(/\/$/, "")}/blog/`,
            badge: "blogs",
          };
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: await buildCollectionStory(
              "blogs",
              { title: listingCard.title, url: listingCard.url },
              posts,
              effectiveMessage,
              preparedQuery.responseLanguage,
              preparedQuery.fallbackAnswer,
              parsed.data.history,
            ),
            cards: [
              listingCard,
              ...posts.map((document) => ({
                type: "blog" as const,
                title: document.title,
                description: (
                  document.descriptions[0] ??
                  document.textSegments[0] ??
                  document.title
                ).slice(0, 500),
                url: document.url,
                image: document.image,
                badge: "blog",
              })),
            ],
            sources: [
              { title: listingCard.title, url: listingCard.url },
              ...posts.map((document) => ({
                title: document.title,
                url: document.url,
              })),
            ],
            suggestions: [],
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    } catch {
      return error(
        503,
        "CONTENT_UNAVAILABLE",
        "Successive’s blog collection is temporarily unavailable.",
        cors.headers,
      );
    }
  }
  try {
    const retrieval = await retrieveFromIndex(effectiveMessage);
    if (!retrieval.reliableMatchFound) {
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: buildHelpfulFallback(preparedQuery.fallbackAnswer),
            cards: [],
            sources: [],
            suggestions: [],
            confidence: "low",
            insufficientContext: true,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    const topScore = retrieval.matches[0]?.score ?? 0;
    // Retrieval already returns the globally ranked Top 5. Do not narrow that
    // set again here: every selected chunk must reach the grounded LLM prompt.
    const selectedMatches = retrieval.matches;
    const context: NormalizedContent[] = selectedMatches.map(
      ({ document, selectedPassages }) => ({
        id: document.id,
        type: document.type,
        slug: document.slug,
        title: document.title,
        excerpt: document.descriptions[0] ?? selectedPassages[0] ?? "",
        plainText: selectedPassages.join("\n\n"),
        url: document.url,
        image: document.image,
        modified: document.modified,
        acfText: "",
        extractedUrls: [],
      }),
    );
    let response;
    if (!getEnv().AI_API_KEY) {
      return error(
        503,
        "AI_NOT_CONFIGURED",
        "The AI provider is not configured. Add AI_API_KEY to the server environment and restart the application.",
        cors.headers,
      );
    }
    try {
      response = await getLLMProvider().generateStructuredResponse({
        message: effectiveMessage,
        responseLanguage: preparedQuery.responseLanguage,
        fallbackAnswer: preparedQuery.fallbackAnswer,
        history: parsed.data.history.slice(-10),
        context,
      });
    } catch {
      return error(
        503,
        "AI_RESPONSE_UNAVAILABLE",
        "A verified answer could not be generated from the published Successive content. Please try again.",
        cors.headers,
      );
    }
    const validated = assistantResponseSchema.safeParse(response);
    if (!validated.success) {
      return error(
        503,
        "INVALID_AI_RESPONSE",
        "The generated answer could not be safely validated. Please try again.",
        cors.headers,
      );
    }
    response = {
      ...validated.data,
      answer: ensureDescriptiveGroundedAnswer(
        validated.data.answer,
        selectedMatches,
      ),
      cards: selectedMatches.map(({ document, selectedPassages }) => ({
        type: cardType(document.type),
        title: document.title,
        description:
          document.descriptions[0] ?? selectedPassages[0] ?? document.title,
        url: document.url,
        image: document.image,
        badge: document.type,
      })),
      sources: selectedMatches.map(({ document }) => ({
        title: document.title,
        url: document.url,
      })),
      confidence: topScore >= 100 ? "high" : "medium",
      insufficientContext: false,
    };
    return NextResponse.json(
      { success: true, data: response },
      { headers: { ...cors.headers, "Cache-Control": "no-store" } },
    );
  } catch {
    return error(
      503,
      "CONTENT_UNAVAILABLE",
      "Successive’s content service is temporarily unavailable. Please try again shortly.",
      cors.headers,
    );
  }
}

function cardType(
  type: string,
): "product" | "case-study" | "blog" | "event" | "page" {
  if (type === "product") return "product";
  if (type.includes("case")) return "case-study";
  if (type === "post") return "blog";
  if (type === "event") return "event";
  return "page";
}

function buildHelpfulFallback(localizedFallback: string): string {
  const site = getEnv().SUCCESSIVE_PUBLIC_SITE_URL.replace(/\/$/, "");
  return `${localizedFallback} Try searching the [Successive website](${site}/?s=) or explore [Successive services](${site}/digital-transformation-services/) for more context.`;
}

function buildContactAnswer(
  localizedAnswer: string,
  url: string,
  description: string,
): string {
  const link = `[Contact Us](${url})`;
  const linkedAnswer = /contact us/i.test(localizedAnswer)
    ? localizedAnswer.replace(/contact us/i, link)
    : `${localizedAnswer} ${link}`;
  const supportingDetail = cleanStoryDescription(description);
  return `${linkedAnswer}\n\n${supportingDetail}`;
}

async function buildCollectionStory(
  label: string,
  listing: { title: string; url: string },
  items: SuccessiveSearchDocument[],
  message: string,
  responseLanguage: string,
  fallbackAnswer: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (getEnv().AI_API_KEY) {
    const context = items.map((document) => ({
      id: document.id,
      type: document.type,
      slug: document.slug,
      title: document.title,
      excerpt: document.descriptions[0] ?? document.textSegments[0] ?? "",
      plainText: document.textSegments.slice(0, 3).join("\n\n"),
      url: document.url,
      image: document.image,
      modified: document.modified,
      acfText: "",
      extractedUrls: [],
    }));
    const prompts = [
      message,
      `${message}\n\nOrganize the answer into two or three meaningful thematic sections derived from the supplied Successive content. Create conceptual headings that describe shared capabilities, topics, applications, or outcomes. Synthesize related items inside those sections with natural inline links. Do not make every page title its own section and do not use a repeated title-description catalogue pattern.`,
    ];
    for (const generationPrompt of prompts) {
      try {
        const generated = await getLLMProvider().generateStructuredResponse({
          message: generationPrompt,
          responseLanguage,
          fallbackAnswer,
          history: history.slice(-10),
          context,
        });
        if (isSubstantialCollectionAnswer(generated.answer, label, items)) {
          return generated.answer;
        }
      } catch {
        // Retry once with explicit thematic-section guidance.
      }
    }
  }
  const entries = items.map((item) => {
    const description = cleanStoryDescription(
      item.descriptions[0] ??
        item.textSegments[0] ??
        "Open the corresponding published Successive page for more information.",
    );
    const ending = /[.!?…]$/.test(description) ? "" : ".";
    return `**[${item.title.replace(/[\[\]]/g, "")}](${item.url})**\n\n${description}${ending}`;
  });
  const heading = label
    .split(" ")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
  return `**Successive ${heading}**\n\nSuccessive’s published ${label} show how its capabilities, ideas, and real-world work address enterprise needs.\n\n${entries.join("\n\n")}\n\nTogether, these sources provide a connected view of Successive’s approach. Continue exploring on the [${listing.title.replace(/[\[\]]/g, "")}](${listing.url}) page.`;
}

function isSubstantialCollectionAnswer(
  answer: string,
  label: string,
  items: SuccessiveSearchDocument[],
): boolean {
  const sentences = answer.match(/[^.!?]+[.!?]+/g)?.length ?? 0;
  const hasOfficialInlineLink = /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(answer);
  const sectionHeadings =
    answer.match(/^(?:#{1,3}\s+(.+)|\*\*([^*]+)\*\*)$/gm) ?? [];
  const itemTitles = new Set(
    items
      .map((item) => normalizeHeading(item.title))
      .concat([
        normalizeHeading(`Successive ${label}`),
        normalizeHeading(label),
      ]),
  );
  const hasThematicHeading = sectionHeadings.some(
    (heading) => !itemTitles.has(normalizeHeading(heading)),
  );
  return (
    answer.trim().length >= 240 &&
    sentences >= 2 &&
    hasOfficialInlineLink &&
    sectionHeadings.length >= 2 &&
    hasThematicHeading
  );
}

function normalizeHeading(value: string): string {
  return value
    .replace(/^#{1,3}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ensureDescriptiveGroundedAnswer(
  answer: string,
  matches: Array<{
    document: SuccessiveSearchDocument;
    selectedPassages: string[];
  }>,
): string {
  const sentences = answer.match(/[^.!?]+[.!?]+/g)?.length ?? 0;
  if (answer.trim().length >= 180 && sentences >= 2) return answer;

  const details = matches.slice(0, 2).map(({ document, selectedPassages }) => {
    const description = cleanStoryDescription(
      document.descriptions[0] ?? selectedPassages[0] ?? document.title,
    );
    return `[${document.title.replace(/[\[\]]/g, "")}](${document.url}) provides additional context: ${description}`;
  });
  return details.length ? `${answer.trim()}\n\n${details.join(" ")}` : answer;
}

function cleanStoryDescription(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 240) return clean;
  const shortened = clean.slice(0, 240);
  const sentenceEnd = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf("? "),
  );
  if (sentenceEnd >= 100) return shortened.slice(0, sentenceEnd + 1);
  const lastWord = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastWord > 0 ? lastWord : 240)}…`;
}
