# Successive chatbot architecture

## Request flow

```text
Website/widget -> /api/ag-ui -> /api/chat
  -> language preparation and intent detection
  -> all paginated public Successive content collections
  -> normalized full-content search index
  -> ranked content chunks
  -> grounded LLM response
  -> cards, source links and suggestions
```

## Important files

- `src/lib/successive-api.ts`: WordPress v2 pagination and compatibility adapter
- `src/lib/search-index.ts`: recursive content extraction and chunking
- `src/lib/search-retriever.ts`: relevance ranking and search cache
- `src/app/api/chat/route.ts`: grounded chat workflow
- `src/app/api/ag-ui/route.ts`: AG-UI event stream
- `public/successive-chat-widget.js`: external-site widget loader

## Content rules

- Successive WordPress is the only factual knowledge source.
- Load every page of all public content collections; never load users.
- Hydrate industry pages because the REST records expose summaries only.
- Do not invent claims, URLs, customers, metrics, or services.
- Keep the AI key server-only.
- Return an explicit error when WordPress or the AI provider is unavailable.

## Environment

See `.env.example`. Production should keep the Successive API base at
`https://successive.tech/wp-json/wp/v2` and set allowed widget origins to the
actual host domains.
