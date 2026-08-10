import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("public/successive-chat-widget.js", "utf8");

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
    expect(
      dom.window.document.querySelector("#successive-chat-widget-styles")
        ?.textContent,
    ).toContain("background:var(--kc-primary)");
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.querySelector("svg path")?.getAttribute("d")).toContain(
      "18 6 6 18",
    );
  });

  it("scopes every widget UI selector under the wrapper class", () => {
    const dom = createWidget();
    const styles =
      dom.window.document.querySelector("#successive-chat-widget-styles")
        ?.textContent ?? "";
    expect(styles).toContain(
      ".successive-chat-widget-wrap .successive-chat-launcher",
    );
    expect(styles).toContain(
      ".successive-chat-widget-wrap #successive-chat-widget-root",
    );
    expect(styles).toContain(
      ".successive-chat-widget-wrap .chat-actions button",
    );
    expect(styles).toContain(".successive-chat-widget-wrap .conversation");
    expect(styles).not.toMatch(/(^|})\.conversation\{/);
    expect(styles).not.toMatch(/(^|})\.bubble\{/);
  });

  it("supports safe named primary colors passed by the script", () => {
    const dom = createWidget("", 'data-primary-color="red"');
    const styles = dom.window.document.querySelector(
      "#successive-chat-widget-styles",
    )?.textContent;
    expect(styles).toContain("--kc-primary:rgb(255, 0, 0)");
    expect(styles).toContain("background:var(--kc-primary)");
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
          answer: "**[AI Development](https://successive.ai/ai-development/)**",
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
          '.bubble strong a[href="https://successive.ai/ai-development/"]',
        ),
      ).not.toBeNull(),
    );
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
