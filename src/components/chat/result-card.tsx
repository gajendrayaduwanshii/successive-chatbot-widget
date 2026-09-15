"use client";
import { ExternalLink } from "lucide-react";
import type { AssistantResponse } from "@/lib/llm/schemas";
export function ResultCard({
  card,
}: {
  card: AssistantResponse["cards"][number];
}) {
  return (
    <article className="result-card">
      {/* URLs are dynamic WordPress assets; native lazy loading avoids a brittle hostname allowlist. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {card.image && <img src={card.image} alt="" loading="lazy" />}
      <div className="result-content">
        <span className="badge">
          {card.service_type || card.badge || card.type.replace("-", " ")}
        </span>
        <h3>{card.title}</h3>
        <p>{card.description}</p>
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("successive-chat:link-clicked", {
                detail: { cardType: card.type },
              }),
            )
          }
        >
          Learn more <ExternalLink size={14} />
        </a>
      </div>
    </article>
  );
}
