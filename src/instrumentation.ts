// Register must return without waiting for data loading or index construction.
// Node-only dynamic import keeps filesystem/cache code out of the Edge bundle.
export function register(): void {
  if (process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.NODE_ENV === "test") return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const processState = globalThis as typeof globalThis & {
      __successiveCorpusStartupScheduled?: boolean;
    };
    if (processState.__successiveCorpusStartupScheduled) return;
    processState.__successiveCorpusStartupScheduled = true;

    const timer = setTimeout(() => {
      void import("./lib/suggestion-corpus")
        .then(({ getSuggestionCorpus }) => getSuggestionCorpus())
        .catch(() => {
          // Startup is best-effort. Normal requests and after() retain retry
          // coverage, including hosts whose Next cache is not initialized yet.
        });
    }, 0);
    timer.unref?.();
  }
}
