import { normalizeSearchText } from "./search-index";
import type { Intent } from "./intent-detector";
import { buildDeterministicUnderstanding, buildRetrievalQuery } from "./query-understanding";

type HistoryMessage = { role: "user" | "assistant"; content: string };

export function asksForAnotherResult(message: string): boolean {
  const normalized = normalizeSearchText(message);
  if (/^(?:tell me more about|tell me about|explain)\b/.test(normalized))
    return false;
  return /^(?:(?:show|give|find) me )?(?:more|another|other|different|next)(?:\s+(?:one|result|item|option|example|service|serivce|serivces|case study|blog|article|webinar|event))?s?$/.test(
    normalized,
  );
}

export function contentIdentity(title: string, url: string): string[] {
  const normalizedUrl = url.trim().replace(/\/$/, "").toLowerCase();
  const normalizedTitle = normalizeSearchText(title);
  return [
    ...(normalizedUrl ? [`url:${normalizedUrl}`] : []),
    ...(normalizedTitle ? [`title:${normalizedTitle}`] : []),
  ];
}

export function contentIdentitiesFromAssistantHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string[] {
  const identities = new Set<string>();
  history
    .filter((message) => message.role === "assistant")
    .forEach(({ content }) => {
      const markdownLinks = content.matchAll(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      );
      for (const match of markdownLinks) {
        contentIdentity(match[1] ?? "", match[2] ?? "").forEach((key) =>
          identities.add(key),
        );
      }
    });
  return [...identities];
}

export function resolveOfferedResourceFollowUp(
  message: string,
  history: HistoryMessage[],
): string | undefined {
  const normalized = normalizeSearchText(message);
  const affirmative = /^(?:yes|yes please|sure|okay|ok|please do|go ahead)$/.test(normalized);
  const ordinal = normalized.match(/(?:summarize |show |open |tell me about )?(?:the )?(first|second|third)(?: one| item| article| resource)?/i)?.[1];
  if (!affirmative && !ordinal) return undefined;
  const prior = history.findLast((item) => item.role === "assistant")?.content ?? "";
  const links = [...prior.matchAll(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g)]
    .map((match) => ({ title: match[1]!.trim(), url: match[2]! }))
    .filter(({ title }) => title.length >= 3);
  if (!links.length) return undefined;
  if (affirmative && !/would you like me to summarize|related (?:article|resource|case study|alternative)/i.test(prior))
    return undefined;
  const index = ordinal === "second" ? 1 : ordinal === "third" ? 2 : 0;
  const selected = links[index];
  const offeredTypeRaw = prior.match(/related (blogs?|articles?|case stud(?:y|ies)|white ?papers?|e-?books?|webinars?|events?|press releases?|media coverage|products?|partner pages?|service pages?|industry pages?|guides?|resources?)/i)?.[1] ?? "resource";
  const offeredType = offeredTypeRaw
    .replace(/case studies/i, "case study")
    .replace(/s$/i, "");
  return selected ? `Summarize '${selected.title}' ${offeredType}` : undefined;
}

export function buildRelatedServiceRetrievalQuery(
  message: string,
  history: HistoryMessage[],
): string | undefined {
  const normalized = normalizeSearchText(message);
  if (
    !/\b(?:related|relevant|supports?|for this)\b.*\bservices?\b|\bservices?\b.*\b(?:related|relevant|supports?|for this)\b/.test(
      normalized,
    )
  )
    return undefined;
  const assistantMessages = history
    .filter((item) => item.role === "assistant")
    .map((item) => item.content)
    .reverse();
  for (const content of assistantMessages) {
    const titles = [...content.matchAll(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g)]
      .map((match) => match[1]?.replace(/\*\*/g, "").trim() ?? "")
      .filter(
        (title) =>
          title.length >= 4 &&
          !/^(?:successive website|successive services|contact us|learn more)$/i.test(
            title,
          ),
      )
      .slice(0, 3);
    if (titles.length)
      return `${titles.join(". ")}. related Successive services`;
  }
  // A fallback answer has no meaningful subject to relate against. Suggestion
  // clicks must start broad service discovery instead of carrying the
  // unsupported user text (for example, random keyboard input) into search.
  return "digital transformation cloud data artificial intelligence experience design services";
}

export function shouldDeduplicateDiscoveryResults(
  message: string,
  intent: Intent,
): boolean {
  void intent; // Retained in the public helper signature for existing callers.
  // Seeing a link once must not make the subject unavailable for the rest of
  // the conversation. An exact repeat (including navigation such as Contact
  // Us) should therefore be answered normally. Exclude seen content only when
  // the visitor explicitly asks to discover another/more/different result.
  return asksForAnotherResult(message);
}

export function buildConversationRetrievalQuery(
  message: string,
  history: HistoryMessage[],
): string {
  const clean = message.trim();
  if (!clean) return clean;
  const current = buildDeterministicUnderstanding(clean);
  // Any explicit current subject wins. This also preserves intentional
  // comparisons/relationships because every current subject stays in the
  // current plan while no older subject is introduced.
  if (current.topics.length || current.entities.length || current.industry)
    return clean;
  const prior = history
    .filter((item) => item.role === "user")
    .map((item) => buildDeterministicUnderstanding(item.content))
    .findLast((candidate) => candidate.topics.length || candidate.entities.length || candidate.industry);
  if (!prior) return clean;
  const inheritedSubject = buildRetrievalQuery({
    ...prior,
    requestedContentType: current.requestedContentType ?? prior.requestedContentType,
  });
  return inheritedSubject ? `${inheritedSubject} ${clean}`.trim() : clean;
}

export function isVagueBusinessDiscovery(query: string): boolean {
  const normalized = normalizeSearchText(query);
  return (
    /^(?:need help|help|for company|technology|business help|i need some help for my business)(?:\s+.*)?$/.test(
      normalized,
    ) ||
    /\b(?:need|want|give|provide)\b.*\b(?:suggestion|suggestions|suggetion|suggetions|recommendation|recommendations)\b.*\bservices?\b/.test(
      normalized,
    ) ||
    /\b(?:suggest|recommend)\b.*\bservices?\b/.test(normalized)
  );
}
