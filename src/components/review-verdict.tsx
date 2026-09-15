import type { CreativeStatus } from "@/generated/prisma/enums";

// What the safety check said about one creative request, in words.
//
// Worth stating plainly because the status alone reads wrong to an operator.
// "IN REVIEW" looks like a queue with their name on it, and it is not — it is
// the reviewer failing to answer. Left unexplained, somebody eventually starts
// approving these by hand, which is exactly the judgement call the automated
// check exists to take off them.
export function ReviewVerdict({
  status,
  reviewedAt,
  reviewCategory,
  reviewNotes,
}: {
  status: CreativeStatus;
  reviewedAt: Date | null;
  reviewCategory: string | null;
  reviewNotes: string | null;
}) {
  const when = reviewedAt
    ? reviewedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  if (status === "BLOCKED") {
    return (
      <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-red-300/80">
          Blocked by the safety check{reviewCategory ? ` · ${reviewCategory}` : ""}
          {when ? ` · ${when}` : ""}
        </p>
        {reviewNotes && <p className="mt-1.5 text-sm text-neutral-300">{reviewNotes}</p>}
      </div>
    );
  }

  if (status === "IN_REVIEW") {
    return (
      <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-amber-300/80">
          The check couldn&apos;t run
        </p>
        <p className="mt-1.5 text-sm text-neutral-300">
          This isn&apos;t waiting on your opinion. The safety reviewer couldn&apos;t be reached
          when the concept was written — usually a missing or failing AI key — so nothing was
          approved unchecked. It retries nightly, and when the customer opens their creatives
          page. You can ask it now instead.
        </p>
      </div>
    );
  }

  if (status === "APPROVED") {
    return (
      <p className="mt-3 text-xs text-neutral-600">
        Approved by the safety check{when ? ` on ${when}` : ""} — no sign-off needed.
      </p>
    );
  }

  return null;
}
