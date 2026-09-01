"use client";

import { useState } from "react";

// A read-only value with a one-click copy. Used for strings that have to be
// pasted somewhere else byte-for-byte (the Meta redirect URI), where
// hand-retyping is the failure mode we're trying to remove.
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions policy).
      // The value is selectable on screen either way, so just leave the label.
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="flex-1 overflow-x-auto rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-neutral-200">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.1em] text-neutral-300 transition hover:border-white hover:bg-white hover:text-black"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
