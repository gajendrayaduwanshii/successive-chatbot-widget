import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { retrieveFromIndex } from "@/lib/search-retriever";

export const dynamic = "force-dynamic";
const schema = z.object({ query: z.string().trim().min(2).max(1000) });

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
    const result = await retrieveFromIndex(parsed.data.query);
    return NextResponse.json({
      normalizedQuery: result.normalizedQuery,
      indexedDocuments: result.indexedDocuments,
      reliableMatchFound: result.reliableMatchFound,
      matches: result.matches.map((match) => ({
        title: match.document.title,
        slug: match.document.slug,
        type: match.document.type,
        score: match.score,
        matchedFields: match.matchedFields,
        contentQuality: match.document.contentQuality,
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
