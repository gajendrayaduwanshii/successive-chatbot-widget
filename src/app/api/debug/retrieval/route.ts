import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cardEligibility, getIndexDiagnostics, retrieveFromIndex } from "@/lib/search-retriever";
import { getContentLoadDiagnostics } from "@/lib/successive-api";
import { detectIntent } from "@/lib/intent-detector";
import { getEnv } from "@/lib/env";
import { getLLMProvider } from "@/lib/llm";
import { buildDeterministicUnderstanding } from "@/lib/query-understanding";
import { validateEvidence } from "@/lib/evidence-validation";

export const dynamic = "force-dynamic";
const schema = z.object({
  query: z.string().trim().min(2).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json(
      { success: false, error: "Debug endpoint is disabled in production." },
      { status: 404 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { success: false, error: "Invalid query." },
      { status: 400 },
    );
  try {
    let understanding = buildDeterministicUnderstanding(parsed.data.query);
    if (getEnv().AI_API_KEY) {
      try {
        understanding = await getLLMProvider().understandQuery(
          parsed.data.query,
          parsed.data.history,
        );
      } catch {
        // Keep deterministic diagnostics available during provider failures.
      }
    }
    const legacyIntent = detectIntent(parsed.data.query);
    const result = await retrieveFromIndex(
      parsed.data.query,
      legacyIntent,
      parsed.data.query,
      new Set<string>(),
      understanding,
    );
    const selectedIds = new Set(
      result.matches.map(({ document }) => `${document.type}:${document.id}`),
    );
    const evidenceValidation = validateEvidence({
      message: parsed.data.query,
      understanding,
      matches: result.matches,
      hasConversationSubject: parsed.data.history.some((item) => item.role === "user"),
    });
    return NextResponse.json({
      originalQuery: parsed.data.query,
      normalizedQuery: result.normalizedQuery,
      legacyIntent,
      understanding,
      indexedDocuments: result.indexedDocuments,
      operations: {
        wordpress: getContentLoadDiagnostics(),
        index: getIndexDiagnostics(),
      },
      reliableMatchFound: result.reliableMatchFound,
      evidenceValidation: {
        status: evidenceValidation.status,
        confidence: evidenceValidation.confidence,
        requestedAttribute: evidenceValidation.requestedAttribute,
        subject: evidenceValidation.subject,
        reason: evidenceValidation.reason,
        accepted: evidenceValidation.accepted.map(({ document }) => ({
          title: document.title,
          url: document.url,
        })),
        rejected: evidenceValidation.rejected,
      },
      confidence:
        (result.matches[0]?.score ?? 0) >= 140
          ? "high"
          : result.reliableMatchFound
            ? "medium"
            : "low",
      candidates: (result.candidates ?? result.matches).map((match) => ({
        title: match.document.title,
        slug: match.document.slug,
        type: match.document.type,
        role: match.document.role,
        serviceType: match.document.service_type,
        primaryTopics: match.document.topicProfile.primaryTopics,
        secondaryTopics: match.document.topicProfile.secondaryTopics,
        score: match.score,
        confidence: match.confidence,
        scoreBreakdown: match.scoreBreakdown,
        matchedFields: match.matchedFields,
        selected: selectedIds.has(`${match.document.type}:${match.document.id}`),
        rejectionReason: match.rejectionReason,
      })),
      finalContext: result.matches.map((match) => ({
        title: match.document.title,
        url: match.document.url,
        passages: match.selectedPassages,
      })),
      finalCards: result.matches
        .filter((match) => cardEligibility(match, understanding, result.matches[0]?.score ?? 0).accepted)
        .slice(0, 3)
        .map((match) => ({
          title: match.document.title,
          url: match.document.url,
        })),
      cardAudit: (result.candidates ?? result.matches).map((match) => {
        const selected = selectedIds.has(`${match.document.type}:${match.document.id}`);
        const eligibility = cardEligibility(match, understanding, result.matches[0]?.score ?? 0);
        return {
          title: match.document.title,
          role: match.document.role,
          topicScore: match.scoreBreakdown?.topic ?? 0,
          problemScore: match.scoreBreakdown?.problem ?? 0,
          outcomeScore: match.scoreBreakdown?.outcome ?? 0,
          industryScore: match.scoreBreakdown?.industry ?? 0,
          entityScore: match.scoreBreakdown?.entity ?? 0,
          typeScore: match.scoreBreakdown?.contentType ?? 0,
          authority: match.scoreBreakdown?.authorityCoverage ?? 0,
          bridgeScore: match.scoreBreakdown?.bridge ?? 0,
          constraintsSatisfied: match.scoreBreakdown?.constraintsSatisfied ?? 0,
          constraintsTotal: match.scoreBreakdown?.constraintsTotal ?? 0,
          contradictions: match.scoreBreakdown?.contradictions ?? 0,
          finalConfidence: match.confidence ?? "low",
          accepted: selected && eligibility.accepted,
          rejectionReason: !selected
            ? match.rejectionReason ?? "not selected for LLM context"
            : !eligibility.accepted
              ? eligibility.reason
              : undefined,
        };
      }),
      matches: result.matches.map((match) => ({
        title: match.document.title,
        slug: match.document.slug,
        type: match.document.type,
        serviceType: match.document.service_type,
        score: match.score,
        matchedFields: match.matchedFields,
        contentQuality: match.document.contentQuality,
        capabilityProfile: match.document.capabilityProfile,
        selectedPassages: match.selectedPassages,
        officialUrl: match.document.url,
      })),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "WordPress content is unavailable." },
      { status: 503 },
    );
  }
}
