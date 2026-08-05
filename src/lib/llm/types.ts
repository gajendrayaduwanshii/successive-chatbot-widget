import type { HistoryMessage } from "@/types/chat";
import type { NormalizedContent } from "@/types/wordpress";
import type { AssistantResponse } from "./schemas";
export interface LLMInput {
  message: string;
  responseLanguage: string;
  fallbackAnswer: string;
  history: HistoryMessage[];
  context: NormalizedContent[];
}
export interface PreparedQuery {
  englishQuery: string;
  responseLanguage: string;
  contactAnswer: string;
  blogsAnswer: string;
  fallbackAnswer: string;
}
export interface LLMProvider {
  prepareMultilingualQuery(message: string): Promise<PreparedQuery>;
  generateStructuredResponse(input: LLMInput): Promise<AssistantResponse>;
}
