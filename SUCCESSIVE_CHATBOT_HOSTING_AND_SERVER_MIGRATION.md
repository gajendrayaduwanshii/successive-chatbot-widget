# Successive Chatbot — Current Hosting and Company Server Requirements

## 1. Current Setup

The chatbot is a Next.js application with a browser widget and server-side APIs. The project's configured Vercel address is `https://successive-chatbot-widget.vercel.app`.

The WordPress website embeds `/successive-chat-widget.js` from this application. The script loads the accompanying `/successive-chat-widget.css` and sends browser chat requests to `POST /api/chat`. The embed can set the API address through `data-api-url`; otherwise it uses the widget script's origin. WordPress and the chatbot are separate applications.

## 2. Current Hosting

- Vercel hosts project `successive-chatbot-widget`. The supplied dashboard screenshots dated 16 September 2026 show successful production deployments.
- Vercel serves the Next.js application, public widget files, and API routes. The chat route explicitly uses the Node.js runtime.
- Dashboard build settings use the **Next.js** framework preset and **Node.js 24.x**, with build, install, and output-directory overrides disabled. The project supplies `npm run build` (`next build`) and `npm start` (`next start`).
- Vercel is connected to GitHub repository `gajendrayaduwanshii/successive-chatbot-widget`. The deployment history shows production deployments from `master` after pull-request merges and preview deployments from development branches. The latest visible production deployment is **Ready**, commit `c62608a`.
- Deployment uses the Vercel Git integration. The separate GitHub Actions workflow refreshes content; it does not deploy the application.

Repository inspection is supplemented by the supplied Vercel and GitHub screenshots dated 16 September 2026. Environment-variable names and scopes are confirmed; their values remain hidden. Deployed domain details and the actual WordPress embed installation are not shown.

## 3. Current Storage

| Storage/cache | Confirmed implementation |
| --- | --- |
| Persisted production search index | Code reads/writes `successive-chatbot/search-index.json` using `BLOB_READ_WRITE_TOKEN`. The dashboard confirms private store `successive-chatbot-widget-blob`, region `IAD1`, and the `successive-chatbot/` folder. The exact JSON file and its contents are not visible. |
| Local search index | `.next/cache/successive-search-index.json`, relative to the application working directory. |
| Local website-content cache | `.next/cache/successive-corpus.json`, relative to the application working directory. |
| In-memory cache | Process-local content and index caches, generally valid for one hour. These are lost on restart and are not shared between processes. |
| Startup prewarm | Node.js startup asynchronously loads/prepares the index, then schedules refreshes at one-hour intervals after completion. |

Local files support development and writable-server operation. File-write failures are tolerated, so successful requests alone do not prove disk persistence. If Blob is unavailable or unconfigured, the application can fall back to local caches and rebuilding from WordPress.

The repository also defines an hourly GitHub Actions job at minute 17, with manual execution available. It calls `POST /api/internal/refresh-search-index` using a bearer `CRON_SECRET`. The supplied GitHub screenshot confirms three successful scheduled runs and one successful manual run on `master`. The latest visible run is #9. The displayed run times are not exactly hourly; the hourly configuration is confirmed, but uninterrupted hourly execution is not established by the screenshot.

## 4. External Connections

| Connection | Purpose |
| --- | --- |
| WordPress Website → Chatbot | Visitor's browser loads the widget and sends chat requests. |
| Chatbot → Successive WordPress API | Reads published website content through the custom `/wp-json/successive-digital/v1` API. |
| Chatbot → LLM Provider | Calls the configured external AI API to generate responses when required. |
| Chatbot → Vercel Blob | Reads/writes the private persisted search index when configured. |
| GitHub Actions → Chatbot | Calls the protected index-refresh endpoint on an hourly configured schedule. |

LLM API credentials stay on the server. Browser access to the chat API uses the configured WordPress-origin allowlist and supports `POST` and `OPTIONS` requests.

## 5. Environment Variables

Configure these names for the selected deployment; conditional requirements are identified below. The Vercel screenshot confirms the listed server variables are configured for Production; values are hidden. `NEXT_PUBLIC_CHAT_API_URL` is supported by code but is not listed in the screenshot. No secret values are included.

| Variable | Purpose |
| --- | --- |
| `SUCCESSIVE_API_BASE_URL` | WordPress content API address; set explicitly for the intended production source. |
| `SUCCESSIVE_PUBLIC_SITE_URL` | Public website address used for website links. |
| `AI_PROVIDER` | Selects the LLM provider. |
| `AI_MODEL` | Selects the model. |
| `AI_BASE_URL` | Provider API endpoint; needed when overriding the provider's default endpoint. |
| `AI_API_KEY` | Server-side authentication for AI API calls. |
| `ALLOWED_ORIGINS` | Comma-separated website origins allowed to call the chat API. |
| `WIDGET_ALLOWED_ORIGINS` | Additional allowed widget-hosting origins, if needed. |
| `BLOB_READ_WRITE_TOKEN` | Required when retaining Vercel Blob storage. |
| `CRON_SECRET` | Required for authenticated scheduled/manual HTTP refresh calls; configure the same secret in the scheduler. |
| `NEXT_PUBLIC_CHAT_API_URL` | Optional API URL for the Next.js chat UI; defaults to `/api/chat`. The external JavaScript widget uses `data-api-url` instead. |

