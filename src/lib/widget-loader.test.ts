import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const source = readFileSync("public/successive-chat-widget.js", "utf8");

function createWidget(markup = "") {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${markup}<script src="https://widget.example/successive-chat-widget.js" data-api-url="https://widget.example/api/chat" data-prompt-input-id="hero-prompt" data-prompt-button-id="hero-button"></script></body></html>`,
    { url: "https://successive.ai/page", runScripts: "outside-only" },
  );
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return dom;
}

describe("public iframe widget loader", () => {
  it("renders the original iframe chat UI", () => {
    const dom = createWidget();
    const launcher = dom.window.document.querySelector<HTMLButtonElement>(
      ".successive-chat-launcher",
    )!;
    launcher.click();
    expect(dom.window.document.querySelector("iframe")).not.toBeNull();
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.querySelector("svg path")?.getAttribute("d")).toContain(
      "18 6 6 18",
    );
  });

  it("sends an external form prompt to the iframe", () => {
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
    const iframe = dom.window.document.querySelector("iframe")!;
    const sent: unknown[] = [];
    iframe.contentWindow!.postMessage = (message: unknown) =>
      sent.push(message);
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        origin: "https://widget.example",
        source: iframe.contentWindow,
        data: { namespace: "successive-chat", type: "SUCCESSIVE_CHAT_READY" },
      }),
    );
    expect(input.value).toBe("");
    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SUCCESSIVE_CHAT_SUBMIT",
          payload: expect.objectContaining({ message: "AI services" }),
        }),
      ]),
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
