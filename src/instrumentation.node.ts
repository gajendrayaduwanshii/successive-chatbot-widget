import { getSuggestionCorpus, refreshSuggestionCorpus } from "./lib/suggestion-corpus";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

type StartupState = { started?: boolean };
const processState = globalThis as typeof globalThis & {
  __successiveCorpusStartupState?: StartupState;
};
const state = processState.__successiveCorpusStartupState ??= {};

/** Starts non-blocking local corpus generation, then refreshes it every hour. */
export function startCorpusRefresh(): void {
  if (state.started) return;
  state.started = true;

  const scheduleNextRefresh = () => {
    const timer = setTimeout(() => {
      void refreshSuggestionCorpus()
        .then((documents) => {
          console.info(`[suggestion-corpus] refreshed ${documents.length} documents`);
        })
        .catch((error: unknown) => {
          console.error("[suggestion-corpus] refresh failed; retaining the previous local JSON", error);
        })
        .finally(scheduleNextRefresh);
    }, REFRESH_INTERVAL_MS);
    timer.unref?.();
  };

  void getSuggestionCorpus()
    .then((documents) => {
      console.info(`[suggestion-corpus] startup ready with ${documents.length} documents`);
    })
    .catch((error: unknown) => {
      console.error("[suggestion-corpus] startup warmup failed; a chat request may retry it", error);
    })
    .finally(scheduleNextRefresh);
}
