import { Bot } from "lucide-react";
import Link from "next/link";
import { ChatWindow } from "@/components/chat/chat-window";
export default function Home() {
  return (
    <main className="app-shell">
      <header className="brand-bar">
        <Link href="/" className="brand" aria-label="Successive AI home">
          <span className="brand-mark">S</span>
          <span>SUCCESSIVE</span>
        </Link>
        <Link href="/widget-preview" className="preview-link">
          Widget preview
        </Link>
      </header>
      <section className="hero">
        <div className="eyebrow">
          <Bot size={15} /> AI-powered website assistant
        </div>
        <h1>How can we help you explore Successive?</h1>
        <p>
          Ask about Successive services, case studies, insights, company
          information, careers, or getting in touch.
        </p>
      </section>
      <ChatWindow />
      <footer className="footer">
        Answers are grounded in content from the official Successive website. AI
        can make mistakes.
      </footer>
    </main>
  );
}
