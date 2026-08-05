export type Intent =
  | "products"
  | "product_detail"
  | "case_studies"
  | "blogs"
  | "events"
  | "resources"
  | "contact"
  | "about"
  | "page"
  | "general";
const includes = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term));

export function detectIntent(query: string): Intent {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  // Visitors often use navigation-style one or two word prompts. Treat those
  // as real content intents instead of requiring a full sentence.
  if (/^(about|about us|company|company info(?:rmation)?)$/.test(q))
    return "about";
  if (
    includes(q, [
      "case study",
      "case studies",
      "customer story",
      "customer stories",
      "customers",
      "clients",
      "success story",
      "success stories",
    ])
  )
    return "case_studies";
  if (includes(q, ["event", "events", "webinar", "webinars"])) return "events";
  if (
    includes(q, [
      "contact",
      "email",
      "talk to",
      "book a demo",
      "reach successive",
    ])
  )
    return "contact";
  if (
    includes(q, [
      "successive add",
      "agentic-driven delivery",
      "agentic driven delivery",
      "adaptive compatibility",
    ])
  )
    return "product_detail";
  if (
    includes(q, ["company", "who is successive", "successive ai"]) ||
    /^(?:tell me )?about (?:successive|the company)$/.test(q)
  )
    return "about";
  if (
    includes(q, [
      "product",
      "products",
      "service",
      "services",
      "offering",
      "offerings",
      "development",
      "consulting",
      "solution",
      "solutions",
      "platform",
    ])
  )
    return "products";
  if (includes(q, ["resource", "resources"])) return "resources";
  if (includes(q, ["blog", "article", "articles", "insight", "insights"]))
    return "blogs";
  if (
    includes(q, [
      "page",
      "privacy",
      "sitemap",
      "career",
      "careers",
      "job",
      "jobs",
      "industry",
      "industries",
      "induster",
      "industers",
    ])
  )
    return "page";
  return "general";
}
