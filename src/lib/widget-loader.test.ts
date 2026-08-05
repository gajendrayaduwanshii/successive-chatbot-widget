import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

describe("public widget loader", () => {
  it("initializes once and supports the public open/close/destroy API", () => {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body><script src="https://widget.example/successive-chat-widget.js" data-open-by-default="false"></script></body></html>',
      { url: "https://successive.ai/page", runScripts: "outside-only" },
    );
    Object.defineProperty(dom.window, "matchMedia", {
      value: () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    const source = readFileSync("public/successive-chat-widget.js", "utf8");
    dom.window.eval(source);
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
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
    expect(api.isOpen()).toBe(false);
    expect(
      dom.window.document.querySelectorAll("#successive-chat-widget-root"),
    ).toHaveLength(1);
    expect(dom.window.document.querySelector("iframe")).toBeNull();
    api.open();
    expect(api.isOpen()).toBe(true);
    const iframeUrl = new URL(
      dom.window.document.querySelector("iframe")?.src ?? "",
    );
    expect(iframeUrl.href).toContain("https://widget.example/embed?");
    expect(iframeUrl.searchParams.get("parentOrigin")).toBe(
      "https://successive.ai",
    );
    api.close();
    expect(api.isOpen()).toBe(false);
    dom.window.eval(source);
    expect(
      dom.window.document.querySelectorAll("#successive-chat-widget-root"),
    ).toHaveLength(1);
    api.destroy();
    expect(
      dom.window.document.querySelector("#successive-chat-widget-root"),
    ).toBeNull();
  });
  it("locks and restores host scrolling for a mobile fullscreen widget", () => {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body><script src="https://widget.example/successive-chat-widget.js" data-mobile-fullscreen="true"></script></body></html>',
      { url: "https://successive.ai/page", runScripts: "outside-only" },
    );
    Object.defineProperty(dom.window, "matchMedia", {
      value: () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    dom.window.eval(readFileSync("public/successive-chat-widget.js", "utf8"));
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    const api = (
      dom.window as unknown as {
        SuccessiveChat: { open(): void; close(): void };
      }
    ).SuccessiveChat;
    api.open();
    expect(dom.window.document.documentElement.style.overflow).toBe("hidden");
    api.close();
    expect(dom.window.document.documentElement.style.overflow).toBe("");
  });
  it("closes when the embedded chat sends its close message", () => {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body><script src="https://widget.example/successive-chat-widget.js"></script></body></html>',
      { url: "https://successive.ai/page", runScripts: "outside-only" },
    );
    Object.defineProperty(dom.window, "matchMedia", {
      value: () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    dom.window.eval(readFileSync("public/successive-chat-widget.js", "utf8"));
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    const api = (
      dom.window as unknown as {
        SuccessiveChat: { open(): void; isOpen(): boolean };
      }
    ).SuccessiveChat;
    api.open();
    const iframe = dom.window.document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        origin: "https://widget.example",
        source: iframe?.contentWindow,
        data: {
          namespace: "successive-chat",
          type: "SUCCESSIVE_CHAT_CLOSE",
        },
      }),
    );
    expect(api.isOpen()).toBe(false);
  });
  it("passes an opaque parent origin when a local HTML file hosts the widget", () => {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body><script src="http://localhost:3000/successive-chat-widget.js"></script></body></html>',
      {
        url: "file:///tmp/successive-widget-test.html",
        runScripts: "outside-only",
      },
    );
    Object.defineProperty(dom.window, "matchMedia", {
      value: () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    dom.window.eval(readFileSync("public/successive-chat-widget.js", "utf8"));
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    const api = (dom.window as unknown as { SuccessiveChat: { open(): void } })
      .SuccessiveChat;
    api.open();
    const iframeUrl = new URL(
      dom.window.document.querySelector("iframe")?.src ?? "",
    );
    expect(iframeUrl.searchParams.get("parentOrigin")).toBe("null");
    const closeHitArea = dom.window.document.querySelector<HTMLButtonElement>(
      ".successive-chat-close-hit-area",
    );
    expect(closeHitArea).not.toBeNull();
    closeHitArea?.click();
    expect(
      (
        dom.window as unknown as {
          SuccessiveChat: { isOpen(): boolean };
        }
      ).SuccessiveChat.isOpen(),
    ).toBe(false);
  });
});
