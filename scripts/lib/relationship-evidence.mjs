const relationshipField = /(?:^|_)(?:related|relationship|relationships|reference|references|referenced|linked_content|related_content|post_object|post_objects|selected_content|selected_posts|selected_pages)(?:_|$)/i;
const metadataField = /(?:^|\.)(?:image|images|media|sizes?|width|height|dimensions?|thumbnail|attachment|file_metadata|files?)(?:\.|$)/i;
const mediaUrl = /\/wp-content\/uploads\/|\.(?:avif|bmp|gif|jpe?g|png|svg|webp|mp4|mov|pdf)(?:[?#]|$)/i;

const canonicalPath = (value) => {
  try {
    const parsed = new URL(String(value), "https://successive.tech");
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
};

const urlsIn = (value) => {
  const text = String(value ?? "");
  return [
    ...(text.match(/https?:\/\/[^\s"'<>]+/gi) ?? []),
    ...((text.match(/(?:href|url)=["'](\/[^"']+)["']/gi) ?? []).map((entry) =>
      entry.replace(/^(?:href|url)=["']|["']$/gi, ""))),
  ];
};

/**
 * Extracts content-record relationships from source data with path semantics.
 * A number matching a known record ID is never sufficient on its own.
 */
export function authoritativeRelationshipIds(record, records) {
  const byId = new Map(records.map((item) => [String(item.id), item]));
  const byPath = new Map(records.map((item) => {
    const path = canonicalPath(item.url ?? item.link ?? item.original_metadata?.link);
    return [path, String(item.id)];
  }).filter(([path]) => path));
  const result = new Set();
  const addId = (value) => {
    const id = String(value ?? "");
    if (id !== String(record.id) && byId.has(id)) result.add(id);
  };
  const addUrl = (value, path) => {
    if (metadataField.test(path) || mediaUrl.test(String(value))) return;
    for (const url of urlsIn(value)) {
      const id = byPath.get(canonicalPath(url));
      if (id) addId(id);
    }
    const direct = byPath.get(canonicalPath(value));
    if (direct) addId(direct);
  };
  const visit = (value, path, semantic = false) => {
    if (value == null || metadataField.test(path)) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`, semantic));
      return;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value);
      const structuredReference = entries.some(([key]) => /^(?:url|link)$/i.test(key)) &&
        entries.some(([key]) => /^(?:id|ID|post_id|record_id|title|type|post_type)$/i.test(key));
      for (const [key, item] of entries) {
        const childPath = `${path}.${key}`;
        const childSemantic = semantic || relationshipField.test(key) || structuredReference;
        if (childSemantic && /^(?:id|ID|post_id|record_id)$/i.test(key) &&
            (typeof item === "number" || typeof item === "string")) addId(item);
        visit(item, childPath, childSemantic);
      }
      return;
    }
    if (typeof value === "string") addUrl(value, path);
    if (semantic && (typeof value === "number" || /^\d+$/.test(String(value)))) addId(value);
  };

  const original = record.original_metadata;
  if (original && typeof original === "object") {
    visit(original.acf, "original_metadata.acf");
    visit(original.content, "original_metadata.content");
  } else {
    // Raw API fixtures may expose genuine relationship fields directly.
    visit(record.related_items, "related_items", true);
    visit(record.relationships, "relationships", true);
    visit(record.acf, "acf");
    visit(record.content, "content");
  }
  if (Number.isFinite(Number(record.parent)) && Number(record.parent) > 0) addId(record.parent);
  return result;
}

export function relationshipTargets(record, wantedRole, records, roleCompatible) {
  const byId = new Map(records.map((item) => [String(item.id), item]));
  return [...authoritativeRelationshipIds(record, records)]
    .map((id) => byId.get(id))
    .filter((item) => item && roleCompatible(item, wantedRole));
}
