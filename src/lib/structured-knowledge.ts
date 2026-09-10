import { decodeEntities, htmlToText } from "./html-utils";
import { buildSearchDocument, normalizeSearchText, type SuccessiveSearchDocument } from "./search-index";
import type { WordPressItem } from "@/types/wordpress";
import type { SuggestionAction } from "./llm/schemas";
import { buildDeterministicUnderstanding, classifyFollowUpScope } from "./query-understanding";
import { designationHasRole, requestedPersonRole, type PersonRoleConcept } from "./person-roles";

export type StructuredAttribute =
  | "company_overview" | "founded" | "values" | "ownership" | "leadership" | "executives" | "board"
  | "advisors" | "certifications" | "company_location" | "global_presence" | "capabilities"
  | "technologies" | "culture" | "career_benefits" | "partners" | "awards"
  | "employee_policy" | "person";

export interface StructuredRequest {
  attribute: StructuredAttribute;
  mode: "list" | "count" | "detail" | "overview" | "latest";
  subject: string;
  normalizedQuery: string;
  requestedRole?: PersonRoleConcept;
}

export interface StructuredAnswer {
  answer: string;
  document: SuccessiveSearchDocument;
  evidencePaths: string[];
  suggestions: string[];
}

export interface TrustedOrganizationCollection {
  organizations: string[];
  source: WordPressItem;
  sourcePath: string;
}

export function cleanOrganizationLabel(value: string): string {
  const decoded = decodeEntities(value).trim();
  if (!decoded || /(?:https?:\/\/|[/\\]|\.(?:svg|png|webp|jpe?g|gif)(?:\?|$))/i.test(decoded)) return "";
  const cleaned = decoded
    .replace(/\b(?:company|brand|client|customer)?\s*logo\b/gi, " ")
    .replace(/\b(?:image|asset|placeholder|untitled)(?:\s*\d+)?\b/gi, " ")
    .replace(/\b(?:id|attachment)[-_ ]?\d+\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 100 || !/[a-z]{2}/i.test(cleaned)) return "";
  return /^(?:logo|image|brand|company|client|customer|icon)\s*\d*$/i.test(cleaned) ? "" : cleaned;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

function trustedLabelFromLogoEntry(value: unknown): string {
  const entry = record(value);
  if (!entry) return "";
  const media = record(entry.logo) ?? record(entry.image) ?? record(entry.media) ?? entry;
  const candidates = [entry.organization_name, entry.organisation_name, entry.company_name,
    entry.brand_name, entry.label, entry.alt_text, media.alt, media.caption, media.title];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const cleaned = cleanOrganizationLabel(candidate);
    if (cleaned) return cleaned;
  }
  return "";
}

