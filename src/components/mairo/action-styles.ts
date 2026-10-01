// Button styles shared by server and client components. They live outside
// overlay.tsx because a "use client" module's exports reach server components
// as client references, not strings — a server card using them got a function
// in its className and rendered as plain text.

/** The one obvious action on a card. */
export const actionClass =
  "inline-flex min-h-[38px] items-center justify-center rounded-full px-4 text-[13px] font-medium text-white transition hover:brightness-110 bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)]";
/** A quieter action. */
export const quietClass =
  "inline-flex min-h-[38px] items-center justify-center rounded-full border border-[color:var(--mairo-line)] px-4 text-[13px] text-white/85 transition hover:border-[color:var(--mairo-line-lit)] hover:text-white";
