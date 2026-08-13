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
  const q = query
    .toLowerCase()
    .replace(/\bservies\b/g, "services")
    .replace(/\bserivces?\b/g, "services")
    .replace(/\bsulutions?\b/g, "solutions")
    .replace(/\bhelthcare\b/g, "healthcare")
    .replace(/\bwebniars?\b/g, "webinars")
    .replace(/\bwhitepepers?\b/g, "whitepapers")
    .replace(/\bwhtieperpers?\b/g, "whitepapers")
    .replace(/\bstduy\b/g, "study")
    .replace(/\bdevlopment\b/g, "development")
    .replace(/\breleted\b/g, "related")
    .replace(/\s+/g, " ")
    .trim();
  // Visitors often use navigation-style one or two word prompts. Treat those
  // as real content intents instead of requiring a full sentence.
  if (/^(about|about us|company|company info(?:rmation)?)$/.test(q))
    return "about";
  if (/^(?:show me )?(?:customers|clients|customer examples?)$/.test(q))
    return "case_studies";
  if (
    includes(q, [
      "case study",
      "case studies",
      "customer story",
      "customer stories",
      "success story",
      "success stories",
      "another example",
      "similar example",
      "similar work",
      "done something similar",
      "any example",
      "any examples",
      "example for this",
      "examples for this",
    ])
  )
    return "case_studies";
  if (
    includes(q, [
      "event",
      "events",
      "webinar",
      "webinars",
      "which one should i attend",
      "where can i register",
    ])
  )
    return "events";
  if (
    includes(q, [
      "contact",
      "email",
      "talk to",
      "book a demo",
      "reach successive",
      "where are successive offices",
      "where are your offices",
      "where is successive located",
      "office locations",
      "speak with someone",
      "what should i do next",
      "project estimate",
      "get an estimate",
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
    includes(q, [
      "who is successive",
      "successive ai",
    ]) ||
    /^(?:tell me )?about (?:successive|the company)$/.test(q)
  )
    return "about";
  if (/^(?:tell me about|who is|what is) successive(?: digital)?[?.!]*$/.test(q))
    return "about";
  if (
    /^(?:can you )?explain(?: about)? (?:your )?successive(?: digital)?[?.!]*$/.test(q) ||
    /^(?:tell me about|explain|what is) (?:your|the) company[?.!]*$/.test(q)
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
  if (
    includes(q, [
      "resource",
      "resources",
      "whitepaper",
      "whitepapers",
      "white paper",
      "white papers",
      "whitepeper",
      "whitepepers",
      "whtieperper",
      "whtieperpers",
    ])
  )
    return "resources";
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
