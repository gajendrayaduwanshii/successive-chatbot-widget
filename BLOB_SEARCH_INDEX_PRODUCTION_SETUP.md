# Persistent chatbot search index

## Purpose

The chatbot previously relied on process-local memory and `.next/cache` JSON files. Those work during local development, but a new Vercel serverless instance may not have them. It can then download the complete WordPress corpus and rebuild the index during a visitor's request.

This change stores the prepared search index in a private Vercel Blob. Every Vercel instance can read the same prepared index.

## Team summary

The chatbot now uses a prepared JSON search index instead of downloading and indexing the complete WordPress corpus during a visitor request. A scheduled workflow refreshes that index hourly and stores it privately in Vercel Blob. New Vercel instances can load the ready index, avoiding the cold-path delay of downloading roughly 946 WordPress records.

## Runtime flow

```text
Hourly GitHub workflow
  -> authenticated request to the deployed Vercel refresh route
  -> fetch complete WordPress content
  -> build the search index
  -> atomically replace private Blob JSON

Chat request on Vercel
  -> read prepared private Blob index
  -> retrieve relevant documents
  -> return grounded answer or use the LLM when required
```

If Blob is not configured or temporarily unavailable, the application preserves the existing local/process cache and on-demand rebuild fallback.

## Files added or changed

- `src/lib/persistent-search-index.ts`: private Vercel Blob read/write support.
- `src/lib/suggestion-corpus.ts`: reads Blob first; publishes a newly built corpus index to Blob.
- `src/lib/search-retriever.ts`: uses the Blob index before rebuilding from WordPress.
- `src/lib/successive-api.ts`: supports a forced refresh for scheduled rebuilds.
- `src/app/api/internal/refresh-search-index/route.ts`: protected production refresh route.
- `.github/workflows/refresh-search-index.yml`: invokes that route hourly and can be run manually.
- `package.json`: adds `npm run corpus:refresh` and the required packages.

## Vercel setup

1. Create a **Private** Vercel Blob store connected to this project.
2. Use the `BLOB` environment prefix and enable the read-write token connection.
3. Vercel creates `BLOB_READ_WRITE_TOKEN` for Production and Preview automatically.
4. Do not expose the Blob token in source code, screenshots, chat, or browser code.

## GitHub setup

Create the same random value for `CRON_SECRET` in both locations:

| Location | Name | Value |
| --- | --- | --- |
| Vercel project environment variables (Production) | `CRON_SECRET` | A new random secret chosen by you. |
| GitHub repository Actions secrets | `CRON_SECRET` | The exact same value. |

The GitHub workflow does not receive `BLOB_READ_WRITE_TOKEN`. The deployed Vercel application already has that sensitive token and performs the private Blob write after validating `CRON_SECRET`.

## First production index

After the code has been pushed and deployed:

1. Open GitHub **Actions**.
2. Choose **Refresh chatbot search index**.
3. Click **Run workflow**.
4. Wait for the run to finish successfully.
5. In Vercel Blob storage, confirm `successive-chatbot/search-index.json` exists.
6. Send a normal `/api/chat` request and confirm the index is reused rather than rebuilding the full WordPress corpus.

The workflow then runs every hour at minute 17. GitHub schedule timing may vary slightly.

## Validation completed locally

- `npm run typecheck` passed.
- Focused route and content-loader tests passed: 75 tests.
- `npm run build` passed.

## Important deployment note

`public/external-widget-example.html` currently contains a local-development URL change. Restore the Vercel widget/API URLs before committing or deploying that file.

## Moving to another server or cloud provider

The chatbot retrieval and answer logic is portable. Only the persistent-storage and scheduling pieces are Vercel-specific.

| Current Vercel component | Equivalent elsewhere |
| --- | --- |
| Private Vercel Blob | AWS S3, Google Cloud Storage, Azure Blob Storage, or a persistent server volume |
| Hourly GitHub workflow | Server cron, GitHub Actions, AWS EventBridge, Cloud Scheduler, or another scheduler |
| `BLOB_READ_WRITE_TOKEN` | Credentials for the selected storage provider |

On a traditional server with permanent disk, the local JSON files can be retained on a mounted persistent volume. On serverless platforms, use persistent object storage so new instances can read the prepared index.

When moving the application, configure the new environment with the WordPress API URL, AI provider/model credentials, allowed origins, widget API URL, and the selected storage credentials.
