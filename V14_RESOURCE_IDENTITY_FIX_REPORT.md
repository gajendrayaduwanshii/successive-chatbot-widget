# V14 Resource Identity Fix Report

## Root Cause

Exact named-resource detection happened after ordinary retrieval sufficiency checks. On an exact-title miss, the first semantic result was immediately rendered as a normal card/source, visually blurring the requested item and a related alternative. Affirmative follow-ups also had no bounded representation of the offered alternative.

The public legacy URL `/blog/what-is-an-api/` currently redirects to a different article, and the configured staging API does not contain an exact `what-is-an-api` post. The safe behavior is therefore an explicit miss—not an invented summary.

## Files Changed

- `src/app/api/chat/route.ts`
- `src/lib/conversation-context.ts`
- `src/lib/core.test.ts`
- `V14_RESOURCE_IDENTITY_FIX_REPORT.md`

The existing unrelated modification in `public/external-widget-example.html` was preserved and not edited.

## Exact-Resource Detection

The existing detector now distinguishes named requests from topic/discovery requests using quoted titles, `called`/`named`/`titled`, supported singular resource types, navigation/summarization operations, and exact Successive URLs/slugs. Unquoted `latest`/`recent` requests remain discovery rather than exact lookup.

Supported resource vocabulary now includes blogs, articles, case studies, whitepapers, ebooks, reports, webinars, events, press/media items, products, partner/service/industry pages, guides, and downloadable resources.

## Exact vs Related

Exact identity still requires current normalized title, slug, alias, or the existing high-confidence near-title rule. A related candidate never becomes exact. Related selection uses normalized topic/title/body evidence and rejects generic resource words.

## Title Normalization and Typo Handling

Current V14 normalization preserves case/punctuation/hyphen tolerance. Existing high-coverage near-title matching remains responsible for minor title variation. Generic semantic similarity is not promoted to identity.

## Content-Type Handling

Existing requested-content-type retrieval remains authoritative. A blog cannot silently satisfy a named case-study request. If retrieval finds no reliable candidate, the exact-miss response now runs before the generic type fallback.

## Fallback, Cards, and CTA

An exact miss returns:

> I couldn't find that exact published item in the available Successive content.

When one strong related candidate exists, it is explicitly called a related blog/article/etc. and the assistant asks whether the visitor wants it summarized. Exact-miss responses contain no cards and no sources, so no promotional CTA implies that the requested item was found. Weak related matches are omitted.

## Follow-Up Handling

`Yes`, `yes please`, `go ahead`, and bounded ordinal selections resolve only against links in the immediately preceding assistant offer. The offered content type is preserved, so a related blog remains a blog. A generic `Yes` after an arbitrary historical link does not inherit that link.

## Regression Results

- Exact Flutter blog: exact summary, matching source/card.
- Missing API named blog: explicit exact miss, one related blog offered in text, zero cards/sources.
- `Yes`: summarized the offered related blog with its matching source/card; did not search for `Yes`.
- Missing arbitrary named blog: no weak/random alternative after generic-word filtering.
- Missing named webinar: exact-miss wording, zero cards/sources.
- Latest API blog: continued discovery behavior.
- `Show me API blogs`: continued category discovery behavior.
- Exact Successive URL/slug: exact article summary and matching source/card.
- Topic `What is an API?`: not classified as a named-resource request.

Automated tests, TypeScript, ESLint, production build, and `git diff --check` are recorded in the final handoff.

## Remaining Limitations

- A resource removed from the configured API cannot be summarized as the requested item.
- Legacy public redirects do not establish title identity when the redirect target is a different article.
- Related-alternative selection intentionally prefers omission over weak similarity.
