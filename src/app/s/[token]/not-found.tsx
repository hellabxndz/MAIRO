import Link from "next/link";

// A shared plan's link that's wrong, or has expired (unclaimed plans are kept 30 days).
export default function SharedPlanNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-center text-white">
      <div className="max-w-[460px]">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">This plan isn&rsquo;t available</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-white/65">The link may be mistyped, or the plan has expired — plans saved without an account are kept for 30 days.</p>
        <Link href="/preview" className="mt-6 inline-flex min-h-[46px] items-center rounded-full bg-[image:var(--mairo-ramp)] px-6 text-[15px] font-semibold text-black">Generate a free AI ad plan</Link>
      </div>
    </main>
  );
}
