import Link from "next/link";

// Scale's dashboard invitation to Social Manager. It asks for a goal, not a
// post: MAIRO plans content only once it knows what the business wants.

export function SocialManagerPrompt() {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-violet/30 bg-violet/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">MAIRO Social Manager</p>
        <p className="mt-1 text-[15px] font-semibold text-white">What do you want MAIRO to help your business accomplish?</p>
        <p className="mt-1 text-[13px] text-muted">Tell MAIRO the goal. It builds your social strategy and content plan, and you approve every post.</p>
      </div>
      <Link href="/dashboard/social" className="inline-flex min-h-[42px] shrink-0 items-center rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white hover:brightness-110">
        Set my goal
      </Link>
    </div>
  );
}
