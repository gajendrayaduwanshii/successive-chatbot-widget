import type { AssistantResponse } from "./llm/schemas";

const GREETING =
  /^(?:hi|hii+|hello|hey|good\s+(?:morning|afternoon|evening)|namaste)[!,.?\s]*$/i;

export function isGreeting(message: string): boolean {
  return GREETING.test(message.trim());
}

/**
 * A bare request for help has no reliable retrieval subject. Keep this check
 * deterministic so a previous conversation topic cannot make the assistant
 * guess a page, title, or case study for prompts such as "i wan thelp".
 */
export function isGenericHelpRequest(message: string): boolean {
  const compact = message.toLowerCase().replace(/[^a-z]/g, "");
  return /^(?:i)?(?:need|want|wan)?(?:some)?(?:help|assistance)$/.test(compact);
}

export function greetingResponse(): AssistantResponse {
  return {
    answer:
      "Hey there! Welcome to the Successive AI Assistant. What would you like to explore today?",
    cards: [],
    suggestions: [
      "Explore Successive services",
      "Show me case studies",
      "Tell me about Successive",
      "Contact Successive",
    ],
    sources: [],
    confidence: "high",
    insufficientContext: false,
  };
}
