"use client";

import { Bot, ClipboardCheck, RotateCcw, Send, ShieldCheck, Truck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { JacketArt, JeansArt } from "./product-art";

/*
 * Scripted demo using a made-up SAMPLE store. Nothing here is real merchant
 * inventory, and no AI model is called: it shows how the product behaves.
 */

type Product = { name: string; price: string; sizes: string; stock: string; art: "black" | "indigo" | "washed" | "jacket" };
type Card =
  | { kind: "products"; items: Product[] }
  | { kind: "verify" }
  | { kind: "order" }
  | { kind: "approval" }
  | { kind: "handoff" };
type Msg = { from: "customer" | "ai"; text: string; card?: Card };

const SAMPLE_STORE = "Northside Denim";

const SCENARIOS: { prompt: string; replies: Msg[] }[] = [
  {
    prompt: "Do you have these jeans in size 32?",
    replies: [
      { from: "ai", text: "Let me check that for you." },
      {
        from: "ai",
        text: "Good news — the Classic Straight Jean is in stock in a 32. Here it is:",
        card: { kind: "products", items: [{ name: "Classic Straight Jean", price: "$64", sizes: "28 · 30 · 32 · 34 · 36", stock: "Size 32 in stock", art: "indigo" }] },
      },
    ],
  },
  {
    prompt: "Do you have black baggy jeans?",
    replies: [
      { from: "ai", text: "Let me check what we have available." },
      {
        from: "ai",
        text: "I found two that match. The Midnight Baggy is the closest fit to what you described.",
        card: {
          kind: "products",
          items: [
            { name: "Midnight Baggy Denim", price: "$68", sizes: "28 – 36", stock: "In stock", art: "black" },
            { name: "Washed Black Wide Leg", price: "$72", sizes: "30 – 34", stock: "Low stock", art: "washed" },
          ],
        },
      },
      { from: "ai", text: "Want a jacket to match? The Utility Denim Jacket pairs well with both." },
    ],
  },
  {
    prompt: "Where is my order?",
    replies: [
      { from: "ai", text: "I can help with that. Let's securely verify your order first.", card: { kind: "verify" } },
      { from: "ai", text: "Thanks — you're verified. Your order has shipped. Here's your tracking link:", card: { kind: "order" } },
    ],
  },
  {
    prompt: "I want to exchange my jeans.",
    replies: [
      { from: "ai", text: "No problem. Your order #1042 is within the 30-day exchange window, and size 34 is available." },
      { from: "ai", text: "I've sent your exchange request to the team for approval. You'll get an email once they decide.", card: { kind: "approval" } },
    ],
  },
  {
    prompt: "I need to speak to a real person.",
    replies: [{ from: "ai", text: "Of course. I've let the team know — a person will pick this up from here.", card: { kind: "handoff" } }],
  },
];

const ART = {
  black: <JeansArt color="#1c1f2b" shade="#0f111a" className="size-full" />,
  indigo: <JeansArt color="#2f4a86" shade="#223564" className="size-full" />,
  washed: <JeansArt color="#3a3d4a" shade="#26283a" className="size-full" />,
  jacket: <JacketArt className="size-full" />,
};

function CardView({ card }: { card: Card }) {
  if (card.kind === "products") {
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {card.items.map((p) => (
          <div key={p.name} className="overflow-hidden rounded-xl border border-line bg-ink-900/80">
            <div className="aspect-[4/3] w-full">{ART[p.art]}</div>
            <div className="space-y-1 p-3">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-fg-muted">{p.price} · Sizes {p.sizes}</p>
              <p className={cn("text-xs", p.stock === "Low stock" ? "text-warning" : "text-success")}>{p.stock}</p>
              <span className="mt-1 inline-block rounded-lg bg-violet/20 px-2.5 py-1 text-xs text-violet-glow">View product</span>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (card.kind === "verify") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-ink-900/80 p-3 text-xs text-fg-muted">
        <ShieldCheck className="size-4 shrink-0 text-electric" aria-hidden />
        We emailed a 6-digit code to the address on the order. Order details are only shared after it&apos;s entered.
      </div>
    );
  }
  if (card.kind === "order") {
    return (
      <div className="mt-2 space-y-1.5 rounded-xl border border-line bg-ink-900/80 p-3 text-xs">
        <p className="flex items-center gap-2 font-medium"><Truck className="size-4 text-electric" aria-hidden /> Order #1042 · Shipped</p>
        <p className="text-fg-muted">Carrier: SampleShip · Tracking SS-000-DEMO</p>
        <span className="inline-block rounded-lg bg-electric/15 px-2.5 py-1 text-electric">Track package</span>
      </div>
    );
  }
  if (card.kind === "approval") {
    return (
      <div className="mt-2 space-y-1 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
        <p className="flex items-center gap-2 font-medium"><ClipboardCheck className="size-4 text-warning" aria-hidden /> Exchange request · Awaiting approval</p>
        <p className="text-fg-muted">Black Denim 32 → Black Denim 34 · Availability verified</p>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-ink-900/80 p-3 text-xs text-fg-muted">
      <UserRound className="size-4 text-violet-glow" aria-hidden /> Conversation handed to a person. The AI has stopped replying.
    </div>
  );
}

export function InteractiveDemo() {
  const [messages, setMessages] = useState<Msg[]>([
    { from: "ai", text: `Hey! Need help finding something? I'm the AI assistant for ${SAMPLE_STORE}.` },
  ]);
  const [typing, setTyping] = useState(false);
  const timers = useRef<number[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const ask = (index: number) => {
    if (typing) return;
    const scenario = SCENARIOS[index];
    setMessages((m) => [...m, { from: "customer", text: scenario.prompt }]);
    let delay = 350;
    scenario.replies.forEach((reply, i) => {
      timers.current.push(window.setTimeout(() => setTyping(true), delay));
      delay += 900 + Math.min(reply.text.length * 12, 900);
      timers.current.push(
        window.setTimeout(() => {
          setMessages((m) => [...m, reply]);
          setTyping(i < scenario.replies.length - 1);
        }, delay),
      );
      delay += 250;
    });
  };

  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setTyping(false);
    setMessages([{ from: "ai", text: `Hey! Need help finding something? I'm the AI assistant for ${SAMPLE_STORE}.` }]);
  };

  return (
    <section id="demo" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-glow">Interactive demo</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Talk to an AI employee</h2>
          <p className="text-fg-muted">Pick a question a real shopper might ask and watch how it responds.</p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-3">
            <p className="text-sm font-medium">Try asking:</p>
            <div className="grid gap-2">
              {SCENARIOS.map((s, i) => (
                <button
                  key={s.prompt}
                  type="button"
                  onClick={() => ask(i)}
                  disabled={typing}
                  className="rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-left text-sm transition-colors hover:border-violet/40 hover:bg-violet/10 disabled:opacity-50"
                >
                  “{s.prompt}”
                </button>
              ))}
            </div>
            <p className="rounded-xl border border-warning/25 bg-warning/5 p-3 text-xs text-fg-muted">
              <strong className="text-fg">Demo only:</strong> this uses a made-up sample store ({SAMPLE_STORE}). The products,
              stock and order shown are sample data — not real merchant inventory — and replies are scripted.
            </p>
          </div>

          <div className="glass glow-ring overflow-hidden rounded-3xl">
            <div className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-violet/30 to-electric/20 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">N</span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Nova</p>
                <p className="flex items-center gap-1 text-[11px] text-fg-muted"><Bot className="size-3" aria-hidden /> AI assistant · {SAMPLE_STORE} (sample)</p>
              </div>
              <button type="button" onClick={reset} className="rounded-lg p-2 text-fg-muted hover:bg-white/10 hover:text-fg" aria-label="Restart demo">
                <RotateCcw className="size-4" />
              </button>
            </div>
            <div ref={scroller} className="h-[440px] space-y-3 overflow-y-auto p-4" aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex animate-fade-up", m.from === "customer" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm",
                      m.from === "customer" ? "rounded-br-sm bg-electric/25" : "rounded-bl-sm bg-white/[0.06]",
                    )}
                  >
                    {m.text}
                    {m.card && <CardView card={m.card} />}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-white/[0.06] px-4 py-3" style={{ width: "fit-content" }} aria-label="AI is typing">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-1.5 animate-typing rounded-full bg-fg-muted" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-line px-3 py-3">
              <div className="h-10 flex-1 rounded-full bg-white/5 px-4 text-sm leading-10 text-fg-subtle">Choose a question on the left…</div>
              <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-r from-violet to-electric" aria-hidden>
                <Send className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
