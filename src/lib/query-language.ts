import type { PreparedQuery } from "./llm/types";

const ROMAN_HINDI_TERMS =
  /\b(aap|aapke|apke|batao|bare|baare|hai|hain|ka|karo|ke|ki|ko|mein|mujhe|nahi|par|se|sirf|yeh)\b/i;
const NON_LATIN_SCRIPT = /[^\u0000-\u024f\u1e00-\u1eff]/u;

export function canUseEnglishQueryDirectly(message: string): boolean {
  return !NON_LATIN_SCRIPT.test(message) && !ROMAN_HINDI_TERMS.test(message);
}

const ROUTING_VOCABULARY = [
  "about", "capabilities", "capability", "career", "careers", "case", "jobs",
  "openings", "quote", "services", "studies", "study", "support",
] as const;

function oneBoundedEdit(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const differences = [...left].map((value, index) => value === right[index] ? -1 : index).filter((index) => index >= 0);
    if (differences.length <= 1) return true;
    return differences.length === 2 && differences[1] === differences[0]! + 1 &&
      left[differences[0]!] === right[differences[1]!] && left[differences[1]!] === right[differences[0]!];
  }
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  let offset = 0;
  for (let index = 0; index < shorter.length; index++) {
    if (shorter[index] !== longer[index + offset]) {
      if (offset) return false;
      offset = 1;
      if (shorter[index] !== longer[index + offset]) return false;
    }
  }
  return true;
}

/** Conservative normalization for routing language, not arbitrary user topics. */
export function normalizeInformalEnglish(message: string): string {
  const withoutResetWrapper = message.trim()
    .replace(/^(?:switching|changing)\s+(?:topics?|subjects?)\s*[:,.-]?\s*/i, "")
    .replace(/^(?:leaving|putting)\s+.{1,60}?\s+aside\s*[:,.-]?\s*/i, "")
    .replace(/^(?:after|instead of)\s+.{1,40}?\s*[:,.-]\s*(?=(?:tell|show|explain|describe|what|who|how|do|can)\b)/i, "")
    .replace(/^(?:now|actually|instead|anyway)\s*[:,.-]?\s*/i, "");
  const shorthand: Record<string, string> = {
    u: "you", ur: "your", wat: "what", wht: "what", abt: "about",
    rn: "right now", pls: "please", plz: "please",
  };
  return withoutResetWrapper.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part)) return part;
    const punctuation = part.match(/^([^a-z0-9]*)([a-z]+)([^a-z0-9]*)$/i);
    if (!punctuation) return part;
    const [, prefix, raw, suffix] = punctuation;
    const lower = raw!.toLowerCase();
    const direct = shorthand[lower];
    if (direct) return `${prefix}${direct}${suffix}`;
    if (lower.endsWith("isation")) return `${prefix}${lower.slice(0, -7)}ization${suffix}`;
    if (lower.length < 4) return part;
    const candidates = ROUTING_VOCABULARY.filter((candidate) => oneBoundedEdit(lower, candidate));
    return candidates.length === 1 ? `${prefix}${candidates[0]}${suffix}` : part;
  }).join("").replace(/\s+/g, " ").trim();
}

export function prepareEnglishQuery(message: string): PreparedQuery {
  return {
    englishQuery: normalizeInformalEnglish(message),
    responseLanguage: "English",
    contactAnswer: "Contact Successive through the official Contact Us page.",
    blogsAnswer: "Here are Successive's published blog articles:",
    fallbackAnswer:
      "I could not find reliable information in the available Successive website content.",
  };
}
