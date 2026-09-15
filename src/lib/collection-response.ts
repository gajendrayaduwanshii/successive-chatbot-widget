import { factualDocumentEvidence, isPresentationStructuredPath, isServiceFamilySchemaType, normalizeSearchText, normalizeServiceSchemaType, type SuccessiveSearchDocument } from "./search-index";
import { documentContentType } from "./response-alignment";
import { buildDeterministicUnderstanding } from "./query-understanding";
import { isRequestedContentTypeCompatible } from "./search-retriever";

type Document = SuccessiveSearchDocument;
export interface IndexedCollection {
  key: string;
  label: string;
  aliases: string[];
  root?: Document;
  members: Document[];
  authority: string[];
}
export interface CollectionResponse {
  collection: IndexedCollection;
  normalizedCollection: string;
  recoveredTypo: boolean;
  children: Document[];
  answer: string;
  inlineLinks: number;
}

// Language grammar and source-schema labels, not website category names.
const MODIFIERS = new Set(["all", "every", "show", "me", "list", "our", "your", "their", "the", "available", "tell", "about", "explore", "please", "complete", "full", "entire"]);
const INFRASTRUCTURE_TYPES = new Set(["page", "post", "company", "contact", "location", "editorial", "global capability", "culture", "leadership"]);
function singular(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("s") && !/(?:ss|us|is|news)$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}
function identity(value: string): string {
  return normalizeSearchText(value).split(" ").map(singular).join(" ");
}
export function normalizeCollectionQuery(query: string): string {
  const normalized = normalizeSearchText(query)
    .replace(/^(?:what|which)\s+(.+?)\s+do you\s+(?:offer|provide|have)$/, "$1")
    .replace(/^(?:what|which) are (?:your|the|our) /, "");
  const words = normalized.split(" ");
  while (words.length && MODIFIERS.has(words[0]!)) words.shift();
  while (words.length && words.at(-1) === "please") words.pop();
  return words.map(singular).join(" ");
}

/** Corpus-free gate using exactly the resolver's existing grammar bound. */
export function isPlausibleCollectionQuery(query: string): boolean {
  const normalized = normalizeCollectionQuery(query);
  return Boolean(normalized && normalized.split(" ").length <= 5);
}
function urlKey(value: string, origin: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password || url.search || url.hash) return;
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || /\.(?:pdf|png|svg|jpg|webp|mp4|zip)$/i.test(path) || /^\/(?:wp-content|wp-includes)\b/.test(path)) return;
    return `${url.origin}${path}`;
  } catch { return; }
}
const distinct = (documents: Document[]) => [...new Map(documents.map((doc) => [doc.url.replace(/\/+$/, ""), doc])).values()];
function rootAliases(root: Document): string[] {
  const slug = identity(root.slug).replace(/\b(?:listing|archive|index)\b/g, "").trim();
  return [...new Set([slug, normalizeCollectionQuery(root.title), ...(normalizeSearchText(root.title).split(" ").length <= 5 ? slug.split(/\s+and\s+/) : [])])].filter(Boolean);
}

