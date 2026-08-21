import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { corsHeaders } from "@/lib/cors";
import {
  greetingResponse,
  isGenericHelpRequest,
  isGreeting,
} from "@/lib/conversation";
import { detectIntent } from "@/lib/intent-detector";
import { getEnv } from "@/lib/env";
import { fetchAllPublishedContent, fetchSuccessive } from "@/lib/successive-api";
import { getContentLoadDiagnostics } from "@/lib/successive-api";
import { getLLMProvider } from "@/lib/llm";
import { assistantResponseSchema } from "@/lib/llm/schemas";
import { rateLimit } from "@/lib/rate-limit";
import {
  canUseEnglishQueryDirectly,
  prepareEnglishQuery,
} from "@/lib/query-language";
import {
  buildSearchDocument,
  buildSearchIndex,
  normalizeSearchText,
  type SuccessiveSearchDocument,
} from "@/lib/search-index";
import {
  isBroadAiServicesQuery,
  isUseCaseQuery,
  getIndexDiagnostics,
  retrieveFromIndex,
  cardEligibility,
  type SearchMatch,
} from "@/lib/search-retriever";
import type { NormalizedContent } from "@/types/wordpress";
import { sanitizeGroundedAnswerOpening } from "@/lib/response-format";
import { extractPublishedContactDetails } from "@/lib/contact-details";
import {
  careerJobSummary,
  careerJobUrl,
  careersPageUrl,
  fetchActiveCareerJobs,
  filterCareerJobs,
  isCareerOpeningQuery,
} from "@/lib/careers-api";
import {
  asksForAnotherResult,
  buildConversationRetrievalQuery,
  buildRelatedServiceRetrievalQuery,
  contentIdentitiesFromAssistantHistory,
  contentIdentity,
  isVagueBusinessDiscovery,
  shouldDeduplicateDiscoveryResults,
  resolveOfferedResourceFollowUp,
  resolveUnsupportedAlternativeFollowUp,
  rejectsPendingAlternative,
  resolveStructuredFollowUpMessage,
} from "@/lib/conversation-context";
import {
  buildDeterministicUnderstanding,
  resolveConversationUnderstanding,
  isDeterministicallyOffTopic,
  applyStructuralBroadQueryRules,
  shouldUseSemanticUnderstanding,
  buildRetrievalQuery,
  isExplicitListRequest,
  type QueryUnderstanding,
} from "@/lib/query-understanding";
import { extractQueryFacets, inferQueryRelation } from "@/lib/query-facets";
import {
  answerStructuredRequest,
  availableClientSuggestionActions,
  classifyClientIntent,
  clientOverviewFallback,
  extractPublishedClientTotal,
  extractTrustedOrganizations,
  understandStructuredRequest,
  type StructuredRequest,
} from "@/lib/structured-knowledge";
import { recoverAuthoritativeEvidence, safeEvidenceResponse, safeUnsupportedQueryResponse, validateEvidence } from "@/lib/evidence-validation";
import { alignedCta, selectAlignedSecondaryMatches } from "@/lib/response-alignment";
import { buildCategoryNavigationActions, buildGlobalRelatedContentActions, buildIndividualPageNavigationActions, buildFollowUpQueryActions, classifySuggestionContext, resolveEligibleActionDocuments, resolveSuggestionAction, type SuggestionContextType } from "@/lib/suggestion-actions";

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
  suggestionAction: z.object({
    id: z.string().min(1).max(80),
    intent: z.enum(["CUSTOMER_WORK_DISCOVERY", "CONTENT_DISCOVERY", "PUBLIC_ORGANIZATION_OVERVIEW", "FOLLOW_UP_QUERY"]),
    contentType: z.enum(["case-study", "customer-work"]).optional(),
    targetContentType: z.string().min(1).max(80).optional(),
    subject: z.string().min(1).max(200).optional(),
    contextType: z.enum(["TOPIC_CONTEXT", "INDIVIDUAL_PAGE_CONTEXT", "CATEGORY_LISTING_CONTEXT"]).optional(),
    sourcePageRole: z.string().min(1).max(80).optional(),
    targetResourceId: z.string().min(3).max(100).optional(),
    targetUrl: z.string().url().optional(),
    relationType: z.enum(["PARENT", "CHILD", "SIBLING", "SAME_SECTION", "SAME_PAGE_GROUP", "DIRECTLY_CONNECTED"]).optional(),
    sourceContext: z.string().max(80).optional(),
    topic: z.string().max(200).optional(),
    entity: z.string().max(200).optional(),
    relation: z.enum(["ANSWER_EVIDENCE", "RELATED_TO_SOURCE", "COLLECTION_MEMBER", "CUSTOMER_WORK", "PUBLIC_ORGANIZATIONS"]).optional(),
    resultKeys: z.array(z.string().min(3).max(100)).max(6).optional(),
    sourceResource: z.string().url().optional(),
    query: z.string().min(2).max(300).optional(),
  }).optional(),
  seenContent: z
    .array(
      z.object({
        title: z.string().trim().max(300),
        url: z.string().url().max(2000),
      }),
    )
    .max(500)
    .optional()
    .default([]),
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

let suggestionCorpusCache: { loadedAt: number; documents: SuccessiveSearchDocument[] } | undefined;
async function getSuggestionCorpus(): Promise<SuccessiveSearchDocument[]> {
  if (suggestionCorpusCache && Date.now() - suggestionCorpusCache.loadedAt < 5 * 60_000)
    return suggestionCorpusCache.documents;
  const documents = buildSearchIndex(await fetchAllPublishedContent());
  suggestionCorpusCache = { loadedAt: Date.now(), documents };
  return documents;
}

async function buildResolvedNavigationActions({ document, subject, contextType, excludedResultKeys = [] }: {
  document: SuccessiveSearchDocument;
  subject?: string;
  contextType: Exclude<SuggestionContextType, "TOPIC_CONTEXT" | "OTHER_CONTEXT">;
  excludedResultKeys?: string[];
}) {
  const corpus = await getSuggestionCorpus();
  const source = corpus.find((candidate) => candidate.id === document.id && candidate.type === document.type) ??
    corpus.find((candidate) => candidate.url.replace(/\/$/, "") === document.url.replace(/\/$/, "")) ?? document;
  return contextType === "CATEGORY_LISTING_CONTEXT"
    ? buildCategoryNavigationActions({ source, corpus, excludedResultKeys, limit: 3 })
    : buildIndividualPageNavigationActions({ source, corpus, userSubject: subject ?? source.title,
        excludedResultKeys, limit: 3 });
}

