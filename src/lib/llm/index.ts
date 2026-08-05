import { getEnv } from "../env";
import { OpenAIProvider } from "./openai-provider";
import type { LLMProvider } from "./types";
export function getLLMProvider(): LLMProvider {
  const provider = getEnv().AI_PROVIDER;
  if (provider === "openai" || provider === "nvidia")
    return new OpenAIProvider();
  throw new Error(`Unsupported LLM provider: ${provider}`);
}
