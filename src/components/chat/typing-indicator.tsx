"use client";

import { useEffect, useState } from "react";

export function TypingIndicator() {
  const [status, setStatus] = useState("Analyzing your request…");

  useEffect(() => {
    const timer = window.setTimeout(
      () => setStatus("Preparing your response…"),
      2200,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="typing" role="status" aria-live="polite">
      <span className="typing-status">{status}</span>
    </div>
  );
}
