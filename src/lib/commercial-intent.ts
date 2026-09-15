import { normalizeSearchText } from "./search-index";

export type CommercialIntent =
  | "pricing"
  | "estimate"
  | "quote"
  | "proposal"
  | "consultation"
  | "contact_sales"
  | "project_discussion"
  | "implementation"
  | "buying";

const INTENT_ORDER: CommercialIntent[] = [
  "pricing", "estimate", "quote", "proposal", "consultation", "project_discussion",
  "contact_sales", "implementation", "buying",
];

const COMMERCIAL_NOUN = /\b(?:costs?|pricing|prices?|charges?|rates?|budgets?|estimates?|quotations?|quotes?|proposals?|commercials?|consultations?)\b/;
const COMMERCIAL_REQUEST = /\b(?:request|need|want|like|help|give|provide|prepare|send|share|get|receive|discuss|talk|speak|connect|contact|reach|call|callback|buy|purchase|engage|hire|start|kick[ -]?off|implement|implementing|build|develop)\b/;

/**
 * An explicit editorial request owns its named title/topic span. Commercial
 * vocabulary inside that span is descriptive title text, not an action. A
 * later actionable clause remains available for genuine mixed-intent turns.
 */
export function explicitEditorialSubject(message: string): string | undefined {
  const normalized = normalizeSearchText(message);
  const trailingRole = normalized.match(
    /^(?:show me|tell me about)\s+(?:the\s+)?(.+?)\s+(?:article|blog|resource|case study)(?:\s+(?:and|then|also)\s+.*)?$/,
  );
  if (trailingRole?.[1]) return trailingRole[1].trim();
  const match = normalized.match(
    /^(?:(?:show|find|list|give me|do you have|show me)\s+(?:the\s+)?(?:articles?|blogs?|resources?|case studies|customer stories)\s*(?:related to|about|titled|called)?\s+|(?:tell me about|show me)\s+(?:the\s+)?(?:article|blog|resource|case study)\s+(?:titled|called)?\s+)(.+)$/,
  );
  if (!match?.[1]) return undefined;
  return match[1]
    .split(/\s+(?:and|then|also)\s+(?=(?:tell|give|what|how|can|could|would|need|want)\b)/)[0]
    ?.trim() || undefined;
}

function commercialActionText(message: string): string {
  const normalized = normalizeSearchText(message);
  const subject = explicitEditorialSubject(message);
  return subject ? normalized.replace(subject, " ").replace(/\s+/g, " ").trim() : normalized;
}

/** Generic, compositional commercial classification; no production question list. */
export function detectCommercialIntent(message: string): CommercialIntent | null {
  return detectCommercialIntents(message)[0] ?? null;
}

