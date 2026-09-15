import { normalizeSearchText, type SuccessiveSearchDocument } from "./search-index";

export type PreparedIdentityIndex = {
  vocabulary: Array<[string, number]>;
  exactIdentityLookup: Array<[string, number[]]>;
};

/**
 * Builds small identity-only structures alongside the large search corpus so
 * server instances can restore title and typo lookup without scanning every
 * document on their first visitor request.
 */
export function buildPreparedIdentityIndex(
  documents: SuccessiveSearchDocument[],
): PreparedIdentityIndex {
  const vocabulary = new Map<string, number>();
  const exactIdentityLookup = new Map<string, number[]>();
  documents.forEach((document, documentIndex) => {
    const vocabularySource = `${document.normalizedTitle} ${document.slug.replace(/-/g, " ")} ${document.headings.join(" ")}`;
    normalizeSearchText(vocabularySource).split(" ").filter((token) => token.length >= 5)
      .forEach((token) => vocabulary.set(token, (vocabulary.get(token) ?? 0) + 1));
    [document.normalizedTitle, normalizeSearchText(document.slug.replace(/-/g, " ")), ...document.aliases]
      .filter(Boolean)
      .forEach((identity) => {
        const matches = exactIdentityLookup.get(identity) ?? [];
        if (!matches.includes(documentIndex)) matches.push(documentIndex);
        exactIdentityLookup.set(identity, matches);
      });
  });
  return {
    vocabulary: [...vocabulary],
    exactIdentityLookup: [...exactIdentityLookup],
  };
}

export function hydratePreparedIdentityIndex(
  documents: SuccessiveSearchDocument[],
  prepared: PreparedIdentityIndex,
): { vocabulary: Map<string, number>; exactIdentityLookup: Map<string, SuccessiveSearchDocument[]> } | undefined {
  if (!Array.isArray(prepared.vocabulary) || !Array.isArray(prepared.exactIdentityLookup)) return undefined;
  const exactIdentityLookup = new Map<string, SuccessiveSearchDocument[]>();
  prepared.exactIdentityLookup.forEach(([identity, indexes]) => {
    if (typeof identity !== "string" || !Array.isArray(indexes)) return;
    const matches = indexes.map((index) => documents[index]).filter((document): document is SuccessiveSearchDocument => Boolean(document));
    if (matches.length) exactIdentityLookup.set(identity, matches);
  });
  return {
    vocabulary: new Map(prepared.vocabulary.filter((entry): entry is [string, number] =>
      Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number")),
    exactIdentityLookup,
  };
}
