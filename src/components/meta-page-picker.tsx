"use client";

import { useState, useTransition } from "react";
import { listMetaPagesAction, selectMetaPageAction } from "@/lib/actions/meta-actions";

// Which Facebook Page the ads go out as, and the means to change it.
//
// Every Meta ad creative carries a page_id — an ad is published *by* a Page,
// there is no such thing as one without. MAIRO had always picked the first
// Page the token returned and never mentioned it, which is fine for the many
// businesses with exactly one and quietly wrong for everyone else: their ads
// went out under whichever brand Meta happened to list first, and the only
// place that was visible was the ad itself.
//
// The list is fetched on demand rather than with the page. Most visits are not
// here to change the Page, and a Graph call on every dashboard render to
// populate a dropdown nobody opened is a slow page and a wasted request.
export function MetaPagePicker({
  pageId,
  pageName,
}: {
  pageId: string | null;
  pageName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setOpen(true);
    startTransition(async () => {
      setError(null);
      const result = await listMetaPagesAction();
      if (result.ok) setPages(result.pages);
      else setError(result.error);
    });
  }

  function choose(id: string) {
    startTransition(async () => {
      setError(null);
      const result = await selectMetaPageAction(id);
      if (result?.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs uppercase tracking-[0.12em] text-neutral-500">Ads go out as</span>
        {pageId ? (
          <span className="text-sm text-white">{pageName ?? pageId}</span>
        ) : (
          <span className="text-sm text-amber-300">No Page chosen</span>
        )}
        {!open && (
          <button
            type="button"
            onClick={load}
            className="text-xs uppercase tracking-[0.1em] text-neutral-400 underline underline-offset-4 transition hover:text-white"
          >
            {pageId ? "Change" : "Choose one"}
          </button>
        )}
      </div>

      {!pageId && !open && (
        <p className="max-w-xl text-xs leading-relaxed text-neutral-500">
          Every Facebook and Instagram ad is published by a Page — MAIRO can&apos;t create one
          until you pick which. If nothing appears when you look, this Meta login doesn&apos;t
          manage a Page yet.
        </p>
      )}

      {open && (
        <div className="space-y-2">
          {pending && !pages && <p className="text-sm text-neutral-500">Asking Meta…</p>}

          {pages?.length === 0 && (
            <p className="max-w-xl text-sm text-amber-300">
              This Meta login doesn&apos;t manage any Pages. Create one on Facebook, or get
              given a role on your business&apos;s existing Page, then reconnect.
            </p>
          )}

          {pages && pages.length > 0 && (
            <ul className="max-w-md divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
              {pages.map((p) => {
                const current = p.id === pageId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={pending || current}
                      onClick={() => choose(p.id)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-white/5 disabled:cursor-default"
                    >
                      <span className={current ? "text-white" : "text-neutral-300"}>{p.name}</span>
                      <span className="text-[11px] uppercase tracking-[0.12em] text-neutral-600">
                        {current ? "Current" : "Use this"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className="max-w-xl text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs uppercase tracking-[0.1em] text-neutral-500 transition hover:text-neutral-300"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
