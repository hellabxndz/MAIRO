import { type ReactNode } from "react";

// The shared primitives, on the MAIRO design system.
//
// Fifty-two files import from here — every campaign screen, every creative
// screen, analytics, integrations, settings, billing, the whole signed-in
// product. They were white buttons and flat white/10 borders from before the
// design system existed, which is why the app still looked like the old MAIRO
// the moment you clicked past the dashboard.
//
// Restyling this file rather than those fifty-two is the whole point of having
// primitives. Nothing below invents a colour: every value is a token from
// globals.css, so the next change to the ramp or the glow moves the entire
// product at once.
//
// The API is unchanged on purpose. Same exports, same props, same class-name
// constants — so this is a visual change with no call-site churn, which is the
// only safe way to touch this many screens in one commit.

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[var(--radius-panel)] border p-6 ${className}`}
      style={{
        backgroundImage: "var(--mairo-glass)",
        borderColor: "var(--mairo-line)",
        boxShadow: "var(--mairo-glow-soft)",
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white sm:text-[26px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {/* Wraps under the title on a phone rather than being squeezed beside it,
          which is where a two-word button used to end up three lines tall. */}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Status colour, and it is a vocabulary rather than a palette.
 *
 * green is live, yellow is waiting on somebody, red is broken, blue is
 * informational, neutral is everything else. Tones are tokens so a status
 * reads the same on the campaigns table, the integrations cards and the
 * billing screen.
 */
const badgeStyles: Record<string, string> = {
  neutral: "bg-white/[0.07] text-muted",
  green: "bg-live/15 text-live",
  yellow: "bg-warn/15 text-warn",
  red: "bg-alert/15 text-alert",
  blue: "bg-blue/15 text-blue-bright",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeStyles;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeStyles[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div
      className="rounded-[var(--radius-panel)] border border-dashed p-10 text-center"
      style={{ borderColor: "var(--mairo-line)" }}
    >
      <p className="text-[15px] font-medium text-white">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-[color:var(--mairo-line)] bg-[rgba(10,16,32,0.6)] px-3.5 py-2.5 " +
  "text-sm text-white placeholder-faint outline-none transition-colors " +
  "focus:border-[color:var(--mairo-line-lit)]";

// The ramp and the key glow, exactly as the hero and the sidebar use them — so
// "Generate creatives" on an inner page is recognisably the same button as
// "Create new campaign" on the dashboard.
//
// Written as a class string rather than a component because these are handed to
// <button>, <a>, <Link> and form submits all over the app, and turning them
// into a component would have meant touching every one of those call sites.
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white " +
  "bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] " +
  "transition-all duration-300 [transition-timing-function:var(--ease-mairo)] " +
  "hover:brightness-110 disabled:pointer-events-none disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--mairo-line)] " +
  "bg-white/[0.02] px-5 py-2.5 text-sm font-medium text-white/85 " +
  "transition-all duration-300 [transition-timing-function:var(--ease-mairo)] " +
  "hover:border-[color:var(--mairo-line-lit)] hover:bg-white/[0.05] hover:text-white " +
  "disabled:pointer-events-none disabled:opacity-50";
