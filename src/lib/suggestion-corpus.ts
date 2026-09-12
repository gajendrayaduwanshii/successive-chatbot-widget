import { fetchAllPublishedContent } from "./successive-api";
import { buildSearchIndex, type SuccessiveSearchDocument } from "./search-index";
import { storeRefreshedSearchIndex } from "./search-retriever";

type SuggestionCorpusState = {
  cache?: { loadedAt: number; documents: SuccessiveSearchDocument[] };
  build?: Promise<SuccessiveSearchDocument[]>;
};

// One process-local cache shared by instrumentation and route bundles, which
// may instantiate this module separately. This replaces the route-local state.
const processState = globalThis as typeof globalThis & {
  __successiveSuggestionCorpusState?: SuggestionCorpusState;
};
const state = processState.__successiveSuggestionCorpusState ??= {};

export async function getSuggestionCorpus(): Promise<SuccessiveSearchDocument[]> {
  if (state.cache && Date.now() - state.cache.loadedAt < 60 * 60_000)
    return state.cache.documents;
  if (!state.build) {
    state.build = fetchAllPublishedContent()
      .then(async (items) => {
        const documents = buildSearchIndex(items);
        state.cache = { loadedAt: Date.now(), documents };
        await storeRefreshedSearchIndex(documents);
        return documents;
      })
      .finally(() => { state.build = undefined; });
  }
  return state.build;
}

/** Forces the next hourly background cycle to rebuild from the published source. */
export async function refreshSuggestionCorpus(): Promise<SuccessiveSearchDocument[]> {
  state.cache = undefined;
  return getSuggestionCorpus();
}
