import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("public/successive-chat-widget.js", "utf8");
const stylesheet = readFileSync("public/successive-chat-widget.css", "utf8");
const applicationStyles = readFileSync("src/app/globals.css", "utf8");

function createWidget(markup = "", scriptAttributes = "") {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${markup}<script src="https://widget.example/successive-chat-widget.js" data-api-url="https://widget.example/api/chat" data-prompt-input-id="hero-prompt" data-prompt-button-id="hero-button" ${scriptAttributes}></script></body></html>`,
    { url: "https://successive.ai/page", runScripts: "outside-only" },
  );
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  Object.defineProperty(dom.window, "fetch", {
    value: vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          answer: "AI services response",
          cards: [],
          sources: [],
          suggestions: [],
        },
      }),
    })),
  });
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return dom;
}

describe("public direct-DOM widget loader", () => {
  it("does not render an unvalidated label-only suggestion", async () => {
    const dom = createWidget();
    const fetchMock = vi.mocked(dom.window.fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {
      answer: "Security response", cards: [], sources: [],
      suggestions: ["Show me a related case study"], suggestionActions: [],
    } }) } as Response);
    (dom.window as unknown as { SuccessiveChat: { sendMessage(value: string): boolean } }).SuccessiveChat.sendMessage("Security approach");
    await vi.waitFor(() => expect(dom.window.document.querySelector(".conversation")?.textContent).toContain("Security response"));
    expect(dom.window.document.querySelector(".suggestions button")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders and submits only the structured action payload", async () => {
    const dom = createWidget();
    const fetchMock = vi.mocked(dom.window.fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {
      answer: "Service response", cards: [], sources: [], suggestions: ["Unsafe legacy label"], suggestionActions: [{
        id: "content-page-42", label: "Explore published detail", intent: "CONTENT_DISCOVERY",
        relation: "RELATED_TO_SOURCE", resultKeys: ["page:42"], topic: "Published detail",
      }],
    } }) } as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { answer: "Exact detail", cards: [], sources: [], suggestions: [], suggestionActions: [] } }) } as Response);
    (dom.window as unknown as { SuccessiveChat: { sendMessage(value: string): boolean } }).SuccessiveChat.sendMessage("service overview");
    await vi.waitFor(() => expect(dom.window.document.querySelector<HTMLButtonElement>(".suggestions button")?.textContent).toContain("Explore published detail"));
    expect(dom.window.document.querySelector(".suggestions")?.textContent).not.toContain("Unsafe legacy label");
    dom.window.document.querySelector<HTMLButtonElement>(".suggestions button")!.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body.suggestionAction).toMatchObject({ id: "content-page-42", intent: "CONTENT_DISCOVERY", resultKeys: ["page:42"] });
  });
  it("renders the chat UI directly without an iframe", () => {
    const dom = createWidget();
    const launcher = dom.window.document.querySelector<HTMLButtonElement>(
      ".successive-chat-launcher",
    )!;
    launcher.click();
    expect(dom.window.document.querySelector("iframe")).toBeNull();
    expect(
      dom.window.document.querySelector(
        ".successive-chat-widget-wrap > #successive-chat-widget-root",
      ),
    ).not.toBeNull();
    expect(
      dom.window.document.querySelector(".successive-chat-ui .conversation"),
    ).not.toBeNull();
    expect(
      dom.window.document.querySelector(
        '.successive-chat-ui textarea[aria-label="Message Successive assistant"]',
      ),
    ).not.toBeNull();
    expect(
      dom.window.document.querySelector(
        'button[aria-label="Clear conversation"] svg',
      ),
    ).not.toBeNull();
    const styleLink = dom.window.document.querySelector<HTMLLinkElement>(
      "#successive-chat-widget-styles",
    );
    expect(styleLink?.rel).toBe("stylesheet");
    expect(styleLink?.href).toBe(
      "https://widget.example/successive-chat-widget.css",
    );
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.querySelector("svg path")?.getAttribute("d")).toContain(
      "18 6 6 18",
    );
  });

  it("supports an icon-only launcher from the embed attributes", () => {
    const iconUrl = "https://assets.example/custom-chat-icon.png";
    const dom = createWidget(
      "",
      `data-title="Ask Successive AI" data-button-label="" data-button-icon-url="${iconUrl}"`,
    );
    const launcher = dom.window.document.querySelector<HTMLButtonElement>(
      ".successive-chat-launcher",
    )!;
    const launcherIcon = launcher.querySelector<HTMLImageElement>(
      ".successive-chat-launcher-icon",
    );

    expect(launcher.getAttribute("aria-label")).toBe("Open Ask Successive AI");
    expect(launcher.classList.contains("successive-chat-launcher-icon-only")).toBe(true);
    expect(launcherIcon?.src).toBe(iconUrl);
    expect(launcherIcon?.alt).toBe("");
    expect(launcher.querySelector(".successive-chat-label")).toBeNull();

    launcher.click();
    expect(launcher.getAttribute("aria-label")).toBe("Close Ask Successive AI");
    expect(launcher.querySelector(".successive-chat-launcher-icon")).toBeNull();
    expect(launcher.querySelector("svg path")?.getAttribute("d")).toContain(
      "18 6 6 18",
    );
  });

  it("scopes every widget UI selector under the wrapper class", () => {
    expect(stylesheet).toContain(
      ".successive-chat-widget-wrap .successive-chat-launcher",
    );
    expect(stylesheet).toContain(
      ".successive-chat-widget-wrap #successive-chat-widget-root",
    );
    expect(stylesheet).toContain(
      ".successive-chat-widget-wrap .chat-actions button",
    );
    expect(stylesheet).toContain(".successive-chat-widget-wrap .conversation");
    expect(stylesheet).not.toMatch(/(^|})\.conversation\{/);
    expect(stylesheet).not.toMatch(/(^|})\.bubble\{/);
  });

  it("inherits the host website font without pixel-based font sizes", () => {
    expect(stylesheet).toContain("font-family: inherit");
    expect(stylesheet).not.toMatch(/font(?:-size)?\s*:[^;]*\d+(?:\.\d+)?px/);
  });

  it("keeps loading animation CSS only inside the widget wrapper stylesheet", () => {
    expect(stylesheet).toContain(".successive-chat-widget-wrap .typing-status");
    expect(stylesheet).toContain(
      ".successive-chat-widget-wrap .typing::before",
    );
    expect(stylesheet).not.toMatch(
      /(^|})\s*\.typing(?:-status|::before|\s*\{)/,
    );
    expect(applicationStyles).not.toContain("typing-status");
    expect(applicationStyles).not.toContain("status-shimmer");
  });

  it("supports safe named primary colors passed by the script", () => {
    const dom = createWidget("", 'data-primary-color="red"');
    const root = dom.window.document.querySelector<HTMLElement>(
      "#successive-chat-widget-root",
    );
    expect(root?.style.getPropertyValue("--kc-primary")).toBe("rgb(255, 0, 0)");
    expect(stylesheet).toContain("background: var(--kc-primary)");
    expect(stylesheet).toContain(
      "color-mix(in srgb, var(--kc-primary) 48%, var(--kc-muted))",
    );
  });

  it("sends an external form prompt directly to the chat API", async () => {
    const dom = createWidget(
      '<form><textarea id="hero-prompt"></textarea><button id="hero-button" type="submit" disabled>Send</button></form>',
    );
    const input =
      dom.window.document.querySelector<HTMLTextAreaElement>("#hero-prompt")!;
    const button =
      dom.window.document.querySelector<HTMLButtonElement>("#hero-button")!;
    input.value = "AI services";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    button.click();
    expect(input.value).toBe("");
    expect(dom.window.fetch).toHaveBeenCalledWith(
      "https://widget.example/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"message":"AI services"'),
      }),
    );
    await vi.waitFor(() =>
      expect(
        dom.window.document.querySelector(".conversation")?.textContent,
      ).toContain("AI services response"),
    );
  });

  it("renders combined bold Markdown links as clickable links", async () => {
    const dom = createWidget();
    const fetchMock = vi.mocked(dom.window.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          answer: "**[Successive Digital](https://successive.tech/)**",
          cards: [],
          sources: [],
          suggestions: [],
        },
      }),
    } as Response);
    const api = (
      dom.window as unknown as {
        SuccessiveChat: { sendMessage(value: string): boolean };
      }
    ).SuccessiveChat;
    api.sendMessage("ai services");
    await vi.waitFor(() =>
      expect(
        dom.window.document.querySelector(
          '.bubble strong a[href="https://successive.tech/"]',
        ),
      ).not.toBeNull(),
    );
  });

  it("renders structured headings, bold labels, and use-case bullets", async () => {
    const dom = createWidget();
    const fetchMock = vi.mocked(dom.window.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          answer:
            "## AI Use Cases\n\nPractical applications supported by Successive content.\n\n### Customer Experience\n\n- **Conversational AI:** Helps customers self-serve.\n- **Personalization:** Tailors relevant experiences.",
          cards: [],
          sources: [],
          suggestions: [],
        },
      }),
    } as Response);
    const api = (
      dom.window as unknown as {
        SuccessiveChat: { sendMessage(value: string): boolean };
      }
    ).SuccessiveChat;
    api.sendMessage("show AI use cases");
    await vi.waitFor(() => {
      const bubbles = dom.window.document.querySelectorAll(".bubble");
      const bubble = bubbles[bubbles.length - 1];
      expect(bubble?.querySelectorAll("h3")).toHaveLength(2);
      expect(bubble?.querySelectorAll("li")).toHaveLength(2);
      expect(bubble?.querySelector("li strong")?.textContent).toBe(
        "Conversational AI:",
      );
    });
  });

  it("changes the loading message from analysis to response preparation", () => {
    const dom = createWidget();
    vi.mocked(dom.window.fetch).mockImplementationOnce(
      () => new Promise(() => {}),
    );
    const timeout = vi
      .spyOn(dom.window, "setTimeout")
      .mockImplementation((callback, delay) => {
        if (delay === 2200 && typeof callback === "function") callback();
        return 1;
      });
    const api = (
      dom.window as unknown as {
        SuccessiveChat: { sendMessage(value: string): boolean };
      }
    ).SuccessiveChat;
    api.sendMessage("show cloud use cases");
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 2200);
    expect(
      dom.window.document.querySelector(".typing-status")?.textContent,
    ).toBe("Preparing your response…");
  });

  it("moves the latest request toward the top without a blank spacer", () => {
    const dom = createWidget();
    vi.mocked(dom.window.fetch).mockImplementationOnce(() => new Promise(() => {}));
    const conversation = dom.window.document.querySelector<HTMLElement>(".conversation")!;
    conversation.scrollTop = 10;
    const reveal = vi.fn();
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: reveal,
    });
    vi.spyOn(dom.window.HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this === conversation ? 20 : this.matches(".message-row.user") ? 70 : 0;
      return { x: 0, y: top, top, left: 0, right: 0, bottom: top, width: 0, height: 0, toJSON: () => ({}) };
    });
    const api = (dom.window as unknown as { SuccessiveChat: { sendMessage(value: string): boolean } }).SuccessiveChat;

    api.sendMessage("keep this request visible");

    expect(conversation.scrollTop).toBe(28);
    expect(reveal).toHaveBeenCalledWith({ behavior: "auto", block: "nearest" });
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(conversation.querySelector(".request-scroll-spacer")).toBeNull();
    expect(conversation.querySelector<HTMLElement>(".message-row.user")?.id).toMatch(/^chat-request-/);
  });

  it("replaces copied stale widget markup", () => {
    const dom = createWidget(
      '<div id="successive-chat-widget-root"><span class="stale">Old</span></div>',
    );
    expect(dom.window.document.querySelector(".stale")).toBeNull();
    expect(
      dom.window.document.querySelectorAll("#successive-chat-widget-root"),
    ).toHaveLength(1);
  });

  it("keeps normal public open, close and destroy controls", () => {
    const dom = createWidget();
    const api = (
      dom.window as unknown as {
        SuccessiveChat: {
          open(): void;
          close(): void;
          destroy(): void;
          isOpen(): boolean;
        };
      }
    ).SuccessiveChat;
    api.open();
    expect(api.isOpen()).toBe(true);
    api.close();
    expect(api.isOpen()).toBe(false);
    api.destroy();
    expect(
      dom.window.document.querySelector("#successive-chat-widget-root"),
    ).toBeNull();
  });
});
