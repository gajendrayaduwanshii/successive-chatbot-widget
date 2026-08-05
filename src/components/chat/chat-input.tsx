"use client";
import { Send } from "lucide-react";
import { useState } from "react";
export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (value: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const text = value.trim();
    if (text.length >= 2 && !disabled) {
      onSend(text);
      setValue("");
    }
  };
  return (
    <div className="input-area">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={1000}
        rows={1}
        placeholder="Ask Successive anything…"
        aria-label="Message Successive assistant"
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        className="send"
        onClick={submit}
        disabled={disabled || value.trim().length < 2}
        aria-label="Send message"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
