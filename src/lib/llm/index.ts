import { getEnv } from "../env";
import { GeminiProvider } from "./gemini-provider";
import { OpenAIProvider } from "./openai-provider";
import type { LLMProvider } from "./types";
export function getLLMProvider(): LLMProvider {
  const provider = getEnv().AI_PROVIDER;
  if (provider === "gemini") return new GeminiProvider();
  if (provider === "openai" || provider === "nvidia" || provider === "groq")
    return new OpenAIProvider();
  throw new Error(`Unsupported LLM provider: ${provider}`);
}
