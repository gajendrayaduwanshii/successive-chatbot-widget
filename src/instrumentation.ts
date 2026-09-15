export async function register(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.NODE_ENV === "test") return;

  // Keep Node-only filesystem and corpus code out of the Edge compilation
  // graph. This is the runtime boundary recommended by Next.js.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCorpusRefresh } = await import("./instrumentation.node");
    startCorpusRefresh();
  }
}
