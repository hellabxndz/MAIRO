"use client";

// Plays the intro on demand, for anyone who skipped it or wants it again.
//
// A custom event rather than a prop or a context: the overlay and this link sit
// in completely different parts of the page, and neither needs to know the
// other exists. Nothing to thread through, nothing to re-render.

export function ReplayIntroLink({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("mairo:play-intro"))}
      className={className}
    >
      {/* Drawn rather than typed: the ▶ character renders as a colour emoji on
          Windows and Android, which is a bright orange box in the middle of a
          monochrome page. This inherits currentColor and stays the same weight
          as the text beside it. */}
      <svg aria-hidden viewBox="0 0 10 12" className="h-2.5 w-2.5 flex-none fill-current">
        <path d="M0 0l10 6-10 6z" />
      </svg>
      Why MAIRO?
    </button>
  );
}
