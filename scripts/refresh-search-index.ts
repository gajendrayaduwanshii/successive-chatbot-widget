import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required to publish the search index.",
    );

  const [
    { fetchAllPublishedContent },
    { buildSearchIndex },
    { writePersistentSearchIndex },
  ] = await Promise.all([
    import("../src/lib/successive-api"),
    import("../src/lib/search-index"),
    import("../src/lib/persistent-search-index"),
  ]);
  const startedAt = Date.now();
  const items = await fetchAllPublishedContent({ forceRefresh: true });
  const documents = buildSearchIndex(items);
  await writePersistentSearchIndex(documents);
  console.info(
    `Published ${documents.length} search documents in ${Date.now() - startedAt}ms.`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Search-index refresh failed.",
  );
  process.exitCode = 1;
});