async function fetchStructuredItems(request: StructuredRequest) {
  if (request.attribute === "employee_policy") {
    const [culture, careers] = await Promise.all([
      fetchSuccessive("/pages/our-culture"),
      fetchSuccessive("/pages/careers"),
    ]);
    return [...culture, ...careers];
  }
  if (request.attribute === "company_location") {
    const [about, contact] = await Promise.all([
      fetchSuccessive("/pages/about-us"),
      fetchSuccessive("/pages/contact"),
    ]);
    return [...about, ...contact];
  }
  const pageSlug = request.attribute === "capabilities" || request.attribute === "technologies"
    ? "global-capabilities"
    : request.attribute === "partners"
      ? "partners"
      : request.attribute === "culture"
        ? "our-culture"
        : request.attribute === "career_benefits"
          ? "careers"
          : request.attribute === "awards"
            ? "awards"
            : "about-us";
  const pageItems = await fetchSuccessive(`/pages/${pageSlug}`);
  if (request.attribute !== "awards" || request.mode !== "latest") return pageItems;
  const awards = await fetchSuccessive("/content?type=award&per_page=100");
  return [...pageItems, ...awards];
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);
  const isSameOrigin = origin === new URL(request.url).origin;
  if (!cors.isAllowed && !isSameOrigin)
    return error(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed.",
      cors.headers,
    );
  return new NextResponse(null, { status: 204, headers: cors.headers });
}
export async function POST(request: NextRequest) {
  const requestStartedAt = performance.now();
  let understandingDurationMs = 0;
  let retrievalDurationMs = 0;
  let finalLlmDurationMs = 0;
  let contextConstructionDurationMs = 0;
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);
  const isSameOrigin = origin === new URL(request.url).origin;
  if (!cors.isAllowed && !isSameOrigin)
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
  const limit = rateLimit(`${ip}:${parsed.data.sessionId ?? "anonymous"}`);
  if (!limit.allowed)
    return error(
      429,
      "RATE_LIMITED",
      "Too many messages. Please wait a moment and try again.",
      { ...cors.headers, "Retry-After": String(limit.retryAfter) },
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
  const lastAssistantContent = [...parsed.data.history].reverse()
    .find((item) => item.role === "assistant")?.content ?? "";
  const groundedTitleFromHistory = lastAssistantContent.match(
    /\[([^\]]{2,200})\]\(https?:\/\/[^)]+\)\s+provides additional context/i,
  )?.[1]?.trim();
  const legacyActionTopic = parsed.data.suggestionAction?.intent === "FOLLOW_UP_QUERY" &&
    !parsed.data.suggestionAction.topic
    ? groundedTitleFromHistory ?? parsed.data.seenContent.at(-1)?.title
    : undefined;
  const resolvedSuggestionAction = parsed.data.suggestionAction
    ? { ...parsed.data.suggestionAction, topic: parsed.data.suggestionAction.topic ?? legacyActionTopic }
    : undefined;
  const actionMessage = resolveSuggestionAction(resolvedSuggestionAction);
  const effectiveMessage = actionMessage ?? resolveUnsupportedAlternativeFollowUp(
    preparedQuery.englishQuery,
    parsed.data.history,
  ) ?? resolveOfferedResourceFollowUp(
    preparedQuery.englishQuery,
    parsed.data.history,
  ) ?? resolveStructuredFollowUpMessage(preparedQuery.englishQuery, parsed.data.history)
    ?? preparedQuery.englishQuery;
  const followUpActions = (labels: string[], topic?: string) => {
    const excluded = new Set([
      normalizeSearchText(effectiveMessage),
      normalizeSearchText(parsed.data.suggestionAction?.query ?? ""),
    ].filter(Boolean));
    return buildFollowUpQueryActions(labels.filter((label) => !excluded.has(normalizeSearchText(label))), 3, topic);
  };

  if (parsed.data.suggestionAction?.intent === "CONTENT_DISCOVERY" && parsed.data.suggestionAction.resultKeys?.length) {
    try {
      const documents = await getSuggestionCorpus();
      const eligible = resolveEligibleActionDocuments(parsed.data.suggestionAction, documents);
      if (eligible.length) {
        const presented = eligible.slice(0, 3);
        const nextActions = parsed.data.suggestionAction.contextType === "INDIVIDUAL_PAGE_CONTEXT"
          ? buildIndividualPageNavigationActions({ source: presented[0]!, corpus: documents,
              userSubject: parsed.data.suggestionAction.subject ?? parsed.data.suggestionAction.topic,
              excludedResultKeys: [parsed.data.suggestionAction.sourceContext ?? ""], limit: 3 })
          : parsed.data.suggestionAction.contextType === "CATEGORY_LISTING_CONTEXT"
            ? buildCategoryNavigationActions({ source: presented[0]!, corpus: documents,
                excludedResultKeys: [parsed.data.suggestionAction.sourceContext ?? ""], limit: 3 })
          : buildGlobalRelatedContentActions({ source: presented[0]!, corpus: documents,
              userSubject: parsed.data.suggestionAction.subject ?? parsed.data.suggestionAction.topic ?? presented[0]!.title,
              recentActionIds: [parsed.data.suggestionAction.id], limit: 3 });
        const answer = presented.map((document) => {
          const details = [...new Set([...document.descriptions, ...document.textSegments])]
            .filter((value) => normalizeSearchText(value) !== document.normalizedTitle)
            .slice(0, 3).join("\n\n") || document.title;
          return `## ${document.title}\n\n${details}\n\n[Read more](${document.url})`;
        }).join("\n\n");
        return NextResponse.json({ success: true, data: {
          answer,
          cards: presented.map((document) => ({ type: cardType(document.type), title: document.title,
            description: document.descriptions[0] ?? document.textSegments[0] ?? document.title,
            url: document.url, image: document.image, badge: document.role.replace(/_/g, " ") })),
          sources: presented.map((document) => ({ title: document.title, url: document.url })),
          suggestions: nextActions.map((action) => action.label), suggestionActions: nextActions,
          confidence: "high", insufficientContext: false,
        }}, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
      }
    } catch {
      // A changed/unavailable corpus must never fall through to raw label search.
    }
    return NextResponse.json({ success: true, data: {
      answer: "That published item is no longer available in the current Successive content collection.",
      cards: [], sources: [], suggestions: [], suggestionActions: [], confidence: "low", insufficientContext: true,
    }}, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
  }

  const clientIntent = classifyClientIntent(effectiveMessage);
  if (clientIntent === "public_work") {
    try {
      const documents = (await fetchAllPublishedContent()).map((item) => buildSearchDocument(item));
      const directCustomerWork = documents.filter((document) => {
        if (parsed.data.suggestionAction?.contentType === "case-study") return document.role === "case_study";
        if (document.role === "case_study") return true;
        if (!["blog", "editorial", "press_release", "resource", "product"].includes(document.role)) return false;
        const identity = normalizeSearchText(`${document.title} ${document.headings.slice(0, 4).join(" ")}`);
        return /\b(?:customer|client)\b.*\b(?:story|success|project|work|case study|collaborat)|\b(?:story|success|project|work|case study|collaborat)\b.*\b(?:customer|client)\b/.test(identity);
      }).sort((left, right) => {
        const rolePriority = (role: SuccessiveSearchDocument["role"]) => role === "case_study" ? 3 : role === "press_release" ? 2 : 1;
        return rolePriority(right.role) - rolePriority(left.role) || right.contentQuality - left.contentQuality;
      });
      const presented = directCustomerWork.slice(0, 3);
      if (presented.length) {
        const answer = [
          "Here are published examples of Successive’s customer work. These are public case studies or customer stories; they do not establish that the organizations involved are current active clients.",
          ...presented.map((document) => `- [${document.title}](${document.url}) — ${document.descriptions[0] ?? document.textSegments[0] ?? "Published customer evidence."}`),
        ].join("\n\n");
        return NextResponse.json({ success: true, data: {
          answer,
          cards: presented.map((document) => ({ type: cardType(document.type), title: document.title,
            description: document.descriptions[0] ?? document.textSegments[0] ?? document.title,
            url: document.url, image: document.image, badge: document.role.replace(/_/g, " ") })),
          sources: presented.map((document) => ({ title: document.title, url: document.url })),
          suggestions: [], suggestionActions: [],
          confidence: "high", insufficientContext: false,
        }}, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
      }
    } catch {
      // Continue through shared evidence retrieval if the corpus is unavailable.
    }
  }
  if (["overview", "current", "count", "confidential"].includes(clientIntent ?? "")) {
    if (clientIntent === "confidential") {
      return NextResponse.json({ success: true, data: {
        answer: "I can’t verify or disclose confidential, NDA-covered, or unannounced client relationships. I can instead show publicly showcased organizations or published customer work.",
        cards: [], sources: [], suggestions: [], suggestionActions: [],
        confidence: "high", insufficientContext: true,
      }}, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
    }
    try {
      const items = await fetchAllPublishedContent();
      const trusted = extractTrustedOrganizations(items);
      if (trusted?.organizations.length) {
        const visible = trusted.organizations;
        const shown = visible.slice(0, /\b(?:all|complete|full)\b/i.test(effectiveMessage) ? visible.length : 10);
        const list = shown.map((name) => `- ${name}`).join("\n");
        const homepageUrl = trusted.source.link ?? getEnv().SUCCESSIVE_PUBLIC_SITE_URL;
        const remainingLink = shown.length < visible.length
          ? `\n\n[View all publicly showcased organizations on the Successive homepage](${homepageUrl})`
          : "";
        const total = extractPublishedClientTotal(items);
        const deterministicAnswer = clientIntent === "current"
          ? `Successive’s public website currently showcases these organizations, but it does not confirm which are current active clients:\n\n${list}${shown.length < visible.length ? `\n\nShowing ${shown.length} of ${visible.length} publicly showcased organizations.${remainingLink}` : ""}`
          : clientIntent === "count"
            ? total
              ? `Successive’s published company information states that it serves **${total} enterprise clients worldwide**. Separately, the homepage currently showcases **${visible.length} organizations** in its trusted-logo collection; that logo count is not the total client count.`
              : `The homepage currently showcases **${visible.length} organizations**, but that logo count is not identified as Successive’s total client count.`
            : `${clientOverviewFallback(effectiveMessage)}\n\n${list}${shown.length < visible.length ? `\n\nShowing ${shown.length} of ${visible.length} publicly showcased organizations.${remainingLink}` : ""}`;
        let answer = deterministicAnswer;
        const suggestionActions = availableClientSuggestionActions(items);
        if (clientIntent === "overview" && getEnv().AI_API_KEY) {
          try {
            const generated = await getLLMProvider().generateStructuredResponse({
              message: `Answer this visitor question: ${effectiveMessage}\nWrite a natural, positive 2-4 sentence introduction before the organization list. Adapt the wording to the exact question and validated organization evidence. For a generic client/customer question, answer directly and do not introduce current/active-status limitations the visitor did not ask about. Do not mention the homepage, website, source, or link in the introduction because the source link is presented separately. Do not write the list, links, headings, sources, or unsupported relationship claims.`,
              responseLanguage: preparedQuery.responseLanguage,
              fallbackAnswer: clientOverviewFallback(effectiveMessage),
              history: parsed.data.history.slice(-6),
              context: [{ id: trusted.source.id, type: trusted.source.type ?? "page", slug: trusted.source.slug ?? "",
                title: typeof trusted.source.title === "string" ? trusted.source.title : trusted.source.title?.rendered ?? "Successive Digital",
                excerpt: "Structured trusted-organization evidence from the canonical public homepage.",
                plainText: `The canonical public homepage structured trusted-logo collection currently showcases: ${visible.join(", ")}. This proves only that these organizations are publicly showcased. It does not prove current active-client status, a project, contract, service usage, or partnership.`,
                url: trusted.source.link ?? getEnv().SUCCESSIVE_PUBLIC_SITE_URL, acfText: "", extractedUrls: [] }],
              understanding: buildDeterministicUnderstanding(effectiveMessage),
            });
            const intro = generated.answer.trim()
              .replace(/^#{1,6}\s+.*$/gm, "")
              .split(/\n\s*(?:[-*]|\d+\.)\s+/)[0]!
              .trim();
            const mentionedOrganizations = visible.filter((name) =>
              ` ${normalizeSearchText(intro)} `.includes(` ${normalizeSearchText(name)} `),
            ).length;
            if (intro.length >= 40 && mentionedOrganizations <= 2 &&
                !/\b(?:public )?(?:home ?page|website|source link)\b/i.test(intro) &&
                !/\b(?:does not (?:establish|confirm|prove)|cannot (?:establish|confirm|verify)|not every organization|current active.client status|available evidence is limited)\b/i.test(intro) &&
                !/\b(?:partner\w*|affiliat\w*|collaborat\w*|chosen successive|chosen us|leaders? in|work(?:s|ing)? (?:with|alongside) (?:these|those|several|the following)|current active clients? (?:are|include)|currently works with all)\b/i.test(intro)) {
              answer = `${intro}\n\n${list}${shown.length < visible.length ? `\n\nShowing ${shown.length} of ${visible.length} publicly showcased organizations.${remainingLink}` : ""}`;
            }
          } catch {
            // Keep the concise evidence-safe fallback when generation is unavailable.
          }
        }
        const homepageIsLinkedInAnswer = answer.includes(homepageUrl) ||
          answer.includes(homepageUrl.replace(/\/$/, ""));
        return NextResponse.json({ success: true, data: {
          answer,
          cards: homepageIsLinkedInAnswer ? [{
            type: "page",
            title: "Successive Digital",
            description: "Explore the complete trusted-organizations collection on Successive’s homepage.",
            url: homepageUrl,
          }] : [],
          sources: [{ title: "Successive Digital", url: homepageUrl }],
          suggestions: suggestionActions.map((action) => action.label), suggestionActions,
          confidence: "high", insufficientContext: clientIntent === "current",
        }}, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
      }
    } catch {
      // Continue through normal retrieval when the homepage source is unavailable.
    }
  }

  if (/\b(?:client|customer|partner|work did|did you do|tell me about)\b/i.test(effectiveMessage)) {
    try {
      const items = await fetchAllPublishedContent();
      const trusted = extractTrustedOrganizations(items);
      const normalizedMessage = normalizeSearchText(effectiveMessage);
      const organization = trusted?.organizations.find((name) => {
        const normalizedName = normalizeSearchText(name);
        return normalizedName.length >= 2 && ` ${normalizedMessage} `.includes(` ${normalizedName} `);
      });
      if (trusted && organization) {
        const organizationKey = normalizeSearchText(organization);
        const related = items
          .filter((item) => item.id !== trusted.source.id)
          .map((item) => buildSearchDocument(item))
          .filter((document) => ` ${normalizeSearchText(document.combinedText)} `.includes(` ${organizationKey} `));
        const partnerEvidence = related.filter((document) => document.role === "partners" || document.role === "partner");
        const customerEvidence = related.filter((document) => {
          if (!["case_study", "press_release", "blog", "editorial", "resource", "product"].includes(document.role)) return false;
          const title = normalizeSearchText(document.title);
          const structuredCustomerField = document.structuredFields.some((field) =>
            /\b(?:client|customer)\b/i.test(field.label) &&
            ` ${normalizeSearchText(field.value)} `.includes(` ${organizationKey} `),
          );
          if (document.role === "case_study") return structuredCustomerField || ` ${title} `.includes(` ${organizationKey} `);
          const text = normalizeSearchText(document.combinedText);
          const escaped = organizationKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const explicitRelation = new RegExp(
            `(?:successive.{0,100}(?:client|customer|worked with|collaborat(?:ed|ion) with).{0,80}${escaped}|${escaped}.{0,80}(?:is a client of successive|worked with successive|collaborat(?:ed|ion) with successive))`,
            "i",
          ).test(text);
          return structuredCustomerField || (` ${title} `.includes(` ${organizationKey} `) && explicitRelation);
        });
        const asksPartner = /\bpartner\b/i.test(effectiveMessage);
        const asksWork = /\b(?:what .*work|did you do|case stud|customer stor|client work|project)\b/i.test(effectiveMessage);
        const lines = [`Successive publicly showcases **${organization}** in its homepage trusted-organizations collection.`];
        if (asksPartner) lines.push(partnerEvidence.length
          ? `Successive’s published partner content separately lists **${organization}** as a formal partner.`
          : `I couldn’t confirm a formal partner relationship for **${organization}** from the published partner content. Trusted-logo presence alone does not establish a partnership.`);
        if (asksWork || customerEvidence.length) lines.push(customerEvidence.length
          ? `Related published customer evidence was found in ${[...new Set(customerEvidence.slice(0, 3).map((document) => document.role.replace(/_/g, " ")))].join(", ")} content.`
          : `I couldn’t confirm specific published customer work for **${organization}**. The trusted logo alone does not establish a project, service, or current active-client relationship.`);
        const presented = (asksPartner ? partnerEvidence : customerEvidence).slice(0, 3);
        return NextResponse.json({ success: true, data: {
          answer: lines.join("\n\n"),
          cards: presented.map((document) => ({ type: cardType(document.type), title: document.title,
            description: document.descriptions[0] ?? document.textSegments[0] ?? document.title,
            url: document.url, image: document.image, badge: document.role.replace(/_/g, " ") })),
          sources: [{ title: "Successive Digital", url: trusted.source.link ?? "https://successive.tech/" },
            ...presented.map((document) => ({ title: document.title, url: document.url }))],
          suggestions: [], suggestionActions: [],
          confidence: "high", insufficientContext: asksWork && !customerEvidence.length,
        }}, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
      }
    } catch {
      // Continue through shared retrieval if the current corpus is unavailable.
    }
  }

  const unsupportedAnswer = safeUnsupportedQueryResponse(effectiveMessage);
  if (unsupportedAnswer) {
    return NextResponse.json({
      success: true,
      data: {
        answer: unsupportedAnswer,
        cards: [], sources: [],
        suggestions: /published case studies/i.test(unsupportedAnswer)
          ? ["Show me published case studies"] : [],
        confidence: "high", insufficientContext: true,
      },
    }, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
  }
  if (rejectsPendingAlternative(preparedQuery.englishQuery, parsed.data.history)) {
    return NextResponse.json({
      success: true,
      data: {
        answer: "Understood—I won’t use that suggested resource. Tell me whether you want another related item or a different topic.",
        cards: [], sources: [],
        suggestions: ["Show me another related resource", "Explore a different topic"],
        confidence: "high", insufficientContext: true,
      },
    }, { headers: { ...cors.headers, "Cache-Control": "no-store" } });
  }
  // Do not let a vague help request inherit an old topic and surface an
  // unrelated document title. Ask for the missing need before retrieval.
  if (isGenericHelpRequest(effectiveMessage)) {
    return NextResponse.json(
      {
        success: true,
        data: {
          answer:
            "Of course—what would you like help with? You can tell me about a business challenge, a Successive service, an industry, or the type of resource you need.",
          cards: [],
          sources: [],
          suggestions: [
            "Explore Successive services",
            "Show me Successive case studies",
            "Help me choose an AI service",
          ],
          confidence: "high",
          insufficientContext: true,
        },
      },
      { headers: { ...cors.headers, "Cache-Control": "no-store" } },
    );
  }
  if (/\b(?:free trials?|trial availability|free demos?|demo availability|hourly rates?|discounts?)\b/i.test(effectiveMessage)) {
    return NextResponse.json(
      {
        success: true,
        data: {
          answer: "I couldn't confirm published information about that commercial offering from the available Successive content. Availability, pricing, or commercial terms would need to be confirmed directly with Successive through the official contact channel.",
          cards: [],
          sources: [],
          suggestions: ["Contact Successive", "Explore Successive services"],
          confidence: "high",
          insufficientContext: true,
        },
      },
      { headers: { ...cors.headers, "Cache-Control": "no-store" } },
    );
  }
  if (
    parsed.data.history.length === 0 &&
    /^(?:how long|how much|when|where|who|what about that|can you do it|tell me more|what will it cost|how quickly can you finish)[?.!\s]*$/i.test(effectiveMessage.trim())
  ) {
    return NextResponse.json(
      {
        success: true,
        data: {
          answer: "What subject or project are you asking about? Please add a little context so I can check the relevant Successive information.",
          cards: [],
          sources: [],
          suggestions: buildRelatedSuggestions("general"),
          suggestionActions: followUpActions(buildRelatedSuggestions("general")),
          confidence: "low",
          insufficientContext: true,
        },
      },
      { headers: { ...cors.headers, "Cache-Control": "no-store" } },
    );
  }
  const structuredRequest = understandStructuredRequest(effectiveMessage);
  if (structuredRequest) {
    try {
      const structuredAnswer = answerStructuredRequest(
        await fetchStructuredItems(structuredRequest),
        structuredRequest,
      );
      if (structuredAnswer) {
        const { document } = structuredAnswer;
        const suppressUnsupportedCard = structuredAnswer.evidencePaths.length === 0;
        const suggestionActions = suppressUnsupportedCard ? [] : await buildResolvedNavigationActions({
          document, subject: structuredRequest.subject || effectiveMessage,
          contextType: "INDIVIDUAL_PAGE_CONTEXT",
        });
        return NextResponse.json(
          {
            success: true,
            data: {
              answer: structuredAnswer.answer,
              cards: suppressUnsupportedCard ? [] : [{
                type: "page" as const,
                title: document.title,
                description: (
                  document.descriptions[0] ??
                  document.textSegments[0] ??
                  document.title
                ).slice(0, 500),
                url: document.url,
                image: document.image,
                badge: document.role.replace(/_/g, " "),
              }],
              sources: suppressUnsupportedCard ? [] : [{ title: document.title, url: document.url }],
              suggestions: suggestionActions.map((action) => action.label),
              suggestionActions,
              confidence: "high",
              insufficientContext: suppressUnsupportedCard,
              ...(process.env.NODE_ENV !== "production" ? {
                diagnostics: {
                  route: "structured_api",
                  companyAttribute: structuredRequest.attribute,
                  evidencePaths: structuredAnswer.evidencePaths,
                  suggestionContextType: "INDIVIDUAL_PAGE_CONTEXT",
                },
              } : {}),
            },
          },
          { headers: { ...cors.headers, "Cache-Control": "no-store" } },
        );
      }
    } catch {
      // Continue through shared retrieval when the published corpus is
      // temporarily incomplete; no static company fact is used as fallback.
    }
  }
  const deterministicUnderstanding =
    buildDeterministicUnderstanding(effectiveMessage);
  const hasExplicitCurrentSubject = deterministicUnderstanding.topics.length > 0 ||
    deterministicUnderstanding.entities.length > 0 || Boolean(deterministicUnderstanding.industry);
  const deterministicWithContext = resolveConversationUnderstanding(
    deterministicUnderstanding,
    parsed.data.history.slice(-8),
  ).understanding;
  let understanding: QueryUnderstanding = deterministicUnderstanding;
  if (
    getEnv().AI_API_KEY &&
    shouldUseSemanticUnderstanding(
      deterministicUnderstanding,
      parsed.data.history,
    )
  ) {
    const understandingStartedAt = performance.now();
    try {
      understanding = await getLLMProvider().understandQuery(
        effectiveMessage,
        hasExplicitCurrentSubject ? [] : parsed.data.history.slice(-8),
      );
    } catch {
      // Deterministic interpretation still supports lexical retrieval if the
      // semantic planning call is unavailable or returns invalid JSON.
    }
    understandingDurationMs = performance.now() - understandingStartedAt;
  }
  // Content type is a hard eligibility constraint only when the visitor
  // explicitly asks for one. The semantic interpreter may infer answer style,
  // but it must not turn an ordinary topic/detail query into a whitepaper,
  // thought-leadership, service, or case-study-only search.
  understanding = {
    ...understanding,
    intent: hasExplicitCurrentSubject || deterministicUnderstanding.containsPremise || ["solve_problem", "recommendation"].includes(deterministicUnderstanding.intent)
      ? deterministicUnderstanding.intent
      : understanding.intent,
    businessProblem: hasExplicitCurrentSubject
      ? deterministicUnderstanding.businessProblem
      : deterministicUnderstanding.businessProblem ?? understanding.businessProblem,
    // An explicit new subject is a topic switch. Semantic planning may use
    // history for vague follow-ups, but it must not reintroduce the previous
    // resource/topic into a clear current question.
    topics: hasExplicitCurrentSubject
      ? deterministicUnderstanding.topics
      : parsed.data.history.length ? deterministicWithContext.topics : understanding.topics,
    desiredOutcomes: hasExplicitCurrentSubject ? deterministicUnderstanding.desiredOutcomes : [...new Set([
      ...deterministicWithContext.desiredOutcomes, ...understanding.desiredOutcomes,
    ])].slice(0, 8),
    domains: hasExplicitCurrentSubject ? deterministicUnderstanding.domains : [...new Set([
      ...deterministicWithContext.domains, ...understanding.domains,
    ])].slice(0, 8),
    technicalSignals: hasExplicitCurrentSubject ? deterministicUnderstanding.technicalSignals : [...new Set([
      ...deterministicWithContext.technicalSignals, ...understanding.technicalSignals,
    ])].slice(0, 10),
    retrievalConcepts: hasExplicitCurrentSubject ? deterministicUnderstanding.retrievalConcepts : [...new Set([
      ...deterministicWithContext.retrievalConcepts, ...understanding.retrievalConcepts,
    ])].slice(0, 12),
    industry: hasExplicitCurrentSubject
      ? deterministicUnderstanding.industry
      : deterministicUnderstanding.industry ?? understanding.industry,
    requestedContentType: deterministicUnderstanding.requestedContentType,
    targetScope: hasExplicitCurrentSubject || deterministicUnderstanding.targetScope !== "topic"
      ? deterministicUnderstanding.targetScope
      : understanding.targetScope,
    entities: hasExplicitCurrentSubject
      ? deterministicUnderstanding.entities
      : deterministicUnderstanding.entities.length ? deterministicUnderstanding.entities : understanding.entities,
  };
  understanding = applyStructuralBroadQueryRules(resolveConversationUnderstanding(
    understanding,
    parsed.data.history.slice(-8),
  ).understanding, effectiveMessage);
  const intent = detectIntent(effectiveMessage);
  const isNamedSuccessivePersonQuery =
    understanding.targetScope === "company" && understanding.entities.length > 0;
  const shouldDeduplicate = shouldDeduplicateDiscoveryResults(
    effectiveMessage,
    intent,
  );
  const seenContentKeys = new Set([
    ...parsed.data.seenContent.flatMap(({ title, url }) =>
      contentIdentity(title, url),
    ),
    ...contentIdentitiesFromAssistantHistory(parsed.data.history),
  ]);
  const premiseVerificationQuery = understanding.containsPremise
    ? normalizeSearchText(effectiveMessage)
        .replace(/\b(?:successive|digital|you|your|have|has|does|do|is|are|cannot|can|not|no|only|right|correct|it|unrelated|to)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  const contextualQuery =
    buildRelatedServiceRetrievalQuery(effectiveMessage, parsed.data.history) ??
    (premiseVerificationQuery || buildRetrievalQuery(understanding) ||
      buildConversationRetrievalQuery(effectiveMessage, parsed.data.history));
  const retrievalMessage = isVagueBusinessDiscovery(contextualQuery)
    ? "digital transformation digital engineering cloud data artificial intelligence experience design services"
    : contextualQuery;
  if (
    isDeterministicallyOffTopic(effectiveMessage) ||
    understanding.isOffTopic ||
    understanding.intent === "off_topic"
  ) {
    return NextResponse.json(
      {
        success: true,
        data: {
          answer:
            "I'm here to help with Successive Digital's services, capabilities, industries, case studies, resources, and related business technology questions. Tell me what you're trying to achieve, and I can find the most relevant Successive information.",
          cards: [],
          sources: [],
          suggestions: [
            "Explore Successive capabilities",
            "Show me Successive case studies",
            "How can Successive help my business?",
          ],
          confidence: "high",
          insufficientContext: true,
        },
      },
      { headers: { ...cors.headers, "Cache-Control": "no-store" } },
    );
  }
  if (isCareerOpeningQuery(effectiveMessage)) {
    try {
      const jobs = await fetchActiveCareerJobs();
      const matches = filterCareerJobs(jobs, effectiveMessage);
      const asksForCount = /\b(?:how many|count|total|number of)\b/i.test(
        effectiveMessage,
      );
      const openingLabel = matches.length === 1 ? "opening" : "openings";
      const answer = matches.length
        ? [
            `${asksForCount ? `There ${matches.length === 1 ? "is" : "are"}` : "I found"} **${matches.length} active ${openingLabel}** matching your request.`,
            ...matches.slice(0, 6).map(
              (job) => `- [${job.title}](${careerJobUrl(job)}) — ${careerJobSummary(job)}`,
            ),
            `[View all current openings](${careersPageUrl()})`,
          ].join("\n\n")
        : `I couldn't find an active opening matching those criteria in Successive's current jobs feed. You can [view all current openings](${careersPageUrl()}) or try a different technology, location, or experience level.`;
      const presented = matches.slice(0, 6);
      return NextResponse.json(
        {
          success: true,
          data: {
            answer,
            cards: presented.map((job) => ({
              type: "page" as const,
              title: job.title,
              description: careerJobSummary(job),
              url: careerJobUrl(job),
              badge: "job opening",
            })),
            sources: presented.length
              ? presented.map((job) => ({ title: job.title, url: careerJobUrl(job) }))
              : [{ title: "Successive Career Opportunities", url: careersPageUrl() }],
            suggestions: [
              "Show me jobs in Noida",
              "Show me technology openings",
              "How many openings are available?",
            ],
            confidence: "high",
            insufficientContext: matches.length === 0,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    } catch {
      return error(
        503,
        "CAREERS_UNAVAILABLE",
        "Successive’s live openings are temporarily unavailable. Please try again shortly.",
        cors.headers,
      );
    }
  }
  if (
    understanding.needsClarification &&
    understanding.clarificationQuestion &&
    !parsed.data.history.length
  ) {
    return NextResponse.json(
      {
        success: true,
        data: {
          answer: understanding.clarificationQuestion,
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
  // Contact is a deterministic navigation intent. Fetch only the published
  // Contact Us page and return one API-backed card; never run broad retrieval
  // that can mix in unrelated posts, case studies, or privacy content.
  if (intent === "contact") {
    const canonicalContactUrl = `${getEnv().SUCCESSIVE_PUBLIC_SITE_URL.replace(/\/$/, "")}/contact/`;
    try {
      const item = (await fetchSuccessive("/pages/contact"))[0];
      if (!item) throw new Error("Contact page is unavailable");
      const document = buildSearchDocument(item);
      const requestedPublishedDetails = /\b(?:phone|telephone|email|e-mail|number)\b/i.test(
        effectiveMessage,
      );
      const details = extractPublishedContactDetails(item.acf);
      const description =
        document.textSegments.find(
          (segment) => segment.toLowerCase() !== document.title.toLowerCase(),
        ) ?? "Open the official Successive Contact Us page.";
      const suggestionActions = await buildResolvedNavigationActions({
        document, subject: effectiveMessage, contextType: "INDIVIDUAL_PAGE_CONTEXT",
      });
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: requestedPublishedDetails
              ? buildPublishedContactAnswer(document.url, details)
              : buildContactAnswer(
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
            sources: [{ title: document.title, url: document.url }],
            suggestions: suggestionActions.map((action) => action.label),
            suggestionActions,
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    } catch {
      const description =
        "Use the official Successive contact page to share your requirements or request assistance from the team.";
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: `## Contact Successive\n\nNeed help or want to discuss a requirement? Visit the official [Contact Us](${canonicalContactUrl}) page to connect with the Successive team.\n\n${description}`,
            cards: [
              {
                type: "page",
                title: "Get In Touch",
                description,
                url: canonicalContactUrl,
                badge: "page",
              },
            ],
            sources: [{ title: "Get In Touch", url: canonicalContactUrl }],
            suggestions: buildRelatedSuggestions("contact", "Get In Touch"),
            suggestionActions: followUpActions(buildRelatedSuggestions("contact", "Get In Touch")),
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
  }
  // Pure company-level questions use the canonical published About page.
  // Subject-bearing phrasing (for example, "what does Successive do with
  // geospatial data?") is not classified as About and continues to normal
  // topic retrieval.
  if (intent === "about" && !isNamedSuccessivePersonQuery) {
    try {
      const item = (await fetchSuccessive("/pages/about-us"))[0];
      if (!item) throw new Error("About page is unavailable");
      const document = buildSearchDocument(item);
      const passages = document.descriptions.length
        ? document.descriptions.slice(0, 3)
        : document.textSegments.slice(0, 3);
      const description = cleanStoryDescription(
        passages[0] ?? "Open the official Successive About page.",
      );
      const suggestionActions = await buildResolvedNavigationActions({
        document, subject: effectiveMessage, contextType: "INDIVIDUAL_PAGE_CONTEXT",
      });
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: `${passages.map(cleanStoryDescription).filter(Boolean).join("\n\n")}\n\n## About Successive Digital\n\n[About Us](${document.url})`,
            cards: [{
              type: "page",
              title: document.title,
              description,
              url: document.url,
              image: document.image,
              badge: "company",
            }],
            sources: [{ title: document.title, url: document.url }],
            suggestions: suggestionActions.map((action) => action.label),
            suggestionActions,
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    } catch {
      // If the canonical page is temporarily unavailable, the shared partial
      // index can still attempt a company-role response below.
    }
  }
  // Case-study collection requests must never fall through to keyword-based
  // global retrieval, where blog posts mentioning "case studies" can outrank
  // the actual collection. Return the listing page followed by the five most
  // recently modified published case studies.
  const caseStudyTopic = effectiveMessage
    .toLowerCase()
    .replace(
      /\b(?:show|give|tell|me|your|the|latest|recent|new|more|another|other|others|different|next|case|study|studies|success|stories|story|about|on|regarding|find|please)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    intent === "case_studies" &&
    /\bcase\s+stud(?:y|ies)\b/i.test(effectiveMessage) &&
    !caseStudyTopic
  ) {
    try {
      const [listingItems, caseStudyItems] = await Promise.all([
        fetchSuccessive("/pages/case-studies"),
        fetchSuccessive("/content?type=case-studies&per_page=100"),
      ]);
      const listing = listingItems[0]
        ? buildSearchDocument(listingItems[0])
        : undefined;
      let caseStudies = caseStudyItems
        .filter((item) => item.type?.includes("case"))
        .map((item) => buildSearchDocument(item))
        .sort(
          (a, b) => Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""),
        )
        .filter(
          (document) =>
            !shouldDeduplicate ||
            !contentIdentity(document.title, document.url).some((key) =>
              seenContentKeys.has(key),
            ),
        );
      caseStudies = caseStudies.slice(0, 5);
      if (!listing) {
        throw new Error("Case-study collection is unavailable");
      }
      if (!caseStudies.length)
        return exhaustedCollectionResponse(
          "case studies",
          listing,
          cors.headers,
        );
      const documents = [listing, ...caseStudies];
      const suggestionActions = await buildResolvedNavigationActions({
        document: listing, contextType: "CATEGORY_LISTING_CONTEXT",
      });
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
            suggestions: suggestionActions.map((action) => action.label),
            suggestionActions,
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
  const blogTopic = effectiveMessage
    .toLowerCase()
    .replace(
      /\b(?:show|give|tell|me|your|the|latest|recent|new|more|another|other|others|different|next|blogs?|articles?|insights?|about|on|regarding|please)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    intent === "blogs" &&
    /\bblogs?\b/i.test(effectiveMessage) &&
    !blogTopic
  ) {
    try {
      const [listingItems, postItems] = await Promise.all([
        fetchSuccessive("/pages/blogs-and-insights").catch(() => []),
        fetchSuccessive("/content?type=post&per_page=100"),
      ]);
      const listing = listingItems[0]
        ? buildSearchDocument(listingItems[0])
        : undefined;
      let posts = postItems
        .filter((item) => item.type === "post")
        .map((item) => buildSearchDocument(item))
        .sort(
          (a, b) => Date.parse(b.modified ?? "") - Date.parse(a.modified ?? ""),
        )
        .filter(
          (document) =>
            !shouldDeduplicate ||
            !contentIdentity(document.title, document.url).some((key) =>
              seenContentKeys.has(key),
            ),
        );
      posts = posts.slice(0, 5);
      if (!posts.length) {
        const fallbackListing = listing ?? {
          title: "Blogs",
          url: `${getEnv().SUCCESSIVE_PUBLIC_SITE_URL.replace(/\/$/, "")}/blogs-and-insights/`,
        };
        return exhaustedCollectionResponse(
          "blogs",
          fallbackListing,
          cors.headers,
        );
      }
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
            url: `${getEnv().SUCCESSIVE_PUBLIC_SITE_URL.replace(/\/$/, "")}/blogs-and-insights/`,
            badge: "blogs",
          };
      const listingDocument = listing ?? buildSearchDocument({ id: -1, type: "page", slug: "blogs",
        link: listingCard.url, title: { rendered: listingCard.title }, content: { rendered: listingCard.description } });
      const suggestionActions = await buildResolvedNavigationActions({
        document: listingDocument, contextType: "CATEGORY_LISTING_CONTEXT",
      });
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
            suggestions: suggestionActions.map((action) => action.label),
            suggestionActions,
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
    const retrievalStartedAt = performance.now();
    let retrieval = await retrieveFromIndex(
      retrievalMessage,
      isNamedSuccessivePersonQuery ? "general" : intent,
      effectiveMessage,
      shouldDeduplicate ? seenContentKeys : new Set<string>(),
      understanding,
    );
    // Semantic expansion can occasionally over-constrain a short, valid
    // visitor query. Always run a deterministic literal plan against the same
    // cached corpus and merge it, making cold/warm answers independent of a
    // single interpretation without adding another WordPress request.
    const literalUnderstanding = applyStructuralBroadQueryRules(
      buildDeterministicUnderstanding(effectiveMessage),
      effectiveMessage,
    );
    const literalRetrieval = await retrieveFromIndex(
      effectiveMessage,
      isNamedSuccessivePersonQuery ? "general" : intent,
      effectiveMessage,
      shouldDeduplicate ? seenContentKeys : new Set<string>(),
      literalUnderstanding,
    );
    const mergedBaseMatches = [...retrieval.matches, ...literalRetrieval.matches]
      .filter((match, index, all) => all.findIndex((candidate) =>
        candidate.document.id === match.document.id && candidate.document.type === match.document.type) === index)
      .slice(0, 8);
    const mergedBaseCandidates = [...(retrieval.candidates ?? []), ...(literalRetrieval.candidates ?? [])]
      .filter((match, index, all) => all.findIndex((candidate) =>
        candidate.document.id === match.document.id && candidate.document.type === match.document.type) === index);
    retrieval = {
      ...retrieval,
      reliableMatchFound: mergedBaseMatches.length > 0,
      matches: mergedBaseMatches,
      candidates: mergedBaseCandidates,
    };
    const facets = extractQueryFacets(effectiveMessage);
    const facetResults = facets.length > 1
      ? await Promise.all(facets.map(async (facet) => {
          const facetUnderstanding: QueryUnderstanding = {
            ...facet.understanding,
            topics: facet.understanding.topics.length ? facet.understanding.topics : understanding.topics,
            entities: facet.understanding.entities.length ? facet.understanding.entities : understanding.entities,
            industry: facet.understanding.industry ?? understanding.industry,
            retrievalConcepts: facet.understanding.retrievalConcepts.length
              ? facet.understanding.retrievalConcepts
              : understanding.retrievalConcepts,
          };
          const facetQuery = buildRetrievalQuery(facetUnderstanding) || facet.text;
          const result = await retrieveFromIndex(
            facetQuery,
            detectIntent(facet.text),
            facet.text,
            shouldDeduplicate ? seenContentKeys : new Set<string>(),
            facetUnderstanding,
          );
          const recovered = result.reliableMatchFound
            ? result.matches
            : recoverAuthoritativeEvidence({
                candidates: result.candidates ?? [],
                understanding: facetUnderstanding,
                relation: facet.relation,
              });
          return { facet, understanding: facetUnderstanding, result, matches: recovered };
        }))
      : [];
    if (facetResults.length) {
      const merged = [...retrieval.matches, ...facetResults.flatMap((item) => item.matches)]
        .filter((match, index, all) => all.findIndex((candidate) => candidate.document.id === match.document.id) === index)
        .slice(0, 8);
      retrieval = {
        ...retrieval,
        reliableMatchFound: merged.length > 0,
        matches: merged,
      };
    }
    if (!retrieval.reliableMatchFound) {
      const recovered = recoverAuthoritativeEvidence({
        candidates: retrieval.candidates ?? [],
        understanding,
        relation: inferQueryRelation(effectiveMessage),
      });
      if (recovered.length) retrieval = {
        ...retrieval,
        reliableMatchFound: true,
        matches: recovered,
      };
    }
    retrievalDurationMs = performance.now() - retrievalStartedAt;
    const namedResourceSubject = parsed.data.suggestionAction?.intent === "FOLLOW_UP_QUERY" &&
      resolvedSuggestionAction?.topic
      ? normalizeSearchText(resolvedSuggestionAction.topic)
      : extractNamedResourceSummarySubject(effectiveMessage);
    if (!retrieval.reliableMatchFound) {
      if (shouldDeduplicate && seenContentKeys.size) {
        return NextResponse.json(
          {
            success: true,
            data: exhaustedResultsData(),
          },
          { headers: { ...cors.headers, "Cache-Control": "no-store" } },
        );
      }
      const requestedType = understanding.requestedContentType;
      const requestedTypeLabel = requestedType?.replace("-", " ");
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: namedResourceSubject
              ? "I couldn't find that exact published item in the available Successive content."
              : requestedTypeLabel
              ? `I couldn't find a strongly matching Successive ${requestedTypeLabel} for this topic. I don't want to present a generic or weakly related item as direct evidence. You can broaden the content type or ask for related Successive services and resources.`
              : buildHelpfulFallback(preparedQuery.fallbackAnswer),
            cards: [],
            sources: [],
            suggestions: buildRelatedSuggestions("general"),
            suggestionActions: followUpActions(buildRelatedSuggestions("general")),
            confidence: "low",
            insufficientContext: true,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    // Retrieval already returns the globally ranked Top 5. Do not narrow that
    // set again here: every selected chunk must reach the grounded LLM prompt.
    const asksForUnseenResults = asksForAnotherResult(effectiveMessage);
    const previouslyPresented = parsed.data.history
      .filter((item) => item.role === "assistant")
      .map((item) => item.content.toLowerCase())
      .join("\n");
    const initiallySelectedMatches = asksForUnseenResults
      ? retrieval.matches.filter(
          ({ document }) =>
            !previouslyPresented.includes(document.url.toLowerCase()) &&
            !previouslyPresented.includes(document.title.toLowerCase()),
        )
      : retrieval.matches;
    const exactNamedResource = namedResourceSubject
      ? initiallySelectedMatches.find(({ document }) => {
          const slug = normalizeSearchText(document.slug.replace(/-/g, " "));
          return document.normalizedTitle === namedResourceSubject ||
            slug === namedResourceSubject || document.aliases.includes(namedResourceSubject);
        }) ?? initiallySelectedMatches.find(({ document }) => {
          const subjectTerms = new Set(namedResourceSubject.split(" "));
          const titleTerms = new Set(document.normalizedTitle.split(" "));
          const overlap = [...subjectTerms].filter((term) => titleTerms.has(term)).length;
          const subjectCoverage = overlap / Math.max(subjectTerms.size, 1);
          const symmetricCoverage = overlap / Math.max(subjectTerms.size, titleTerms.size, 1);
          return symmetricCoverage >= 0.88 ||
            (subjectTerms.size >= 2 && subjectCoverage >= 0.8 && document.normalizedTitle.includes(namedResourceSubject));
        })
      : undefined;
    if (namedResourceSubject && !exactNamedResource) {
      const relatedPool = retrieval.candidates ?? initiallySelectedMatches;
      const closest = selectRelatedNamedResource(namedResourceSubject, relatedPool);
      const related = closest ? [closest] : initiallySelectedMatches.slice(0, 1);
      const alternatives = related.length
        ? ` I found a related ${related[0]!.document.role.replace(/_/g, " ")}, ${related.map(({ document }) => `'[${document.title}](${document.url})'`).join("; ")}. Would you like me to summarize that instead?`
        : "";
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: `I couldn't find that exact published item in the available Successive content.${alternatives}`,
            cards: [],
            sources: [],
            suggestions: related.length ? [`Summarize '${related[0]!.document.title}'`] : [
              "Show me another related resource",
              "Show me a related case study",
              "Explore Successive services",
            ],
            confidence: "low",
            insufficientContext: true,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    let selectedMatches = exactNamedResource
      ? [exactNamedResource]
      : initiallySelectedMatches;
    // Preserve relevance order for semantic/problem discovery. Collection
    // branches above may still intentionally vary already-qualified items.
    if (asksForUnseenResults && !selectedMatches.length) {
      return NextResponse.json(
        {
          success: true,
          data: {
            answer:
              "I’ve already shown the strongest matching items available for this topic. You can broaden the topic, view all available items, or ask for a related case study.",
            cards: [],
            sources: [],
            suggestions: [
              "Show me all services",
              "Show me a related case study",
              "Help me choose the right service",
            ],
            confidence: "medium",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    // Complete collections are already constrained by deterministic content
    // type/role filters. Present that authoritative collection before
    // per-question evidence validation can collapse it to one topical item.
    if (
      retrieval.collectionTotal !== undefined &&
      isExplicitListRequest(effectiveMessage)
    ) {
      const presented = retrieval.matches.slice(0, 15);
      const total = retrieval.collectionTotal;
      const label = retrieval.collectionLabel ?? "items";
      const listingSource = presented.find(({ document }) => document.role === "global_capabilities" ||
        document.role === "partners" || document.role === "page")?.document ?? presented[0]?.document;
      const suggestionActions = listingSource ? await buildResolvedNavigationActions({
        document: listingSource, contextType: "CATEGORY_LISTING_CONTEXT",
      }) : [];
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: buildCollectionListAnswer(label, total, presented),
            cards: presented.map(({ document, selectedPassages }) => ({
              type: cardType(document.type),
              title: document.title,
              description: bestStoryDescription(document, selectedPassages),
              url: document.url,
              image: document.image,
              badge: document.type,
              service_type: document.service_type,
            })),
            sources: presented.map(({ document }) => ({
              title: document.title,
              url: document.url,
            })),
            suggestions: suggestionActions.map((action) => action.label),
            suggestionActions,
            confidence: "high",
            insufficientContext: false,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    let evidenceValidation = validateEvidence({
      message: effectiveMessage,
      contextMessage: retrievalMessage,
      understanding,
      matches: selectedMatches,
      hasConversationSubject: parsed.data.history.some((item) => item.role === "user"),
    });
    const hasGroundedFollowUpTarget = parsed.data.suggestionAction?.intent === "FOLLOW_UP_QUERY" &&
      Boolean(exactNamedResource) &&
      /\b(?:help (?:my|our|a) business|business outcomes?|benefits?|value|implement|implementation|apply|adopt)\b/i.test(
        parsed.data.suggestionAction.query ?? effectiveMessage,
      );
    if (["INSUFFICIENT_EVIDENCE", "AMBIGUOUS"].includes(evidenceValidation.status) && literalRetrieval.matches.length) {
      const literalValidation = validateEvidence({
        message: effectiveMessage,
        contextMessage: effectiveMessage,
        understanding: literalUnderstanding,
        matches: literalRetrieval.matches,
        hasConversationSubject: parsed.data.history.some((item) => item.role === "user"),
      });
      if (literalValidation.status === "SUPPORTED" || literalValidation.status === "PARTIALLY_SUPPORTED") {
        selectedMatches = literalValidation.accepted.length
          ? literalValidation.accepted
          : literalRetrieval.matches;
        evidenceValidation = literalValidation;
      }
    }
    if (
      facets.length === 1 &&
      ["INSUFFICIENT_EVIDENCE", "AMBIGUOUS"].includes(evidenceValidation.status)
    ) {
      const recovered = recoverAuthoritativeEvidence({
        candidates: retrieval.candidates ?? selectedMatches,
        understanding,
        relation: inferQueryRelation(effectiveMessage),
      });
      if (recovered.length) {
        const recoveredValidation = validateEvidence({
          message: effectiveMessage,
          contextMessage: retrievalMessage,
          understanding,
          matches: recovered,
          hasConversationSubject: parsed.data.history.some((item) => item.role === "user"),
        });
        if (recoveredValidation.status === "SUPPORTED") {
          selectedMatches = recovered;
          evidenceValidation = recoveredValidation;
        }
      }
    }
    if (!hasGroundedFollowUpTarget && facets.length === 1 && ["INSUFFICIENT_EVIDENCE", "AMBIGUOUS"].includes(evidenceValidation.status)) {
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: safeEvidenceResponse(evidenceValidation),
            cards: [],
            sources: [],
            suggestions: buildRelatedSuggestions("general"),
            suggestionActions: followUpActions(buildRelatedSuggestions("general")),
            confidence: "low",
            insufficientContext: true,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    if (!hasGroundedFollowUpTarget && facets.length === 1 && evidenceValidation.status === "PARTIALLY_SUPPORTED") {
      const related = evidenceValidation.accepted[0];
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: safeEvidenceResponse(evidenceValidation),
            cards: related ? [{
              type: cardType(related.document.type),
              title: related.document.title,
              description: bestStoryDescription(related.document, related.selectedPassages),
              url: related.document.url,
              image: related.document.image,
              badge: related.document.role.replace(/_/g, " "),
            }] : [],
            sources: related ? [{ title: related.document.title, url: related.document.url }] : [],
            suggestions: buildRelatedSuggestions("general", related?.document.title),
            suggestionActions: followUpActions(buildRelatedSuggestions("general", related?.document.title)),
            confidence: "medium",
            insufficientContext: true,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    const validatedMatches = facets.length > 1
      ? selectedMatches
      : evidenceValidation.accepted.length
      ? evidenceValidation.accepted
      : selectedMatches;
    selectedMatches = validatedMatches;
    const topScore = selectedMatches[0]?.score ?? 0;
    const isWhitepaperQuery =
      /\b(?:white ?papers?|whitepepers?|whtieperpers?)\b/i.test(
        effectiveMessage,
      );
    const isWhitepaperCollectionQuery =
      isWhitepaperQuery &&
      /\b(?:total|all|list|count|how many)\b/i.test(effectiveMessage);
    const preGenerationAlignment = selectAlignedSecondaryMatches({
      matches: validatedMatches,
      understanding,
      limit: 4,
    });
    const contextMatches = preGenerationAlignment.primary
      ? [preGenerationAlignment.primary, ...preGenerationAlignment.related]
      : validatedMatches.slice(0, 1);
    selectedMatches = contextMatches;
    const contextStartedAt = performance.now();
    const context: NormalizedContent[] = contextMatches.map(
      ({ document, selectedPassages }) => ({
        id: document.id,
        type: document.type,
        slug: document.slug,
        title: document.title,
        excerpt: document.descriptions[0] ?? selectedPassages[0] ?? "",
        plainText: namedResourceSubject
          ? document.textSegments.slice(0, 10).join("\n\n")
          : selectedPassages.join("\n\n"),
        url: document.url,
        image: document.image,
        modified: document.modified,
        acfText: "",
        extractedUrls: [],
        service_type: document.service_type,
      }),
    );
    contextConstructionDurationMs = performance.now() - contextStartedAt;
    let generatedData;
    if (!getEnv().AI_API_KEY) {
      return error(
        503,
        "AI_NOT_CONFIGURED",
        "The AI provider is not configured. Add AI_API_KEY to the server environment and restart the application.",
        cors.headers,
      );
    }
    try {
      const finalLlmStartedAt = performance.now();
      const generated = await getLLMProvider().generateStructuredResponse({
        message: effectiveMessage,
        responseLanguage: preparedQuery.responseLanguage,
        fallbackAnswer: preparedQuery.fallbackAnswer,
        history: hasExplicitCurrentSubject ? [] : parsed.data.history.slice(-10),
        context,
        understanding,
      });
      const validated = assistantResponseSchema.safeParse(generated);
      if (validated.success) generatedData = validated.data;
      finalLlmDurationMs = performance.now() - finalLlmStartedAt;
    } catch {
      // Continue with a deterministic source-backed story below.
    }
    let generatedAnswer =
      generatedData?.answer ?? buildGroundedRetrievalAnswer(selectedMatches);
    if (
      shouldDeduplicate &&
      answerReferencesSeenContent(generatedAnswer, seenContentKeys)
    )
      generatedAnswer = buildGroundedRetrievalAnswer(selectedMatches);
    if (isWhitepaperCollectionQuery) {
      generatedAnswer = buildWhitepaperCollectionAnswer(selectedMatches);
    }
    const explicitNoEvidence =
      /\b(?:could not|couldn't|cannot|can't) find reliable information\b/i.test(
        generatedAnswer,
      );
    const onlyLowCoverageEvidence = selectedMatches.every((match) =>
      match.matchedFields.includes("low-query-coverage"),
    );
    if (explicitNoEvidence && onlyLowCoverageEvidence) {
      return NextResponse.json(
        {
          success: true,
          data: {
            answer: buildHelpfulFallback(preparedQuery.fallbackAnswer),
            cards: [],
            sources: [],
            suggestions: buildRelatedSuggestions("general"),
            suggestionActions: followUpActions(buildRelatedSuggestions("general")),
            confidence: "low",
            insufficientContext: true,
          },
        },
        { headers: { ...cors.headers, "Cache-Control": "no-store" } },
      );
    }
    if (explicitNoEvidence)
      generatedAnswer = buildGroundedRetrievalAnswer(selectedMatches);
    if (
      understanding.containsPremise &&
      /\bSuccessive\s+(?:does not|doesn't|cannot|can't|has no|only)\b/i.test(generatedAnswer)
    )
      generatedAnswer = buildGroundedRetrievalAnswer(selectedMatches);
    const groundedAnswer = ensureDescriptiveGroundedAnswer(
      generatedAnswer,
      selectedMatches,
    );
    const directlyAnswered = ensureExplicitPremiseCorrection(ensureDirectDefinition(
      groundedAnswer,
      selectedMatches,
      effectiveMessage,
    ), understanding);
    const categoryAnswer = isUseCaseQuery(effectiveMessage)
      ? ensureCategoryHeading(
          directlyAnswered,
          buildUseCaseHeading(effectiveMessage),
        )
      : isBroadAiServicesQuery(effectiveMessage)
        ? ensureCategoryHeading(directlyAnswered, "Successive AI Services")
        : directlyAnswered;
    const alignment = selectAlignedSecondaryMatches({
      matches: selectedMatches,
      understanding,
      limit: 2,
    });
    const alignedMatches = [alignment.primary, ...alignment.related].filter(
      (match): match is SearchMatch => Boolean(match),
    );
    const cta = alignedCta(alignment.primary, understanding);
    const incompleteFacets = facetResults.filter((item) => item.matches.length === 0);
    const facetCompleteAnswer = incompleteFacets.length
      ? `${categoryAnswer.trim()}\n\n${incompleteFacets.map(({ facet }) => `I couldn’t find authoritative published evidence for the requested ${facet.relation.toLowerCase().replace(/_/g, " ")} facet.`).join("\n")}`
      : categoryAnswer;
    const finalAnswer = cta && !facetCompleteAnswer.includes(alignment.primary?.document.url ?? "")
      ? `${facetCompleteAnswer.trim()}\n\n${cta}`
      : facetCompleteAnswer;
    const cardMatches = alignedMatches.filter((match) =>
      cardEligibility(match, understanding, topScore).accepted,
    );
    // If the grounded answer explicitly cites an accepted context document,
    // keep its card consistent with that visible link even when the optional
    // secondary-card score is below the normal discovery threshold.
    const answerReferencedMatches = contextMatches.filter(({ document }) =>
      finalAnswer.includes(document.url) || finalAnswer.includes(document.url.replace(/\/$/, "")),
    );
    const referencedAndEligibleCards = [...answerReferencedMatches, ...cardMatches]
      .filter((match, index, all) => all.findIndex((candidate) =>
        candidate.document.id === match.document.id && candidate.document.type === match.document.type) === index);
    const presentedMatches =
      exactNamedResource
        ? [exactNamedResource]
        : isWhitepaperCollectionQuery && selectedMatches.length <= 15
        ? selectedMatches
        : referencedAndEligibleCards.slice(0, 3);
    const sourceMatches = presentedMatches.length
      ? presentedMatches
      : alignedMatches.slice(0, 2);
    // Labels proposed by an LLM or legacy templates are not executable contracts.
    // Discover and validate real corpus items first, then create structured actions.
    const suggestionContextType = classifySuggestionContext({
      source: alignment.primary?.document,
      exactResource: Boolean(exactNamedResource),
      personEntity: isNamedSuccessivePersonQuery && alignment.primary?.document.role === "company",
    });
    const relatedEvidenceActions = alignment.primary
      ? suggestionContextType === "INDIVIDUAL_PAGE_CONTEXT" ? buildIndividualPageNavigationActions({
          source: alignment.primary.document,
          corpus: await getSuggestionCorpus(),
          userSubject: understanding.entities[0] ?? understanding.topics[0] ?? alignment.primary.document.title,
          limit: 3,
        }) : buildGlobalRelatedContentActions({
          source: alignment.primary.document,
          corpus: await getSuggestionCorpus(),
          userSubject: understanding.entities[0] ?? understanding.topics[0] ?? alignment.primary.document.title,
          recentActionIds: parsed.data.suggestionAction ? [parsed.data.suggestionAction.id] : [],
          limit: 3,
        })
      : [];
    const suggestionActions = relatedEvidenceActions
      .filter((action, index, all) => all.findIndex((candidate) => candidate.id === action.id) === index)
      .slice(0, 3);
    const response = {
      ...(generatedData ?? {
        answer: groundedAnswer,
        cards: [],
        sources: [],
        suggestions: [],
        confidence: "medium" as const,
        insufficientContext: false,
      }),
      answer: finalAnswer,
      cards: presentedMatches.map(({ document, selectedPassages }) => ({
        type: cardType(document.type),
        title: document.title,
        description: bestStoryDescription(document, selectedPassages),
        url: document.url,
        image: document.image,
        badge: document.type,
        service_type: document.service_type,
      })),
      sources: sourceMatches.map(({ document }) => ({
        title: document.title,
        url: document.url,
      })),
      suggestions: suggestionActions.map((action) => action.label),
      suggestionActions,
      confidence: topScore >= 100 ? "high" : "medium",
      insufficientContext: false,
    };
    if (process.env.NODE_ENV !== "production") {
      console.info("chat_request_metrics", {
        totalDurationMs: Math.round(performance.now() - requestStartedAt),
        understandingDurationMs: Math.round(understandingDurationMs),
        retrievalDurationMs: Math.round(retrievalDurationMs),
        relationshipScoringDurationMs: retrieval.timings?.relationshipScoringMs ?? 0,
        rankingDurationMs: retrieval.timings?.rankingMs ?? 0,
        contextConstructionDurationMs: Math.round(contextConstructionDurationMs),
        finalLlmDurationMs: Math.round(finalLlmDurationMs),
        wordpress: getContentLoadDiagnostics(),
        index: getIndexDiagnostics(),
        selectedDocuments: selectedMatches.length,
      });
    }
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

function answerReferencesSeenContent(
  answer: string,
  seenContentKeys: Set<string>,
): boolean {
  for (const match of answer.matchAll(/https?:\/\/[^\s)]+/g)) {
    if (contentIdentity("", match[0]).some((key) => seenContentKeys.has(key)))
      return true;
  }
  return false;
}

function ensureCategoryHeading(answer: string, heading: string): string {
  const trimmed = answer.trim();
  const leadingHeading = trimmed.match(/^#{1,3}\s+[^\n]+\n+/);
  // A generated answer that already starts with prose follows the required
  // direct-summary-first format; do not move a category title above it.
  if (!leadingHeading) return trimmed;

  const blocks = trimmed
    .slice(leadingHeading[0].length)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const introductionIndex = blocks.findIndex(
    (block) =>
      !/^#{1,3}\s/.test(block) &&
      !/^(?:[-*]|\d+\.)\s/.test(block) &&
      !/^\*\*\[[^\]]+\]/.test(block),
  );
  if (introductionIndex < 0) return trimmed;

  const [introduction] = blocks.splice(introductionIndex, 1);
  return `${introduction}\n\n## ${heading}\n\n${blocks.join("\n\n")}`;
}

function buildUseCaseHeading(message: string): string {
  const topic = message
    .toLowerCase()
    .replace(/\b(?:use cases?|applications?)\b/g, " ")
    .replace(
      /\b(?:i|we|want|need|show|give|tell|find|some|me|us|the|a|an|of|for|in|about|please|business)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const label = (topic || "Business")
    .split(" ")
    .map((word) =>
      word === "ai" ? "AI" : word[0]!.toUpperCase() + word.slice(1),
    )
    .join(" ");
  return `${label} Use Cases`;
}

function extractNamedResourceSummarySubject(message: string): string | null {
  if (/\b(?:latest|newest|most recent|recent)\b/i.test(message) && !/[‘’'“"]/.test(message))
    return null;
  const successiveUrl = message.match(/https?:\/\/(?:www\.)?successive\.tech\/[^\s)]+/i)?.[0];
  if (successiveUrl) {
    try {
      const slug = new URL(successiveUrl).pathname.split("/").filter(Boolean).at(-1);
      if (slug) return normalizeSearchText(slug.replace(/-/g, " "));
    } catch {
      // Continue with title parsing for malformed visitor input.
    }
  }
  const quoted = message.match(/['“"]([^'”"]{3,200})['”"]/i)?.[1];
  if (quoted) return normalizeSearchText(quoted);
  const explicitlyNamed = message.match(
    /\b(?:called|named|titled)\s+(.+?)(?:\s+(?:blog|article|post|case study|white ?paper|e-?book|report|webinar|event|press release|media coverage|product|platform|partner page|service page|industry page|guide|downloadable resource|resource))?[?.!]*$/i,
  )?.[1];
  if (explicitlyNamed) return normalizeSearchText(explicitlyNamed);
  // Unquoted discovery grammar ("find an article about X", "show blogs on X")
  // names a topic and content type, not a resource identity. Only summary or
  // content-inspection verbs may use descriptive partial-title resolution.
  if (!/^(?:summarize|summarise|explain|tell me (?:the key points|what it says)|what does)\b/i.test(message.trim())) return null;
  const prefixType = message.match(
    /^(?:(?:summarize|summarise|explain|tell me (?:the key points from|what it says about)|what does)\s+)?(?:the\s+|an?\s+)?(?:blog|article|post|case study|white ?paper|e-?book|report|webinar|event|press release|media coverage|guide|downloadable resource|resource)\s+(?:about\s+)?['“\"]?(.+?)['”\"]?[?.!]*$/i,
  );
  const suffixType = message.match(
    /^(?:(?:summarize|summarise|explain|what does)\s+)?(?:the\s+|an?\s+)?['“\"]?(.+?)['”\"]?\s+(?:blog|article|post|case study|white ?paper|e-?book|report|webinar|event|press release|media coverage|guide|downloadable resource|resource)[?.!]*$/i,
  );
  const subject = prefixType?.[1] ?? suffixType?.[1];
  return subject ? normalizeSearchText(subject) : null;
}

function ensureExplicitPremiseCorrection(
  answer: string,
  understanding: QueryUnderstanding,
): string {
  if (!understanding.containsPremise || !/\b(?:does not|cannot|has no|only|doesn't|can't|no )\b/i.test(understanding.normalizedQuery))
    return answer;
  if (/^\s*(?:no\b|that(?:'s| is) not correct|the premise)/i.test(answer) || /couldn.?t (?:find|confirm)/i.test(answer))
    return answer;
  return `No—the premise is not supported by Successive’s published evidence.\n\n${answer}`;
}

function selectRelatedNamedResource(
  subject: string,
  candidates: SearchMatch[],
): SearchMatch | undefined {
  const glue = new Set([
    "what", "who", "where", "when", "why", "how", "is", "are", "a", "an",
    "the", "of", "and", "or", "in", "to", "for", "blog", "article", "post",
    "resource", "report", "guide", "webinar", "event", "published", "item",
  ]);
  const normalizedSubject = normalizeSearchText(subject);
  const subjectTerms = normalizedSubject
    .split(" ")
    .filter((term) => term.length > 1 && !glue.has(term));
  if (!subjectTerms.length) return candidates[0];
  const definitionEntity = /^(?:what|who)\s+(?:is|are)\b/.test(normalizedSubject)
    ? subjectTerms.join(" ")
    : "";
  return candidates
    .map((candidate) => {
      const identity = ` ${candidate.document.normalizedTitle} ${candidate.document.slug.replace(/-/g, " ")} `;
      const body = ` ${candidate.document.combinedText} `;
      const titleHits = subjectTerms.filter((term) => identity.includes(` ${term} `)).length;
      const bodyHits = subjectTerms.filter((term) => body.includes(` ${term} `)).length;
      const definitionEvidence = definitionEntity && (
        body.includes(`what ${definitionEntity} is`) ||
        body.includes(`what an ${definitionEntity} is`) ||
        body.includes(`${definitionEntity} is an`) ||
        body.includes(`${definitionEntity} is a`)
      );
      return {
        candidate,
        identityQualified: titleHits / subjectTerms.length >= 0.5 || Boolean(definitionEvidence),
        score: titleHits * 30 + bodyHits * 8 + (definitionEvidence ? 80 : 0) +
          Math.min(20, Math.max(0, candidate.score) / 20),
      };
    })
    .filter(({ score, identityQualified }) => identityQualified && score >= 25)
    .sort((a, b) => b.score - a.score)[0]?.candidate;
}

function exhaustedResultsData() {
  return {
    answer:
      "I’ve already shown the available matching items for this topic. Ask about a specific item for more detail, or try a different topic.",
    cards: [],
    sources: [],
    suggestions: [
      "Explore a different topic",
      "Show me Successive services",
      "Show me a related case study",
    ],
    confidence: "medium" as const,
    insufficientContext: false,
  };
}

function exhaustedCollectionResponse(
  label: string,
  listing: { title: string; url: string },
  headers: Record<string, string>,
) {
  return NextResponse.json(
    {
      success: true,
      data: {
        ...exhaustedResultsData(),
        answer: `I’ve already shown the available ${label} in this conversation. You can revisit the [${listing.title.replace(/[\[\]]/g, "")}](${listing.url}) page or ask about a specific item.`,
        cards: [
          {
            type: "page" as const,
            title: listing.title,
            description: `Open the Successive ${label} listing page.`,
            url: listing.url,
            badge: label,
          },
        ],
        sources: [{ title: listing.title, url: listing.url }],
      },
    },
    { headers: { ...headers, "Cache-Control": "no-store" } },
  );
}

function buildHelpfulFallback(localizedFallback: string): string {
  const site = getEnv().SUCCESSIVE_PUBLIC_SITE_URL.replace(/\/$/, "");
  return `${localizedFallback} Try searching the [Successive website](${site}/?s=) or explore [Successive services](${site}/digital-transformation-services/) for more context.`;
}

function buildGroundedRetrievalAnswer(
  matches: Array<{
    document: SuccessiveSearchDocument;
    selectedPassages: string[];
  }>,
): string {
  return matches
    .slice(0, 3)
    .map(({ document, selectedPassages }) => {
      const description = bestStoryDescription(document, selectedPassages);
      return `**[${document.title.replace(/[\[\]]/g, "")}](${document.url})**\n\n${description}`;
    })
    .join("\n\n");
}

function buildWhitepaperCollectionAnswer(
  matches: Array<{
    document: SuccessiveSearchDocument;
    selectedPassages: string[];
  }>,
): string {
  const items = matches
    .map(
      ({ document }, index) =>
        `${index + 1}. [${document.title.replace(/[\[\]]/g, "")}](${document.url})`,
    )
    .join("\n");
  return `## Published Whitepapers\n\nSuccessive currently has **${matches.length} published whitepapers** available in the website API:\n\n${items}`;
}

function buildCollectionListAnswer(
  label: string,
  total: number,
  matches: Array<{ document: SuccessiveSearchDocument }>,
): string {
  const shown = matches.length;
  const summary =
    shown >= total
      ? `Successive has **${total} published ${total === 1 ? "entry" : "entries"}** in ${label}.`
      : `Successive has **${total} published entries** in ${label}. Showing **${shown} of ${total}**.`;
  const items = matches
    .map(
      ({ document }, index) =>
        `${index + 1}. [${document.title.replace(/[\[\]]/g, "")}](${document.url})`,
    )
    .join("\n");
  return `## ${label.replace(/\b\w/g, (letter) => letter.toUpperCase())}\n\n${summary}\n\n${items}`;
}

function buildRelatedSuggestions(
  intent: ReturnType<typeof detectIntent>,
  primaryTitle?: string,
): string[] {
  const title = primaryTitle?.replace(/\s+/g, " ").trim().slice(0, 90);
  const learnMore = title ? `How can ${title} help my business?` : "Show me relevant Successive services";
  const outcomes = title
    ? `What business outcomes can ${title} support?`
    : "What business outcomes can Successive support?";
  const implementation = title
    ? `How can Successive implement ${title} for my business?`
    : "How can Successive implement this for my business?";
  if (intent === "products" || intent === "product_detail")
    return [
      learnMore,
      outcomes,
      implementation,
    ];
  if (intent === "case_studies")
    return [
      learnMore,
      "What business outcomes does this customer work demonstrate?",
      "Which Successive service supports this?",
    ];
  if (intent === "blogs" || intent === "resources")
    return [
      learnMore,
      "What are the key business takeaways from this resource?",
      "Which Successive service is related to this?",
    ];
  if (intent === "events")
    return [
      learnMore,
      "What topics does this event cover?",
      "Which Successive service is related to this topic?",
    ];
  if (intent === "contact")
    return [
      "Show me Successive services",
      "Show me relevant case studies",
      "Tell me about Successive industries",
    ];
  return [
    learnMore,
    outcomes,
    implementation,
  ];
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

function buildPublishedContactAnswer(
  url: string,
  details: { phones: string[]; emails: string[] },
): string {
  const phoneText = details.phones.length
    ? `Published phone numbers: ${details.phones.map((phone) => `**${phone}**`).join(" and ")}.`
    : "The current Contact page does not publish a phone number.";
  const emailText = details.emails.length
    ? `Published email addresses: ${details.emails.map((email) => `**${email}**`).join(" and ")}.`
    : `The current page does not publish a direct email address; use the official [Contact Us](${url}) form to send a message.`;
  return `${phoneText} ${emailText}`;
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
  answer = sanitizeGroundedAnswerOpening(
    answer,
    matches.map(({ document }) => document.title),
  );
  const sourceTitles = new Set(
    matches.map(({ document }) => normalizeHeading(document.title)),
  );
  const leadingHeading = answer.trim().match(/^#{1,3}\s+([^\n]+)\n+/);
  // A retrieved page title is evidence, not the answer's topic. Do not force
  // an SEO/article title into the assistant response heading.
  const withHeading =
    leadingHeading && sourceTitles.has(normalizeHeading(leadingHeading[1]!))
      ? answer.trim().slice(leadingHeading[0].length).trim()
      : answer.trim();
  const sentences = withHeading.match(/[^.!?]+[.!?]+/g)?.length ?? 0;
  const hasInlinePageLink = matches.some(({ document }) =>
    withHeading.includes(`](${document.url})`),
  );
  if (withHeading.length >= 180 && sentences >= 2 && hasInlinePageLink)
    return withHeading;

  const details = matches.slice(0, 2).map(({ document, selectedPassages }) => {
    const description = bestStoryDescription(document, selectedPassages);
    return `[${document.title.replace(/[\[\]]/g, "")}](${document.url}) provides additional context: ${description}`;
  });
  return details.length
    ? `${withHeading}\n\n${details.join("\n\n")}`
    : withHeading;
}

function ensureDirectDefinition(
  answer: string,
  matches: Array<{
    document: SuccessiveSearchDocument;
    selectedPassages: string[];
  }>,
  message: string,
): string {
  const subject = message
    .trim()
    .match(/^what\s+is\s+(?:an?\s+)?(.+?)[?.!]*$/i)?.[1]
    ?.trim();
  if (!subject || subject.split(/\s+/).length > 8) return answer;
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definitionPattern = new RegExp(
    `\\b${escaped}\\s+is\\s+[^.!?]{15,320}[.!?]`,
    "i",
  );
  if (definitionPattern.test(answer.slice(0, 500))) return answer;
  const evidence = matches.flatMap(({ document, selectedPassages }) => [
    ...selectedPassages,
    ...document.textSegments,
    ...document.descriptions,
  ]);
  const definition = evidence
    .map((passage) => passage.match(definitionPattern)?.[0]?.trim())
    .find(Boolean);
  return definition ? `${definition}\n\n${answer}` : answer;
}

function bestStoryDescription(
  document: SuccessiveSearchDocument,
  selectedPassages: string[],
): string {
  const normalizedTitle = normalizeHeading(document.title);
  const candidates = [
    ...document.descriptions,
    ...selectedPassages,
    ...document.textSegments,
  ];
  const substantial = candidates.filter((value) => {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length >= 60 && normalizeHeading(clean) !== normalizedTitle;
  });
  const unique = substantial.filter((value, index) => {
    const clean = normalizeHeading(value);
    return !substantial
      .slice(0, index)
      .some((previous) => normalizeHeading(previous).includes(clean));
  });
  return cleanStoryDescription(
    unique.slice(0, 3).join(" ") || candidates[0] || document.title,
  );
}

function cleanStoryDescription(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 420) return clean;
  const shortened = clean.slice(0, 420);
  const sentenceEnd = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf("? "),
  );
  if (sentenceEnd >= 100) return shortened.slice(0, sentenceEnd + 1);
  const lastWord = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastWord > 0 ? lastWord : 240)}…`;
}
