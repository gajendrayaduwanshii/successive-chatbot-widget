import { ChatWindow } from "@/components/chat/chat-window";
import { parseWidgetQuery, readableForeground } from "@/lib/widget-config";

export const dynamic = "force-dynamic";

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  Object.entries(raw).forEach(([key, value]) => {
    if (typeof value === "string") params.set(key, value);
  });
  const config = parseWidgetQuery(params);
  const candidateApi = params.get("apiUrl");
  const candidateParentOrigin = params.get("parentOrigin");
  let apiUrl: string | undefined;
  let parentOrigin: string | undefined;
  try {
    if (candidateApi) {
      const parsed = new URL(candidateApi);
      if (
        parsed.protocol === "https:" ||
        (parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(parsed.hostname))
      )
        apiUrl = parsed.toString();
    }
  } catch {
    /* use same-origin API */
  }
  try {
    if (candidateParentOrigin) {
      if (candidateParentOrigin === "null") {
        // Local HTML opened with file:// has an opaque origin. postMessage can
        // reach an opaque parent only with "*"; the host loader still verifies
        // both the iframe window and the widget's own origin on receipt.
        parentOrigin = "*";
      }
      const parsed = new URL(candidateParentOrigin);
      if (
        parsed.origin === candidateParentOrigin &&
        (parsed.protocol === "https:" ||
          (parsed.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(parsed.hostname)))
      ) {
        parentOrigin = parsed.origin;
      }
    }
  } catch {
    /* retain the opaque-origin fallback or use the trusted iframe referrer */
  }
  return (
    <main
      className="embed-page"
      style={
        {
          "--successive-chat-primary": config.primaryColor,
          "--successive-chat-primary-text": readableForeground(
            config.primaryColor,
          ),
          "--successive-chat-background": "#ffffff",
          "--successive-chat-text": "#172033",
          "--successive-chat-border": "#e5e8f0",
          "--successive-chat-radius": "16px",
        } as React.CSSProperties
      }
    >
      <ChatWindow
        embedded
        widget
        title={config.title}
        welcomeMessage={config.welcomeMessage}
        primaryColor={config.primaryColor}
        apiUrl={apiUrl}
        logoUrl={config.logoUrl || undefined}
        parentOrigin={parentOrigin}
      />
    </main>
  );
}
