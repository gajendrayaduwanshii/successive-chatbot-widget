# Successive Complete Content API Audit

The chatbot uses only Successive's custom complete-content namespace:

```text
https://successive.tech/wp-json/successive-digital/v1
```

Environment-specific alternatives are kept in `.env` and `.env.example`.

## Routes

```text
GET /content?type=page&per_page=100&page=1
GET /content?type=post&per_page=100&page=1
GET /content?type={custom-post-type}&per_page=100&page=1
GET /pages/{slug}
GET /post-types
```

Collection pagination follows the response headers `X-WP-Total` and
`X-WP-TotalPages`. The adapter fetches every page and caches the derived search
index for five minutes.

## Content coverage

The custom API returns editor fields and complete recursive ACF data. Nested
headings, descriptions, repeaters, FAQs, links and image metadata are normalized
and chunked directly. The chatbot does not scrape public page HTML.

The service dropdown is exposed as `acf.service_type`. Current stored values are
`Sub-service`, `Expertise`, and `Piller`; visitor-facing queries normalize these
to service, expertise, and pillar.

## Retrieval flow

1. Fetch all configured custom v1 collections with pagination.
2. Recursively extract editor and ACF text.
3. Preserve paragraph boundaries and build overlapping bounded chunks.
4. Apply intent and service-type filters before ranking.
5. Rank globally and send the top five grounded chunks to the AI provider.
6. Return up to three source-backed story cards for service-category queries.
7. Return a grounded fallback when no reliable source matches.