/** Catalog discovery uses only existing index data. It never fetches or constructs page URLs. */
export function discoverIndexedCollections(documents: Document[], siteUrl: string): IndexedCollection[] {
  let origin: string;
  try { origin = new URL(siteUrl).origin; } catch { return []; }
  const valid = distinct(documents.filter((doc) => urlKey(doc.url, origin)));
  const byUrl = new Map(valid.map((doc) => [urlKey(doc.url, origin)!, doc]));
  const byId = new Map(valid.filter((doc) => doc.type === "page").map((doc) => [doc.id, doc]));
  const groups = new Map<string, IndexedCollection>();
  const typedMembers = new Map<string, Document[]>();
  const add = (name: string, docs: Document[], authority: string) => {
    const key = identity(name);
    if (!key || INFRASTRUCTURE_TYPES.has(key)) return;
    const group = groups.get(key) ?? { key, label: name.replace(/[-_]/g, " "), aliases: [key], members: [], authority: [] };
    if (["content-type", "source-content-type", "service-schema", "indexed-role", "lead-magnet-schema", "lead-magnet-subtype"].includes(authority)) {
      typedMembers.set(key, distinct([...(typedMembers.get(key) ?? []), ...docs]));
    }
    group.members = distinct([...group.members, ...docs]);
    group.authority = [...new Set([...group.authority, authority])];
    groups.set(key, group);
  };
  for (const doc of valid) {
    // Reuse family normalization without allowing a title keyword to establish
    // membership. Source types, schema, URL identity and taxonomy remain evidence.
    const structural = { ...doc, title: "", normalizedTitle: "", productLike: false, role: "page" as const };
    add(documentContentType(isServiceFamilySchemaType(doc.service_type) ? { ...structural, slug: "" } : structural), [doc], "content-type");
    const resourceFields = doc.structuredFields.filter((field) =>
      /(?:^|[._])lead_magnet_(?:heading|title|description|content)/i.test(field.path) && field.kind === "text");
    if (resourceFields.length && !isServiceFamilySchemaType(doc.service_type)) {
      add("resource", [doc], "lead-magnet-schema");
      for (const field of resourceFields) {
        add(documentContentType({ ...structural, slug: "", title: field.value }), [doc], "lead-magnet-subtype");
      }
    }
    if (doc.type !== "page" && doc.type !== "post") add(doc.type, [doc], "source-content-type");
    if (doc.type !== "page") {
      const family = groups.get(identity(documentContentType(structural)));
      if (family) family.aliases = [...new Set([...family.aliases, identity(doc.type)])];
    }
    if (isServiceFamilySchemaType(doc.service_type)) add("service", [doc], "service-schema");
    // Roles supplement typed collections only for unambiguously classified
    // records; a service mentioning "resource management" is not a resource.
    if (!isServiceFamilySchemaType(doc.service_type) && (doc.type !== "page" ||
        doc.role === "service" || doc.role === "global_capabilities")) add(doc.role, [doc], "indexed-role");
    const segments = new URL(doc.url).pathname.split("/").filter(Boolean);
    for (let length = 1; length < segments.length; length++) {
      const parent = byUrl.get(`${origin}/${segments.slice(0, length).join("/")}`);
      add(segments.slice(0, length).join(" "), [doc], "url-hierarchy");
      if (parent) add(parent.slug, [doc], "url-hierarchy");
    }
    for (const term of doc.taxonomyTerms.filter((value) => /[a-z]/i.test(value))) add(term, [doc], "taxonomy");
  }
  // URL and taxonomy catalogs can supplement an unknown family, but cannot
  // broaden a family whose members have explicit type/schema authority.
  for (const [key, members] of typedMembers) groups.get(key)!.members = members;
  const rootMembers = new Map<Document, Document[]>();
  for (const root of valid.filter((doc) => doc.type === "page" && !isServiceFamilySchemaType(doc.service_type))) {
    const rootKey = urlKey(root.url, origin)!;
    const children = valid.filter((doc) => doc !== root && (
      doc.parentId === root.id || urlKey(doc.url, origin)!.startsWith(`${rootKey}/`)
    ));
    for (const link of root.structuredLinks.filter((link) => !isPresentationStructuredPath(link.path))) {
      let target = byUrl.get(urlKey(link.url, origin) ?? "");
      // WordPress relationship GUIDs are identifiers, not usable destinations.
      // Resolve the ID back to an indexed canonical URL; never expose the GUID.
      if (!target && /(?:relationship|selected|related)/i.test(link.path)) {
        try {
          const id = new URL(link.url).searchParams.get("page_id");
          if (id) target = byId.get(Number(id));
        } catch { /* malformed source reference */ }
      }
      if (target && target !== root && /(?:relationship|selected|related)/i.test(link.path)) children.push(target);
    }
    const members = distinct(children);
    const aliases = rootAliases(root);
    const enumerated = [...(summary(root) ?? "").matchAll(/\b(?:featuring|includes?|including|comprises?|such as)\s+([^.!?]+)/gi)]
      .flatMap((match) => match[1]!.split(/,|\band\b/i)).map(normalizeCollectionQuery);
    const namedGroups = [...groups.values()].filter((group) => group.authority.includes("source-content-type") &&
      enumerated.includes(group.key));
    const landing = namedGroups.length >= 2 || aliases.some((alias) => groups.has(alias)) ||
      members.filter((doc) => doc.parentId === root.id || urlKey(doc.url, origin)!.startsWith(`${rootKey}/`)).length >= 2 ||
      identity(root.slug) !== normalizeSearchText(root.slug) && identity(root.slug).split(" ").length <= 2;
    if (!landing) continue;
    if (members.length) rootMembers.set(root, members);
    // A root's short exact slug, or an authored conjunction such as
    // "Blogs and Insights", establishes which typed catalog it describes.
    for (const group of groups.values()) {
      if (aliases.includes(group.key)) {
        const sameType = group.members.filter((doc) => doc !== root);
        const associated = distinct(sameType);
        if (!associated.length) continue;
        if (!group.root || members.length > (rootMembers.get(group.root)?.length ?? 0)) {
          group.root = root;
          group.members = associated;
          group.aliases = [...new Set([...group.aliases, ...aliases.filter((alias) => !alias.includes(" and "))])];
          group.authority.push("canonical-landing-identity");
        }
      }
    }
    // A landing-page introduction may explicitly advertise several indexed
    // types. Only that authored enumeration can establish a mixed catalog.
    if (namedGroups.length >= 2 && normalizeSearchText(root.title).split(" ").length <= 5) {
      const combined = distinct(namedGroups.flatMap((group) => group.members));
      add(root.slug, combined, "authored-type-enumeration");
      const aggregate = groups.get(identity(root.slug));
      if (aggregate) {
        aggregate.members = combined;
        rootMembers.set(root, combined);
        aggregate.root = root;
        // Only the full landing identity names the aggregate; a component alias
        // must continue to name its separate source family.
        aggregate.aliases = [...new Set([identity(root.slug), normalizeCollectionQuery(root.title)])];
      }
    }
    if (members.length && (members.length >= 2 || identity(root.slug) !== normalizeSearchText(root.slug) || aliases.some((alias) => groups.has(alias)))) {
      const existing = groups.get(identity(root.slug));
      const typed = existing?.authority.some((signal) => ["content-type", "source-content-type", "service-schema", "lead-magnet-subtype", "authored-type-enumeration"].includes(signal));
      add(root.slug, typed ? members.filter((doc) => existing!.members.includes(doc)) : members, "root-child-reference");
      const group = groups.get(identity(root.slug));
      if (group) { group.root = root; group.aliases = [...new Set([...group.aliases, ...aliases])]; }
    }
  }
  for (const aggregate of groups.values()) {
    if (!aggregate.authority.includes("authored-type-enumeration")) continue;
    for (const group of groups.values()) {
      if (group !== aggregate && group.root === aggregate.root) group.aliases = [group.key];
    }
  }
  // An aggregate role can reuse a root only when it directly references its
  // members. This also handles pages collecting several related resource types.
  for (const group of groups.values()) {
    if (!group.root) {
      const candidates = [...rootMembers].map(([root, members]) => ({ root, members,
        overlap: members.filter((doc) => group.members.includes(doc)).length }))
        .filter(({ root, overlap, members }) => overlap >= 2 && (identity(root.role) === group.key || overlap / group.members.length >= 0.8))
        .sort((a, b) => b.overlap - a.overlap);
      if (candidates.length === 1 || candidates[0] && candidates[0].overlap > candidates[1]!.overlap) {
        group.root = candidates[0]!.root;
        // Root overlap provides navigation authority, never additional type membership.
        group.authority.push("aggregate-root-reference");
      }
    }
    group.members = group.members.filter((doc) => doc !== group.root && !rootMembers.has(doc));
  }
  return [...groups.values()].filter((group) => group.members.length >= 2 || group.root && group.members.length >= 1);
}

