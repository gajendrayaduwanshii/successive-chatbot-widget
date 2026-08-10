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
    return value == null ? fallback : String(value).toLowerCase() === "true";
  };
  var safeColor = function (value, fallback) {
    var candidate = typeof value === "string" ? value.trim() : "";
    if (!candidate) return fallback;
    // Restrict accepted input to ordinary color notation before asking the
    // browser to resolve it. This prevents CSS declaration injection while
    // supporting values such as red, #f00, rgb(...), and hsl(...).
    if (
      !/^(?:[a-z]+|#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/i.test(
        candidate,
      )
    )
      return fallback;
    var probe = document.createElement("span");
    probe.style.color = candidate;
    if (!probe.style.color) return fallback;
    document.documentElement.appendChild(probe);
    var resolved = window.getComputedStyle(probe).color;
    probe.remove();
    return resolved || probe.style.color || fallback;
  };
  var foreground = function (color) {
    var rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    var r = rgb
      ? Number(rgb[1])
      : Number.parseInt(
          color.length === 4 ? color[1] + color[1] : color.slice(1, 3),
          16,
        );
    var g = rgb
      ? Number(rgb[2])
      : Number.parseInt(
          color.length === 4 ? color[2] + color[2] : color.slice(3, 5),
          16,
        );
    var b = rgb
      ? Number(rgb[3])
      : Number.parseInt(
          color.length === 4 ? color[3] + color[3] : color.slice(5, 7),
          16,
        );
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
    primaryColor: safeColor(data.primaryColor, "#0063ce"),
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

  var storageKey = "successive-chat:conversation:v2";
  var sessionKey = "successive-chat:session:v1";
  var root, launcher, panel, conversation, input, sendButton, unread, style;
  var open = false;
  var loading = false;
  var messages = [];
  var sessionId = "";
  var unbindPromptInput = null;
  var previousOverflow = "";
  var mobileQuery = window.matchMedia("(max-width: 640px)");
  var icon = function (path, size) {
    return (
      '<svg aria-hidden="true" width="' +
      (size || 18) +
      '" height="' +
      (size || 18) +
      '" viewBox="0 0 24 24"><path d="' +
      path +
      '"></path></svg>'
    );
  };
  var chatIcon =
    "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z";
  var closeIcon = "M18 6 6 18M6 6l12 12";
  var botIcon =
    "M12 8V4H8m-2 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm3 5v2m6-2v2M2 12h2m16 0h2";
  var userIcon = "M20 21a8 8 0 0 0-16 0m8-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z";
  var sendIcon = "m22 2-7 20-4-9-9-4Zm0 0L11 13";
  var trashIcon = "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v6m4-6v6";
  var externalIcon =
    "M15 3h6v6m0-6-9 9m7 1v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6";
  var dispatch = function (name, detail) {
    window.dispatchEvent(
      new CustomEvent("successive-chat:" + name, { detail: detail || {} }),
    );
  };
  var create = function (tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };
  var setPageLock = function (locked) {
    if (!(config.mobileFullscreen && mobileQuery.matches)) return;
    if (locked) {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    } else document.documentElement.style.overflow = previousOverflow;
  };
  var save = function () {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  };
  var validLink = function (value) {
    return safeUrl(value, "");
  };
  var appendInline = function (parent, text) {
    var pattern =
      /\*\*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
    var cursor = 0;
    var match;
    while ((match = pattern.exec(text))) {
      if (match.index > cursor)
        parent.appendChild(
          document.createTextNode(text.slice(cursor, match.index)),
        );
      if (match[1] || match[3]) {
        var label = match[1] || match[3];
        var href = validLink(match[2] || match[4]);
        if (href) {
          var link = create("a", "", label);
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.addEventListener("click", function () {
            dispatch("link-clicked", { cardType: "inline" });
          });
          if (match[1]) {
            var boldLink = create("strong");
            boldLink.appendChild(link);
            parent.appendChild(boldLink);
          } else parent.appendChild(link);
        } else parent.appendChild(document.createTextNode(label));
      } else {
        var strong = create("strong", "", match[5]);
        parent.appendChild(strong);
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length)
      parent.appendChild(document.createTextNode(text.slice(cursor)));
  };
  var renderAnswer = function (parent, answer) {
    var lines = String(answer || "").split(/\r?\n/);
    var list = null;
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) {
        list = null;
        return;
      }
      var heading = line.match(/^#{1,3}\s+(.+)$/);
      var item = line.match(/^[-*]\s+(.+)$/);
      if (heading) {
        list = null;
        var h = create("h3");
        appendInline(h, heading[1]);
        parent.appendChild(h);
      } else if (item) {
        if (!list) {
          list = create("ul");
          parent.appendChild(list);
        }
        var li = create("li");
        appendInline(li, item[1]);
        list.appendChild(li);
      } else {
        list = null;
        var p = create("p");
        appendInline(p, line);
        parent.appendChild(p);
      }
    });
  };
  var renderCards = function (wrap, cards) {
    if (!Array.isArray(cards) || !cards.length) return;
    var grid = create("div", "card-grid");
    cards.forEach(function (card) {
      if (!card || !validLink(card.url)) return;
      var article = create("article", "result-card");
      var imageUrl = validLink(card.image);
      if (imageUrl) {
        var image = create("img");
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        article.appendChild(image);
      }
      var content = create("div", "result-content");
      content.appendChild(
        create(
          "span",
          "badge",
          card.service_type ||
            card.badge ||
            String(card.type || "page").replace("-", " "),
        ),
      );
      content.appendChild(
        create("h3", "", safeText(card.title, "Result", 200)),
      );
      content.appendChild(create("p", "", safeText(card.description, "", 500)));
      var link = create("a", "", "Learn more ");
      link.href = validLink(card.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.insertAdjacentHTML("beforeend", icon(externalIcon, 14));
      link.addEventListener("click", function () {
        dispatch("link-clicked", { cardType: card.type || "page" });
      });
      content.appendChild(link);
      article.appendChild(content);
      grid.appendChild(article);
    });
    if (grid.childNodes.length) wrap.appendChild(grid);
  };
  var renderSources = function (wrap, sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    var details = create("details", "sources");
    details.appendChild(
      create("summary", "", "Sources (" + sources.length + ")"),
    );
    var links = create("div");
    sources.forEach(function (source) {
      var href = source && validLink(source.url);
      if (!href) return;
      var link = create("a", "", safeText(source.title, "Source", 200) + " ");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.insertAdjacentHTML("beforeend", icon(externalIcon, 12));
      link.addEventListener("click", function () {
        dispatch("link-clicked", { cardType: "source" });
      });
      links.appendChild(link);
    });
    details.appendChild(links);
    wrap.appendChild(details);
  };
  var renderSuggestions = function (wrap, suggestions) {
    if (!Array.isArray(suggestions) || !suggestions.length) return;
    var box = create("div", "suggestions");
    suggestions.forEach(function (suggestion) {
      var value = safeText(suggestion, "", 160);
      if (!value) return;
      var button = create("button");
      button.type = "button";
      button.appendChild(create("span", "", value));
      button.insertAdjacentHTML("beforeend", icon("m9 18 6-6-6-6", 16));
      button.addEventListener("click", function () {
        sendMessage(value);
      });
      box.appendChild(button);
    });
    wrap.appendChild(box);
  };
  var renderMessage = function (message) {
    var assistant = message.role === "assistant";
    var row = create(
      "div",
      "message-row " + (assistant ? "assistant" : "user"),
    );
    var avatar = create("div", "avatar");
    avatar.setAttribute("aria-hidden", "true");
    avatar.innerHTML = icon(assistant ? botIcon : userIcon, 17);
    row.appendChild(avatar);
    var wrap = create("div", "message-wrap");
    if (assistant)
      wrap.appendChild(create("div", "message-author", "Successive Assistant"));
    var bubble = create("div", "bubble");
    if (assistant)
      renderAnswer(bubble, message.response?.answer || message.content);
    else bubble.textContent = message.content;
    if (message.failedPrompt) {
      var retry = create("button", "retry", "Try again");
      retry.type = "button";
      retry.addEventListener("click", function () {
        sendMessage(message.failedPrompt);
      });
      bubble.appendChild(retry);
    }
    wrap.appendChild(bubble);
    if (assistant && message.response) {
      renderCards(wrap, message.response.cards);
      renderSources(wrap, message.response.sources);
      renderSuggestions(wrap, message.response.suggestions);
    }
    row.appendChild(wrap);
    return row;
  };
  var renderConversation = function () {
    if (!conversation) return;
    conversation.replaceChildren();
    conversation.appendChild(
      create(
        "p",
        "chat-disclaimer",
        "Successive AI answers from published Successive content. Please verify important information using the linked sources.",
      ),
    );
    messages.forEach(function (message) {
      conversation.appendChild(renderMessage(message));
    });
    if (loading) {
      var row = create("div", "message-row assistant");
      var avatar = create("div", "avatar");
      avatar.innerHTML = icon(botIcon, 16);
      row.appendChild(avatar);
      var typing = create("div", "typing");
      typing.setAttribute("role", "status");
      typing.setAttribute("aria-label", "Assistant is thinking");
      typing.innerHTML = "<span></span><span></span><span></span>";
      row.appendChild(typing);
      conversation.appendChild(row);
    }
    conversation.scrollTop = conversation.scrollHeight;
  };
  var seenContent = function () {
    var seen = {};
    messages.forEach(function (message) {
      var response = message.response;
      if (!response) return;
      (response.sources || [])
        .concat(
          (response.cards || []).map(function (card) {
            return { title: card.title, url: card.url };
          }),
        )
        .forEach(function (item) {
          var url = item && validLink(item.url);
          if (url)
            seen[url.replace(/\/$/, "").toLowerCase()] = {
              title: item.title,
              url: url,
            };
        });
    });
    return Object.keys(seen)
      .map(function (key) {
        return seen[key];
      })
      .slice(-500);
  };
  var history = function () {
    return messages.slice(-10).map(function (message) {
      return {
        role: message.role,
        content: message.response?.answer || message.content,
      };
    });
  };
  var setLoading = function (value) {
    loading = value;
    if (input) input.disabled = value;
    if (sendButton)
      sendButton.disabled = value || !input || input.value.trim().length < 2;
    renderConversation();
  };
  var sendMessage = function (value) {
    var message = typeof value === "string" ? value.trim() : "";
    if (loading || message.length < 2 || message.length > 1000) return false;
    var requestHistory = history();
    var requestSeenContent = seenContent();
    messages.push({ role: "user", content: message });
    save();
    openWidget();
    setLoading(true);
    dispatch("message-submitted", {
      messageLengthCategory:
        message.length < 80
          ? "short"
          : message.length < 300
            ? "medium"
            : "long",
    });
    var startedAt = performance.now();
    fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        history: requestHistory,
        seenContent: requestSeenContent,
        sessionId: sessionId,
      }),
    })
      .then(function (response) {
        return response.json().then(function (json) {
          if (!response.ok || !json || !json.data)
            throw new Error(
              json?.error?.message || "I couldn’t complete that request.",
            );
          return json.data;
        });
      })
      .then(function (response) {
        messages.push({
          role: "assistant",
          content: response.answer,
          response: response,
        });
        save();
        if (!open) {
          unread.textContent = "1";
          unread.hidden = false;
        }
        dispatch("response-received", {
          durationCategory:
            performance.now() - startedAt < 6000 ? "normal" : "slow",
          hasCards: Array.isArray(response.cards) && response.cards.length > 0,
        });
      })
      .catch(function (error) {
        var networkFailure =
          error instanceof Error && /failed to fetch/i.test(error.message);
        messages.push({
          role: "assistant",
          content: networkFailure
            ? "The chat service could not be reached. If this is a local HTML test, make sure the chatbot server is running and refresh the page."
            : error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
          failedPrompt: message,
        });
        save();
        dispatch("error", { code: "API_ERROR" });
      })
      .finally(function () {
        setLoading(false);
      });
    return true;
  };
  var renderState = function () {
    if (!launcher || !panel) return;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute(
      "aria-label",
      open ? "Close " + config.title : config.buttonLabel,
    );
    launcher.innerHTML = icon(open ? closeIcon : chatIcon, 23);
    if (!open)
      launcher.appendChild(
        create("span", "successive-chat-label", config.buttonLabel),
      );
    panel.hidden = !open;
    root.classList.toggle("successive-chat-open", open);
  };
  var openWidget = function () {
    if (open) return;
    open = true;
    unread.textContent = "";
    unread.hidden = true;
    renderState();
    setPageLock(true);
    dispatch("open");
    window.setTimeout(function () {
      input?.focus();
    }, 0);
  };
  var closeWidget = function () {
    if (!open) return;
    open = false;
    renderState();
    setPageLock(false);
    dispatch("close");
  };
  var toggleWidget = function () {
    if (open) closeWidget();
    else openWidget();
  };
  var clearConversation = function () {
    messages = [{ role: "assistant", content: config.welcomeMessage }];
    save();
    renderConversation();
  };
  var bindPromptInput = function () {
    if (!config.promptInputId) return;
    var externalInput = document.getElementById(config.promptInputId);
    if (!externalInput || !("value" in externalInput)) return;
    var form = externalInput.form || externalInput.closest("form");
    var button = config.promptButtonId
      ? document.getElementById(config.promptButtonId)
      : null;
    var update = function () {
      if (button)
        button.disabled = String(externalInput.value || "").trim().length < 2;
    };
    var submit = function (event) {
      if (event) event.preventDefault();
      if (sendMessage(String(externalInput.value || "")))
        externalInput.value = "";
      update();
    };
    var keydown = function (event) {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      submit(event);
    };
    externalInput.addEventListener("input", update);
    externalInput.addEventListener("keydown", keydown);
    if (form) form.addEventListener("submit", submit);
    else if (button) button.addEventListener("click", submit);
    update();
    unbindPromptInput = function () {
      externalInput.removeEventListener("input", update);
      externalInput.removeEventListener("keydown", keydown);
      if (form) form.removeEventListener("submit", submit);
      else if (button) button.removeEventListener("click", submit);
    };
  };
  var destroy = function () {
    setPageLock(false);
    if (unbindPromptInput) unbindPromptInput();
    if (root) root.remove();
    if (style) style.remove();
    delete window.SuccessiveChat;
  };
  var css = function () {
    var side = config.position === "bottom-left" ? "left:20px" : "right:20px";
    var panelSide = config.position === "bottom-left" ? "left:0" : "right:0";
    var origin = config.position === "bottom-left" ? "left" : "right";
    return (
      "#successive-chat-widget-root{--kc-primary:" +
      config.primaryColor +
      ";--kc-dark:#0050a8;--kc-ink:#080b14;--kc-muted:#4a5565;--kc-line:#d9dee5;--kc-soft:#f7f8fa;position:fixed;bottom:max(20px,env(safe-area-inset-bottom));" +
      side +
      ";z-index:" +
      config.zIndex +
      ';font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--kc-ink);line-height:1.4}' +
      "#successive-chat-widget-root *{box-sizing:border-box}#successive-chat-widget-root button,#successive-chat-widget-root textarea{font:inherit}#successive-chat-widget-root svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
      ".successive-chat-launcher{margin-left:auto;display:flex;align-items:center;gap:9px;min-width:56px;height:56px;padding:0 18px;border:0;border-radius:999px;background:var(--kc-primary);color:#fff;box-shadow:0 12px 34px rgba(15,23,42,.28);font-weight:700;font-size:14px;cursor:pointer;transition:.18s}.successive-chat-launcher:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(15,23,42,.35)}" +
      ".successive-chat-panel{position:absolute;bottom:70px;" +
      panelSide +
      ";width:" +
      config.width +
      "px;height:" +
      config.height +
      "px;max-width:calc(100vw - 24px);max-height:calc(100vh - 104px);overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 24px 80px rgba(2,6,23,.3);transform-origin:bottom " +
      origin +
      ";animation:successive-chat-in .2s ease-out}.successive-chat-panel[hidden],.successive-chat-unread[hidden]{display:none}" +
      ".successive-chat-ui{width:100%;height:100%;min-height:0;background:#fff;display:flex;flex-direction:column;text-align:left;overflow:hidden}.successive-chat-ui .chat-header{min-height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;border:0;background:var(--kc-primary);color:" +
      foreground(config.primaryColor) +
      ";font-size:14px;font-weight:700}.chat-title,.chat-actions{display:flex;align-items:center;gap:9px}.online{width:8px;height:8px;border-radius:50%;background:#21b573;box-shadow:0 0 0 4px #ddf8eb}.chat-logo{max-width:28px;max-height:28px}.chat-actions button{min-height:34px;border:0;background:none;color:inherit;display:inline-flex;gap:6px;align-items:center;justify-content:center;vertical-align:middle;line-height:1;cursor:pointer;padding:8px;border-radius:8px}.chat-actions button svg{display:block;flex:0 0 auto}.chat-actions button span{display:block;line-height:1}.chat-actions button:hover{background:#ffffff20}" +
      ".conversation{flex:1;overflow:auto;padding:18px 15px;scrollbar-width:thin}.chat-disclaimer{margin:0 0 18px;color:var(--kc-muted);font-size:11px;line-height:1.5}.message-row{display:flex;width:100%;min-width:0;gap:11px;margin-bottom:24px;align-items:flex-start}.message-row.user{flex-direction:row-reverse}.avatar{width:32px;height:32px;flex:0 0 auto;border-radius:10px;display:grid;place-items:center;background:#eef0f5;color:#657086}.assistant .avatar{background:#e4f2ff;color:var(--kc-primary)}.message-wrap{min-width:0;max-width:90%}.message-author{margin:0 0 5px 2px;color:#344054;font-size:12px;font-weight:700}.user .message-wrap{display:flex;flex-direction:column;align-items:flex-end}.bubble{max-width:100%;overflow-wrap:anywhere;padding:12px 15px;border-radius:5px 16px 16px 16px;background:var(--kc-soft);line-height:1.6;font-size:15px}.user .bubble{background:var(--kc-primary);color:#fff;border-radius:16px 5px 16px 16px}.bubble p{margin:0 0 9px}.bubble p:last-child,.bubble ul:last-child{margin-bottom:0}.bubble h3{margin:14px 0 6px;color:#172033;font-size:14px}.bubble h3:first-child{margin-top:0}.bubble ul{padding-left:20px}.bubble a,.sources a{color:var(--kc-primary)}" +
      ".retry{display:block;margin-top:10px;border:1px solid #d6d9e2;border-radius:8px;background:white;padding:7px 11px;cursor:pointer;color:var(--kc-primary)}.card-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:13px;width:100%}.result-card{border:1px solid var(--kc-line);border-radius:14px;overflow:hidden;background:#fff;display:flex;flex-direction:column;min-width:0}.result-card>img{width:100%;height:128px;object-fit:cover;background:#edeff5}.result-content{padding:14px;display:flex;flex-direction:column;align-items:flex-start;flex:1}.badge{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:var(--kc-primary);background:#f0edff;padding:4px 7px;border-radius:5px}.result-content h3{font-size:15px;line-height:1.35;margin:9px 0 6px}.result-content p{font-size:12.5px;color:var(--kc-muted);line-height:1.5;margin:0 0 13px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.result-content>a{display:flex;gap:5px;align-items:center;color:var(--kc-primary);text-decoration:none;font-size:12px;font-weight:700;margin-top:auto}" +
      ".sources{margin-top:12px;font-size:12px;color:var(--kc-muted)}.sources summary{cursor:pointer}.sources div{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.sources a{display:flex;align-items:center;gap:4px;text-decoration:none}.suggestions{display:flex;flex-direction:column;margin-top:12px;overflow:hidden;border:1px solid var(--kc-line);border-radius:12px;background:#fff}.suggestions button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:0;border-bottom:1px solid var(--kc-line);color:#344054;background:transparent;font-size:13px;font-weight:600;text-align:left;cursor:pointer}.suggestions button:last-child{border-bottom:0}.suggestions button:hover{color:var(--kc-dark);background:#f6faff}" +
      ".input-area{width:100%;border-top:1px solid var(--kc-line);padding:15px 18px;display:flex;align-items:flex-end;gap:10px;background:#fff}.input-area textarea{min-width:0;border:1px solid #d9dce6;border-radius:12px;padding:11px 13px;resize:none;flex:1;min-height:44px;max-height:120px;outline:none}.input-area textarea:focus{border-color:var(--kc-primary);box-shadow:0 0 0 3px #d8ecff}.send{width:44px;height:44px;border:0;border-radius:12px;background:var(--kc-primary);color:#fff;display:grid;place-items:center;cursor:pointer}.send:disabled{opacity:.4;cursor:not-allowed}.typing{height:42px;padding:0 16px;display:flex;align-items:center;gap:4px;background:var(--kc-soft);border-radius:5px 16px 16px 16px}.typing span{width:6px;height:6px;border-radius:50%;background:#8b93a3;animation:successive-bounce 1.2s infinite}.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}" +
      ".successive-chat-unread{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border:2px solid #fff;border-radius:999px;background:#ef4444;color:#fff;font:700 11px/16px sans-serif;text-align:center}@keyframes successive-chat-in{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}@keyframes successive-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}" +
      "@media(max-width:640px){.successive-chat-label,.chat-actions button span{display:none}.successive-chat-launcher{width:56px;padding:0;justify-content:center}" +
      (config.mobileFullscreen
        ? ".successive-chat-panel{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;border-radius:0}"
        : "") +
      "}@media(prefers-reduced-motion:reduce){.successive-chat-panel,.successive-chat-launcher,.typing span{animation:none;transition:none}}"
    );
  };
  var init = function () {
    document.getElementById("successive-chat-widget-root")?.remove();
    document.getElementById("successive-chat-widget-styles")?.remove();
    try {
      sessionId = sessionStorage.getItem(sessionKey) || crypto.randomUUID();
      sessionStorage.setItem(sessionKey, sessionId);
      var saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (Array.isArray(saved)) messages = saved.slice(-100);
    } catch {
      sessionId = "session-" + Date.now().toString(36);
    }
    if (!messages.length)
      messages = [{ role: "assistant", content: config.welcomeMessage }];
    style = create("style");
    style.id = "successive-chat-widget-styles";
    style.textContent = css();
    document.head.appendChild(style);
    root = create("div");
    root.id = "successive-chat-widget-root";
    panel = create("div", "successive-chat-panel");
    panel.hidden = true;
    var chat = create("section", "successive-chat-ui");
    chat.setAttribute("aria-label", config.title);
    var header = create("div", "chat-header");
    var title = create("div", "chat-title");
    if (config.logoUrl) {
      var logo = create("img", "chat-logo");
      logo.src = config.logoUrl;
      logo.alt = "";
      title.appendChild(logo);
    } else title.appendChild(create("span", "online"));
    title.appendChild(document.createTextNode(config.title));
    var actions = create("div", "chat-actions");
    var clear = create("button");
    clear.type = "button";
    clear.setAttribute("aria-label", "Clear conversation");
    clear.title = "Clear conversation";
    clear.innerHTML = icon(trashIcon, 16);
    clear.appendChild(create("span", "", "Clear"));
    clear.addEventListener("click", clearConversation);
    var close = create("button");
    close.type = "button";
    close.title = "Close chat";
    close.setAttribute("aria-label", "Close chat");
    close.innerHTML = icon(closeIcon, 18);
    close.addEventListener("click", closeWidget);
    actions.appendChild(clear);
    actions.appendChild(close);
    header.appendChild(title);
    header.appendChild(actions);
    conversation = create("div", "conversation");
    conversation.setAttribute("aria-live", "polite");
    var inputArea = create("div", "input-area");
    input = create("textarea");
    input.rows = 1;
    input.maxLength = 1000;
    input.placeholder = "Ask Successive anything…";
    input.setAttribute("aria-label", "Message Successive assistant");
    sendButton = create("button", "send");
    sendButton.type = "button";
    sendButton.setAttribute("aria-label", "Send message");
    sendButton.innerHTML = icon(sendIcon, 18);
    var submit = function () {
      var value = input.value;
      if (sendMessage(value)) input.value = "";
      sendButton.disabled = loading || input.value.trim().length < 2;
    };
    input.addEventListener("input", function () {
      sendButton.disabled = loading || input.value.trim().length < 2;
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    });
    sendButton.addEventListener("click", submit);
    sendButton.disabled = true;
    inputArea.appendChild(input);
    inputArea.appendChild(sendButton);
    chat.appendChild(header);
    chat.appendChild(conversation);
    chat.appendChild(inputArea);
    panel.appendChild(chat);
    launcher = create("button", "successive-chat-launcher");
    launcher.type = "button";
    launcher.style.color = foreground(config.primaryColor);
    launcher.addEventListener("click", toggleWidget);
    unread = create("span", "successive-chat-unread");
    unread.hidden = true;
    root.appendChild(panel);
    root.appendChild(launcher);
    root.appendChild(unread);
    var mountContainer = config.containerId
      ? document.getElementById(config.containerId)
      : null;
    var externalInput = config.promptInputId
      ? document.getElementById(config.promptInputId)
      : null;
    var externalButton = config.promptButtonId
      ? document.getElementById(config.promptButtonId)
      : null;
    if (
      mountContainer &&
      ((externalInput && mountContainer.contains(externalInput)) ||
        (externalButton && mountContainer.contains(externalButton)))
    )
      mountContainer = null;
    (mountContainer || document.body).appendChild(root);
    renderConversation();
    renderState();
    bindPromptInput();
    dispatch("ready");
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
