"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  loadCatalogsAction,
  loadPagePostsAction,
  saveSalesSourceAction,
} from "@/lib/actions/sales-setup-actions";
import { describePost, type PagePost, type ProductCatalog } from "@/lib/campaigns/sales-source";
import { primaryButtonClass } from "@/components/ui";

type Source = "MAIRO_CREATES" | "EXISTING_POST" | "CATALOG";

const OPTIONS: { key: Source; label: string; sub: string }[] = [
  {
    key: "MAIRO_CREATES",
    label: "MAIRO makes them",
    sub: "A picture and the words written for you, from scratch",
  },
  {
    key: "EXISTING_POST",
    label: "Run a post I already have",
    sub: "Something from your Page that already did well",
  },
  {
    key: "CATALOG",
    label: "Sell from my product catalogue",
    sub: "Meta shows each person the product they're most likely to buy",
  },
];

// Where a shop's ads come from, asked once the subscription is paid.
//
// The list of posts is fetched only when somebody actually picks that option.
// It is a Graph call on the customer's Page, and making it on page load for
// everyone would slow the screen down to populate a list most people never
// open — the same reasoning as the Page picker on the Meta connection screen.
export function SalesSourcePicker({
  initialSource,
  initialPostId,
  initialCatalogId,
}: {
  initialSource: Source;
  initialPostId: string | null;
  initialCatalogId: string | null;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [postId, setPostId] = useState<string | null>(initialPostId);
  const [catalogId, setCatalogId] = useState<string | null>(initialCatalogId);

  const [posts, setPosts] = useState<PagePost[] | null>(null);
  const [catalogs, setCatalogs] = useState<ProductCatalog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [pending, start] = useTransition();

  function choose(next: Source) {
    setSource(next);
    setSaved(false);
    setSaveError(null);
    setLoadError(null);

    if (next === "EXISTING_POST" && posts === null) {
      start(async () => {
        const result = await loadPagePostsAction();
        if (result.ok) setPosts(result.posts);
        else setLoadError(result.error);
      });
    }
    if (next === "CATALOG" && catalogs === null) {
      start(async () => {
        const result = await loadCatalogsAction();
        if (result.ok) setCatalogs(result.catalogs);
        else setLoadError(result.error);
      });
    }
  }

  function save() {
    start(async () => {
      setSaveError(null);
      const result = await saveSalesSourceAction({ source, postId, catalogId });
      if (result?.error) setSaveError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={source === o.key}
            onClick={() => choose(o.key)}
            className={`rounded-xl border p-4 text-left transition ${
              source === o.key
                ? "border-white/40 bg-white/[0.06]"
                : "border-white/10 bg-white/5 hover:border-white/25"
            }`}
          >
            <p className="text-sm text-white">{o.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">{o.sub}</p>
          </button>
        ))}
      </div>

      {pending && !posts && !catalogs && (
        <p className="text-sm text-neutral-500">Asking Meta…</p>
      )}

      {loadError && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-sm leading-relaxed text-amber-200/80">
          {loadError}
        </p>
      )}

      {source === "EXISTING_POST" && posts && posts.length === 0 && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-sm leading-relaxed text-amber-200/80">
          There are no posts with a picture on your Page yet. Post something with a photo and it
          shows up here — or let MAIRO make the ads for now.
        </p>
      )}

      {/* Which post, shown as the post rather than as an id. Somebody choosing
          between their own posts recognises the picture, not "17841...". */}
      {source === "EXISTING_POST" && posts && posts.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">
            Which post should MAIRO run?
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {posts.map((post) => (
              <li key={post.id}>
                <button
                  type="button"
                  aria-pressed={postId === post.id}
                  onClick={() => {
                    setPostId(post.id);
                    setSaved(false);
                  }}
                  className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${
                    postId === post.id
                      ? "border-white/40 bg-white/[0.06]"
                      : "border-white/10 bg-white/5 hover:border-white/25"
                  }`}
                >
                  {post.imageUrl && (
                    <Image
                      src={post.imageUrl}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized
                      className="h-16 w-16 flex-none rounded-lg object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-3 block text-sm text-white">
                      {describePost(post, 120)}
                    </span>
                    {post.createdAt && (
                      <span className="mt-1 block text-xs text-neutral-500">
                        {new Date(post.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {source === "CATALOG" && catalogs && catalogs.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">
            Which catalogue?
          </p>
          <ul className="max-w-md divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {catalogs.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={catalogId === c.id}
                  onClick={() => {
                    setCatalogId(c.id);
                    setSaved(false);
                  }}
                  className={`flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left text-sm transition ${
                    catalogId === c.id ? "bg-white/[0.06] text-white" : "text-neutral-300 hover:bg-white/[0.03]"
                  }`}
                >
                  <span>{c.name}</span>
                  {c.productCount !== null && (
                    <span className="text-xs text-neutral-500">{c.productCount} products</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Only when Meta has not already said something. Two amber paragraphs
          making the same point, one under the other, reads as a fault. */}
      {source === "CATALOG" && !loadError && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-xs leading-relaxed text-amber-200/80">
          Catalogue ads aren&apos;t running yet — MAIRO is still applying to Meta for them. Your
          answer is saved and MAIRO will write the ads the usual way until they are.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-300">Saved.</span>}
        {saveError && <span className="text-xs text-amber-300">{saveError}</span>}
      </div>
    </div>
  );
}
