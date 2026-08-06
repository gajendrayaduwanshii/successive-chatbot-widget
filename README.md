# Successive AI Chatbot

Standalone Next.js chatbot and embeddable widget grounded in Successive
Digital's public WordPress content. This is a separate project; the sibling
Kagen chatbot is not modified.

See [Successive Content API Audit](docs/SUCCESSIVE_CONTENT_API_AUDIT.md) for
the live page-wise and post-wise API coverage and pagination behavior.

## Data sources

The server reads every paginated record from Successive's complete custom v1
content API:

- `https://successive.tech/wp-json/successive-digital/v1/content?type=post`
- `https://successive.tech/wp-json/successive-digital/v1/content?type=page`
- `https://successive.tech/wp-json/successive-digital/v1/pages/{slug}`
- `accelerators`, `award`, `careers`, `case_study`, `employee-perspective`
- `industries`, `media-coverage`, `partners`, `press-release`
- `thought-leadership`

The custom endpoint returns complete recursive ACF payloads. The chatbot indexes
editor content and nested ACF fields directly without calling the standard
WordPress API or scraping rendered HTML. The derived search index is cached for
five minutes.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Add a server-side `AI_API_KEY` to `.env`. The default provider settings target
NVIDIA NIM but any OpenAI-compatible endpoint can be configured.

Local routes:

- App: `http://localhost:3000`
- Widget preview: `http://localhost:3000/widget-preview`
- Static widget test: `http://localhost:3000/widget-test.html`
- Health: `http://localhost:3000/api/health`
- Chat: `POST http://localhost:3000/api/chat`

## Embed

```html
<script
  src="https://YOUR-DEPLOYMENT/successive-chat-widget.js"
  data-title="Ask Successive AI"
  data-button-label="Chat with Successive"
></script>
```

## Verification

```bash
npm run format
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Never commit `.env` or expose `AI_API_KEY` through a `NEXT_PUBLIC_*` variable.