/** Returns every explicitly requested commercial action, in the user's order. */
export function detectCommercialIntents(message: string): CommercialIntent[] {
  const q = normalizeSearchText(message);
  const actionText = commercialActionText(message);
  const informationalCostTopic = /^(?:tell|show|explain|describe|summarize|what is|what are)\b.*\b(?:cost optimi[sz]ation|cost control|cost management|finops)\b/.test(q);
  if (informationalCostTopic && !/\b(?:project cost|pricing|estimate|quote|quotation|proposal|sales)\b/.test(q)) return [];
  if (/\b(?:do not|don t|not)\s+(?:need|want|asking (?:for|about))\s+(?:the )?(?:price|pricing|cost|estimate|quote|quotation|proposal)\b/.test(q) &&
      !/\b(?:instead|but|actually)\b.*\b(?:price|pricing|project cost|estimate|quote|quotation|proposal)\b/.test(q)) return [];
  if (/\b(?:reduce|lower|control|optimi[sz]e|cut|save on)\b.*\b(?:costs?|prices?|spend|budget)\b/.test(q) &&
      !/\b(?:estimate|quote|quotation|proposal|pricing|contact|sales)\b/.test(q)) return [];
  const matches: Array<{ intent: CommercialIntent; index: number }> = [];
  const add = (intent: CommercialIntent, expression: RegExp) => {
    const match = expression.exec(actionText);
    if (match) matches.push({ intent, index: match.index });
  };
  add("pricing", /\b(?:how much|what(?:'s| is| are) (?:the )?(?:cost|price|pricing)|costs?|prices?|pricing|charges?|rates?)\b/);
  add("estimate", /\b(?:estimates?|budgets?)\b/);
  add("quote", /\b(?:quotations?|quotes?)\b/);
  add("proposal", /\b(?:proposals?|commercial proposal)\b/);
  add("consultation", /\b(?:consultation|consulting call|talk to (?:an? )?expert|speak (?:to|with) (?:an? )?expert|(?:need|want|request|book|get|schedule|offer|provide|can i (?:get|have)) (?:a )?(?:demo|free trial|trial)|discuss (?:this|that|it|the requirement|my requirement|our requirement) with (?:your|the) team)\b/);
  add("contact_sales", /\b(?:contact|connect|reach|speak|talk|call|callback)\b.*\b(?:sales|team|successive|someone|expert|representative|advisor)\b|\b(?:sales|team|someone|expert|representative|advisor)\b.*\b(?:contact|connect|reach|speak|talk|call)\b/);
  add("project_discussion", /\b(?:project|requirements?|engagement|sales)\b.*\b(?:discuss|discussion|talk|review|explore)\b|\b(?:discuss|discussion|talk|review|explore)\b.*\b(?:project|requirements?|engagement|sales|team)\b/);
  add("project_discussion", /\b(?:contact|connect|get in touch|speak|talk)\b.{0,80}\b(?:projects?|services?|implementations?|integrations?|engagements?|proposals?|quotations?|quotes?|requirements?|business)\b|\b(?:projects?|services?|implementations?|integrations?|engagements?|proposals?|quotations?|quotes?|requirements?|business)\b.{0,80}\b(?:contact|connect|get in touch|speak|talk)\b/);
  add("project_discussion", /\b(?:what|how)\b.{0,50}\bprojects?\b.{0,50}\b(?:involve|include|entail|work|run)\b/);
  add("estimate", /\b(?:delivery |project |implementation )?timelines?\b/);
  add("project_discussion", /\b(?:dedicated teams?|custom requirements?)\b/);
  const implementationAction = /\b(?:implement(?:ing|ation)?|deploy(?:ing|ment)?|roll(?:ing)? out|adopt(?:ing|ion)?)\b/;
  const commercialActor = /\b(?:can|could|would|help|need|want|like|team|successive|partner|hire|engage|for us|for me|our|my)\b/;
  if (implementationAction.test(q) && commercialActor.test(q) &&
      !/^how (?:is|are|was|were|do|does)\b/.test(q)) add("implementation", implementationAction);
  if (/\bintegration requirements?\b/.test(q)) add("implementation", /\bintegration requirements?\b/);
  add("buying", /\b(?:buy|purchase|engage|hire|start (?:a|the|our) project|work with successive|next steps?|get started)\b/);
  if (!matches.length && COMMERCIAL_NOUN.test(actionText) && (COMMERCIAL_REQUEST.test(actionText) || /[?]$/.test(message.trim())))
    matches.push({ intent: "pricing", index: actionText.search(COMMERCIAL_NOUN) });
  return matches
    .sort((a, b) => a.index - b.index || INTENT_ORDER.indexOf(a.intent) - INTENT_ORDER.indexOf(b.intent))
    .filter((item, index, all) => all.findIndex((other) => other.intent === item.intent) === index)
    .map(({ intent }) => intent);
}

const SUBJECT_NOISE = new Set([
  "cost", "costs", "pricing", "price", "prices", "charge", "charges", "rate", "rates",
  "budget", "budgets", "estimate", "estimates", "quotation", "quotations", "quote", "quotes",
  "proposal", "proposals", "commercial", "consultation", "sales", "contact", "callback", "request",
  "timeline", "timelines", "dedicated", "custom", "integration",
  "offer", "offers", "offered", "demo", "demos", "trial", "trials", "free",
  "need", "want", "then", "tell", "show", "give", "example", "explain", "describe", "list", "find", "provide", "prepare", "send", "share", "get", "receive", "discuss",
  "discussion", "talk", "speak", "connect", "reach", "call", "buy", "purchase", "engage", "hire",
  "start", "project", "requirements", "requirement", "implementation", "implement", "implementing",
  "develop", "developing", "build", "building", "team", "someone", "expert", "successive", "much", "would", "could", "actually", "one",
  "can", "do", "does", "what", "how", "the", "this", "that", "it", "these", "those", "me", "us", "my", "our",
  "a", "an", "i", "you", "your", "we", "are", "am", "is", "be", "being", "planning", "plan", "looking",
  "for", "of", "to", "with", "about", "regarding", "involving", "related", "like", "help", "please",
]);

export function commercialSubject(message: string, inheritedSubject?: string | null): string | null {
  const normalized = normalizeSearchText(message);
  // Prefer a grammatical subject complement over the whole request. These
  // patterns identify clause roles, not topic names, so they generalize to any
  // service/product/entity currently present in Successive content.
  const complement = normalized.match(
    /\b(?:pricing|price|estimate|quote|quotation|proposal|consultation)\s+(?:for|about|regarding)\s+(.+)$/,
  )?.[1] ?? normalized.match(
    /\b(?:timeline|dedicated team|custom requirements?|integration requirements?)\s+(?:for|about|regarding)\s+(.+)$/,
  )?.[1] ?? normalized.match(
    /\b(?:help(?: us| me)?\s+)?(?:implement(?:ing)?|deploy(?:ing)?|adopt(?:ing)?|roll(?:ing)? out)\s+(.+)$/,
  )?.[1] ?? normalized.match(
    /\b(?:planning|plan|need|want|looking for)\s+(?:a|an|the)?\s*(.+?)(?:\s+(?:can|could|would)\s+(?:we|you)|$)/,
  )?.[1];
  const candidate = complement ?? normalized;
  const candidateWords = candidate.split(" ");
  const words = candidateWords.filter((word, index) => {
    // Numeric brand components (for example 24×7) and IT used as an industry
    // acronym are subject identity, not grammatical request noise.
    if (/^\d$/.test(word) && /\d/.test(candidateWords[index - 1] ?? "")) return true;
    if (word === "it" && /^(?:managed|software|technology|digital)$/.test(candidateWords[index - 1] ?? "") &&
        /^(?:company|services?|consulting|solutions?)$/.test(candidateWords[index + 1] ?? "")) return true;
    return word.length > 1 && !SUBJECT_NOISE.has(word);
  });
  const explicit = words.join(" ").trim().replace(/^([a-z0-9+#.-]+) solution$/, "$1");
  const residualHasPriceableSignal = /\b(?:services?|solutions?|products?|platforms?|software|applications?|development|implementation|integration|consulting|migration|engineering|accelerators?|systems?|websites?|commerce|cloud|data|api|cms|ai)\b/.test(normalized);
  const explicitWasGrammaticallyNamed = Boolean(complement);
  const validExplicit = /[a-z0-9]/.test(explicit) && !/^(?:services?|solutions?|products?|work)$/.test(explicit) &&
    (explicitWasGrammaticallyNamed || residualHasPriceableSignal)
    ? explicit : null;
  return validExplicit || inheritedSubject?.trim() || null;
}

export function isDependentCommercialSubjectQuery(message: string): boolean {
  const q = normalizeSearchText(message);
  return /\b(?:it|this|that|same|the service|that service|this service|the solution|that solution|this solution|the product|that product|this product|the offering|that offering|this offering|the project|that project|this project)\b/.test(q);
}

/** True when the current commercial clause explicitly prices an unspecialized project. */
export function hasExplicitGenericProjectSubject(message: string): boolean {
  const q = normalizeSearchText(message);
  return /^(?:how much (?:does|would|will|can) )?(?:an? |the )?project(?: usually| typically)? cost$/.test(q) ||
    /^(?:the )?costs? of (?:an? |the )?project$/.test(q) ||
    /^(?:an? |the )?project (?:cost|costs|pricing|price)$/.test(q);
}

export function isCommerciallyPriceableContext(
  subject: string | null | undefined,
  contentType: string | null | undefined,
): boolean {
  if (!subject) return false;
  if (["service", "sub-service", "expertise", "solution", "product", "kagen-product", "accelerator", "technology"].includes(contentType ?? ""))
    return true;
  if (["leadership", "company", "blog", "thought-leadership", "press-release", "media-coverage", "news", "award", "career"].includes(contentType ?? ""))
    return false;
  return /\b(?:service|solution|platform|software|application|development|implementation|integration|consulting|migration|engineering|accelerator|product)\b/.test(normalizeSearchText(subject));
}

/** Recovers the subject stated in our immediately preceding commercial answer when older user turns aged out. */
export function commercialSubjectFromAnswer(answer: string): string | null {
  const plain = answer.replace(/\[[^\]]+]\([^)]*\)/g, " ").replace(/[*_#]/g, " ");
  const match = plain.match(/\b(?:cost of|estimate for|quotation for|proposal for)\s+(.+?)\s+(?:depends|after|based)\b/i) ??
    plain.match(/\bthe\s+(.+?)\s+implementation requirements\b/i) ??
    plain.match(/\bfor\s+(.+?),\s+start by sharing\b/i);
  if (!match?.[1]) return null;
  const normalized = normalizeSearchText(match[1]);
  return /^(?:your project|your requirements|the project)$/.test(normalized) ? null : normalized;
}

export function contactUsCta(contactUrl: string): string {
  return `To discuss your requirements further, please connect with the Successive team through the official [Contact Us](${contactUrl}) page.`;
}

const label = (subject: string) => subject.split(" ").map((word) =>
  /^(?:ai|cms|api|devsecops|kagen)$/i.test(word) ? word.toUpperCase() : word[0]!.toUpperCase() + word.slice(1),
).join(" ").replace("DEVSECOPS", "DevSecOps").replace("KAGEN", "Kagen");

export function commercialAnswer(subject: string | null, contactUrl: string, intents: CommercialIntent | CommercialIntent[]): string {
  const requested = Array.isArray(intents) ? intents : [intents];
  const topic = subject ? label(subject) : "your project";
  const lines: Record<CommercialIntent, string> = {
    pricing: subject ? `The cost of ${topic} depends on the requirements, scope, integrations, customization, complexity, and delivery needs.` : "Pricing depends on the service, project scope, requirements, integrations, customization, complexity, and delivery needs.",
    estimate: `An estimate for ${topic} depends on the required scope, integrations, customization, and implementation needs.`,
    quote: `Successive can prepare a tailored quotation for ${topic} after understanding the requirements, scope, and delivery needs.`,
    proposal: `Successive can discuss ${topic} and prepare an appropriate proposal based on the business goals, technical scope, and delivery needs.`,
    consultation: `Successive can discuss ${topic}, the business goals, requirements, and implementation considerations to help identify an appropriate approach.`,
    project_discussion: `Successive can work with you to understand ${subject ? `${topic} requirements` : "your project requirements"}, goals, scope, and delivery needs, then discuss an appropriate approach and next steps.`,
    contact_sales: `You can speak with Successive about ${subject ? topic : "your requirements"} through the official contact channel.`,
    implementation: `Successive can review the ${topic} implementation requirements, goals, current environment, and delivery needs to determine an appropriate approach.`,
    buying: `To engage Successive for ${topic}, start by sharing the requirements, scope, and solution needs so the team can discuss an appropriate engagement and delivery approach.`,
  };
  const body = requested.slice(0, 2).map((intent) => lines[intent]).join(" ");
  return `${body}\n\n${contactUsCta(contactUrl)}`;
}
