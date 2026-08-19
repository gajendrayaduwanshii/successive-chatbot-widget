import { decodeEntities, htmlToText } from "./html-utils";
import { buildSearchDocument, normalizeSearchText, type SuccessiveSearchDocument } from "./search-index";
import type { WordPressItem } from "@/types/wordpress";

export type StructuredAttribute =
  | "company_overview" | "values" | "leadership" | "executives" | "board"
  | "advisors" | "certifications" | "global_presence" | "capabilities"
  | "technologies" | "culture" | "career_benefits" | "partners" | "awards"
  | "person";

export interface StructuredRequest {
  attribute: StructuredAttribute;
  mode: "list" | "count" | "detail" | "overview" | "latest";
  subject: string;
  normalizedQuery: string;
}

export interface StructuredAnswer {
  answer: string;
  document: SuccessiveSearchDocument;
  evidencePaths: string[];
  suggestions: string[];
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const text = (value: unknown): string => typeof value === "string"
  ? htmlToText(decodeEntities(value)).replace(/\s+/g, " ").trim()
  : "";

const queryNoise = /\b(?:what|which|who|where|when|why|how|is|are|was|were|do|does|did|can|could|would|should|tell|show|give|list|find|explain|define|me|us|our|your|the|a|an|any|some|about|at|in|from|of|with|successive|digital|company|please|have|has)\b/g;

export function normalizeVisitorQuery(message: string): string {
  const vocabulary = new Map([
    ["abot", "about"], ["bussiness", "business"], ["capabilites", "capabilities"],
    ["valus", "values"], ["parnership", "partnership"],
    ["modernisation", "modernization"], ["ur", "your"], ["u", "you"],
  ]);
  return normalizeSearchText(message).split(" ")
    .map((token) => vocabulary.get(token) ?? token)
    .join(" ");
}

export function understandStructuredRequest(message: string): StructuredRequest | null {
  const q = normalizeVisitorQuery(message);
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
    !/\b(?:what|which|who|where|how|tell|show|list|company|values?|ceo|founder|leader|leadership|board|director|executive|services?|capabilities|technologies|partner|culture|career|awards?)\b/.test(personCandidate ?? "")
    ? personCandidate
    : undefined;
  let attribute: StructuredAttribute | undefined;
  if (person) attribute = "person";
  else if (/\b(?:core values?|values?|principles?)\b/.test(q)) attribute = "values";
  else if (/\b(?:certifications?|standards?|compliance|accreditation)\b/.test(q)) attribute = "certifications";
  else if (/\b(?:board(?: of directors)?|board members?)\b/.test(q)) attribute = "board";
  else if (/\b(?:executives?|executive management|management team)\b/.test(q)) attribute = "executives";
  else if (/\b(?:advisors?|partners and advisors)\b/.test(q)) attribute = "advisors";
  else if (/\b(?:ceo|founder|leadership|leaders?|who leads)\b/.test(q)) attribute = "leadership";
  else if (/\b(?:headquarters|offices?|worldwide footprint|global presence|company locations?|operate globally)\b/.test(q) && !/\b(?:gis|arcgis|location intelligence|site selection|spatial)\b/.test(q)) attribute = "global_presence";
  else if (/\b(?:work culture|workplace|life at successive|employee culture|inclusive workplace|continuous learning|employee growth)\b/.test(q)) attribute = "culture";
  else if (/\b(?:employee benefits?|career benefits?|perks?|rewards and recognitions?|learning and development|why (?:join|work at) successive|successive careers|career page)\b/.test(q) && !/\b(?:job|opening|vacancy|hiring|apply)\b/.test(q)) attribute = "career_benefits";
  else if (/\b(?:partners?|partnerships?|alliances?|partner ecosystem)\b/.test(q)) attribute = "partners";
  else if (/\b(?:awards?|recognitions?|achievements?)\b/.test(q)) attribute = "awards";
  else if (/\b(?:technologies|technology stack|tech stack|programming languages?|frameworks?|devops tools?|automation tools?|frontend|backend|mobile technologies)\b/.test(q) || /^do you use [a-z0-9.+# -]+\??$/.test(q)) attribute = "technologies";
  else if (/\b(?:global capabilities|technical capabilities|technical expertise|ai capabilities|digital experience capabilities|creative capabilities|devops capabilities|automation capabilities|your capabilities)\b/.test(q)) attribute = "capabilities";
  else if (/\b(?:what is successive|what does successive|about successive|company info|kind of company)\b/.test(q)) attribute = "company_overview";
  if (!attribute) return null;
  return { attribute, mode, subject: person ?? subject, normalizedQuery: q };
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

function mediaLabel(value: unknown): string {
  const source = record(value);
  if (!source) return "";
  return valueFrom(source, ["alt", "caption", "title", "name"])
    .replace(/[_-]+/g, " ").replace(/\s+logo(?:file)?\b/gi, "")
    .replace(/\blogo\b/gi, "").replace(/\s+/g, " ").trim();
}

function nestedMediaLabels(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedMediaLabels);
  const source = record(value);
  if (!source) return [];
  const direct = mediaLabel(source);
  if (source.url && direct) return [direct];
  return Object.values(source).flatMap(nestedMediaLabels);
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

export function answerStructuredRequest(
  items: WordPressItem[],
  request: StructuredRequest,
): StructuredAnswer | null {
  const company = roleDocument(items, "company");
  if (["company_overview", "values", "leadership", "executives", "board", "advisors", "certifications", "global_presence", "person"].includes(request.attribute)) {
    if (!company) return null;
    const { item, document } = company;
    if (request.attribute === "company_overview") {
      const overview = document.descriptions.slice(0, 3).join("\n\n");
      return pageAnswer(document, overview, ["about_content", "description"], ["What are Successive’s core values?", "Who leads Successive?", "What is Successive’s global presence?"]);
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
    const peopleKeys = request.attribute === "board" ? ["board-directors"]
      : request.attribute === "executives" ? ["executive_management"]
        : request.attribute === "advisors" ? ["partners_and_advisors"]
          : request.attribute === "leadership" ? ["executive_management"]
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
      const roleTerm = request.subject;
      const roleMatch = people.filter(({ designation }) => normalizeSearchText(designation).split(" ").some((term) => normalizeSearchText(roleTerm).includes(term)));
      const selected = roleMatch.length ? roleMatch : people;
      const answer = request.mode === "count"
        ? `The current published ${request.attribute} records list **${selected.length} people**.`
        : selected.map(({ name, designation }) => `- **${name}**${designation ? ` — ${designation}` : ""}`).join("\n");
      return pageAnswer(document, answer, peopleKeys, ["Show the board of directors", "Show Successive’s executives"]);
    }
    if (request.attribute === "certifications") {
      const labels = nestedMediaLabels(collection(item.acf, "certifications"))
        .filter((label, index, all) => label && all.indexOf(label) === index);
      const answer = labels.length
        ? `Successive’s About content currently publishes these certification or standards labels:\n${labels.map((label) => `- **${label}**`).join("\n")}`
        : `I couldn’t confirm specific certification labels from the current published About content.`;
      return pageAnswer(document, answer, ["certifications"], ["Tell me about Successive’s company standards", "Show Successive’s leadership"]);
    }
    const footprint = document.structuredFields.filter((field) => /footprint|office|location|headquarter/i.test(`${field.path} ${field.label} ${field.value}`));
    const factual = footprint.filter((field) => field.value.length > 25 && !/\.(?:png|jpe?g|webp|svg|avif)/i.test(field.value));
    const answer = factual.length
      ? factual.slice(0, 5).map((field) => field.value).join("\n\n")
      : `Successive’s About content includes a worldwide-footprint section, but the available API text does not provide enough explicit location details to confirm office names or a location count.`;
    return pageAnswer(document, answer, ["worldwide_footprint"], ["Tell me about Successive Digital", "How does Successive support global enterprises?"]);
  }

  if (["capabilities", "technologies"].includes(request.attribute)) {
    const source = roleDocument(items, "global_capabilities");
    if (!source) return null;
    const categories = collection(source.item.acf, "capabilities_categories").map((entry) => ({
      name: valueFrom(entry, ["inner_title", "title", "heading", "name", "label"]),
      description: valueFrom(entry, ["short_description", "description", "content", "text"]),
      technologies: [...new Set(nestedMediaLabels(entry.logo_repeater))],
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
      partners: [...new Set(nestedMediaLabels(entry.partnerships_logos))],
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

  if (request.attribute === "culture" || request.attribute === "career_benefits") {
    const source = roleDocument(items, request.attribute === "culture" ? "culture" : "careers");
    if (!source) return null;
    const fields = source.document.structuredFields.filter((field) => field.kind === "text" && field.value.length > 12);
    const terms = normalizeSearchText(request.subject).split(" ").filter((term) => term.length > 3);
    const matched = fields.filter((field) => terms.some((term) => normalizeSearchText(`${field.label} ${field.value}`).includes(term)));
    const selected = (matched.length ? matched : fields).slice(0, 8);
    return pageAnswer(source.document, selected.map((field) => field.value).join("\n\n"), [...new Set(selected.map((field) => field.path.split("[")[0]!))], ["Tell me about life at Successive", "What career benefits does Successive offer?"]);
  }

  if (request.attribute === "awards") {
    const source = roleDocument(items, "awards");
    if (!source) return null;
    if (request.mode === "latest") {
      const awards = items.filter((item) => item.type === "award")
        .sort((a, b) => Date.parse(b.date ?? b.modified ?? "") - Date.parse(a.date ?? a.modified ?? ""));
      if (awards[0]) {
        const latest = buildSearchDocument(awards[0]);
        return pageAnswer(source.document, `The newest published award record in the current API is **${latest.title}**${awards[0].date ? ` (${awards[0].date.slice(0, 10)})` : ""}.`, ["award.date", "award.title"], ["Show all awards and recognitions", "What is Successive recognized for?"]);
      }
    }
    return pageAnswer(source.document, source.document.descriptions.slice(0, 5).join("\n\n"), ["title", "description", "title2", "description2"], ["What is Successive recognized for?", "What is Successive’s latest award?"]);
  }
  return null;
}
