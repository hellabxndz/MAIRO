"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  loadPagePostsAction,
  saveSalesSourceAction,
  scanShopAction,
} from "@/lib/actions/sales-setup-actions";
import { describePost, type PagePost } from "@/lib/campaigns/sales-source";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

type Found = {
  found: number;
  how: string;
  sample: { title: string; priceCents: number | null; currency: string; imageUrl: string | null }[];
};

const money = (cents: number | null, currency: string) =>
  cents === null
    ? null
    : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

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
    sub: "MAIRO reads your website and advertises what you sell",
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
  initialWebsite,
  initialProductCount,
}: {
  initialSource: Source;
  initialPostId: string | null;
  initialWebsite: string | null;
  initialProductCount: number;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [postId, setPostId] = useState<string | null>(initialPostId);
  const [shopUrl, setShopUrl] = useState(initialWebsite ?? "");
  const [found, setFound] = useState<Found | null>(null);

  const [posts, setPosts] = useState<PagePost[] | null>(null);
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
  }

  function scan() {
    start(async () => {
      setLoadError(null);
      setFound(null);
      const result = await scanShopAction(shopUrl);
      if (result.ok) setFound(result);
      else setLoadError(result.error);
    });
  }

  function save() {
    start(async () => {
      setSaveError(null);
      const result = await saveSalesSourceAction({ source, postId });
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

      {pending && !posts && (
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

      {source === "CATALOG" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="shop-url" className="text-sm font-medium text-white">
              Where do you sell?
            </label>
            <p className="mb-2 mt-1 max-w-xl text-xs leading-relaxed text-neutral-500">
              The page that lists what you sell. MAIRO reads it and advertises the products it
              finds — you don&apos;t have to set anything up in Facebook.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                id="shop-url"
                value={shopUrl}
                onChange={(e) => {
                  setShopUrl(e.target.value);
                  setSaved(false);
                }}
                placeholder="yourshop.com/collections/all"
                className="w-full max-w-md rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30"
              />
              <button
                type="button"
                onClick={scan}
                disabled={pending || shopUrl.trim().length === 0}
                className={secondaryButtonClass}
              >
                {pending ? "Reading…" : "Read my shop"}
              </button>
            </div>
          </div>

          {/* What it found, shown as the products rather than as a number.
              Somebody checking MAIRO read the right page recognises their own
              items and prices; "47 products" proves nothing. */}
          {found && (
            <div>
              <p className="mb-2 text-sm text-emerald-300">
                Found {found.found} {found.found === 1 ? "product" : "products"}.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {found.sample.map((p) => (
                  <li
                    key={p.title}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2"
                  >
                    {p.imageUrl && (
                      <Image
                        src={p.imageUrl}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 flex-none rounded object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{p.title}</span>
                      {money(p.priceCents, p.currency) && (
                        <span className="block text-xs text-neutral-500">
                          {money(p.priceCents, p.currency)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {found.found > found.sample.length && (
                <p className="mt-2 text-xs text-neutral-600">
                  and {found.found - found.sample.length} more
                </p>
              )}
            </div>
          )}

          {!found && initialProductCount > 0 && (
            <p className="text-xs text-neutral-500">
              MAIRO already has {initialProductCount}{" "}
              {initialProductCount === 1 ? "product" : "products"} from your shop. Read it again to
              pick up new ones or new prices.
            </p>
          )}

          <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-xs leading-relaxed text-amber-200/80">
            Catalogue ads aren&apos;t running yet — MAIRO is still applying to Meta for them. Your
            products are saved and MAIRO will write the ads the usual way until they are.
          </p>
        </div>
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
