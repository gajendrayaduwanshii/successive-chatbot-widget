import { normalizeSearchText } from "./search-index";

type HistoryMessage = { role: "user" | "assistant"; content: string };

const CONTEXTUAL_FOLLOW_UP =
  /\b(?:that|this|it|these|those|them|first one|second one|another|another one|similar|example|case stud(?:y|ies)|article|blog|webinar|event|service|services|recommend|suggest|implement|more detail|tell me more|explain more|simpler|what about|how does|what should i do next)\b/i;
const EXPLICIT_TOPIC_SWITCH =
  /\b(?:actually|instead|switch(?:ing)? to|more interested in|new topic)\b/i;
const SELF_CONTAINED_TOPIC =
  /\b(?:(?:all|total|list|count|how many)\s+(?:services?|white ?papers?|whitepepers?|whtieperpers?|webinars?|events?|case studies|blogs?|industries|accelerators?|expertise|pillars?)|white ?papers?|whitepepers?|whtieperpers?|ai (?:services?|solutions?|consulting)|artificial intelligence (?:services?|solutions?|consulting)|cloud (?:services?|solutions?|migration)|migrate (?:to )?(?:aws|azure|cloud)|full[ -]?stack development|location intelligence|arcgis|gis|retail business|healthcare solutions?)\b/i;

export function buildConversationRetrievalQuery(
  message: string,
  history: HistoryMessage[],
): string {
  const clean = message.trim();
  if (
    !clean ||
    EXPLICIT_TOPIC_SWITCH.test(clean) ||
    SELF_CONTAINED_TOPIC.test(clean)
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
      .replace(
        /^.*?\b(?:more interested in|switch(?:ing)? to|instead)\s+/i,
        "",
      )
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
  const shortMessage = normalizeSearchText(clean).split(" ").length <= 6;
  if (!shortMessage && !CONTEXTUAL_FOLLOW_UP.test(clean)) return clean;
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
