import { ArrowRight, Bot, CheckCircle2, ClipboardCheck, PlayCircle, Truck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { JeansArt } from "./product-art";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pt-40">
      <div className="starfield pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-violet/20 blur-[120px]" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-7 text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-xs text-violet-glow">
            <Bot className="size-3.5" aria-hidden /> Your AI sales &amp; customer service employee
          </span>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-gradient">Your Business Never Stops.</span>
            <br />
            Neither Should Your AI Employee.
          </h1>
          <p className="mx-auto max-w-xl text-lg text-fg-muted lg:mx-0">
            Meet your new AI sales and customer service assistant. Turn customer questions into sales, manage orders, and
            provide support around the clock.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <ButtonLink href="/signup" size="lg">
              Get Started <ArrowRight aria-hidden />
            </ButtonLink>
            <ButtonLink href="#demo" size="lg" variant="secondary">
              <PlayCircle aria-hidden /> Watch Demo
            </ButtonLink>
          </div>
          <p className="text-xs text-fg-subtle">Built for Shopify stores · You approve every refund, return and exchange</p>
        </div>

        <HeroConsole />
      </div>
    </section>
  );
}

/** Illustration of the AI employee at work. Uses made-up sample content. */
function HeroConsole() {
  return (
    <figure className="relative mx-auto w-full max-w-md animate-fade-up lg:max-w-none">
      <div className="glass glow-ring relative rounded-3xl p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet to-electric text-sm font-semibold">N</span>
            <div>
              <p className="text-sm font-medium">Nova</p>
              <p className="flex items-center gap-1.5 text-[11px] text-success">
                <span className="size-1.5 animate-pulse-soft rounded-full bg-success" /> AI employee · on shift
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-subtle">Live console</span>
        </div>

        <div className="space-y-3">
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-electric/20 px-3.5 py-2 text-sm">Do you have black baggy jeans?</div>
          <div className="max-w-[88%] space-y-2 rounded-2xl rounded-bl-sm bg-white/[0.06] px-3.5 py-2.5 text-sm">
            <p>Yes! Here&apos;s our best match — it&apos;s in stock in your size.</p>
            <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-900/70 p-2">
              <JeansArt color="#1c1f2b" shade="#0f111a" className="size-12 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">Midnight Baggy Denim</p>
                <p className="text-[11px] text-fg-muted">$68 · 28–36</p>
              </div>
              <span className="rounded-lg bg-violet/20 px-2 py-1 text-[11px] text-violet-glow">View</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-xs">
            <Truck className="size-4 shrink-0 text-electric" aria-hidden />
            <span><span className="text-fg">Order #1042</span> <span className="text-fg-muted">· tracking shared</span></span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2.5 text-xs">
            <ClipboardCheck className="size-4 shrink-0 text-warning" aria-hidden />
            <span><span className="text-fg">Exchange request</span> <span className="text-fg-muted">· needs you</span></span>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -top-4 hidden animate-float items-center gap-2 rounded-xl border border-success/25 bg-ink-850/90 px-3 py-2 text-xs shadow-xl sm:flex">
        <CheckCircle2 className="size-4 text-success" aria-hidden /> Question resolved
      </div>
      <figcaption className="mt-3 text-center text-[11px] text-fg-subtle">Illustration with sample store content</figcaption>
    </figure>
  );
}
