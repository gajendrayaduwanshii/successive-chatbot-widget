import { normalizeSearchText } from "./search-index";
import type { Intent } from "./intent-detector";

type HistoryMessage = { role: "user" | "assistant"; content: string };

const CONTEXTUAL_FOLLOW_UP =
  /\b(?:that|this|it|these|those|them|first one|second one|another|another one|similar|example|case stud(?:y|ies)|article|blog|webinar|event|service|services|serivce|serivces|recommend|suggest|implement|more detail|tell me more|explain more|simpler|what about|how does|what should i do next)\b/i;
const EXPLICIT_TOPIC_SWITCH =
  /\b(?:actually|instead|switch(?:ing)? to|more interested in|new topic)\b/i;
const SELF_CONTAINED_TOPIC =
  /\b(?:(?:all|total|list|count|how many)\s+(?:services?|white ?papers?|whitepepers?|whtieperpers?|webinars?|events?|case studies|blogs?|industries|accelerators?|expertise|pillars?)|white ?papers?|whitepepers?|whtieperpers?|ai (?:services?|solutions?|consulting)|artificial intelligence (?:services?|solutions?|consulting)|cloud (?:services?|solutions?|migration)|migrate (?:to )?(?:aws|azure|cloud)|full[ -]?stack development|location intelligence|arcgis|gis|retail business|healthcare solutions?)\b/i;

// Suggestion chips often use "Tell me more about <published title>". The
// explicit title is a complete new retrieval subject, not a pronoun-based
// follow-up that should inherit every earlier user query.
const EXPLICIT_NAMED_SUBJECT =
  /^(?:tell me more about|tell me about|explain|show me)\s+(?!this\b|that\b|it\b|the (?:first|second|next) one\b).{8,}$/i;

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
  if (
    !clean ||
    EXPLICIT_TOPIC_SWITCH.test(clean) ||
    SELF_CONTAINED_TOPIC.test(clean) ||
    EXPLICIT_NAMED_SUBJECT.test(clean)
  )
    return clean;
  let userHistory = history
    .filter((item) => item.role === "user")
    .map((item) => item.content.trim())
    .filter(Boolean);
  const lastSwitch = userHistory.findLastIndex((item) =>
    EXPLICIT_TOPIC_SWITCH.test(item),
  );
  if (lastSwitch >= 0) {
    userHistory = userHistory.slice(lastSwitch);
    userHistory[0] = userHistory[0]
      .replace(/^.*?\b(?:more interested in|switch(?:ing)? to|instead)\s+/i, "")
      .replace(/[.!?]+$/, "")
      .trim();
  }
  userHistory = userHistory.filter(
    (item) =>
      !/^(?:any |do you have (?:any )?)?(?:webinar|webinars|event|events)\??$/i.test(
        item,
      ) && !/^(?:that sounds useful|okay|thanks|thank you)[.!]?$/i.test(item),
  );
  userHistory = userHistory.slice(-4);
  if (!userHistory.length) return clean;
  // A short named topic such as "Innovation" or "Digital Transformation"
  // must be searched on its own. Only short messages containing an actual
  // referential/follow-up term inherit history.
  if (!CONTEXTUAL_FOLLOW_UP.test(clean)) return clean;
  return [...userHistory, clean].join(". ");
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
