# Client / Customer Intent Fix Report

> Date: 21 August 2026  
> Source: existing Successive WordPress custom API and canonical homepage `/`; no page scraping or static organization list.

## Actual Homepage API Structure

The current page collection contains a CMS page record whose public `link` is `https://successive.tech/`. Its ACF payload exposes the trusted collection through the stable `trusted_logos` repeater. Each row contains structured logo media and may contain an explicit `alt_text`; the media object contains `alt`, `caption`, and `title` metadata. The implementation identifies the homepage by canonical root URL `/`, not by its internal CMS slug.

## Structure-First Detection

The extractor prioritizes a stable customer/trusted logo ACF collection on the canonical homepage. It excludes keys representing partner, certification, award, technology, and social collections. If the stable field is unavailable, fallback detection requires multiple signals together: canonical homepage context, customer/trust semantics, a logo-like collection key, and at least three meaningful structured labels.

Marketing heading text is not required. Heading text is used only by the fallback classifier, so changing it while retaining the structured repeater does not affect extraction.

## Dynamic Extraction and Cleanup

Organization labels are selected in priority order from explicit organization/company/brand labels, row alt text, and accessible logo metadata. URLs, paths, filenames, extensions, media IDs, generic `logo`/`image`/`asset` labels, empty values, and placeholders are rejected. Names are deduplicated by normalized identity while preserving the first displayed spelling and homepage order.

No current organization name, logo filename, marketing heading, or client array is stored in application code. Normal corpus refresh therefore updates the response when homepage content changes.

## Intent and Relationship Rules

- Bare `client`, `clients`, `customer`, and `customers` prompts use the dynamic homepage overview instead of generic keyword retrieval.
- Current/active wording reports only that the website currently showcases the organizations; it does not claim active-client status.
- Total-client questions use an authoritative published company count when present and explicitly distinguish it from the trusted-logo count.
- Confidential, NDA, and unannounced-client requests return a clean abstention with no cards or sources.
- Explicit case-study, blog, press/news, industry, and capability requests retain their typed retrieval paths.
- Customer/client terminology inside customer-experience services, support automation, customer-data platforms, client-side code, client-server architecture, and multi-client delivery is not treated as a client-list intent.

## Client, Case Study, and Partner Distinction

A trusted logo proves only `PUBLICLY_SHOWCASED_ORGANIZATION`. It does not prove current active-client status, a project, service usage, or formal partnership.

Specific dynamic organization queries check homepage presence, customer-work evidence, and partner evidence independently. Case-study authority requires the organization in the case-study identity or an explicit client/customer structured field. Editorial/press evidence requires a direct Successive-to-organization client or collaboration relation; incidental mentions are rejected. Partner results come only from partner authority and are labeled separately.

## Cross-Category and Retrieval Safety

Related evidence may come from case studies, blogs/editorial, press, resources, products, or partner content, but category alone is insufficient. Relation validation happens after candidates are available, so lexical, vector, and hybrid similarity cannot turn a generic mention into customer evidence. Generic overviews show no random cards; specific queries show at most three validated relationship cards.

## Automated Tests

Fixtures verify:

- heading changes do not affect the stable structured repeater;
- A/B/C changing to A/C/D changes output without code changes;
- duplicate marquee entries are deduplicated;
- empty, generic, filename-like, and asset labels are rejected;
- partner, certification, and technology logo collections are excluded;
- only the canonical `/` homepage is eligible;
- overview/current grammar and client-keyword collision handling.

## Live Query Validation

The live runner obtains organization names from the current homepage API at runtime and tests the first, middle, and last entries without hardcoding them. The matrix contains 36 turns covering overview, current status, count, public work, case studies, blogs, announcements, industry/capability questions, confidential requests, terminology collisions, and dynamic organization client/partner/work relations.

The initial relation pass exposed incidental editorial matches for a short organization label and a technology-oriented organization. Relation validation was tightened, and focused live reruns confirmed that incidental articles no longer appear as customer-work cards while directly supported case-study evidence can still be presented.

## Dynamic Introduction and Anti-Repetition

Normal overview introductions are synthesized from a constrained homepage evidence context and the exact visitor question. The server retains control of the organization list and canonical homepage source. Generated introductions that duplicate the list or imply unsupported client, project, contract, collaboration, or partnership relationships are rejected. When generation is unavailable, a concise query-sensitive evidence fallback is composed instead of reusing one fixed 3–4 sentence paragraph.

The required five-prompt live anti-repetition run produced **5 unique answers from 5 turns**, all HTTP 200, all grounded to `https://successive.tech/` as the primary source, and zero unsupported active-client claims.

## Remaining Limitations

- Some homepage labels preserve source casing and spacing exactly; CMS editors remain responsible for the preferred public display name.
- Public logo presence cannot establish contract status or recency without a separate explicit source.
- Many published case studies intentionally anonymize customers, so they cannot always be linked to a trusted-logo organization.
- The fallback structural detector is deliberately conservative and returns no list when component identity and semantic/collection signals are insufficient.