The screenshot shows `SUCCESSIVE_API_BASE_URL`, `SUCCESSIVE_PUBLIC_SITE_URL`, and `BLOB_READ_WRITE_TOKEN` in both Production and Preview. The AI variables, `CRON_SECRET`, and both origin allowlists are shown for Production only.

Other dashboard entries are `BLOB_WEBHOOK_PUBLIC_KEY`, `BLOB_STORE_ID`, and `NEXT_PUBLIC_APP_NAME` (Production and Preview). No direct use of these was found in the inspected application source or scripts, so they are not listed as required migration variables.

Set the production runtime environment appropriately through `NODE_ENV`. Supply secrets through company secret/environment management. If changing `NEXT_PUBLIC_CHAT_API_URL`, rebuild the application because browser configuration is included at build time.

## 6. Company Server Requirements

- **Runtime:** A Linux application server with Node.js and npm. Match the Vercel Node.js 24.x configuration for migration. The lockfile contains Next.js 16.2.11, whose declared minimum is Node.js 20.9.0.
- **Build and operation:** Install locked dependencies with `npm ci`, build with `npm run build`, and run with `npm start`. Provide a service manager such as systemd or PM2, a stable working directory, and automatic restart after failure or reboot.
- **Network entry point:** Provide a domain/subdomain, DNS, a reverse proxy, and HTTPS/SSL. Proxy both widget assets and API routes, including browser preflight requests. Allow sufficient request time for index refresh; its route declares a 300-second execution limit.
- **Configuration:** Provision the environment variables above and allow the actual WordPress website origins in CORS configuration.
- **Persistent storage:** Provide writable storage for the index and content-cache files, retained across deployments. The current paths are hardcoded under `.next/cache`; preserve/mount those files or change the code to use a dedicated persistent directory. Replacing Blob with another object-storage service requires code and credential changes.
- **Outbound access:** Permit HTTPS and DNS access to the selected WordPress API and LLM endpoint; also permit Vercel Blob access if retained. Build infrastructure needs access to npm dependencies.
- **Refresh automation:** Retain the hourly GitHub workflow with its URL updated, or provide company scheduling for the protected refresh endpoint. Keep `CRON_SECRET` synchronized. The existing `npm run corpus:refresh` command requires Blob and must be adapted before using it for disk-only storage.
- **Operations:** Provide CI/CD or a documented deployment process, application/error logs, restart and rollback procedures, and health monitoring through `/api/health`. If using multiple application processes or servers, account for separate in-memory caches and shared-storage refresh coordination.

## 7. Vercel to Company Server Mapping

| Current Vercel Component | Company Server Replacement |
| --- | --- |
| Vercel Hosting | Company application server |
| Vercel-hosted Next.js Node.js API runtime | Node.js Next.js runtime managed as a service |
| Private Vercel Blob | Persistent company-server storage or approved object storage; Blob may also be retained |
| Vercel Environment Variables | Company secret/environment management |
| Vercel Git deployments (`master` → production) | Company CI/CD or deployment process |
| Vercel Domain/HTTPS | Company domain, reverse proxy and SSL |
| GitHub Actions hourly refresh targeting Vercel | Updated GitHub Actions target or company scheduler |

## 8. Simple Architecture Flow

Target company-server setup:

```text
Successive WordPress Website
|
v
Chatbot Widget (visitor's browser)
|
v
Company Hosted Next.js Chatbot
|
+--> Successive WordPress API
|
+--> LLM Provider
|
+--> Persistent Search Index Storage

Scheduler --> Protected chatbot index-refresh endpoint
```

## 9. Migration Notes

1. Deploy and build the application on the company server with the required environment configuration.
2. Retain Blob or replace it with persistent storage. For disk-only operation, remove the Blob token from the new environment and preserve the local cache paths; adapt storage code if using another object store.
3. Update WordPress widget script/CSS references and `data-api-url` to the company HTTPS address. Update repository examples and the hardcoded URL in `.github/workflows/refresh-search-index.yml`.
4. Run an authenticated refresh and confirm the index is written, reused, and refreshed hourly. Verify persistence across restarts and deployments.
5. Verify outbound WordPress/LLM access, SSL, CORS, `/api/health`, and an end-to-end chat from the WordPress website before switching traffic.

**Inspection basis:** `package.json`, `package-lock.json`, `next.config.ts`, `.env.example`, widget files, `src/lib/env.ts`, `src/lib/cors.ts`, persistence/cache modules, startup instrumentation, API routes, refresh script, and GitHub refresh workflow. Also reviewed: supplied Vercel Git, Build and Deployment, Blob, Deployments, Environment Variables, and GitHub Actions screenshots dated 16 September 2026. Remaining unconfirmed items: environment-variable values (including provider/model selection), exact Blob JSON file/contents, deployed domain settings, and installed WordPress embed. Successful scheduled runs are visible, but continuous hourly execution is not confirmed.
