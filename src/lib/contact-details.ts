import type { JsonValue } from "@/types/wordpress";

/** Recursively extracts only contact fields that WordPress actually publishes. */
export function extractPublishedContactDetails(value: JsonValue | undefined) {
  const phones = new Set<string>();
  const emails = new Set<string>();
  const addresses = new Set<string>();
  const visit = (node: JsonValue | undefined, key = "") => {
    if (typeof node === "string") {
      if (/phone|telephone|mobile|contact/i.test(key)) {
        for (const match of node.match(/\+?\d[\d ()-]{7,}\d/g) ?? []) phones.add(match.trim());
      }
      if (/email|e-mail/i.test(key)) {
        for (const match of node.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) emails.add(match);
      }
      if (/address|location|office/i.test(key) && !/^https?:/i.test(node.trim()) && node.trim().length >= 8)
        addresses.add(node.trim());
      return;
    }
    if (Array.isArray(node)) return node.forEach((child) => visit(child, key));
    if (node && typeof node === "object")
      Object.entries(node).forEach(([childKey, child]) => visit(child as JsonValue, childKey));
  };
  visit(value);
  return { phones: [...phones], emails: [...emails], addresses: [...addresses] };
}
