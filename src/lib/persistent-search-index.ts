import { get, put } from "@vercel/blob";
import type { SuccessiveSearchDocument } from "./search-index";
import { buildPreparedIdentityIndex, type PreparedIdentityIndex } from "./search-index-preparation";

const BLOB_PATHNAME = "successive-chatbot/search-index.json";
const INDEX_VERSION = 2;

export type PersistedSearchIndex = {
  version: number;
  loadedAt: number;
  documents: SuccessiveSearchDocument[];
  preparedIdentityIndex?: PreparedIdentityIndex;
};

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Reads the shared production index. Local development intentionally falls
 * back to .next/cache when Blob storage has not been configured.
 */
export async function readPersistentSearchIndex(): Promise<
  PersistedSearchIndex | undefined
> {
  const token = blobToken();
  if (!token) return undefined;
  try {
    const result = await get(BLOB_PATHNAME, { access: "private", token });
    if (!result || result.statusCode !== 200) return undefined;
    const value = (await new Response(result.stream).json()) as Partial<PersistedSearchIndex>;
    if ((value.version !== 1 && value.version !== INDEX_VERSION) || !Array.isArray(value.documents))
      return undefined;
    return {
      version: INDEX_VERSION,
      loadedAt: typeof value.loadedAt === "number" ? value.loadedAt : Date.now(),
      documents: value.documents,
      preparedIdentityIndex: value.version === INDEX_VERSION
        ? value.preparedIdentityIndex
        : undefined,
    };
  } catch {
    // Blob outages must not turn a valid on-demand corpus rebuild into an error.
    return undefined;
  }
}

/**
 * Atomically replaces the shared production index after a complete rebuild.
 * A stable pathname lets every new Vercel instance read the newest artifact.
 */
export async function writePersistentSearchIndex(
  documents: SuccessiveSearchDocument[],
): Promise<void> {
  const token = blobToken();
  if (!token) return;
  const body: PersistedSearchIndex = {
    version: INDEX_VERSION,
    loadedAt: Date.now(),
    documents,
    preparedIdentityIndex: buildPreparedIdentityIndex(documents),
  };
  await put(BLOB_PATHNAME, JSON.stringify(body), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    token,
  });
}
