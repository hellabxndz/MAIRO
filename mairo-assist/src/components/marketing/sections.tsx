import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Inbox,
  MessageCircle,
  Package,
  Palette,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { formatPlanPrice, PLAN_LIST } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl space-y-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-glow">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="text-fg-muted">{children}</p>}
    </div>
  );
}

export function WhatIs() {
  const chatbot = [
    "Answers from a fixed script",
    "Guesses about products and stock",
    "Can't see orders or tracking",
    "Dead-ends customers who need help",
  ];
  const assist = [
    "Knows your real catalog, prices and inventory",
    "Securely looks up a customer's own order",
    "Collects returns and exchanges for your approval",
    "Hands off to your team when it should",
  ];
  return (
    <section id="what-is" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="What is Mairo Assist?" title="An AI employee, not another chatbot">
          Mairo Assist works the front desk of your online store: it helps shoppers buy, answers support questions and
          handles order requests — using your store&apos;s real information, under rules you control.
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white/[0.02] p-6">
            <p className="mb-4 flex items-center gap-2 font-medium text-fg-muted">
              <MessageCircle className="size-4" aria-hidden /> Traditional chatbot
            </p>
            <ul className="space-y-3">
              {chatbot.map((t) => (
                <li key={t} className="flex gap-3 text-sm text-fg-muted">
                  <X className="mt-0.5 size-4 shrink-0 text-danger/70" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass glow-ring rounded-2xl p-6">
            <p className="mb-4 flex items-center gap-2 font-medium">
              <Bot className="size-4 text-violet-glow" aria-hidden /> Mairo Assist
            </p>
            <ul className="space-y-3">
              {assist.map((t) => (
                <li key={t} className="flex gap-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: ShoppingCart, title: "AI Sales Assistant", text: "Helps shoppers find the right product, size and color — and points them to checkout." },
  { icon: Clock, title: "24/7 Customer Support", text: "Answers shipping, returns and product questions any time, from your own policies." },
  { icon: Package, title: "Order Management", text: "Securely verifies customers before sharing order status and real tracking links." },
  { icon: Sparkles, title: "Product Recommendations", text: "Suggests alternatives, matching items and upgrades that are actually available." },
  { icon: Inbox, title: "Customer Inbox", text: "Every conversation in one place. Take over any chat with one click." },
  { icon: Palette, title: "AI Employee Customization", text: "Name, personality, tone and instructions — preview before anything goes live." },
  { icon: BarChart3, title: "Analytics", text: "Real conversations, leads and order requests. No inflated numbers." },
  { icon: ShoppingBag, title: "Shopify Integration", text: "Connects through Shopify's official authorization. Never your password." },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="Features" title="Everything your front desk does — around the clock" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="glass group rounded-2xl p-5 transition-colors hover:border-violet/30">
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet/25 to-electric/20 ring-1 ring-violet/25">
                <Icon className="size-5 text-violet-glow" aria-hidden />
              </div>
              <h3 className="mb-1.5 font-medium">{title}</h3>
              <p className="text-sm text-fg-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "Create your business account", text: "Tell us about your business in a couple of minutes." },
  { title: "Connect your online store", text: "Approve read access on Shopify's own screen." },
  { title: "Customize your AI employee", text: "Pick a name, a personality and your house rules." },
  { title: "Activate your AI", text: "Test it in preview, then switch it on in your theme editor." },
  { title: "Monitor conversations and activity", text: "Watch it work, step in any time, approve what matters." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="How it works" title="Hire in an afternoon. No code." />
        <ol className="grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-line bg-white/[0.02] p-5">
              <span className="mb-4 flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-violet to-electric text-sm font-semibold">{i + 1}</span>
              <h3 className="mb-1 text-sm font-medium">{s.title}</h3>
              <p className="text-xs text-fg-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL;

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="Pricing" title="Less than a part-time hire">
          Simple monthly plans. Change or cancel any time.
        </SectionHeading>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_LIST.map((plan) => {
            const featured = plan.key === "growth";
            return (
              <div key={plan.key} className={cn("relative flex flex-col rounded-2xl p-6", featured ? "glass glow-ring" : "border border-line bg-white/[0.02]")}>
                {featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-violet to-electric px-3 py-0.5 text-xs font-medium">Most popular</span>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 min-h-10 text-sm text-fg-muted">{plan.tagline}</p>
                <p className="mt-4 text-3xl font-semibold tracking-tight">
                  {formatPlanPrice(plan)}
                  <span className="text-sm font-normal text-fg-muted">/month</span>
                </p>
                {plan.customPricing && <p className="text-xs text-fg-subtle">Custom pricing</p>}
                {plan.inherits && <p className="mt-4 text-xs font-medium text-fg-muted">Everything in {plan.inherits[0].toUpperCase() + plan.inherits.slice(1)}, plus:</p>}
                <ul className={cn("flex-1 space-y-2 text-sm", plan.inherits ? "mt-2" : "mt-4")}>
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-violet-glow" aria-hidden /> {h}
                    </li>
                  ))}
                </ul>
                <ButtonLink href={plan.selfServe || !SALES_EMAIL ? "/signup" : `mailto:${SALES_EMAIL}`} variant={featured ? "primary" : "secondary"} className="mt-6">
                  {plan.selfServe ? "Get Started" : "Talk to us"}
                </ButtonLink>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: "What does Mairo Assist do?",
    a: "It's an AI employee for your online store. It chats with shoppers on your website, answers product and policy questions, recommends products that are actually available, looks up orders for verified customers, and collects return, exchange and refund requests for your approval.",
  },
  {
    q: "How does the Shopify integration work?",
    a: "You connect your store through Shopify's official authorization screen and approve exactly what Mairo Assist can read — products, inventory, orders and fulfillment. We never ask for your Shopify password, and you can disconnect at any time. The chat widget is switched on from your Shopify theme editor.",
  },
  {
    q: "Can I control what the AI says?",
    a: "Yes. You set its name, personality, tone and instructions, test it in a private preview, and publish when you're happy. You can pause it instantly, take over any conversation, and restore earlier versions of its instructions.",
  },
  {
    q: "Can the AI manage orders?",
    a: "It can look up a customer's own order after secure verification and share real status and tracking information. It never refunds, cancels or changes an order by itself: those requests go to your approval center, and only an authorized person on your team can approve them.",
  },
  {
    q: "Does it replace my employees?",
    a: "It handles the repetitive questions so your team doesn't have to, and escalates to a person whenever a customer asks or a situation needs judgment. Most businesses use it to cover nights, weekends and busy periods.",
  },
  {
    q: "How does billing work?",
    a: "Plans are billed monthly and you can change or cancel at any time. If you install Mairo Assist from the Shopify App Store, the charge appears on your Shopify bill — you're never billed twice for the same plan. Each plan includes a monthly AI usage allowance, and we tell you before you reach it.",
  },
  {
    q: "Is my customers' information secure?",
    a: "Each business's data is isolated from every other business at the database level. Store credentials are encrypted and never reach the browser, customers must verify before seeing order details, and we keep only the customer information the product needs. Every important admin action is logged.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-3xl px-5">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-line bg-white/[0.02] open:bg-white/[0.04]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-fg-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-5">
        <div className="glass glow-ring relative overflow-hidden rounded-3xl px-6 py-16 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_50%_0%,rgb(124_92_255/0.3),transparent)]" aria-hidden />
          <div className="relative space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Your Next Employee <span className="text-gradient">Is AI.</span>
            </h2>
            <p className="mx-auto max-w-xl text-fg-muted">Set up in minutes. Stays on shift while you sleep.</p>
            <ButtonLink href="/signup" size="lg">
              Hire Your AI Employee <ArrowRight aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
