"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type Position = "bottom-right" | "bottom-left";
const subscribeToOrigin = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

export default function WidgetPreview() {
  const deployment = useSyncExternalStore(
    subscribeToOrigin,
    getOrigin,
    getServerOrigin,
  );
  const [color, setColor] = useState("#0063ce");
  const [position, setPosition] = useState<Position>("bottom-right");
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(650);
  const [openDefault, setOpenDefault] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [promptInputId, setPromptInputId] = useState("ai-search");
  const [promptButtonId, setPromptButtonId] = useState("ai-search-button");
  const [open, setOpen] = useState(openDefault);
  const [copied, setCopied] = useState(false);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === previewFrame.current?.contentWindow &&
        event.data?.namespace === "successive-chat" &&
        event.data?.type === "SUCCESSIVE_CHAT_CLOSE"
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const query = useMemo(
    () =>
      new URLSearchParams({
        title: "Ask Successive AI",
        welcomeMessage: "Hi! How can I help you explore Successive?",
        primaryColor: color,
        position,
        ...(deployment
          ? {
              apiUrl: `${deployment}/api/chat`,
              parentOrigin: deployment,
            }
          : {}),
      }).toString(),
    [color, deployment, position],
  );
  const snippetOrigin =
    deployment || "https://YOUR-SUCCESSIVE-CHAT-DOMAIN.example";
  const snippet = `<script
  src="${snippetOrigin}/successive-chat-widget.js"
  data-api-url="${snippetOrigin}/api/chat"
  data-title="Ask Successive AI"
  data-welcome-message="Hi! How can I help you explore Successive?"
  data-primary-color="${color}"
  data-position="${position}"
  data-button-label="Chat with Successive"
  data-width="${width}"
  data-height="${height}"
  data-open-by-default="${openDefault}"
  data-prompt-input-id="${promptInputId}"
  data-prompt-button-id="${promptButtonId}"
  defer
></script>`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <main className="preview-builder">
      <header>
        <Link href="/" className="brand">
          <span className="brand-mark">K</span>
          <span>SUCCESSIVE</span>
        </Link>
        <div>
          <h1>Widget configurator</h1>
          <p>Customize, preview, and copy your installation snippet.</p>
        </div>
      </header>
      <div className="builder-grid">
        <aside className="config-panel">
          <label>
            Primary color{" "}
            <div className="color-control">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                value={color}
                onChange={(e) =>
                  /^#[0-9a-f]{0,6}$/i.test(e.target.value) &&
                  setColor(e.target.value)
                }
              />
            </div>
          </label>
          <label>
            Position{" "}
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as Position)}
            >
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </select>
          </label>
          <label>
            Width: {width}px{" "}
            <input
              type="range"
              min="320"
              max="520"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label>
            Height: {height}px{" "}
            <input
              type="range"
              min="450"
              max="850"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </label>
          <label>
            Search input/textarea ID{" "}
            <input
              value={promptInputId}
              placeholder="ai-search"
              onChange={(event) => {
                const value = event.target.value;
                if (/^[A-Za-z][\w:.-]*$/.test(value) || value === "")
                  setPromptInputId(value);
              }}
            />
          </label>
          <label>
            Search button ID{" "}
            <input
              value={promptButtonId}
              placeholder="ai-search-button"
              onChange={(event) => {
                const value = event.target.value;
                if (/^[A-Za-z][\w:.-]*$/.test(value) || value === "")
                  setPromptButtonId(value);
              }}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={openDefault}
              onChange={(e) => {
                setOpenDefault(e.target.checked);
                setOpen(e.target.checked);
              }}
            />{" "}
            Open by default
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={mobile}
              onChange={(e) => setMobile(e.target.checked)}
            />{" "}
            Mobile preview
          </label>
        </aside>
        <section className={`preview-stage ${mobile ? "mobile-stage" : ""}`}>
          <nav>
            <span>Successive</span>
            <span>Products　Resources　About</span>
          </nav>
          <div className="stage-copy">
            <small>AI-FIRST CONTENT INTELLIGENCE</small>
            <h2>Enterprise knowledge, activated.</h2>
            <p>
              Explore secure content intelligence solutions built for complex
              organizations.
            </p>
          </div>
          {open && deployment && (
            <div
              className={`stage-widget ${position}`}
              style={{
                width: mobile ? "100%" : Math.min(width, 520),
                height: mobile ? "100%" : Math.min(height, 720),
              }}
            >
              <iframe
                ref={previewFrame}
                src={`/embed?${query}`}
                title="Successive widget preview"
              />
            </div>
          )}
          {!open && (
            <button
              className={`stage-launcher ${position}`}
              style={{ background: color }}
              onClick={() => setOpen(true)}
            >
              <MessageCircle />
              <span>Chat with Successive</span>
            </button>
          )}
        </section>
      </div>
      <section className="snippet-panel">
        <div>
          <h2>Installation snippet</h2>
          <button onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
        <pre>
          <code>{snippet}</code>
        </pre>
      </section>
    </main>
  );
}
