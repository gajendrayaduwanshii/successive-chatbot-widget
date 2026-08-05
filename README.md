# Successive AI Chatbot

Standalone Next.js chatbot and embeddable widget grounded in Successive
Digital's public WordPress content. This is a separate project; the sibling
Kagen chatbot is not modified.

## Data sources

The server reads every paginated record from the public WordPress v2 content
collections, including:

- `https://successive.tech/wp-json/wp/v2/posts`
- `https://successive.tech/wp-json/wp/v2/pages`
- `accelerators`, `award`, `careers`, `case_study`, `employee-perspective`
- `industries`, `media-coverage`, `partners`, `press-release`
- `thought-leadership`

Posts and pages are requested with `_embed=1`, so featured media and author
details are available to the content normalizer without calling the users
endpoint. Industry REST records contain only summaries, so their seven public
pages are additionally hydrated from the rendered `<main>` content. The derived
search index is cached for five minutes.

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
