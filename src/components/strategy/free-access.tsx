import Link from "next/link";
import { SetupProgress } from "@/components/onboarding/setup-progress";
import type { OnboardingStep } from "@/lib/onboarding/progress";

// What a free-plan account sees inside the dashboard before subscribing.
// Free: their plan, their business, connected accounts and pricing. Everything
// that runs real advertising shows a locked preview with the way to unlock it.

/** Pages a free-plan account can open before subscribing. */
export const FREE_PAGES = [
  "/dashboard/business",
  "/dashboard/settings",
  "/dashboard/account",
  "/dashboard/meta",
  "/dashboard/integrations",
  "/dashboard/billing",
  "/dashboard/guide",
  // Opens to the Social Manager upgrade screen (Scale only), not a preview.
  "/dashboard/social",
];

/** Sidebar destinations shown with a lock before subscribing. */
export const LOCKED_NAV = [
  "/dashboard/mission",
  "/dashboard/decisions",
  "/dashboard/create",
  "/dashboard/campaigns",
  "/dashboard/creative-studio",
  "/dashboard/analytics",
  "/dashboard/reports",
  "/dashboard/activity",
  "/dashboard/agents",
  "/dashboard/leads",
];

export function isFreePage(pathname: string): boolean {
  return pathname === "/dashboard" || pathname === "/dashboard/" || FREE_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`));
}

const LOCKED: { prefix: string; title: string; text: string }[] = [
  { prefix: "/dashboard/analytics", title: "Analytics", text: "Activate Mairo to see live campaign performance." },
  { prefix: "/dashboard/campaigns", title: "Campaigns", text: "Subscribe to turn your approved plan into a real campaign." },
  { prefix: "/dashboard/create", title: "Create", text: "Subscribe to turn your approved plan into a real campaign." },
  { prefix: "/dashboard/mission", title: "MAIRO Mission", text: "Your approved free plan becomes MAIRO's mission once you subscribe — then MAIRO runs it, measures it and improves it." },
  { prefix: "/dashboard/decisions", title: "Mairo Decisions", text: "Once your campaign is running, Mairo tells you what to change and why." },
  { prefix: "/dashboard/creative-studio", title: "Creative Studio", text: "Creative generation is part of your Mairo plan." },
  { prefix: "/dashboard/reports", title: "Reports", text: "Weekly Reports start once a real campaign is running." },
  { prefix: "/dashboard/activity", title: "Mairo Activity", text: "See everything Mairo does for you once it's running your ads." },
  { prefix: "/dashboard/agents", title: "Mairo AI", text: "Chat with Mairo about your live ads after activating. You can already ask Mairo to change your free plan." },
  { prefix: "/dashboard/health", title: "Business Health", text: "Business Health appears after a real campaign has run long enough to measure." },
];

function lockInfo(pathname: string) {
  return LOCKED.find((l) => pathname.startsWith(l.prefix)) ?? { title: "Full Mairo", text: "This is part of the full Mairo platform. Activate Mairo to use it." };
}

function ChooseButton({ approved }: { approved: boolean }) {
  return (
    <Link
      href={approved ? "/plan/activate" : "/plan"}
      className="inline-flex min-h-[42px] items-center rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110"
    >
      {approved ? "Choose a Plan" : "Review my free plan"}
    </Link>
  );
}

function LockIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

/** Replaces a paid page's content before subscribing. */
export function LockedArea({ pathname, approved }: { pathname: string; approved: boolean }) {
  const info = lockInfo(pathname);
  return (
    <div className="relative mx-auto max-w-[900px] overflow-hidden rounded-2xl border border-white/[0.07] bg-field/80">
      {/* A shape of the page behind the lock — no numbers. */}
      <div aria-hidden className="pointer-events-none select-none p-6 opacity-40 blur-[2px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-white/10 bg-white/[0.04]" />
          ))}
        </div>
        <div className="mt-3 h-48 rounded-xl border border-white/10 bg-gradient-to-t from-violet/20 to-transparent" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-[420px] rounded-2xl border border-white/12 bg-paper p-6 text-center shadow-2xl">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/12 text-violet-bright">
            <LockIcon />
          </span>
          <p className="mt-3 text-[18px] font-semibold text-white">{info.title}</p>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-faint">Locked</p>
          <p className="mt-2 text-[14px] text-muted">{info.text}</p>
          <div className="mt-4">
            <ChooseButton approved={approved} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The dashboard home before subscribing: where they are and what's next. */
export function FreeHome({
  approved,
  connected,
  businessName,
  stoppedReason,
  steps,
}: {
  approved: boolean;
  connected: boolean;
  businessName: string;
  stoppedReason: string | null;
  steps: OnboardingStep[] | null;
}) {
  const next = !approved
    ? { title: "Review and approve your free plan", text: "Change anything you like — ask Mairo or edit it yourself — then approve it.", href: "/plan", label: "Open my free plan", external: false }
    : !connected
      ? { title: "Connect your ad account", text: "So Mairo knows where your campaign will eventually run. Connecting doesn't launch anything or spend money.", href: "/api/meta/connect?returnTo=%2Fplan%2Factivate%3Fconnected%3D1", label: "Connect My Ad Account", external: true }
      : { title: "Choose your Mairo plan", text: "Your ad account is connected. After subscribing, Mairo builds the real campaign for you to review.", href: "/plan/activate", label: "Choose a Plan", external: false };

  const tiles = [
    { title: "My Free Plan", text: "Your advertising strategy", href: "/plan" },
    { title: "My Business", text: "What Mairo knows about you", href: "/dashboard/business" },
    { title: "Connected Accounts", text: connected ? "Meta connected" : "Nothing connected yet", href: "/dashboard/integrations" },
    { title: "Pricing", text: "Plans and what they unlock", href: approved ? "/plan/activate" : "/plan" },
  ];
  const locked = [
    { title: "Analytics", text: "Activate Mairo to see live campaign performance." },
    { title: "Campaigns", text: "Subscribe to turn your approved plan into a real campaign." },
    { title: "Mairo Decisions", text: "What to change and why, once a campaign runs." },
    { title: "Creative Studio", text: "Creative generation comes with your plan." },
    { title: "Business Health", text: "Measured once a real campaign is running." },
    { title: "Weekly Reports", text: "Start with your first live week." },
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      {steps && <SetupProgress steps={steps} />}
      {stoppedReason && (
        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
          <p className="text-[15px] font-semibold text-white">Mairo paused your campaigns</p>
          <p className="mt-1 text-[13.5px] text-white/85">{stoppedReason}</p>
        </div>
      )}
      <p className="mt-8 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">{businessName}</p>
      <h1 className="mt-1 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">{approved ? "Your strategy is ready." : "Your free plan is ready to review."}</h1>
      <p className="mt-1.5 max-w-[640px] text-[14.5px] text-muted">
        Your free plan shows you how Mairo would advertise your business. A subscription is required before Mairo builds or launches the real campaign.
      </p>

      <div className="mt-6 rounded-2xl border border-violet/30 bg-violet/[0.06] p-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Next step</p>
        <p className="mt-1 text-[18px] font-semibold text-white">{next.title}</p>
        <p className="mt-1 text-[14px] text-muted">{next.text}</p>
        {next.external ? (
          <a href={next.href} className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110">{next.label}</a>
        ) : (
          <Link href={next.href} className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110">{next.label}</Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.title} href={t.href} className="rounded-2xl border border-white/[0.07] bg-field/80 p-5 transition hover:border-violet/40">
            <p className="text-[15px] font-semibold text-white">{t.title}</p>
            <p className="mt-1 text-[13px] text-muted">{t.text}</p>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 text-[16px] font-semibold text-white">Unlocks with your Mairo plan</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locked.map((l) => (
          <div key={l.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <p className="text-[14.5px] font-medium text-white">{l.title}</p>
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-faint">
                <LockIcon className="h-3.5 w-3.5" /> Locked
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-muted">{l.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <ChooseButton approved={approved} />
      </div>
    </div>
  );
}
