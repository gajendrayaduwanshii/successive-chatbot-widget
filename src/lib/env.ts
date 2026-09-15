import { z } from "zod";

const serverEnvSchema = z.object({
  SUCCESSIVE_API_BASE_URL: z
    .string()
    .url()
    .default("https://successive.tech/wp-json/successive-digital/v1"),
  SUCCESSIVE_PUBLIC_SITE_URL: z
    .string()
    .url()
    .default("https://successive.tech"),
  AI_PROVIDER: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  LLM_PROVIDER: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      "http://localhost:3000,https://successive.tech,https://www.successive.tech",
    ),
  WIDGET_ALLOWED_ORIGINS: z.string().optional(),
});

export function getEnv() {
  const env = serverEnvSchema.parse(process.env);
  return {
    ...env,
    AI_PROVIDER: env.AI_PROVIDER ?? env.LLM_PROVIDER ?? "openai",
    AI_API_KEY: env.AI_API_KEY ?? env.LLM_API_KEY,
    AI_MODEL: env.AI_MODEL ?? env.LLM_MODEL ?? "gpt-4.1-mini",
  };
}
