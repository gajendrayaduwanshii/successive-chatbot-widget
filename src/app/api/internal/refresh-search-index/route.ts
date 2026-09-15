import { NextRequest, NextResponse } from "next/server";
import { refreshSuggestionCorpus } from "@/lib/suggestion-corpus";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Rebuilds the shared search index. Only the scheduled workflow may call it. */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  try {
    const documents = await refreshSuggestionCorpus();
    return NextResponse.json({
      success: true,
      documents: documents.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("search_index_refresh_failed", error);
    return NextResponse.json(
      { success: false, error: "Search-index refresh failed." },
      { status: 500 },
    );
  }
}
