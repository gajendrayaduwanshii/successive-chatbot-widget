import type { PreparedQuery } from "./llm/types";

const ROMAN_HINDI_TERMS =
  /\b(aap|aapke|apke|batao|bare|baare|hai|hain|ka|karo|ke|ki|ko|mein|mujhe|nahi|par|se|sirf|yeh)\b/i;
const NON_LATIN_SCRIPT = /[^\u0000-\u024f\u1e00-\u1eff]/u;

export function canUseEnglishQueryDirectly(message: string): boolean {
  return !NON_LATIN_SCRIPT.test(message) && !ROMAN_HINDI_TERMS.test(message);
}

export function prepareEnglishQuery(message: string): PreparedQuery {
  return {
    englishQuery: message,
    responseLanguage: "English",
    contactAnswer: "Contact Successive through the official Contact Us page.",
    blogsAnswer: "Here are Successive's published blog articles:",
    fallbackAnswer:
      "I could not find reliable information in the available Successive website content.",
  };
}
