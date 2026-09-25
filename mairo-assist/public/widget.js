/*
 * Mairo Assist storefront chat widget.
 * Loaded on the merchant's Shopify store. Talks to Mairo Assist only through
 * the store's App Proxy (same origin, signed by Shopify), so no keys or
 * secrets are ever in this file. Renders in a Shadow DOM so the store's CSS
 * can't break it, and never inserts untrusted text as HTML.
 */
(function () {
  "use strict";
  if (window.__mairoAssist) return;
  window.__mairoAssist = true;

  var script =
    document.currentScript ||
    Array.prototype.slice.call(document.getElementsByTagName("script")).filter(function (s) {
      return /\/widget\.js(\?|$)/.test(s.src);
    })[0];
  var proxy = "/apps/mairo-assist";
  try {
    var p = new URL(script.src).searchParams.get("proxy");
    if (p && /^\/[A-Za-z0-9/_-]+$/.test(p)) proxy = p;
  } catch (e) {}
  var API = proxy.replace(/\/+$/, "");

  var store = {
    get: function (k) {
      try { return window.localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(k, v); } catch (e) {}
    },
  };

  function randomSecret() {
    var bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += ("0" + bytes[i].toString(16)).slice(-2);
    return s;
  }
  var visitor = store.get("mairo_assist_visitor");
  if (!visitor || !/^[A-Za-z0-9_-]{24,100}$/.test(visitor)) {
    visitor = randomSecret();
    store.set("mairo_assist_visitor", visitor);
  }
  var conversation = store.get("mairo_assist_conversation");

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function safeUrl(u) {
    try {
      var x = new URL(u, window.location.href);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : null;
    } catch (e) { return null; }
  }
  function validColor(c) {
    return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#7c5cff";
  }

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}" +
    ".wrap{position:fixed;bottom:20px;z-index:2147483000}" +
    ".wrap.right{right:20px}.wrap.left{left:20px}" +
    ".bubble{width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px -6px rgba(20,10,60,.55),0 0 0 1px rgba(255,255,255,.12) inset;transition:transform .2s}" +
    ".bubble:hover{transform:translateY(-2px) scale(1.03)}" +
    ".bubble svg{width:28px;height:28px}" +
    ".panel{position:absolute;bottom:76px;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 110px);background:#0a0e20;color:#eef0fb;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 60px -12px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}" +
    ".wrap.right .panel{right:0}.wrap.left .panel{left:0}" +
    ".head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}" +
    ".avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;color:#fff}" +
    ".title{flex:1;min-width:0}.title b{display:block;font-size:14px}.title span{font-size:11px;color:#a4acc9}" +
    ".x{background:none;border:0;color:#a4acc9;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:8px}.x:hover{background:rgba(255,255,255,.06)}" +
    ".msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}" +
    ".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".m.customer{align-self:flex-end;color:#fff;border-bottom-right-radius:4px}" +
    ".m.ai,.m.team,.m.system{align-self:flex-start;background:rgba(255,255,255,.07);border-bottom-left-radius:4px}" +
    ".who{font-size:10px;color:#a4acc9;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em}" +
    ".cards{display:flex;flex-direction:column;gap:8px;align-self:flex-start;width:85%}" +
    ".card{display:flex;gap:10px;align-items:center;padding:8px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:#070a18;color:#eef0fb;text-decoration:none}" +
    ".card img{width:48px;height:48px;border-radius:8px;object-fit:cover;background:#151b36;flex:none}" +
    ".card .ct{flex:1;min-width:0}.card .ct b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card .ct span{font-size:12px;color:#a4acc9}" +
    ".card .go{font-size:12px;padding:5px 9px;border-radius:8px;color:#fff}" +
    ".typing{align-self:flex-start;display:flex;gap:4px;padding:12px;background:rgba(255,255,255,.07);border-radius:14px}" +
    ".typing i{width:6px;height:6px;border-radius:50%;background:#a4acc9;animation:b 1.2s infinite}" +
    ".typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes b{0%,80%,100%{opacity:.35;transform:none}40%{opacity:1;transform:translateY(-3px)}}" +
    "@media (prefers-reduced-motion:reduce){.typing i{animation:none}.bubble{transition:none}}" +
    ".notice{font-size:12px;color:#a4acc9;text-align:center;padding:6px 12px}" +
    ".form{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.08)}" +
    ".form textarea{flex:1;resize:none;height:42px;max-height:120px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#070a18;color:#eef0fb;font-size:14px;outline:none}" +
    ".form textarea:focus{border-color:#3aa0ff}" +
    ".send{border:0;border-radius:12px;padding:0 14px;color:#fff;font-weight:600;cursor:pointer}.send:disabled{opacity:.5;cursor:default}" +
    ".foot{font-size:10px;color:#6f7898;text-align:center;padding:0 0 8px}" +
    ".err{font-size:12px;color:#f87171;padding:0 12px 8px}" +
    "@media (max-width:480px){.wrap{bottom:14px}.wrap.right{right:14px}.wrap.left{left:14px}.panel{position:fixed;inset:0;width:100vw;max-width:none;height:100%;max-height:none;border-radius:0}}";

  var BOT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>';

  function start(cfg) {
    var color = validColor(cfg.brandColor);
    var host = el("div", { id: "mairo-assist-widget" });
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.appendChild(el("style", { text: CSS }));

    var wrap = el("div", { class: "wrap " + (cfg.position === "bottom-left" ? "left" : "right") });
    var bubble = el("button", { class: "bubble", type: "button", "aria-label": "Chat with " + cfg.name + " (AI assistant)", "aria-expanded": "false" });
    bubble.style.background = "linear-gradient(135deg," + color + ",#3aa0ff)";
    bubble.innerHTML = BOT_SVG; // constant markup, no user data

    var panel = el("div", { class: "panel", role: "dialog", "aria-label": "Chat with " + cfg.name });
    panel.hidden = true;
    var avatar = el("div", { class: "avatar", text: (cfg.name || "A").charAt(0).toUpperCase() });
    avatar.style.background = "linear-gradient(135deg," + color + ",#3aa0ff)";
    var close = el("button", { class: "x", type: "button", "aria-label": "Close chat", text: "×" });
    var head = el("div", { class: "head" }, [avatar, el("div", { class: "title" }, [el("b", { text: cfg.name }), el("span", { text: "AI assistant · " + cfg.businessName })]), close]);
    var msgs = el("div", { class: "msgs", "aria-live": "polite" });
    var notice = el("div", { class: "notice" });
    notice.hidden = true;
    var err = el("div", { class: "err", role: "alert" });
    err.hidden = true;
    var input = el("textarea", { "aria-label": "Message", placeholder: "Ask about products, shipping, returns…", maxlength: "2000", rows: "1" });
    var send = el("button", { class: "send", type: "submit", text: "Send" });
    send.style.background = color;
    var form = el("form", { class: "form" }, [input, send]);
    var foot = el("div", { class: "foot", text: "Powered by Mairo Assist · AI answers may need checking" });
    panel.appendChild(head);
    panel.appendChild(msgs);
    panel.appendChild(notice);
    panel.appendChild(err);
    panel.appendChild(form);
    panel.appendChild(foot);
    wrap.appendChild(panel);
    wrap.appendChild(bubble);
    root.appendChild(wrap);

    var state = { messages: [], typing: false, withTeam: false, pending: [], timer: null, open: false };

    function render() {
      msgs.textContent = "";
      var welcome = el("div", { class: "m ai" }, [el("div", { class: "who", text: cfg.name }), document.createTextNode(cfg.welcomeMessage || "Hi! How can I help?")]);
      msgs.appendChild(welcome);
      state.messages.concat(state.pending).forEach(function (m) {
        var who = m.from === "customer" ? null : m.from === "team" ? "Team" : m.from === "system" ? null : cfg.name;
        var bubbleEl = el("div", { class: "m " + m.from }, [who ? el("div", { class: "who", text: who }) : null, document.createTextNode(m.text)]);
        if (m.from === "customer") bubbleEl.style.background = color;
        msgs.appendChild(bubbleEl);
        if (m.cards && m.cards.length) {
          var cards = el("div", { class: "cards" });
          m.cards.slice(0, 4).forEach(function (c) {
            var url = safeUrl(c.url);
            var img = safeUrl(c.image);
            var go = el("span", { class: "go", text: "View" });
            go.style.background = color;
            var card = el(url ? "a" : "div", url ? { class: "card", href: url } : { class: "card" }, [
              img ? el("img", { src: img, alt: "", loading: "lazy" }) : el("img", { alt: "" }),
              el("div", { class: "ct" }, [el("b", { text: c.title || "" }), el("span", { text: c.price || "" })]),
              url ? go : null,
            ]);
            cards.appendChild(card);
          });
          msgs.appendChild(cards);
        }
      });
      if (state.typing || (state.pending.length && !state.withTeam)) {
        msgs.appendChild(el("div", { class: "typing", "aria-label": cfg.name + " is typing" }, [el("i"), el("i"), el("i")]));
      }
      notice.hidden = !state.withTeam;
      notice.textContent = state.withTeam ? "You're now chatting with the " + cfg.businessName + " team." : "";
      msgs.scrollTop = msgs.scrollHeight;
    }

    function qs(extra) {
      var p = new URLSearchParams({ visitor: visitor });
      if (conversation) p.set("conversation", conversation);
      for (var k in extra || {}) p.set(k, extra[k]);
      return p.toString();
    }

    function poll() {
      if (!conversation) return schedule();
      fetch(API + "/messages?" + qs(), { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.messages) {
            var customerCount = data.messages.filter(function (m) { return m.from === "customer"; }).length;
            var seen = state.messages.filter(function (m) { return m.from === "customer"; }).length;
            state.pending = state.pending.slice(Math.max(0, customerCount - seen));
            state.messages = data.messages;
            state.typing = data.typing;
            state.withTeam = data.withTeam;
            render();
          }
        })
        .catch(function () {})
        .then(schedule);
    }
    function schedule() {
      clearTimeout(state.timer);
      if (!state.open) return;
      var busy = state.typing || state.pending.length > 0;
      state.timer = setTimeout(poll, busy ? 1500 : 6000);
    }

    function setOpen(open) {
      state.open = open;
      panel.hidden = !open;
      bubble.setAttribute("aria-expanded", String(open));
      if (open) {
        render();
        poll();
        setTimeout(function () { input.focus(); }, 30);
      } else {
        clearTimeout(state.timer);
        bubble.focus();
      }
    }

    bubble.addEventListener("click", function () { setOpen(!state.open); });
    close.addEventListener("click", function () { setOpen(false); });
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text || send.disabled) return;
      send.disabled = true;
      err.hidden = true;
      state.pending.push({ from: "customer", text: text, cards: [] });
      input.value = "";
      render();
      fetch(API + "/messages?" + qs(), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ visitor: visitor, conversation: conversation, text: text }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.d && res.d.message) || "Message not sent. Please try again.");
          conversation = res.d.conversationId;
          store.set("mairo_assist_conversation", conversation);
          poll();
        })
        .catch(function (e2) {
          state.pending.pop();
          input.value = text;
          err.textContent = e2.message || "Message not sent. Please try again.";
          err.hidden = false;
          render();
        })
        .then(function () { send.disabled = false; });
    });
  }

  function boot() {
    fetch(API + "/config", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) { if (cfg && cfg.enabled) start(cfg); })
      .catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
