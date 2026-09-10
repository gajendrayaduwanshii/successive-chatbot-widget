import type { QueryUnderstanding } from "./query-understanding";
import { contactUsCta } from "./commercial-intent";

const CONTACTABLE_REQUEST = /\b(?:integrat(?:e|es|ed|ing|ion)|interoperab(?:le|ility)|compatib(?:le|ility)|connect(?:s|ed|ing|ion)?\s+with|support(?:s|ed|ing)?|work(?:s|ed|ing)?\s+with|implement(?:s|ed|ing|ation)?|deploy(?:s|ed|ing|ment)?|customi[sz](?:e|es|ed|ing|ation)|particular\s+(?:need|requirement|use\s*case)|specific\s+(?:need|requirement|technology|system|platform|use\s*case)|(?:available|provide|offer|deliver|operate|serve).{0,50}\b(?:our|my|this|the)\s+(?:region|country|location|market)|after[-\s]implementation|post[-\s]implementation|ongoing\s+(?:support|maintenance)|dedicated(?:\s+[a-z0-9+.#-]+){0,3}\s+(?:developers?|engineers?|team)|engagement\s+model|long[-\s]term\s+(?:project|engagement|support)|staff(?:ing| augmentation)|free\s+trial|trial\s+availability|free\s+demo|demo\s+availability)\b/i;

const BUSINESS_CONTEXT = /\b(?:your|our|my|company|business|organization|organisation|team|developers?|engineers?|staffing|engagement|project|system|platform|application|app|erp|crm|cms|technology|knowledge\s+base|monitoring\s+tools?|requirement|use\s*case|solution|services?|implementation|integration|region|market)\b/i;
const CONTENT_DISCOVERY = /\b(?:case stud(?:y|ies)|customer stor(?:y|ies)|blog|article|resource|whitepaper|e-?book|webinar|event|press release|report)\b/i;
const SENSITIVE_INFORMATION = /\b(?:revenue|stock price|valuation|confidential|private contract|contract details|client information|trade secret|nonpublic|unpublished financial)\b/i;

export type ContactableFallback = {
  subject: string | null;
  kind: "integration" | "implementation" | "support" | "availability" | "engagement" | "requirement" | "company_fact";
};

export type PublishedEvidenceState = "VALID_DIRECT" | "VALID_RELATED" | "NO_VALID_CONTENT";

function explicitCurrentSubject(message: string): string | null {
  const normalized = message.trim().replace(/[?.!]+$/, "");
  const possessiveOffering = normalized.match(
    /\b(?:your|successive(?: digital)?(?:'s)?)\s+([a-z0-9][a-z0-9+.#/& -]{1,100}?)\s+(?:services?|solutions?|capabilities|offerings?|platforms?(?!\s+services?\b))\b/i,
  )?.[1];
  const typedDiscovery = normalized.match(
    /\b(?:about|regarding|for)\s+([a-z0-9][a-z0-9+.#/& -]{1,100}?)\s+(?:services?|case stud(?:y|ies)|articles?|resources?|products?|industries|solutions?|capabilities)\b/i,
  )?.[1];
  const value = (possessiveOffering ?? typedDiscovery)?.trim();
  return value && !/^(?:the|a|an|this|that|these|those|our|my)$/i.test(value) ? value : null;
}

export function selectContactableFallback(
  message: string,
  understanding: QueryUnderstanding,
  evidenceState: PublishedEvidenceState,
  inheritedSubject?: string | null,
): ContactableFallback | null {
  if (evidenceState !== "NO_VALID_CONTENT") return null;
  return classifyContactableFallback(message, understanding, inheritedSubject);
}

/**
 * Classifies only business questions for which a Successive team discussion is
 * a reasonable next step. It deliberately does not decide whether evidence is
 * sufficient; callers invoke it only after validated content is exhausted.
 */
export function classifyContactableFallback(
  message: string,
  understanding: QueryUnderstanding,
  inheritedSubject?: string | null,
): ContactableFallback | null {
  if (
    understanding.isOffTopic ||
    understanding.intent === "off_topic" ||
    (understanding.requestedContentType != null && [
      "case-study", "blog", "whitepaper", "ebook", "webinar", "event",
      "press-release", "media-coverage", "news", "resource", "thought-leadership",
    ].includes(understanding.requestedContentType)) ||
    CONTENT_DISCOVERY.test(message) ||
    SENSITIVE_INFORMATION.test(message) ||
    !CONTACTABLE_REQUEST.test(message) ||
    !BUSINESS_CONTEXT.test(message)
  ) return null;

  const normalized = message.toLowerCase();
  const kind = /integrat|interoperab|compatib|connect(?:s|ed|ing|ion)?\s+with|work(?:s|ed|ing)?\s+with/.test(normalized)
    ? "integration"
    : /dedicated|engagement model|long[-\s]term|staff(?:ing| augmentation)/.test(normalized)
      ? "engagement"
    : /implement|deploy|customi[sz]/.test(normalized)
      ? "implementation"
      : /support|maintenance/.test(normalized)
        ? "support"
        : /available|provide|offer|deliver|operate|serve|trial|demo/.test(normalized)
          ? "availability"
          : "requirement";
  const refersToPriorSubject = /\b(?:this|that|it|its|these|those|them)\b/i.test(message);
  const explicitSubject = explicitCurrentSubject(message);
  const meaningfulTopic = understanding.topics.find((topic) =>
    !/^(?:this|that|for|free|trial|demo|support|supported|supporting|specific|particular|existing|custom|dedicated|long|term|implementation|implement|integration|integrate|availability|available|engagement|staffing|requirement|requirements|need|needs|company|business|project|projects|service|solution|developers?|engineers?|team)$/i.test(topic),
  );
  const subject = refersToPriorSubject && inheritedSubject
    ? inheritedSubject
    : explicitSubject ?? understanding.entities[0] ?? meaningfulTopic ?? null;
  return { subject, kind };
}

export function buildContactableFallbackAnswer(
  decision: ContactableFallback,
  contactUrl: string,
): string {
  if (decision.kind === "company_fact") {
    const fact = decision.subject ? ` **${decision.subject}**` : " that company information";
    return `I couldn’t find a publicly confirmed${fact} for Successive Digital in the available published content. For the most accurate and up-to-date information, ${contactUsCta(contactUrl).replace(/^To discuss your requirements further, /, "")}`;
  }
  const subject = decision.subject ? ` for **${decision.subject}**` : "";
  const limitation = decision.kind === "integration"
    ? `The available published Successive content does not confirm that specific integration${subject}.`
    : decision.kind === "support"
      ? `I couldn't confirm that exact support requirement${subject} from the available published Successive content.`
      : decision.kind === "availability"
        ? `The available published Successive content does not confirm that specific availability${subject}.`
        : decision.kind === "engagement"
          ? `I couldn't confirm that exact engagement model${subject} from the available published Successive content.`
        : decision.kind === "implementation"
          ? `I couldn't verify that exact implementation requirement${subject} from the published Successive content.`
          : `I couldn't confirm that particular requirement${subject} from the available published Successive content.`;
  return `${limitation} ${contactUsCta(contactUrl)}`;
}
