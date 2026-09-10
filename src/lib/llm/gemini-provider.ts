import { getEnv } from "../env";
import { OpenAIProvider } from "./openai-provider";

function geminiOpenAIBaseUrl(baseUrl: string | undefined) {
  const normalized = (baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  return /\/openai$/i.test(normalized) ? `${normalized}/` : `${normalized}/openai/`;
}

export class GeminiProvider extends OpenAIProvider {
  constructor() {
    super(geminiOpenAIBaseUrl(getEnv().AI_BASE_URL));
  }
}