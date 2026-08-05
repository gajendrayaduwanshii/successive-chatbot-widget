"use client";
import { RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantResponse } from "@/lib/llm/schemas";
import type { ChatMessage, HistoryMessage } from "@/types/chat";
import { ChatInput } from "./chat-input";
import { ChatMessage as Message } from "./chat-message";
import { TypingIndicator } from "./typing-indicator";

const defaultWelcome =
  "Hello! I’m the Successive AI Assistant. I can help you explore Successive’s products, customer stories, resources, events, and more. What would you like to know?";
const storageKey = "successive-chat:conversation:v1";

interface ChatWindowProps {
  widget?: boolean;
  embedded?: boolean;
  title?: string;
  welcomeMessage?: string;
  primaryColor?: string;
  apiUrl?: string;
  logoUrl?: string;
  parentOrigin?: string;
}
const emit = (name: string, detail: Record<string, unknown> = {}) => {
  window.dispatchEvent(new CustomEvent(`successive-chat:${name}`, { detail }));
};
export function ChatWindow({
  widget = false,
  embedded = false,
  title = "Successive Assistant",
  welcomeMessage = defaultWelcome,
  primaryColor,
  apiUrl,
  logoUrl,
  parentOrigin,
}: ChatWindowProps) {
  const welcome: ChatMessage = {
    id: "welcome",
    role: "assistant",
    content: welcomeMessage,
  };
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [loading, setLoading] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const sessionId = useRef("");
  const postParent = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      if (!embedded) return;
      try {
        const parsedReferrerOrigin = document.referrer
          ? new URL(document.referrer).origin
          : undefined;
        const referrerOrigin =
          parsedReferrerOrigin === "null" ? "*" : parsedReferrerOrigin;
        const trustedParentOrigin = referrerOrigin || parentOrigin;
        if (!trustedParentOrigin || window.parent === window) return;
        window.parent.postMessage(
          {
            namespace: "successive-chat",
            type,
            ...(payload ? { payload } : {}),
          },
          trustedParentOrigin,
        );
      } catch {
        /* no trusted parent referrer */
      }
    },
    [embedded, parentOrigin],
  );
  useEffect(() => {
    try {
      sessionId.current =
        sessionStorage.getItem("successive-chat:session:v1") ||
        crypto.randomUUID();
      sessionStorage.setItem("successive-chat:session:v1", sessionId.current);
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      sessionId.current = crypto.randomUUID();
    }
    postParent("SUCCESSIVE_CHAT_READY");
  }, [postParent]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* storage may be blocked */
    }
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);
  const send = useCallback(
    async (text: string) => {
      if (loading) return;
      const user: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };
      const history: HistoryMessage[] = messages
        .filter((m) => m.id !== "welcome")
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.response?.answer ?? m.content,
        }));
      setMessages((current) => [...current, user]);
      setLoading(true);
      emit("message-submitted", {
        messageLengthCategory:
          text.length < 80 ? "short" : text.length < 300 ? "medium" : "long",
      });
      const startedAt = performance.now();
      try {
        const response = await fetch(
          apiUrl || process.env.NEXT_PUBLIC_CHAT_API_URL || "/api/chat",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: text,
              history,
              sessionId: sessionId.current,
            }),
          },
        );
        const json: unknown = await response.json();
        if (
          !response.ok ||
          typeof json !== "object" ||
          json === null ||
          !("data" in json)
        ) {
          const msg =
            typeof json === "object" && json && "error" in json
              ? (json as { error?: { message?: string } }).error?.message
              : undefined;
          throw new Error(msg || "I couldn’t complete that request.");
        }
        const data = (json as { data: AssistantResponse }).data;
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.answer,
            response: data,
          },
        ]);
        const duration = performance.now() - startedAt;
        emit("response-received", {
          durationCategory:
            duration < 2000 ? "fast" : duration < 6000 ? "normal" : "slow",
          hasCards: data.cards.length > 0,
        });
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : "Something went wrong. Please try again.",
            failedPrompt: text,
          },
        ]);
        emit("api-error");
        postParent("SUCCESSIVE_CHAT_ERROR", { message: "Chat request failed" });
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, loading, messages, postParent],
  );
  const clear = () => {
    setMessages([welcome]);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* storage may be blocked */
    }
  };
  const closeEmbed = () => postParent("SUCCESSIVE_CHAT_CLOSE");
  return (
    <section
      className={`chat-panel ${widget ? "widget-chat" : ""} ${embedded ? "embed-chat" : ""}`}
      aria-label="Successive AI chat"
      style={
        primaryColor
          ? ({ "--brand": primaryColor } as React.CSSProperties)
          : undefined
      }
    >
      <div className="chat-header">
        <div>
          {logoUrl ? (
            <>
              {/* Dynamic HTTPS widget branding cannot use a fixed Next Image hostname allowlist. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="chat-logo" src={logoUrl} alt="" />
            </>
          ) : (
            <span className="online" />
          )}
          {title}
        </div>
        <div className="chat-actions">
          <button
            type="button"
            onClick={clear}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <Trash2 size={16} />
            <span>Clear</span>
          </button>
          {embedded && (
            <button
              type="button"
              onClick={closeEmbed}
              aria-label="Close chat"
              title="Close chat"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="conversation" aria-live="polite">
        <p className="chat-disclaimer">
          Successive AI answers from published Successive content. Please verify
          important information using the linked sources.
        </p>
        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            onSuggestion={send}
            onRetry={send}
          />
        ))}
        {loading && (
          <div className="message-row assistant">
            <div className="avatar">
              <Sparkles size={16} />
            </div>
            <TypingIndicator />
          </div>
        )}
        <div ref={end} />
      </div>
      <ChatInput onSend={send} disabled={loading} />
      {loading && (
        <button className="sr-only" aria-label="Request in progress">
          <RotateCcw />
        </button>
      )}
    </section>
  );
}