function trustedLabelsFromCollection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.map(trustedLabelFromLogoEntry).filter(Boolean).filter((name) => {
    const key = normalizeSearchText(name);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function isCanonicalHomepage(item: WordPressItem): boolean {
  try { const url = new URL(item.link ?? item.url ?? ""); return url.pathname === "/" || url.pathname === ""; }
  catch { return false; }
}

function findTrustedStructuralCollection(node: unknown, path = "acf"): { names: string[]; path: string } | null {
  const source = record(node);
  if (!source) return null;
  for (const [key, value] of Object.entries(source)) {
    if (/^(?:trusted|customer|client|brands?)[_-].*logos?$|^(?:trusted|customer|client)_logos?$/i.test(key) &&
        !/(?:partner|certif|award|technolog)/i.test(key)) {
      const names = trustedLabelsFromCollection(value);
      if (names.length) return { names, path: `${path}.${key}` };
    }
  }
  for (const [key, value] of Object.entries(source)) {
    const nested = findTrustedStructuralCollection(value, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

function findTrustedSemanticFallback(node: unknown, path = "acf"): { names: string[]; path: string } | null {
  const source = record(node);
  if (!source) return null;
  const semantics = Object.entries(source)
    .filter(([key, value]) => /heading|title|label|name/i.test(key) && typeof value === "string")
    .map(([, value]) => normalizeSearchText(String(value))).join(" ");
  if (/\b(?:trusted|customers?|clients?|brands?|organizations?|companies|enterprises?)\b/.test(semantics) &&
      !/\b(?:partners?|certifications?|awards?|technologies|social)\b/.test(semantics)) {
    for (const [key, value] of Object.entries(source)) {
      if (!/logo|brand|customer|client|organization|company|marquee|carousel/i.test(key)) continue;
      const names = trustedLabelsFromCollection(value);
      if (names.length >= 3) return { names, path: `${path}.${key}` };
    }
  }
  for (const [key, value] of Object.entries(source)) {
    const nested = findTrustedSemanticFallback(value, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

export function extractTrustedOrganizations(items: WordPressItem[]): TrustedOrganizationCollection | null {
  for (const item of items.filter(isCanonicalHomepage)) {
    const found = findTrustedStructuralCollection(item.acf) ?? findTrustedSemanticFallback(item.acf);
    if (found) return { organizations: found.names, source: item, sourcePath: found.path };
  }
  return null;
}

export function extractPublishedClientTotal(items: WordPressItem[]): string | null {
  for (const item of items) {
    if (!isCanonicalHomepage(item) && !/\babout\b/i.test(item.slug ?? "")) continue;
    const match = JSON.stringify(item.acf ?? {}).match(/\b(\d[\d,]*\+?)\s+(?:enterprise\s+)?clients?\b/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

export type ClientIntent = "overview" | "current" | "count" | "public_work" | "blog" | "news" | "confidential" | null;
export function classifyClientIntent(message: string): ClientIntent {
  const q = normalizeSearchText(message);
  if (/\b(?:secret|confidential|unannounced|nda|undisclosed)\b.*\b(?:clients?|customers?|companies|organizations?)\b|\b(?:clients?|customers?)\b.*\b(?:secret|confidential|unannounced|nda|undisclosed)\b/.test(q)) return "confidential";
  if (/\b(?:clients?|customers?)\b.*\b(?:right now|current|currently|active|today|working with)\b|\b(?:current|active)\s+(?:clients?|customers?)\b/.test(q)) return "current";
  if (/^which (?:of )?(?:these|those) (?:ones )?(?:are )?current\??$/.test(q)) return "current";
  if (/\b(?:how many|count|total|number of)\b.*\b(?:clients?|customers?|trusted organizations?)\b/.test(q)) return "count";
  if (/\b(?:client|customer)\b.*\b(?:blogs?|articles?)\b|\b(?:blogs?|articles?)\b.*\b(?:client|customer)\b/.test(q)) return "blog";
  if (/\b(?:client|customer)\b.*\b(?:announcements?|news|press releases?|media)\b|\b(?:announcements?|news|press releases?|media)\b.*\b(?:client|customer)\b/.test(q)) return "news";
  if (/\b(?:client|customer)\b.*\b(?:case stud(?:y|ies)|stories|examples|projects?|success|published work)\b|\b(?:case stud(?:y|ies)|stories|examples|published work)\b.*\b(?:client|customer)\b/.test(q)) return "public_work";
  if (/\b(?:customer experience|customer support|customer data|customer journey|client side|client server|multi client)\b/.test(q)) return null;
  if (/^(?:our|your)\s+(?:clients?|customers?)\??$/.test(q) ||
      /^(?:show (?:me )?)?(?:our|your)\s+(?:clients?|customers?)\??$/.test(q) ||
      /^(?:show (?:me )?)?(?:clients?|customers?)\??$/.test(q) ||
      /^companies (?:you|successive) (?:work|works) with\??$/.test(q)) return "overview";
  if (/^(?:show (?:me )?|who are your |which (?:organizations|companies) (?:trust|are showcased).*)?(?:clients?|customers?)\??$/.test(q) ||
      /^(?:who are your clients|show your clients|which organizations trust successive|which companies are showcased|which companies (?:work with you|do you work with)|tell me about your customers)$/.test(q)) return "overview";
  return null;
}

export function clientOverviewFallback(message: string): string {
  const q = normalizeSearchText(message);
  if (/customers?/.test(q)) {
    return "## Customers\n\nSuccessive highlights a broad selection of trusted organizations. Here are some of them:";
  }
  if (/who are your clients/.test(q)) {
    return "## Our Clients\n\nSuccessive works across a range of industries and highlights the following trusted organizations:";
  }
  if (/which companies|companies you work with/.test(q)) {
    return "## Organizations We Work With\n\nHere are some of the trusted organizations highlighted by Successive:";
  }
  if (/^(?:our|your) clients?$/.test(q)) {
    return "## Our Clients\n\nSuccessive highlights organizations across different industries and business domains. A selection appears below.";
  }
  if (/^clients$/.test(q)) {
    return "## Trusted Organizations\n\nSuccessive highlights organizations representing a variety of industries and technology needs. Some of them are listed below.";
  }
  return "## Clients\n\nSuccessive highlights a diverse group of trusted organizations. Here are some of them:";
}

export function availableClientSuggestionActions(items: WordPressItem[]): SuggestionAction[] {
  const documents = items.map((item) => buildSearchDocument(item));
  const caseStudies = documents.filter((document) => document.role === "case_study");
  const otherCustomerWork = documents.filter((document) =>
    ["blog", "editorial", "press_release", "resource", "product"].includes(document.role) &&
    /\b(?:customer|client)\b.*\b(?:story|success|project|work|collaborat)|\b(?:story|success|project|work|collaborat)\b.*\b(?:customer|client)\b/i.test(
      `${document.title} ${document.headings.slice(0, 4).join(" ")}`,
    ),
  );
  const actions: SuggestionAction[] = [];
  const broadKeys = new Set([...caseStudies, ...otherCustomerWork].map((document) => `${document.type}:${document.id}`));
  const caseKeys = new Set(caseStudies.map((document) => `${document.type}:${document.id}`));
  const broaderIsDistinct = broadKeys.size !== caseKeys.size || [...broadKeys].some((key) => !caseKeys.has(key));
  if (broaderIsDistinct && !caseStudies.length) actions.push({
    id: "customer-work-discovery", label: "Show published customer work",
    intent: "CUSTOMER_WORK_DISCOVERY", contentType: "customer-work", relation: "CUSTOMER_WORK", sourceContext: "CLIENT_OVERVIEW",
  });
  if (caseStudies.length) actions.push({
    id: "customer-case-study-discovery", label: "Show customer case studies",
    intent: "CUSTOMER_WORK_DISCOVERY", contentType: "case-study", relation: "CUSTOMER_WORK", sourceContext: "CLIENT_OVERVIEW",
  });
  return actions;
}

const text = (value: unknown): string => typeof value === "string"
  ? htmlToText(decodeEntities(value)).replace(/\s+/g, " ").trim()
  : "";

const queryNoise = /\b(?:what|which|who|where|when|why|how|is|are|was|were|do|does|did|can|could|would|should|tell|show|give|list|find|explain|define|me|us|our|your|the|a|an|any|some|about|at|in|from|of|with|successive|digital|company|please|have|has)\b/g;

export function normalizeVisitorQuery(message: string): string {
  const vocabulary = new Map([
    ["abot", "about"], ["bussiness", "business"], ["capabilites", "capabilities"],
    ["valus", "values"], ["parnership", "partnership"], ["parnters", "partners"],
    ["tecnologies", "technologies"], ["succesive", "successive"],
    ["adress", "address"], ["addres", "address"], ["locaiton", "location"],
    ["loaction", "location"], ["offcie", "office"], ["headquater", "headquarters"],
    ["modernisation", "modernization"], ["ur", "your"], ["u", "you"],
  ]);
  return normalizeSearchText(message).split(" ")
    .map((token) => vocabulary.get(token) ?? token)
    .join(" ");
}

function isCompanyLocationQuery(query: string): boolean {
  if (/\b(?:job|jobs|career|careers|opening|openings|vacancy|vacancies|hiring|apply)\b/.test(query))
    return false;
  if (/\b(?:gis|arcgis|location intelligence|location analytics|location strategy|market location|site selection|spatial|geospatial)\b/.test(query))
    return false;
  return (
    /\b(?:headquarters?|hq|head office|main office|corporate office|offices?|branches?|office address|company address|global footprint|worldwide footprint|global presence)\b/.test(query) ||
    /\b(?:company|successive|your|our) locations?\b/.test(query) ||
    /^(?:[a-z][a-z .'-]{1,60})\s+(?:location|office|branch|address)$/.test(query) ||
    /\bwhere (?:is|are) (?:successive(?: digital)?|the company|your company|you|your offices?|your branches?)(?:\s+(?:located|based))?\b/.test(query) ||
    /\bwhere can (?:i|we) visit\b/.test(query) ||
    /\bwhich (?:city|cities|country|countries)\b.*\b(?:located|based|operate|offices?|presence)\b/.test(query) ||
    /\bdo (?:you|successive) (?:have offices?|operate) in\b/.test(query) ||
    /\b(?:us|u s|united states)[ -]?only company\b|\bonly (?:a )?(?:us|u s|united states) company\b/.test(query) ||
    /\b(?:located|based|operate|operates|presence) (?:in|at|outside)\b/.test(query) ||
    /^(?:location|locations|address|presence|which (?:city|country|cities|countries))$/.test(query)
  );
}

function isCompanyCertificationQuery(query: string): boolean {
  if (/\b(?:continuous|cloud|application|security|service|services|consulting|automation|pipeline|sdlc|devsecops)\b/.test(query))
    return false;
  return /\b(?:company|successive|your|our)?\s*(?:certifications?|accreditations?|standards?)\b/.test(query) ||
    /\bwhat (?:certifications?|standards?) (?:do|does|are)\b/.test(query);
}

export function isOwnershipQuery(query: string): boolean {
  const q = normalizeVisitorQuery(query);
  if (/\b(?:data|content|code|project|task|account|asset|vehicle|home|property)(?: s)? ownership\b|\bownership (?:mindset|culture|experience)\b/.test(q))
    return false;
  return /\bwho (?:owns|controls)\b/.test(q) ||
    /\bwho (?:is|are) (?:the )?owners?\b/.test(q) ||
    /\b(?:company|business) owners?\b/.test(q) ||
    /\bowners? of\b/.test(q) ||
    /\bownership of\b/.test(q) ||
    /\bs ownership\b/.test(q) ||
    /\b(?:is|was) .{1,80}\bowned by\b/.test(q) ||
    /\b(?:does|do) .{1,80}\bown\b/.test(q) ||
    /^(?:the )?owners?(?: of (?:the )?company)?$/.test(q);
}

export function understandStructuredRequest(message: string): StructuredRequest | null {
  const q = normalizeVisitorQuery(message);
  const ownershipIntent = isOwnershipQuery(q);
  const requestedRole = ownershipIntent ? null : requestedPersonRole(q);
  const mode = /\b(?:how many|count|number of|total)\b/.test(q) ? "count"
    : /\b(?:latest|recent|newest|most recent|current)\b/.test(q) ? "latest"
      : /\b(?:what are|which|who are|list|show|any)\b/.test(q) ? "list"
        : /\b(?:what does|tell me about|define|who is)\b/.test(q) ? "detail"
          : "overview";
  const subject = q.replace(queryNoise, " ").replace(/\s+/g, " ").trim();
  const bareNameCandidate = /^[\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){1,4}$/u.test(message.trim())
    ? q
    : undefined;
  const personCandidate =
    q.match(/^who is (.+?)(?: (?:at|in|from|of) successive(?: digital)?)?$/)?.[1] ??
    q.match(/^tell me about (.+?)(?: (?:at|in|from|of) successive(?: digital)?)?$/)?.[1] ??
    bareNameCandidate;
  const personTokens = personCandidate?.split(" ").filter(Boolean) ?? [];
  const person = personTokens.length >= 2 && personTokens.length <= 5 &&
    !/\b(?:what|which|who|where|how|tell|show|list|only|instead|company|successive|advantage|differentiators?|values?|ceo|founder|leader|leadership|board|director|executive|services?|solutions?|capabilities|technologies|programming|languages?|frameworks?|partner|culture|career|awards?|offices?|locations?|headquarters?|presence|footprint|industries?|gis|geospatial|site selection|security|compliance|automation)\b/.test(personCandidate ?? "")
    ? personCandidate
    : undefined;
  let attribute: StructuredAttribute | undefined;
  if (/\b(?:appraisals?|performance reviews?|promotion|salary|hike|bonus|leave|notice period|probation|attendance|employee id|my manager|personal (?:phone|address)|private|confidential|internal .*?(?:forecast|policy|record)|absent today)\b/.test(q)) attribute = "employee_policy";
  else if (ownershipIntent) attribute = "ownership";
  else if (person && !requestedRole) attribute = "person";
  else if (/\b(?:core values?|values?|principles?)\b/.test(q)) attribute = "values";
  else if (isCompanyCertificationQuery(q)) attribute = "certifications";
  else if (/\b(?:board(?: of directors)?|board members?)\b/.test(q)) attribute = "board";
  else if (/\b(?:executives?|executive management|management team)\b/.test(q)) attribute = "executives";
  else if (/\b(?:advisors?|partners and advisors)\b/.test(q)) attribute = "advisors";
  else if (requestedRole || /\b(?:leadership|leaders?|who leads|management)\b/.test(q)) attribute = "leadership";
  else if (/\b(?:how old|how long (?:the )?company (?:has been|is) in business|founded|founding year|established|started|company age|company history|history of successive|get started)\b/.test(q)) attribute = "founded";
  else if (isCompanyLocationQuery(q)) attribute = "company_location";
  else if (/\b(?:global enterprises?|global clients?|international clients?|support global)\b/.test(q)) attribute = "global_presence";
  else if (/\b(?:work culture|workplace|life at successive|employee culture|inclusive workplace|continuous learning|employee growth)\b/.test(q)) attribute = "culture";
  else if (/\b(?:employee benefits?|career benefits?|perks?|rewards and recognitions?|learning and development|why (?:join|work at) successive|successive careers|career page)\b/.test(q) && !/\b(?:job|opening|vacancy|hiring|apply)\b/.test(q)) attribute = "career_benefits";
  else if (/\b(?:partners?|partnerships?|alliances?|partner ecosystem)\b/.test(q)) attribute = "partners";
  else if (/\b(?:awards?|recognitions?|achievements?)\b/.test(q)) attribute = "awards";
  else if (/\b(?:technologies|technology stack|tech stack|programming languages?|frameworks?|devops tools?|automation tools?|frontend|backend|mobile technologies)\b/.test(q) || (
    /^(?:do you (?:use|work with)|can (?:you|successive) build (?:with|using)) [a-z0-9.+# -]+\??$/.test(q) &&
    !/\b(?:companies|businesses|organizations|organisations|industry|sector)\b/.test(q)
  )) attribute = "technologies";
  else if (/\b(?:global capabilities|technical capabilities|technical expertise|ai capabilities|digital experience capabilities|creative capabilities|devops capabilities|automation capabilities|your capabilities)\b/.test(q)) attribute = "capabilities";
  else if (/^(?:what is successive(?: digital)?|what does (?:successive(?: digital)?|(?:the|your|our) company) do|tell me about (?:successive(?: digital)?|(?:the|your|our) company)|about successive(?: digital)?|company info(?:rmation)?|what kind of company is successive(?: digital)?|is successive(?: digital)? (?:a )?(?:product|services?) company|or (?:a )?services? company)\??$/.test(q) ||
    /\b(?:successive advantage|what makes successive different|company differentiators?|why (?:choose|successive))\b/.test(q)) attribute = "company_overview";
  if (!attribute) return null;
  return { attribute, mode, subject: person ?? subject, normalizedQuery: q, requestedRole: requestedRole ?? undefined };
}

/** Connects only a terse location refinement to the existing location path. */
export function understandContextualStructuredRequest(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): StructuredRequest | null {
  const direct = understandStructuredRequest(message);
  if (direct) return direct;
  const current = buildDeterministicUnderstanding(message);
  const scope = classifyFollowUpScope(current, message);
  if (!["CONTINUE_SAME_SCOPE", "REFINE_SCOPE", "AMBIGUOUS_FOLLOW_UP"].includes(scope))
    return null;
  const previousLocation = history
    .filter((item) => item.role === "user")
    .map((item) => understandStructuredRequest(item.content))
    .findLast((request) => request?.attribute === "company_location");
  if (!previousLocation) return null;
  const subject = current.entities[0] ?? current.industry ?? current.topics
    .filter((topic) => !/^(?:only|instead|specifically)$/.test(topic))
    .join(" ");
  return subject ? understandStructuredRequest(`${subject} office`) : null;
}

export type UnsupportedCompanyInformation = "operational_hours" | "financial_metrics" | "industry_superlative" | "company_type";

export function requestedCompanyFactLabel(message: string): string {
  const withoutPossessiveMarker = message.replace(/([\p{L}\p{N}])(?:['\u2019]s)\b/giu, "$1");
  const normalized = normalizeSearchText(withoutPossessiveMarker)
    .replace(/\b(?:what|which|how many|how much|does|do|did|is|are|was|were|has|have|had|tell me|show me|find|confirm|publicly|current|currently|latest|last year)\b/g, " ")
    .replace(/\b(?:successive|digital|the company|company(?: s)?|its|your|their|a|an|the|of|for|previous year)\b/g, " ")
    .replace(/^(?:['\u2019]+|[^\p{L}\p{N}]+)|(?:['\u2019]+|[^\p{L}\p{N}]+)$/gu, " ")
    .replace(/\s+/g, " ").trim();
  return normalized || "requested company information";
}

/** Classifies company questions that require explicit published evidence and must never fall through to lexical retrieval. */
export function classifyUnsupportedCompanyInformation(message: string): UnsupportedCompanyInformation | null {
  const q = normalizeSearchText(message);
  if (/\b(?:office|business|working) (?:hours?|timings?|schedule)|\bopen (?:on )?(?:weekends?|saturdays?|sundays?)\b/.test(q))
    return "operational_hours";
  if (/\b(?:stock price|share price|market cap|valuation|(?:annual|yearly|company|its|your|successive(?: digital)?)?\s*(?:revenue|turnover|profit|earnings|income)|employee (?:count|total)|number of employees|how many employees|office count|number of offices|how many offices)\b/.test(q))
    return "financial_metrics";
  if (/\b(?:biggest|largest|main|primary|top) (?:industry|sector|focus)\b|\bwhich is (?:your|the) (?:biggest|largest|main|primary) focus\b/.test(q))
    return "industry_superlative";
  if (/\b(?:product|services?) company\b/.test(q) && (/\bsuccessive\b/.test(q) || /^(?:or|is it)\b/.test(q)))
    return "company_type";
  return null;
}

function roleDocument(items: WordPressItem[], role: SuccessiveSearchDocument["role"]) {
  const canonicalSlugs: Partial<Record<SuccessiveSearchDocument["role"], string[]>> = {
    company: ["about-us", "about"],
    global_capabilities: ["global-capabilities"],
    partners: ["partners"],
    culture: ["our-culture"],
    careers: ["careers"],
    awards: ["awards"],
  };
  const candidates = items.map((item) => ({ item, document: buildSearchDocument(item) }))
    .filter(({ document }) => document.role === role);
  const preferred = canonicalSlugs[role] ?? [];
  return candidates.sort((left, right) => {
    const leftRank = preferred.indexOf(left.document.slug);
    const rightRank = preferred.indexOf(right.document.slug);
    return (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank) -
      (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank);
  })[0];
}

function collection(acf: unknown, key: string): Record<string, unknown>[] {
  const root = record(acf);
  const values = root?.[key];
  return Array.isArray(values)
    ? values.map(record).filter((value): value is Record<string, unknown> => !!value)
    : [];
}

function valueFrom(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return "";
}

function sectionCompanionText(value: unknown, headingPattern: RegExp): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => sectionCompanionText(item, headingPattern));
  const source = record(value);
  if (!source) return [];
  const entries = Object.entries(source);
  const results: string[] = [];
  for (const [key, candidate] of entries) {
    const heading = text(candidate);
    if (!heading || !headingPattern.test(heading)) continue;
    const suffix = key.match(/\d+$/)?.[0] ?? "";
    const prefix = key.replace(/(?:heading|title)\d*$/i, "");
    const companionKeys = [
      `${prefix}description${suffix}`, `${prefix}content${suffix}`, `${prefix}text${suffix}`,
      `description${suffix}`, `content${suffix}`, `text${suffix}`, `sub_heading${suffix}`, `sub-heading${suffix}`,
    ];
    const companion = valueFrom(source, companionKeys);
    if (companion) results.push(companion);
  }
  return [...results, ...entries.flatMap(([, child]) => sectionCompanionText(child, headingPattern))];
}

function globalPresenceFacts(values: string[], request: StructuredRequest): string[] {
  const asksForOfficeLocation = isCompanyLocationQuery(request.normalizedQuery);
  if (!asksForOfficeLocation) return values;
  const locationTerms = /\b(?:headquarters?|hq|office|offices|location|locations|address|city|country|based|operate|operates|presence)\b/i;
  return values.flatMap((value) => {
    const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ?? [];
    return sentences
      .filter((sentence) => locationTerms.test(sentence))
      .map((sentence) => sentence
        .replace(/^founded\b.*?\b(?:today|currently|now)\b[, ]*/i, "")
        .trim())
      .filter(Boolean);
  });
}

function officeLocationAnswer(facts: string[], request: StructuredRequest): string {
  const evidence = facts.join(" ").replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  const countries = [...new Set(facts.flatMap((fact) => {
    const match = fact.match(/^[^:]*\bcountry[^:]*:\s*(.+)$/i);
    if (!match) return [];
    const country = match[1]!
      .replace(/\b(?:footer|country|icon)\b/gi, " ")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return country ? [country] : [];
  }))];
  const addresses = [...new Set(facts.flatMap((fact) => {
    const match = fact.match(/^[^:]*\baddress[^:]*:\s*(.+)$/i);
    return match?.[1]?.trim() ? [match[1].trim()] : [];
  }))];
  const footprint = evidence.match(/\boperate(?:s)? across ([^.!?;,]*?locations?)\b/i)?.[1];
  const locations = evidence.match(/\b(?:such as|including)\s+(.+?)(?=,?\s+(?:serving|supporting)\b|[.!?]|$)/i)?.[1];
  const locationNames = locations?.split(/,|\band\b/i).map((name) => name.trim()).filter(Boolean) ?? [];
  const requestedLocations = locationNames.filter((name) =>
    request.normalizedQuery.includes(normalizeSearchText(name.replace(/\((?:hq|headquarters?)\)/i, ""))),
  );
  const headquarters = locations?.match(/(?:^|,|\band\b)\s*([^,]+?)\s*\((?:HQ|headquarters?)\)/i)?.[1]
    ?.replace(/^and\s+/i, "")
    .trim();
  const asksLimitedScope = /\bonly\b/.test(request.normalizedQuery);
  const requestedCountries = countries.filter((country) =>
    request.normalizedQuery.includes(normalizeSearchText(country)),
  );
  if (asksLimitedScope && (countries.length > 1 || locationNames.length > 1))
    lines.push(countries.length > 1
      ? `No—Successive is not limited to one country; its published office presence includes ${countries.join(" and ")}.`
      : "No—Successive’s published footprint covers multiple locations.");
  if (requestedCountries.length)
    lines.push(`Yes—Successive has a published office location in ${requestedCountries.join(" and ")}.`);
  else if (requestedLocations.length)
    lines.push(`Yes—Successive’s published footprint includes ${requestedLocations.join(" and ")}.`);
  if (!asksLimitedScope && !requestedCountries.length && countries.length)
    lines.push(`Successive’s official Contact page lists office locations in ${countries.join(" and ")}.`);
  if (addresses.length) {
    lines.push("Published office addresses are:");
    lines.push(...addresses.map((address) => `- ${address}`));
  }
  if (footprint) lines.push(`Successive operates across ${footprint} worldwide.`);
  if (locations) lines.push(`Its published locations include ${locations.replace(/,?\s+and\s+/i, ", and ")}.`);
  if (headquarters) lines.push(`${headquarters} is identified as Successive’s headquarters.`);
  const reach = evidence.match(/\bserving\s+(.+?worldwide)\b/i)?.[1];
  if (reach && !asksLimitedScope && !requestedLocations.length)
    lines.push(`From its global presence, Successive serves ${reach}.`);
  if (lines.length >= 3) return [...new Set(lines)].slice(0, 6).join("\n\n");
  return facts.join("\n\n");
}

export function cleanMediaLabel(value: string): string {
  return decodeEntities(value)
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/\?.*$/, "")
    .replace(/\.(?:avif|gif|jpe?g|png|svg|webp)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b[0-9a-f]{10,}\b/gi, "")
    .replace(/\b(?:1[5-9]|2[0-9])\d{8,}\b/g, "")
    .replace(/\b(?:logo|image|asset|file|final|copy|scaled)(?:\s+\d+)?\b/gi, "")
    .replace(/\s*\(\s*\d+\s*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mediaLabel(value: unknown): string {
  const source = record(value);
  if (!source) return "";
  const candidates = ["alt", "caption", "title", "name", "filename", "url"]
    .map((key) => cleanMediaLabel(text(source[key])))
    .filter(Boolean);
  return candidates.find((candidate) =>
    /[a-z]{2,}/i.test(candidate) && !/^(?:img|image|asset|untitled|logo)\s*\d*$/i.test(candidate),
  ) ?? candidates[0] ?? "";
}

function nestedMediaLabels(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedMediaLabels);
  const source = record(value);
  if (!source) return [];
  const direct = mediaLabel(source);
  if (source.url && direct) return [direct];
  return Object.values(source).flatMap(nestedMediaLabels);
}

function cleanCatalogLabels(values: string[]): string[] {
  return [...new Set(values.map((value) => cleanMediaLabel(value)))]
    .filter(Boolean)
    .filter((value) => !/\b(?:wp content|uploads?|vector|logo ?file|new project|make it|owesome)\b|poop|https?:|[/\\]/i.test(value))
    .filter((value) => value.length <= 80);
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0]!; row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length]!;
}

function fuzzyName(query: string, name: string): boolean {
  const requested = normalizeSearchText(query).split(" ").filter(Boolean);
  const actual = normalizeSearchText(name).split(" ").filter(Boolean);
  if (!requested.length || !actual.length || requested[0] !== actual[0]) return false;
  const requestedLast = requested.at(-1)!;
  const actualLast = actual.at(-1)!;
  return requestedLast === actualLast ||
    (requestedLast.length >= 4 && actualLast.length >= 4 && editDistance(requestedLast, actualLast) <= 1);
}

function pageAnswer(document: SuccessiveSearchDocument, answer: string, evidencePaths: string[], suggestions: string[]): StructuredAnswer {
  return { answer, document, evidencePaths, suggestions };
}

function publishedOwnershipEvidence(document: SuccessiveSearchDocument): { value: string; path: string } | null {
  const structured = document.structuredFields.find(({ path, label, value }) =>
    /\b(?:owner|ownership|owned by|parent company|controlling (?:company|entity))\b/i.test(`${path.replace(/[_-]+/g, " ")} ${label}`) &&
    value.trim().length > 1,
  );
  if (structured) return { value: structured.value.trim(), path: structured.path };

  const explicitRelation = [...document.descriptions, ...document.textSegments]
    .flatMap((value) => value.split(/(?<=[.!?])\s+/))
    .find((value) => /\b(?:is (?:wholly |majority |privately )?owned by|ownership (?:is|belongs to)|parent company is|controlled by)\b/i.test(value));
  return explicitRelation ? { value: explicitRelation.trim(), path: "published_company_content" } : null;
}

export function answerStructuredRequest(
  items: WordPressItem[],
  request: StructuredRequest,
): StructuredAnswer | null {
  const company = roleDocument(items, "company");
  if (["company_overview", "founded", "values", "ownership", "leadership", "executives", "board", "advisors", "certifications", "company_location", "global_presence", "person"].includes(request.attribute)) {
    if (!company) return null;
    const { item, document } = company;
    if (request.attribute === "company_overview") {
      const asksDifferentiator = /\b(?:advantage|different|differentiator|why choose)\b/.test(request.normalizedQuery);
      const differentiators = asksDifferentiator
        ? sectionCompanionText(item.acf, /what sets us apart|why successive|successive advantage|our advantage|differentiator/i)
        : [];
      const overview = (differentiators.length ? differentiators : document.descriptions.slice(0, 3)).join("\n\n");
      return pageAnswer(document, overview, ["about_content", "description"], ["What are Successive’s core values?", "Who leads Successive?", "What is Successive’s global presence?"]);
    }
    if (request.attribute === "founded") {
      const foundingEvidence = [
        ...document.structuredFields.map(({ value }) => value),
        ...document.textSegments,
      ].find((value) => /\b(?:founded|established|started)\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(value));
      const foundingYear = foundingEvidence?.match(/\b(?:19|20)\d{2}\b/)?.[0];
      if (!foundingYear) {
        return pageAnswer(
          document,
          "I couldn’t confirm Successive Digital’s founding year from the current published About Us API content.",
          [],
          ["Tell me about Successive Digital", "Who founded Successive?"],
        );
      }
      const currentYear = new Date().getUTCFullYear();
      const approximateAge = currentYear - Number(foundingYear);
      const answer = /\b(?:how old|how long|company age)\b/.test(request.normalizedQuery)
        ? `Successive Digital was founded in **${foundingYear}**, so it is approximately **${approximateAge} years old** in ${currentYear}.`
        : `Successive Digital was founded in **${foundingYear}**.`;
      return pageAnswer(document, answer, ["worldwide_footprint"], ["Tell me about Successive Digital", "Who founded Successive?"]);
    }
    if (request.attribute === "ownership") {
      const evidence = publishedOwnershipEvidence(document);
      const answer = evidence
        ? `Successive Digital’s published company content states: ${evidence.value}`
        : "I couldn’t confirm Successive Digital’s ownership from the current published Successive content.";
      return pageAnswer(document, answer, evidence ? [evidence.path] : [], ["Tell me about Successive Digital"]);
    }
    if (request.attribute === "values") {
      const values = collection(item.acf, "core_values").map((entry) => ({
        name: valueFrom(entry, ["heading", "title", "name", "label"]),
        description: valueFrom(entry, ["sub-heading", "sub_heading", "description", "content", "text"]),
      })).filter(({ name }) => name);
      const exact = values.find(({ name }) => normalizeSearchText(request.subject).includes(normalizeSearchText(name)));
      if (exact) return pageAnswer(document, `**${exact.name}** — ${exact.description || "The current About content lists this as a core value."}`, ["core_values"], ["Show all core values", "Tell me about Successive’s culture"]);
      const answer = request.mode === "count"
        ? `Successive’s current About content lists **${values.length} core values**: ${values.map(({ name }) => name).join(", ")}.`
        : [`Successive’s current core values are:`, ...values.map(({ name, description }) => `- **${name}**${description ? ` — ${description}` : ""}`)].join("\n");
      return pageAnswer(document, answer, ["core_values"], ["What does agility mean at Successive?", "Tell me about Successive’s culture"]);
    }
    const explicitLeadershipTeam = /\bleadership team\b/.test(request.normalizedQuery);
    const peopleKeys = request.requestedRole ? ["executive_management", "leadership_team", "board-directors", "partners_and_advisors"]
      : request.attribute === "board" ? ["board-directors"]
      : request.attribute === "executives" ? ["executive_management"]
        : request.attribute === "advisors" ? ["partners_and_advisors"]
          : request.attribute === "leadership" ? [explicitLeadershipTeam ? "leadership_team" : "executive_management"]
            : ["executive_management", "leadership_team", "board-directors", "partners_and_advisors"];
    const people = peopleKeys.flatMap((key) => collection(item.acf, key).map((entry) => ({
      name: valueFrom(entry, ["name", "title", "heading"]),
      designation: valueFrom(entry, ["desgnation", "designation", "role", "position"]),
      group: key.replace(/[_-]+/g, " "),
    }))).filter(({ name }) => name);
    if (request.attribute === "person") {
      const person = people.find(({ name }) => fuzzyName(request.subject, name));
      if (!person) return null;
      const answer = `**${person.name}** is listed as **${person.designation || "a team member"}** in Successive’s ${person.group} section.`;
      return pageAnswer(document, answer, peopleKeys, ["Show Successive’s leadership team", "Who is the CEO of Successive?"]);
    }
    if (["leadership", "executives", "board", "advisors"].includes(request.attribute)) {
      // The query names a published section, not a designation filter. For
      // example, "Executive Management" must not select only people whose
      // designation happens to contain the word "Executive".
      const requestedExecutiveRole = request.requestedRole;
      const roleMatches = requestedExecutiveRole
        ? people.map((person) => ({
          person,
          priority: designationHasRole(person.designation, requestedExecutiveRole) ? 2
            : requestedExecutiveRole === "board_member" && person.group === "board directors" ? 1
              : 0,
        })).filter(({ priority }) => priority > 0)
          .sort((left, right) => right.priority - left.priority)
          .map(({ person }) => person)
        : [];
      if (requestedExecutiveRole && !roleMatches.length) {
        return pageAnswer(
          document,
          "I couldn’t confirm the requested role from Successive’s current published leadership records.",
          [],
          ["Show Successive’s executives", "Show the Leadership Team"],
        );
      }
      const selected = (requestedExecutiveRole ? roleMatches : people).slice(0, 3);
      const tabAnchors = {
        board: "#w-tabs-5-data-w-pane-0",
        executives: "#w-tabs-5-data-w-pane-1",
        advisors: "#w-tabs-5-data-w-pane-2",
        leadership: "#w-tabs-5-data-w-pane-3",
      } as const;
      const sectionKey = request.attribute === "leadership" && !explicitLeadershipTeam
        ? "executives"
        : request.attribute as keyof typeof tabAnchors;
      const sectionUrl = `${document.url.split("#")[0]}${tabAnchors[sectionKey]}`;
      const moreLine = !requestedExecutiveRole && people.length > selected.length
        ? `\n\nShowing the first 3 of ${people.length}. [More](${sectionUrl})`
        : "";
      const answer = request.mode === "count"
        ? `The current published ${request.attribute} records list **${people.length} people**.`
        : `${selected.map(({ name, designation }) => `- **${name}**${designation ? ` — ${designation}` : ""}`).join("\n")}${moreLine}`;
      const sectionDocument = {
        ...document,
        url: sectionUrl,
      };
      return pageAnswer(sectionDocument, answer, peopleKeys, ["Show the board of directors", "Show Successive’s executives"]);
    }
    if (request.attribute === "certifications") {
      const labels = nestedMediaLabels(collection(item.acf, "certifications"))
        .filter((label, index, all) => label && all.indexOf(label) === index)
        .filter((label) => !/^(?:iso|soc|cmmi|certificate|certification)\d+$/i.test(label));
      const answer = labels.length
        ? `Successive’s About content currently publishes these certification or standards labels:\n${labels.map((label) => `- **${label}**`).join("\n")}`
        : `I couldn’t confirm specific certification labels from the current published About content.`;
      return pageAnswer(document, answer, ["certifications"], ["Tell me about Successive’s company standards", "Show Successive’s leadership"]);
    }
    const locationSources = request.attribute === "company_location"
      ? items.map((sourceItem) => ({ item: sourceItem, document: buildSearchDocument(sourceItem) }))
      : [{ item, document }];
    const evidence = locationSources.flatMap((source) => [
      ...sectionCompanionText(source.item.acf, /worldwide footprint|global presence|office locations?|headquarters?|contact|address/i)
        .map((value) => ({ source, value, path: "location_section", label: "Location" })),
      ...source.document.structuredFields
        .filter((field) => /footprint|office|location|headquarter|address|city|country/i.test(`${field.path} ${field.label}`))
        .map((field) => ({ source, value: field.value, path: field.path, label: field.label })),
    ]).filter(({ value }) => value.length > 3 && !/https?:|\.(?:png|jpe?g|webp|svg|avif)|global map|chief revenue officer/i.test(value));
    const subjectTerms = normalizeSearchText(request.subject).split(" ")
      .filter((term) => term.length > 2 && !/^(?:office|offices|location|locations|address|branch|branches)$/.test(term));
    evidence.sort((left, right) => {
      const score = (entry: typeof left) => {
        const identity = normalizeSearchText(`${entry.path} ${entry.value}`);
        const subjectMatch = subjectTerms.some((term) => identity.includes(term)) ? 100 : 0;
        const specificity = /address|street|city|country|office|headquarter/i.test(entry.path) ? 30 : 0;
        const canonical = /contact/i.test(entry.source.document.slug) ? 10 : 0;
        return subjectMatch + specificity + canonical;
      };
      return score(right) - score(left);
    });
    const factual = [...new Set([
      ...evidence.map(({ value, path, label }) =>
        /address|city|country|office|headquarter/i.test(path) ? `${label}: ${value}` : value),
    ].filter((value) => value.length > 3))];
    const relevantFacts = globalPresenceFacts(factual, request);
    const answer = relevantFacts.length
      ? isCompanyLocationQuery(request.normalizedQuery)
        ? officeLocationAnswer(relevantFacts.slice(0, 5), request)
        : relevantFacts.slice(0, 5).join("\n\n")
      : `Successive’s About content includes a worldwide-footprint section, but the available API text does not provide enough explicit location details to confirm office names or a location count.`;
    const primaryDocument = evidence[0]?.source.document ?? document;
    return pageAnswer(primaryDocument, answer, evidence.map(({ path }) => path), ["Tell me about Successive Digital", "How does Successive support global enterprises?"]);
  }

  if (["capabilities", "technologies"].includes(request.attribute)) {
    const source = roleDocument(items, "global_capabilities");
    if (!source) return null;
    const categories = collection(source.item.acf, "capabilities_categories").map((entry) => ({
      name: valueFrom(entry, ["inner_title", "title", "heading", "name", "label"]),
      description: valueFrom(entry, ["short_description", "description", "content", "text"]),
      technologies: cleanCatalogLabels(nestedMediaLabels(entry.logo_repeater)),
    })).filter(({ name }) => name);
    const subjectTerms = normalizeSearchText(request.subject).split(" ").filter((term) => term.length > 2);
    const matched = categories.filter(({ name, technologies }) => {
      const identity = normalizeSearchText(`${name} ${technologies.join(" ")}`);
      return subjectTerms.some((term) => identity.includes(term));
    });
    const selected = matched.length ? matched : categories;
    const exactTechnology = categories.flatMap((category) => category.technologies.map((technology) => ({ category: category.name, technology })))
      .find(({ technology }) => normalizeSearchText(request.subject).includes(normalizeSearchText(technology)));
    const answer = exactTechnology
      ? `Yes. Successive’s current Global Capabilities catalog lists **${exactTechnology.technology}** under **${exactTechnology.category}**.`
      : selected.map(({ name, description, technologies }) => [
          `### ${name}`, description,
          technologies.length ? `**Technologies:** ${technologies.join(", ")}` : "",
        ].filter(Boolean).join("\n\n")).join("\n\n");
    return pageAnswer(source.document, answer, ["capabilities_categories"], ["Which technologies does Successive use?", "How can these capabilities help my business?"]);
  }

  if (request.attribute === "partners") {
    const source = roleDocument(items, "partners");
    if (!source) return null;
    const groups = collection(source.item.acf, "partnerships_repeater").map((entry) => ({
      category: valueFrom(entry, ["acf_repeater", "title", "heading", "name", "label"]) || "Partnerships",
      partners: cleanCatalogLabels(nestedMediaLabels(entry.partnerships_logos)),
    }));
    const all = groups.flatMap(({ category, partners }) => partners.map((name) => ({ category, name })));
    const subjectTokens = new Set(normalizeSearchText(request.subject).split(" ").filter((term) => term.length > 2 && !["partner", "partners", "partnership"].includes(term)));
    const exact = all.find(({ name }) => normalizeSearchText(name).split(" ").some((term) => subjectTokens.has(term)));
    const matchedGroups = groups.filter(({ category }) => normalizeSearchText(request.subject).split(" ").some((term) => term.length > 2 && normalizeSearchText(category).includes(term)));
    const selected = matchedGroups.length ? matchedGroups : groups;
    const answer = exact
      ? `Yes. Successive’s current Partners & Alliances catalog lists **${exact.name}** under **${exact.category}**.`
      : selected.map(({ category, partners }) => `### ${category}\n\n${partners.map((name) => `- **${name}**`).join("\n")}`).join("\n\n");
    return pageAnswer(source.document, answer, ["partnerships_repeater"], ["Which cloud partners does Successive have?", "How do partnerships help clients?"]);
  }

  if (["culture", "career_benefits", "employee_policy"].includes(request.attribute)) {
    const source = roleDocument(items, request.attribute === "career_benefits" ? "careers" : "culture") ??
      roleDocument(items, "careers");
    if (!source) return null;
    if (request.attribute === "career_benefits") {
      const benefits = collection(source.item.acf, "advantage_slider").map((entry) => ({
        name: valueFrom(entry, ["advantage_heading", "heading", "title", "name"]),
        description: valueFrom(entry, ["advantage_description", "description", "content", "text"]),
      })).filter(({ name, description }) => name && description);
      if (!benefits.length) {
        return pageAnswer(
          source.document,
          "I couldn’t confirm explicit career-benefit details from Successive’s current published Careers API content.",
          [],
          ["Tell me about Successive’s culture", "Show current job openings"],
        );
      }
      const introduction = valueFrom(record(source.item.acf) ?? {}, ["advantage_subtitle"]);
      const answer = [
        introduction,
        ...benefits.map(({ name, description }) => `- **${name}** — ${description}`),
      ].filter(Boolean).join("\n");
      return pageAnswer(
        source.document,
        answer,
        ["advantage_subtitle", "advantage_slider"],
        ["Tell me about Successive’s culture", "Show current job openings"],
      );
    }
    const fields = source.document.structuredFields.filter((field) =>
      field.kind === "text" && field.value.length > 12 &&
      !/image_repeater|\.image(?:\.|\[|$)|banner_image|advantage_image|cta_image/i.test(field.path) &&
      !/^(?:why[-_ ]?successive\d*|careerbanner|aboutus[_ -]?latest)$/i.test(field.value),
    );
    const terms = normalizeSearchText(request.subject).split(" ").filter((term) => term.length > 3 && !["employee", "policy", "successive"].includes(term));
    const policyTerms = request.attribute === "employee_policy"
      ? request.normalizedQuery.match(/\b(?:appraisal|performance review|promotion|salary|hike|bonus|leave|notice period|probation|attendance|employee id|manager|personal phone|personal address|confidential|internal|absent)\b/g) ?? []
      : [];
    const matchTerms = policyTerms.length ? policyTerms : terms;
    const matched = fields.filter((field) => matchTerms.some((term) =>
      normalizeSearchText(`${field.label} ${field.value}`).includes(normalizeSearchText(term)),
    ));
    if (request.attribute === "employee_policy" && !matched.length) {
      return pageAnswer(
        source.document,
        "I couldn’t confirm this employee-policy detail from Successive’s current published Culture or Careers API content. For an authoritative answer, please check with Successive HR or your internal employee policy portal.",
        [],
        ["Tell me about Successive’s culture", "What career benefits does Successive publish?"],
      );
    }
    const selected = (matched.length ? matched : fields).slice(0, 8);
    return pageAnswer(source.document, selected.map((field) => field.value).join("\n\n"), [...new Set(selected.map((field) => field.path.split("[")[0]!))], ["Tell me about life at Successive", "What career benefits does Successive offer?"]);
  }

  if (request.attribute === "awards") {
    const source = roleDocument(items, "awards");
    if (!source) return null;
    if (request.mode === "latest") {
      const awards = items.filter((item) => item.type === "award" && Number.isFinite(Date.parse(item.date ?? "")))
        .sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!));
      const latestDate = awards[0]?.date ? Date.parse(awards[0].date) : NaN;
      const hasUniqueLatest = Number.isFinite(latestDate) &&
        (!awards[1]?.date || Date.parse(awards[1].date) < latestDate);
      if (awards[0] && hasUniqueLatest) {
        const latest = buildSearchDocument(awards[0]);
        return pageAnswer(source.document, `The newest published award record in the current API is **${latest.title}**${awards[0].date ? ` (${awards[0].date.slice(0, 10)})` : ""}.`, ["award.date", "award.title"], ["Show all awards and recognitions", "What is Successive recognized for?"]);
      }
      return pageAnswer(source.document, "The available published content confirms Successive’s awards collection, but it does not provide a unique, reliable award date that establishes which item is latest.", ["title", "description"], ["Show all awards and recognitions", "What is Successive recognized for?"]);
    }
    return pageAnswer(source.document, source.document.descriptions.slice(0, 5).join("\n\n"), ["title", "description", "title2", "description2"], ["What is Successive recognized for?", "What is Successive’s latest award?"]);
  }
  return null;
}
