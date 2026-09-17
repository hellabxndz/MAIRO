import Link from "next/link";
import type { ReactNode } from "react";

// The MAIRO component kit.
//
// Everything visual in the product is assembled from these, and they read their
// colour, radius and glow from the tokens in globals.css rather than carrying
// their own. That is the difference between a design system and a folder of
// components that happen to look similar: change the ramp in one place and the
// primary button, the headline and the intelligence core all move together.
//
// Server components. None of these need state, so none of them ship JavaScript.

/* ------------------------------------------------------------------ button */

type ButtonTone = "primary" | "ghost" | "quiet";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2.5 rounded-full text-[13px] font-medium " +
  "transition-all duration-300 [transition-timing-function:var(--ease-mairo)] " +
  "disabled:pointer-events-none disabled:opacity-45";

const BUTTON_SIZE = "px-6 py-3 sm:px-7 sm:py-3.5";

/**
 * The one button in the product.
 *
 * Three tones, and the hierarchy between them is the whole point: `primary`
 * carries the ramp and the key glow and there should be one per screen;
 * `ghost` is the hairline alternative that sits beside it; `quiet` is a text
 * action that happens to be clickable. A screen with two primaries has no
 * primary.
 */
export function MairoButton({
  children,
  href,
  tone = "primary",
  className = "",
  type = "button",
  ...rest
}: {
  children: ReactNode;
  href?: string;
  tone?: ButtonTone;
  className?: string;
  type?: "button" | "submit";
} & Record<string, unknown>) {
  const tones: Record<ButtonTone, string> = {
    primary: "text-white hover:brightness-110",
    ghost:
      "text-white/85 border border-[color:var(--mairo-line)] bg-white/[0.02] " +
      "hover:border-[color:var(--mairo-line-lit)] hover:bg-white/[0.05] hover:text-white",
    quiet: "text-muted hover:text-white",
  };

  const style =
    tone === "primary"
      ? { backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }
      : undefined;

  const cls = `${BUTTON_BASE} ${tone === "quiet" ? "px-1 py-1" : BUTTON_SIZE} ${tones[tone]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={cls} style={style} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} style={style} {...rest}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- glass */

/**
 * A holographic panel.
 *
 * A translucent fill, a hairline, and a soft shadow — and deliberately no
 * backdrop-filter. See the note in globals.css: it cannot sample a fixed
 * backdrop on mobile browsers and paints the panel as an opaque black
 * rectangle, which is a bug this product has already shipped once.
 *
 * `lit` raises the border and adds the interactive glow. Use it for the panel
 * the screen is about, not for all of them.
 */
export function GlassPanel({
  children,
  className = "",
  lit = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  lit?: boolean;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Tag
      className={`relative overflow-hidden rounded-[var(--radius-panel)] border ${className}`}
      style={{
        backgroundImage: "var(--mairo-glass)",
        borderColor: lit ? "var(--mairo-line-lit)" : "var(--mairo-line)",
        boxShadow: lit ? "var(--mairo-glow-lift)" : "var(--mairo-glow-soft)",
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * A panel that lifts and lights its border on hover.
 *
 * Separated from GlassPanel rather than being a prop on it because the hover
 * treatment only makes sense on something you can actually click, and putting
 * it on a static panel is how an interface starts lying about what is
 * interactive.
 */
export function MairoCard({
  children,
  href,
  className = "",
  lit = false,
}: {
  children: ReactNode;
  href?: string;
  className?: string;
  /**
   * The lit edge from the reference renders: a brighter border and a blue cast
   * on the shadow. For a card that is meant to glow as part of a composition,
   * not for every card on a dense screen — if they all glow, none of them does.
   */
  lit?: boolean;
}) {
  const inner = (
    <div
      className={
        "group relative h-full overflow-hidden rounded-[var(--radius-card)] border " +
        "transition-all duration-500 [transition-timing-function:var(--ease-mairo)] " +
        "hover:-translate-y-0.5 " +
        className
      }
      style={{
        backgroundImage: lit
          ? "linear-gradient(158deg, rgba(28,48,104,0.58), rgba(9,15,36,0.72))"
          : "var(--mairo-glass)",
        borderColor: lit ? "rgba(108,158,255,0.42)" : "var(--mairo-line)",
        boxShadow: lit
          ? "0 0 0 1px rgba(80,130,235,0.12), 0 0 28px rgba(61,125,255,0.22), 0 18px 48px rgba(2,6,18,0.6)"
          : "var(--mairo-glow-soft)",
      }}
    >
      {/* The border illumination, as an overlay rather than a border-colour
          change: a transition on border-color cannot be feathered, and a hard
          edge lighting up reads as a glitch rather than as a response. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ boxShadow: "var(--mairo-glow-lift)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/* --------------------------------------------------------------------- HUD */

/**
 * The small spaced labels in the corners of the reference renders.
 *
 * They are doing real work rather than decorating: they name what the thing
 * beside them is for, in two or three words, at a size that never competes
 * with the headline. Mono, because this is the machine speaking.
 */
export function HudLabel({
  children,
  className = "",
  align = "left",
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={`${align === "right" ? "text-right" : ""} ${className}`}>
      <p className="font-mono text-[9px] uppercase leading-[1.7] tracking-[0.28em] text-faint sm:text-[10px]">
        {children}
      </p>
      <span
        aria-hidden
        className={`mt-2 block h-px w-10 ${align === "right" ? "ml-auto" : ""}`}
        style={{ backgroundImage: "linear-gradient(to right, transparent, rgba(122,162,255,0.55))" }}
      />
    </div>
  );
}

/** The live/idle dot used beside anything MAIRO is currently doing. */
export function AIStatus({ label, live = true }: { label: string; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-1.5 w-1.5">
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live/60" />
        )}
        <span className={`relative h-1.5 w-1.5 rounded-full ${live ? "bg-live" : "bg-faint"}`} />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{label}</span>
    </span>
  );
}

/** The small capability chips inside the reference's capability cards. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted sm:text-[10px]"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.02)" }}
    >
      {children}
    </span>
  );
}
