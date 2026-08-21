# Suggestion Action Contract Fix Report

> Date: 21 August 2026  
> Principle: a visible quick action must have a structured, evidence-backed execution path.

## Root Cause

Suggestions were transported only as display strings. Clicking a button submitted its label as a new standalone message, so conversation context and intended content type could be lost. Labels could be conversationally attractive without any guarantee that retrieval could fulfill them.

## Architecture

Responses can now include backward-compatible `suggestionActions` containing an action ID, display label, structured intent, content type, and source context. The React UI renders only these structured actions; legacy label-only suggestions are not displayed. Clicking an action sends its structured payload with the visible label, and the server resolves the payload before ordinary query parsing.

This creates the contract:

`available evidence → validated action → visible label → structured click payload → deterministic route → evidence-backed response`.

## Pre-validation and Availability

Client overview actions are derived from the current indexed corpus. Published-customer-work is offered only when eligible case-study or directly related customer-story content exists. Customer-case-study discovery is offered only when the case-study collection contains published items. No current-client-status action is emitted because the homepage trusted-logo collection does not establish active status.

The availability check uses indexed roles and relationship-bearing identity metadata; it does not run answer generation. Vector or lexical similarity alone cannot create an action.

## Click Execution

`CUSTOMER_WORK_DISCOVERY` carries `customer-work` or `case-study` content type. The server executes that payload through the public customer-work collection route instead of searching the label text. Case-study actions return case-study cards. Broader customer-work actions return the strongest eligible public customer evidence.

Second-turn responses currently emit no further structured actions unless another action has an independently implemented and validated contract. This safely ends the chain instead of presenting a speculative third turn.

## Generic Display Safety

The structured-action boundary applies to every chatbot response in the React UI. Categories that still return legacy label-only suggestions display zero quick actions. This intentionally favors fewer correct actions over broken buttons while additional categories are migrated to structured actions.

## Client Flow Before and After

Before: `client → Show published customer work → generic fallback`.

After: `client → structured CUSTOMER_WORK_DISCOVERY action → published customer-work cards and sources`.

The unsupported `Which ones are current?` button is no longer displayed.

## Contract Test Results

A 15-category first-turn contract run covered client/customer, services, technologies, products, partners, industries, case studies, blogs, news, locations, company facts, Kagen, AI, cloud, and security. Only two actions were eligible for display under the structured-action requirement; all label-only suggestions were suppressed.

The initial run caught one resolver mismatch for the broad published-work action. After binding both customer-work content types to the structured customer-work route, the exact client regression was rerun from fresh state:

- visible structured actions: **2**
- independently clicked actions: **2**
- fulfilled actions: **2 PASS / 0 FAIL**
- label-only suggestions rendered: **0**
- customer case-study action returned case-study cards: **PASS**
- published customer-work action returned public customer-work cards: **PASS**
- unsupported current-client suggestion displayed: **NO**

## Files Changed

- `src/lib/llm/schemas.ts`
- `src/lib/structured-knowledge.ts`
- `src/app/api/chat/route.ts`
- `src/components/chat/chat-window.tsx`
- `src/components/chat/chat-message.tsx`
- `src/lib/structured-knowledge.test.ts`
- `scripts/suggestion-action-contract-test.mjs`

## Remaining Limitations

- Existing non-client label-only suggestions are hidden until their categories receive structured availability checks and action executors.
- Older external clients that ignore `suggestionActions` may still render the legacy `suggestions` array; the bundled React/iframe UI enforces the new contract.
- Structured action payloads are validated but not cryptographically signed; they are treated as navigation intent, never as factual evidence or authorization.
