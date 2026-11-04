"use client";

import Link from "next/link";
import { FIELD_EVENT } from "@/lib/cinematic/field-event";

// The one action on the homepage: a business's website, straight into the
// free plan (/preview reads ?website=). A plain GET form, so it works before
// any JavaScript arrives and the plan page owns every check.
//
// Typing stirs the Field behind the page (FIELD_EVENT) and tells the hero's
// readout what's being typed — the page answering the visitor, nothing sent
// anywhere until they press the button.

const stir = (text: string) => {
  window.dispatchEvent(new CustomEvent(FIELD_EVENT, { detail: { energy: Math.min(1, 0.35 + text.length / 24), text } }));
};

export function WebsiteStart({ id, label = "Build my free plan" }: { id: string; label?: string }) {
  return (
    <div>
      <form action="/preview" method="get" className="flex flex-col gap-2 rounded-[30px] border border-[color:var(--v3-line-strong)] bg-[color:var(--v3-ink)] p-1.5 sm:flex-row sm:items-center sm:rounded-full">
        <label htmlFor={id} className="sr-only">
          Your business website
        </label>
        <input
          id={id}
          name="website"
          type="text"
          inputMode="url"
          autoComplete="url"
          required
          placeholder="yourbusiness.com"
          onInput={(e) => stir(e.currentTarget.value)}
          onFocus={(e) => stir(e.currentTarget.value)}
          className="min-h-[52px] min-w-0 flex-1 bg-transparent px-5 text-[16px] text-white outline-none placeholder:text-white/35"
        />
        <button type="submit" className="cine-cta group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[15.5px] font-semibold">
          {label} <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
        </button>
      </form>
      <p className="mt-3 px-2 text-[13px] text-[color:var(--v3-text-3)]">
        Free. No card. No website?{" "}
        <Link href="/preview?manual=1" className="text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white">
          Describe your business instead
        </Link>
        .
      </p>
    </div>
  );
}
