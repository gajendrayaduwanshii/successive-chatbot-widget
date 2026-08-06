# Successive chatbot architecture

## Request flow

```text
Website/widget -> /api/chat
  -> language preparation and intent detection
  -> all paginated public Successive content collections
  -> normalized full-content search index
  -> ranked content chunks
  -> grounded LLM response
  -> cards, source links and suggestions
```

## Important files

- `src/lib/successive-api.ts`: custom v1 pagination and content adapter
- `src/lib/search-index.ts`: recursive content extraction and chunking
- `src/lib/search-retriever.ts`: relevance ranking and search cache
- `src/app/api/chat/route.ts`: grounded chat workflow
- `public/successive-chat-widget.js`: external-site widget loader

## Content rules

- Successive WordPress is the only factual knowledge source.
- Load every page of all public content collections; never load users.
- Index complete editor and recursive ACF content from custom v1.
- Do not invent claims, URLs, customers, metrics, or services.
- Keep the AI key server-only.
- Return an explicit error when WordPress or the AI provider is unavailable.

## Environment

See `.env.example`. Production should keep the Successive API base at
`https://successive.tech/wp-json/successive-digital/v1` and set allowed widget
origins to the actual host domains.
