import type { AssistantResponse } from "./llm/schemas";

const GREETING =
  /^(?:hi|hii+|hello|hey|good\s+(?:morning|afternoon|evening)|namaste)[!,.?\s]*$/i;

export function isGreeting(message: string): boolean {
  return GREETING.test(message.trim());
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