function oneEdit(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1 || Math.min(left.length, right.length) < 4) return false;
  if (left.length === right.length) {
    const differing = [...left].map((char, i) => char === right[i] ? -1 : i).filter((i) => i >= 0);
    return differing.length === 1 || differing.length === 2 && differing[1] === differing[0]! + 1 &&
      left[differing[0]!] === right[differing[1]!] && left[differing[1]!] === right[differing[0]!];
  }
  const [short, long] = left.length < right.length ? [left, right] : [right, left];
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  return false;
}
function summary(doc: Document): string | undefined {
  const fields = doc.structuredFields.filter((field) => field.kind === "text" &&
    /(?:hero|overview|intro|description|content)/i.test(field.path) && !isPresentationStructuredPath(field.path) &&
    !/(?:\[|faq|image|logo|post_|relationship|selected|heading|title)/i.test(field.path)).map((field) => field.value);
  const values = [...fields, ...(doc.editorTextSegments ?? []), ...doc.descriptions, ...factualDocumentEvidence(doc)];
  const sentence = values.flatMap((value) => value.replace(/https?:\/\/\S+/g, "").replace(/[[\]*#]/g, "").split(/(?<=[.!?])\s+/))
    .map((text) => text.replace(/\s+/g, " ").trim())
    .find((text) => text.split(" ").length >= 8 && !text.endsWith("?") &&
      !/^(?:download|contact|talk|connect|get answers|explore our faqs|you will learn)/i.test(text));
  if (!sentence) return;
  return sentence.length <= 220 ? sentence : `${sentence.slice(0, 217).replace(/\s+\S*$/, "")}…`;
}
const link = (doc: Document, label = doc.title) => `[${label.replace(/[[\]\\]/g, "").replace(/\s+/g, " ").trim()}](${doc.url.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;

/** A narrow grammar prevents topic/relationship/attribute questions becoming catalogs. */
export function resolveCollectionResponse(query: string, documents: Document[], siteUrl: string): CollectionResponse | undefined {
  if (!isPlausibleCollectionQuery(query)) return;
  const normalized = normalizeCollectionQuery(query);
  const catalog = discoverIndexedCollections(documents, siteUrl);
  // Exact canonical topic identity retains its existing route, unless it is
  // the proven landing page of the collection being requested.
  const topic = documents.find((doc) => identity(doc.title) === normalized || identity(doc.slug) === normalized);
  if (topic && !catalog.some((group) => group.root?.url === topic.url)) return;
  let matches = catalog.filter((group) => group.aliases.includes(normalized));
  // Resolve a complete sequence of indexed family names (or source-type
  // acronyms) only to an already proven aggregate. No leftover topic is allowed.
  if (!matches.length) {
    const tokens = normalized.split(" ");
    const parts: IndexedCollection[] = [];
    let offset = 0;
    while (offset < tokens.length) {
      if (tokens[offset] === "and" && parts.length && offset + 1 < tokens.length) { offset++; continue; }
      let found: IndexedCollection[] = [];
      let consumed = 0;
      for (let end = tokens.length; end > offset; end--) {
        const phrase = tokens.slice(offset, end).join(" ");
        found = catalog.filter((group) => group.key === phrase ||
          group.authority.includes("source-content-type") && group.key.split(" ").length > 1 &&
          group.key.split(" ").map((word) => word[0]).join("") === phrase);
        if (!found.length) {
          const understood = buildDeterministicUnderstanding(phrase);
          if (understood.requestedContentType && identity(understood.requestedContentType) === phrase) {
            found = catalog.filter((group) => group.authority.includes("authored-type-enumeration") &&
              group.members.every((doc) => isRequestedContentTypeCompatible(doc, understood.requestedContentType)));
          }
        }
        if (found.length) { consumed = end - offset; break; }
      }
      if (found.length !== 1) break;
      parts.push(found[0]!);
      offset += consumed;
    }
    if (offset === tokens.length && parts.length) {
      const requestedMembers = new Set(parts.flatMap((part) => part.members.map((doc) => doc.url)));
      matches = catalog.filter((group) => group.authority.includes("authored-type-enumeration") &&
        group.members.length === requestedMembers.size && group.members.every((doc) => requestedMembers.has(doc.url)));
    }
  }
  let recoveredTypo = false;
  if (!matches.length && normalized.length >= 4) {
    matches = catalog.filter((group) => group.aliases.some((alias) =>
      alias.startsWith(`${normalized} `) && group.authority.includes("source-content-type") ||
      group.root && !alias.includes(" ") && alias.startsWith(normalized) && alias.length <= normalized.length + 4));
  }
  if (!matches.length) {
    matches = catalog.filter((group) => group.aliases.some((alias) => oneEdit(normalized, alias)));
    recoveredTypo = matches.length > 0;
  }
  const exactKey = matches.filter((group) => group.key === normalized);
  if (exactKey.length) matches = exactKey;
  else if (matches.length > 1) {
    const canonicalRoot = matches.filter((group) => group.root && identity(group.root.slug) === group.key);
    if (canonicalRoot.length === 1) matches = canonicalRoot;
  }
  // Aliases which describe the same actual set are equivalent, not ambiguous.
  const unique = [...new Map(matches.map((group) => [group.members.map((doc) => doc.url).sort().join("|"), group])).values()];
  if (unique.length !== 1) return;
  const collection = unique[0]!;
  const ranked = [...collection.members].sort((a, b) =>
    Number(normalizeServiceSchemaType(b.service_type) === "pillar") - Number(normalizeServiceSchemaType(a.service_type) === "pillar") ||
    (a.menuOrder ?? 0) - (b.menuOrder ?? 0) || b.contentQuality - a.contentQuality || a.url.localeCompare(b.url));
  const representatives = collection.authority.includes("authored-type-enumeration")
    ? [...new Map([...ranked].reverse().map((doc) => [doc.type, doc])).values()]
    : [];
  const children = distinct([...representatives, ...ranked]).slice(0, 3);
  if (!children.length) return;
  const overview = collection.root && summary(collection.root) || `Explore the published ${collection.label} collection and the options below.`;
  const supporting = `${children.map((doc) => link(doc)).join(", ")}.`;
  const cta = collection.root ? `Explore ${link(collection.root)} for the complete collection.` : undefined;
  const answer = [overview, supporting, cta].filter(Boolean).join("\n\n");
  return { collection, normalizedCollection: collection.key, recoveredTypo, children, answer,
    inlineLinks: (answer.match(/\]\(https:\/\//g) ?? []).length };
}
