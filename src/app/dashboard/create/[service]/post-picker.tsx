"use client";

import Image from "next/image";
import { describePost, type PagePost } from "@/lib/campaigns/sales-source";

// A business's own posts, shown as the posts rather than as ids. Somebody
// choosing between them recognises the picture, not "17841...".
export function PostPicker({
  posts,
  error,
  loading,
  selectedId,
  onSelect,
  emptyText,
}: {
  posts: PagePost[] | null;
  error: string | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (post: PagePost) => void;
  emptyText: string;
}) {
  if (loading && !posts) {
    return <p className="text-[13px] text-muted">Asking Meta for your posts…</p>;
  }
  if (error) {
    return (
      <p
        className="rounded-xl border p-4 text-[13px] leading-relaxed text-amber-200/90"
        style={{ borderColor: "var(--mairo-line)" }}
      >
        {error}
      </p>
    );
  }
  if (!posts) return null;
  if (posts.length === 0) {
    return <p className="text-[13px] leading-relaxed text-muted">{emptyText}</p>;
  }

  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {posts.map((post) => {
        const selected = post.id === selectedId;
        return (
          <li key={post.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(post)}
              className="flex w-full gap-3 rounded-xl border p-3 text-left transition-all duration-300"
              style={{
                borderColor: selected ? "rgba(108,158,255,0.5)" : "var(--mairo-line)",
                background: selected ? "rgba(61,125,255,0.08)" : "rgba(255,255,255,0.015)",
              }}
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
                <span className="line-clamp-3 block text-[13px] text-white">
                  {describePost(post, 120)}
                </span>
                {post.createdAt && (
                  <span className="mt-1 block text-[11.5px] text-faint">
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
        );
      })}
    </ul>
  );
}
