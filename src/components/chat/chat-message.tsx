"use client";
import { ArrowRight, Bot, ExternalLink, UserRound } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as Message } from "@/types/chat";
export function ChatMessage({
  message,
  onSuggestion,
  onRetry,
}: {
  message: Message;
  onSuggestion: (value: string) => void;
  onRetry: (value: string) => void;
}) {
  const assistant = message.role === "assistant";
  return (
    <div className={`message-row ${assistant ? "assistant" : "user"}`}>
      <div className="avatar" aria-hidden>
        {assistant ? <Bot size={17} /> : <UserRound size={17} />}
      </div>
      <div className="message-wrap">
        {assistant && (
          <div className="message-author">Successive Assistant</div>
        )}
        <div className="bubble">
          {assistant ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.response?.answer ?? message.content}
            </ReactMarkdown>
          ) : (
            message.content
          )}
          {message.failedPrompt && (
            <button
              className="retry"
              onClick={() => onRetry(message.failedPrompt!)}
            >
              Try again
            </button>
          )}
        </div>
        {message.response?.sources.length ? (
          <details className="sources">
            <summary>Sources ({message.response.sources.length})</summary>
            <div>
              {message.response.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("successive-chat:link-clicked", {
                        detail: { cardType: "source" },
                      }),
                    )
                  }
                >
                  {source.title}
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </details>
        ) : null}
        {message.response?.suggestions.length ? (
          <div className="suggestions">
            {message.response.suggestions.map((s) => (
              <button key={s} onClick={() => onSuggestion(s)}>
                <span>{s}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
