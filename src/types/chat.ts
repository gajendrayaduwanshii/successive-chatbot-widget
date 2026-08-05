import type { AssistantResponse } from "@/lib/llm/schemas";
export type ChatRole = "user" | "assistant";
export interface HistoryMessage {
  role: ChatRole;
  content: string;
}
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  response?: AssistantResponse;
  failedPrompt?: string;
}
