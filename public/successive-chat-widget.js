(function () {
  "use strict";

  if (window.SuccessiveChat && window.SuccessiveChat.__initialized) return;

  var script = document.currentScript;
  if (!script) {
    var scripts = document.querySelectorAll(
      'script[src*="successive-chat-widget.js"]',
    );
    script = scripts[scripts.length - 1];
  }
  if (!script) return;

  var scriptUrl;
  try {
    scriptUrl = new URL(script.src, document.baseURI);
  } catch {
    return;
  }
  var widgetOrigin = scriptUrl.origin;
  var data = script.dataset || {};
  var clamp = function (value, fallback, min, max) {
    var parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
  };
  var safeText = function (value, fallback, max) {
    var text = typeof value === "string" ? value.trim() : "";
    return text ? text.slice(0, max) : fallback;
  };
  var isHex = function (value) {
    return /^#[0-9a-f]{6}$/i.test(value || "");
  };
  var safeUrl = function (value, fallback) {
    if (!value) return fallback;
    try {
      var url = new URL(value, widgetOrigin);
      if (
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
      )
        return url.href;
    } catch {}
    return fallback;
  };
  var bool = function (value, fallback) {
    if (value == null) return fallback;
    return String(value).toLowerCase() === "true";
  };
  var foreground = function (hex) {
    var r = Number.parseInt(hex.slice(1, 3), 16);
    var g = Number.parseInt(hex.slice(3, 5), 16);
    var b = Number.parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
      ? "#111827"
      : "#ffffff";
  };
  var allowedDomain = safeText(data.allowedDomain, "", 253).toLowerCase();
  if (
    allowedDomain &&
    location.hostname.toLowerCase() !== allowedDomain &&
    !location.hostname.toLowerCase().endsWith("." + allowedDomain)
  ) {
    window.dispatchEvent(
      new CustomEvent("successive-chat:error", {
        detail: { code: "DOMAIN_NOT_ALLOWED" },
      }),
    );
    return;
  }

  var config = {
    apiUrl: safeUrl(data.apiUrl, widgetOrigin + "/api/chat"),
    title: safeText(data.title, "Ask Successive AI", 60),
    welcomeMessage: safeText(
      data.welcomeMessage,
      "Hi! How can I help you explore Successive?",
      300,
    ),
    primaryColor: isHex(data.primaryColor) ? data.primaryColor : "#0063ce",
    position: data.position === "bottom-left" ? "bottom-left" : "bottom-right",
    buttonLabel: safeText(data.buttonLabel, "Chat with Successive", 40),
    logoUrl: safeUrl(data.logoUrl, ""),
    openByDefault: bool(data.openByDefault, false),
    zIndex: clamp(data.zIndex, 2147483000, 1000, 2147483646),
    width: clamp(data.width, 400, 320, 520),
    height: clamp(data.height, 650, 450, 850),
    mobileFullscreen: bool(data.mobileFullscreen, true),
    promptInputId: safeText(data.promptInputId, "", 100),
    promptButtonId: safeText(data.promptButtonId, "", 100),
    containerId: safeText(data.containerId, "", 100),
  };

  var root, launcher, panel, frame, closeHitArea, unread, style;
  var open = false;
  var ready = false;
  var pendingMessages = [];
  var retryTimer = null;
  var unbindPromptInput = null;
  var previousOverflow = "";
  var mobileQuery = window.matchMedia("(max-width: 640px)");
  var iconChat =
    '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>';
  var iconClose =
    '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var dispatch = function (name, detail) {
    window.dispatchEvent(
      new CustomEvent("successive-chat:" + name, { detail: detail || {} }),
    );
  };
  var setPageLock = function (locked) {
    if (!(config.mobileFullscreen && mobileQuery.matches)) return;
    if (locked) {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = previousOverflow;
    }
  };
  var buildFrame = function () {
    if (frame) return;
    frame = document.createElement("iframe");
    frame.className = "successive-chat-frame";
    frame.title = config.title;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups",
    );
    var params = new URLSearchParams({
      title: config.title,
      welcomeMessage: config.welcomeMessage,
      primaryColor: config.primaryColor,
      position: config.position,
      buttonLabel: config.buttonLabel,
      apiUrl: config.apiUrl,
      parentOrigin: window.location.origin,
    });
    if (config.logoUrl) params.set("logoUrl", config.logoUrl);
    frame.src = widgetOrigin + "/embed?" + params.toString();
    panel.appendChild(frame);
  };
  var renderState = function () {
    if (!launcher || !panel) return;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute(
      "aria-label",
      open ? "Close " + config.title : config.buttonLabel,
    );
    launcher.innerHTML =
      (open ? iconClose : iconChat) +
      (open ? "" : '<span class="successive-chat-label"></span>');
    var label = launcher.querySelector(".successive-chat-label");
    if (label) label.textContent = config.buttonLabel;
    panel.hidden = !open;
    root.classList.toggle("successive-chat-open", open);
  };
  var openWidget = function () {
    if (open) return;
    buildFrame();
    open = true;
    unread.textContent = "";
    unread.hidden = true;
    renderState();
    setPageLock(true);
    dispatch("open");
    if (ready && frame.contentWindow)
      frame.contentWindow.postMessage(
        { namespace: "successive-chat", type: "SUCCESSIVE_CHAT_OPEN" },
        widgetOrigin,
      );
  };
  var postSubmittedMessage = function (item) {
    if (!ready || !frame || !frame.contentWindow) return false;
    frame.contentWindow.postMessage(
      {
        namespace: "successive-chat",
        type: "SUCCESSIVE_CHAT_SUBMIT",
        payload: { id: item.id, message: item.message },
      },
      widgetOrigin,
    );
    return true;
  };
  var schedulePendingRetry = function () {
    if (retryTimer || !pendingMessages.length) return;
    retryTimer = window.setTimeout(function () {
      retryTimer = null;
      if (ready) pendingMessages.forEach(postSubmittedMessage);
      if (pendingMessages.length) schedulePendingRetry();
    }, 750);
  };
  var sendMessage = function (value) {
    var message = typeof value === "string" ? value.trim() : "";
    if (message.length < 2 || message.length > 1000) return false;
    var item = {
      id:
        "prompt-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10),
      message: message,
    };
    pendingMessages.push(item);
    openWidget();
    postSubmittedMessage(item);
    schedulePendingRetry();
    return true;
  };
  var bindPromptInput = function () {
    if (!config.promptInputId) return;
    var input = document.getElementById(config.promptInputId);
    if (!input || !("value" in input)) return;
    var form = input.form || input.closest("form");
    var button = config.promptButtonId
      ? document.getElementById(config.promptButtonId)
      : null;
    var update = function () {
      if (button) button.disabled = String(input.value || "").trim().length < 2;
    };
    var submit = function (event) {
      if (event) event.preventDefault();
      if (sendMessage(String(input.value || ""))) input.value = "";
      update();
    };
    var keydown = function (event) {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      submit(event);
    };
    input.addEventListener("input", update);
    input.addEventListener("keydown", keydown);
    if (form) form.addEventListener("submit", submit);
    else if (button) button.addEventListener("click", submit);
    update();
    unbindPromptInput = function () {
      input.removeEventListener("input", update);
      input.removeEventListener("keydown", keydown);
      if (form) form.removeEventListener("submit", submit);
      else if (button) button.removeEventListener("click", submit);
    };
  };
  var closeWidget = function () {
    if (!open) return;
    open = false;
    renderState();
    setPageLock(false);
    dispatch("close");
    if (ready && frame && frame.contentWindow)
      frame.contentWindow.postMessage(
        { namespace: "successive-chat", type: "SUCCESSIVE_CHAT_CLOSE" },
        widgetOrigin,
      );
  };
  var toggleWidget = function () {
    if (open) closeWidget();
    else openWidget();
  };
  var onMessage = function (event) {
    if (
      !frame ||
      event.origin !== widgetOrigin ||
      event.source !== frame.contentWindow
    )
      return;
    var message = event.data;
    if (
      !message ||
      message.namespace !== "successive-chat" ||
      typeof message.type !== "string"
    )
      return;
    if (
      [
        "SUCCESSIVE_CHAT_READY",
        "SUCCESSIVE_CHAT_CLOSE",
        "SUCCESSIVE_CHAT_RESIZE",
        "SUCCESSIVE_CHAT_UNREAD",
        "SUCCESSIVE_CHAT_ERROR",
        "SUCCESSIVE_CHAT_SUBMIT_ACK",
      ].indexOf(message.type) < 0
    )
      return;
    if (message.type === "SUCCESSIVE_CHAT_READY") {
      ready = true;
      dispatch("ready");
      pendingMessages.forEach(postSubmittedMessage);
      schedulePendingRetry();
    } else if (
      message.type === "SUCCESSIVE_CHAT_SUBMIT_ACK" &&
      message.payload &&
      typeof message.payload.id === "string"
    ) {
      pendingMessages = pendingMessages.filter(function (item) {
        return item.id !== message.payload.id;
      });
      if (!pendingMessages.length && retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    } else if (message.type === "SUCCESSIVE_CHAT_CLOSE") {
      closeWidget();
    } else if (
      message.type === "SUCCESSIVE_CHAT_RESIZE" &&
      message.payload &&
      Number.isInteger(message.payload.height) &&
      message.payload.height >= 450 &&
      message.payload.height <= 850
    ) {
      panel.style.height = message.payload.height + "px";
    } else if (
      message.type === "SUCCESSIVE_CHAT_UNREAD" &&
      message.payload &&
      Number.isInteger(message.payload.count) &&
      message.payload.count >= 0 &&
      message.payload.count <= 99
    ) {
      unread.textContent = String(message.payload.count);
      unread.hidden = open || message.payload.count === 0;
    } else if (message.type === "SUCCESSIVE_CHAT_ERROR") {
      dispatch("error", { code: "IFRAME_ERROR" });
    }
  };
  var destroy = function () {
    setPageLock(false);
    window.removeEventListener("message", onMessage);
    if (unbindPromptInput) unbindPromptInput();
    if (retryTimer) window.clearTimeout(retryTimer);
    if (root) root.remove();
    if (style) style.remove();
    delete window.SuccessiveChat;
  };
  var init = function () {
    var staleRoot = document.getElementById("successive-chat-widget-root");
    if (staleRoot) staleRoot.remove();
    var staleStyle = document.getElementById("successive-chat-widget-styles");
    if (staleStyle) staleStyle.remove();
    style = document.createElement("style");
    style.id = "successive-chat-widget-styles";
    style.textContent =
      "#successive-chat-widget-root{--kc-primary:" +
      config.primaryColor +
      ";position:fixed;bottom:max(20px,env(safe-area-inset-bottom));" +
      (config.position === "bottom-left" ? "left:20px" : "right:20px") +
      ";z-index:" +
      config.zIndex +
      ';font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      "#successive-chat-widget-root *{box-sizing:border-box}.successive-chat-launcher{margin-left:auto;display:flex;align-items:center;gap:9px;min-width:56px;height:56px;padding:0 18px;border:0;border-radius:999px;background:var(--kc-primary);color:#fff;box-shadow:0 12px 34px rgba(15,23,42,.28);font:700 14px inherit;cursor:pointer;transition:transform .18s,box-shadow .18s}.successive-chat-launcher:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(15,23,42,.35)}.successive-chat-launcher:focus-visible{outline:3px solid #a5b4fc;outline-offset:3px}.successive-chat-launcher svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.successive-chat-panel{position:absolute;bottom:70px;" +
      (config.position === "bottom-left" ? "left:0" : "right:0") +
      ";width:" +
      config.width +
      "px;height:" +
      config.height +
      "px;max-width:calc(100vw - 24px);max-height:calc(100vh - 104px);overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 24px 80px rgba(2,6,23,.3);transform-origin:bottom " +
      (config.position === "bottom-left" ? "left" : "right") +
      ";animation:successive-chat-in .2s ease-out}.successive-chat-panel[hidden]{display:none}.successive-chat-frame{display:block;width:100%;height:100%;border:0}.successive-chat-close-hit-area{position:absolute;z-index:2;top:0;right:0;width:52px;height:58px;padding:0;border:0;background:transparent;cursor:pointer}.successive-chat-close-hit-area:focus-visible{outline:3px solid #fff;outline-offset:-6px;border-radius:10px}.successive-chat-unread{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border:2px solid #fff;border-radius:999px;background:#ef4444;color:#fff;font:700 11px/16px sans-serif;text-align:center}.successive-chat-unread[hidden]{display:none}@keyframes successive-chat-in{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}" +
      "@media(max-width:640px){.successive-chat-label{display:none}.successive-chat-launcher{width:56px;padding:0;justify-content:center}" +
      (config.mobileFullscreen
        ? ".successive-chat-panel{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;border-radius:0}"
        : "") +
      "}@media(prefers-reduced-motion:reduce){.successive-chat-panel,.successive-chat-launcher{animation:none;transition:none}}";
    document.head.appendChild(style);
    root = document.createElement("div");
    root.id = "successive-chat-widget-root";
    panel = document.createElement("div");
    panel.className = "successive-chat-panel";
    panel.hidden = true;
    closeHitArea = document.createElement("button");
    closeHitArea.type = "button";
    closeHitArea.className = "successive-chat-close-hit-area";
    closeHitArea.setAttribute("aria-label", "Close chat");
    closeHitArea.title = "Close chat";
    closeHitArea.addEventListener("click", closeWidget);
    panel.appendChild(closeHitArea);
    launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "successive-chat-launcher";
    launcher.style.color = foreground(config.primaryColor);
    unread = document.createElement("span");
    unread.className = "successive-chat-unread";
    unread.hidden = true;
    launcher.addEventListener("click", toggleWidget);
    root.appendChild(panel);
    root.appendChild(launcher);
    root.appendChild(unread);
    var mountContainer = config.containerId
      ? document.getElementById(config.containerId)
      : null;
    var promptInput = config.promptInputId
      ? document.getElementById(config.promptInputId)
      : null;
    var promptButton = config.promptButtonId
      ? document.getElementById(config.promptButtonId)
      : null;
    if (
      mountContainer &&
      ((promptInput && mountContainer.contains(promptInput)) ||
        (promptButton && mountContainer.contains(promptButton)))
    )
      mountContainer = null;
    (mountContainer || document.body).appendChild(root);
    window.addEventListener("message", onMessage);
    renderState();
    bindPromptInput();
    if (config.openByDefault) openWidget();
  };

  window.SuccessiveChat = {
    __initialized: true,
    open: openWidget,
    close: closeWidget,
    toggle: toggleWidget,
    sendMessage: sendMessage,
    destroy: destroy,
    isOpen: function () {
      return open;
    },
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
