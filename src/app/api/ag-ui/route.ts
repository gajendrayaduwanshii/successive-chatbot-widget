import { EventType, RunAgentInputSchema, type BaseEvent } from "@ag-ui/core";
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { SUCCESSIVE_RESPONSE_EVENT } from "@/lib/ag-ui";
import { normalizeAssistantResponse } from "@/lib/llm/schemas";
import { POST as chatPost } from "@/app/api/chat/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function jsonError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string>,
) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers },
  );
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);
  const isSameOrigin = origin === new URL(request.url).origin;
  if (!cors.isAllowed && !isSameOrigin) {
    return jsonError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed.",
      cors.headers,
    );
  }
  return new NextResponse(null, { status: 204, headers: cors.headers });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);
  const isSameOrigin = origin === new URL(request.url).origin;
  if (!cors.isAllowed && !isSameOrigin) {
    return jsonError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed.",
      cors.headers,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      400,
      "INVALID_AG_UI_REQUEST",
      "Please send a valid AG-UI JSON request.",
      cors.headers,
    );
  }

  const parsed = RunAgentInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      400,
      "INVALID_AG_UI_REQUEST",
      parsed.error.issues[0]?.message ?? "Invalid AG-UI request.",
      cors.headers,
    );
  }

  const conversation = parsed.data.messages
    .filter(
      (
        message,
      ): message is typeof message & {
        role: "user" | "assistant";
        content: string;
      } =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .slice(-11);
  const latestUserIndex = conversation.findLastIndex(
    (message) => message.role === "user",
  );
  const latestUser = conversation[latestUserIndex];
  if (!latestUser) {
    return jsonError(
      400,
      "INVALID_AG_UI_REQUEST",
      "The AG-UI request must include a user message.",
      cors.headers,
    );
  }

  const chatRequest = new NextRequest(new URL("/api/chat", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.headers.get("origin")
        ? { Origin: request.headers.get("origin")! }
        : {}),
      ...(request.headers.get("x-forwarded-for")
        ? { "x-forwarded-for": request.headers.get("x-forwarded-for")! }
        : {}),
      ...(request.headers.get("x-real-ip")
        ? { "x-real-ip": request.headers.get("x-real-ip")! }
        : {}),
    },
    body: JSON.stringify({
      message: latestUser.content,
      history: conversation
        .slice(0, latestUserIndex)
        .slice(-10)
        .map(({ role, content }) => ({ role, content })),
      sessionId: parsed.data.threadId,
    }),
  });
  const chatResponse = await chatPost(chatRequest);
  let chatPayload: unknown = await chatResponse.json();

  if (!chatResponse.ok) {
    const errorPayload =
      typeof chatPayload === "object" &&
      chatPayload !== null &&
      "error" in chatPayload &&
      typeof chatPayload.error === "object" &&
      chatPayload.error !== null
        ? chatPayload.error
        : undefined;
    const message =
      errorPayload &&
      "message" in errorPayload &&
      typeof errorPayload.message === "string"
        ? errorPayload.message
        : "The chat service is currently unavailable. Please check your connection and try again.";
    chatPayload = {
      data: {
        answer: message,
        cards: [],
        sources: [],
        suggestions: [],
        confidence: "low",
        insufficientContext: true,
      },
    };
  }

  const responseResult = normalizeAssistantResponse(
    typeof chatPayload === "object" &&
      chatPayload !== null &&
      "data" in chatPayload
      ? chatPayload.data
      : undefined,
  );
  if (!responseResult.success) {
    return jsonError(
      503,
      "INVALID_AGENT_RESPONSE",
      "The AG-UI response could not be safely validated.",
      cors.headers,
    );
  }

  const messageId = crypto.randomUUID();
  const toolCallId = crypto.randomUUID();
  const cardTypes = new Set(responseResult.data.cards.map((card) => card.type));
  const layout =
    responseResult.data.cards.length === 0
      ? "conversation"
      : responseResult.data.cards.length === 1
        ? "spotlight"
        : cardTypes.size === 1 && cardTypes.has("product")
          ? "products"
          : cardTypes.size === 1 && cardTypes.has("case-study")
            ? "stories"
            : cardTypes.size === 1 && cardTypes.has("blog")
              ? "editorial"
              : "discovery";
  const hasGeneratedUi =
    responseResult.data.cards.length > 0 ||
    responseResult.data.suggestions.length > 0;
  const events: BaseEvent[] = [
    {
      type: EventType.RUN_STARTED,
      threadId: parsed.data.threadId,
      runId: parsed.data.runId,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: responseResult.data.answer,
    },
    {
      type: EventType.CUSTOM,
      name: SUCCESSIVE_RESPONSE_EVENT,
      value: responseResult.data,
    },
    { type: EventType.TEXT_MESSAGE_END, messageId },
    ...(hasGeneratedUi
      ? [
          {
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: "show_successive_response",
            parentMessageId: messageId,
          },
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId,
            delta: JSON.stringify({
              query: latestUser.content,
              layout,
              cards: responseResult.data.cards,
              suggestions: responseResult.data.suggestions,
            }),
          },
          { type: EventType.TOOL_CALL_END, toolCallId },
          {
            type: EventType.TOOL_CALL_RESULT,
            messageId: crypto.randomUUID(),
            toolCallId,
            content: "Rendered the query-specific Successive interface.",
            role: "tool" as const,
          },
        ]
      : []),
    {
      type: EventType.RUN_FINISHED,
      threadId: parsed.data.threadId,
      runId: parsed.data.runId,
      result: { messageId },
    },
  ];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      ...cors.headers,
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
