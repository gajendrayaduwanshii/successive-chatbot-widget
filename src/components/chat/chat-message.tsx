"use client";
import { ArrowRight, Bot, ExternalLink, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as Message } from "@/types/chat";
import { ResultCard } from "./result-card";
export function ChatMessage({
  message,
  onSuggestion,
  onRetry,
  animate = false,
  onAnimationProgress,
  onAnimationComplete,
}: {
  message: Message;
  onSuggestion: (value: string) => void;
  onRetry: (value: string) => void;
  animate?: boolean;
  onAnimationProgress?: () => void;
  onAnimationComplete?: () => void;
}) {
  const assistant = message.role === "assistant";
  const answer = message.response?.answer ?? message.content;
  const [visibleAnswer, setVisibleAnswer] = useState(animate ? "" : answer);

  useEffect(() => {
    if (!assistant || !animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const reducedMotionTimer = window.setTimeout(() => {
        setVisibleAnswer(answer);
        onAnimationComplete?.();
      }, 0);
      return () => window.clearTimeout(reducedMotionTimer);
    }

    let index = 0;
    const charactersPerTick = Math.max(1, Math.ceil(answer.length / 140));
    const timer = window.setInterval(() => {
      index = Math.min(index + charactersPerTick, answer.length);
      setVisibleAnswer(answer.slice(0, index));
      onAnimationProgress?.();
      if (index === answer.length) {
        window.clearInterval(timer);
        onAnimationComplete?.();
      }
    }, 22);
    return () => window.clearInterval(timer);
  }, [animate, answer, assistant, onAnimationComplete, onAnimationProgress]);

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
              {visibleAnswer}
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
        {!animate && message.response?.cards.length ? (
          <div className="card-grid">
            {message.response.cards.map((card) => (
              <ResultCard key={`${card.type}:${card.url}`} card={card} />
            ))}
          </div>
        ) : null}
        {!animate && message.response?.sources.length ? (
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
        {!animate && message.response?.suggestions.length ? (
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
