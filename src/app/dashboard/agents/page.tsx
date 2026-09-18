import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { hasActivePlan } from "@/lib/readiness";
import { PlanLock } from "@/components/plan-lock";
import { GlassPanel, HudLabel, MairoButton } from "@/components/mairo";
import { assistantNameOf, ASSISTANT_SKILLS, CLIENT_AGENT } from "@/lib/ai/agents";
import { findOrCreateThread, loadThreadMessages } from "@/lib/ai/threads";
import { AssistantConsole } from "./assistant-console";

// The assistant's own page.
//
// One assistant, named by the business, on one thread. This replaced a grid of
// three cards — Strategist, Creative, Support — that made somebody choose a
// specialist before they were allowed to ask a question. The choice was
// meaningless to anyone who did not already know the answer, and getting it
// wrong gave a worse reply than not choosing would have.
//
// The numbers on this page come from the account. There are no illustrative
// figures here and there must not be: a page introducing the thing that
// reports on your money is the last place to put a number that is not yours.
// When there is nothing to show, the tile says so.

export const metadata = { title: "Your assistant — MAIRO" };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string; about?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { ask, about } = await searchParams;

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      assistantName: true,
      subscriptionTier: true,
      subscriptionStatus: true,
    },
  });
  if (!org) redirect("/sign-in");

  const name = assistantNameOf(org.assistantName);

  if (!hasActivePlan(org)) {
    return (
      <div>
        <AssistantHero name={name} businessName={org.name} stats={null} smsOn={false} />
        <div className="mt-8">
          <PlanLock
            title={`${name} comes with a plan`}
            body="One assistant that knows your numbers, writes your ads and answers anything else — looking at your actual account rather than guessing. Pick a plan and it opens up straight away."
          />
        </div>
      </div>
    );
  }

  const [thread, live, creatives, changes, sms] = await Promise.all([
    findOrCreateThread(session.user.id, organizationId, CLIENT_AGENT),
    db.mairoCampaign.count({ where: { organizationId, status: "ACTIVE" } }),
    db.platformCreative.count({ where: { organizationId } }),
    // Applied only. A recommendation MAIRO made and nobody acted on is not a
    // change MAIRO made, and counting it as one would inflate the one number
    // on this page that is meant to prove the product does something.
    db.optimizationRecommendation.count({
      where: { mairoCampaign: { organizationId }, appliedAt: { not: null } },
    }),
    db.smsPreference.findUnique({
      where: { organizationId },
      select: { verifiedAt: true, optedOutAt: true },
    }),
  ]);

  const initialMessages = await loadThreadMessages(thread.id);

  // What to offer before the first message. Shaped by what the account
  // actually has — offering "why is this campaign doing badly" to somebody
  // with no campaigns is the product not reading its own screen.
  const suggestions =
    live > 0
      ? [
          "How are my ads doing?",
          "What have you changed this week?",
          "Should I increase my budget?",
          "Write me a new ad for my best campaign",
        ]
      : [
          "What should I advertise first?",
          "How much should I spend a month?",
          "What do you need from me to start?",
          "How does MAIRO actually work?",
        ];

  return (
    <div>
      <AssistantHero
        name={name}
        businessName={org.name}
        stats={{ live, creatives, changes }}
        smsOn={Boolean(sms?.verifiedAt) && !sms?.optedOutAt}
      />

      <div className="mt-8">
        <AssistantConsole
          threadId={thread.id}
          initialMessages={initialMessages}
          name={name}
          businessName={org.name}
          suggestions={suggestions}
          autoAsk={ask === "changes" ? "I'd like some changes made to this campaign." : (ask ?? null)}
          aboutCampaignId={about ?? null}
        />
      </div>

      <section className="mt-10">
        <HudLabel className="mb-5">What {name} handles</HudLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          {ASSISTANT_SKILLS.map((skill) => (
            <div
              key={skill.title}
              className="rounded-[var(--radius-card)] border p-5"
              style={{
                borderColor: "var(--mairo-line)",
                backgroundImage: "var(--mairo-glass)",
              }}
            >
              <h3 className="text-[14px] font-medium text-white">{skill.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{skill.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-2xl text-[12.5px] leading-relaxed text-faint">
          There is no second assistant to ask instead. Whatever it is, ask {name}.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

type Stats = { live: number; creatives: number; changes: number };

function AssistantHero({
  name,
  businessName,
  stats,
  smsOn,
}: {
  name: string;
  businessName: string;
  stats: Stats | null;
  smsOn: boolean;
}) {
  return (
    <GlassPanel className="px-5 py-8 sm:px-8 sm:py-10" lit>
      {/* The glow behind the orb, clipped by the panel. Decorative, so it is
          hidden from assistive tech and stopped from taking pointer events. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl lg:left-[120px]"
        style={{ background: "radial-gradient(circle, rgba(61,125,255,0.5), transparent 70%)" }}
      />

      <div className="relative flex flex-col items-center gap-7 text-center lg:flex-row lg:items-center lg:gap-9 lg:text-left">
        <AssistantOrb />

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-faint">
            Your AI assistant
          </p>
          <h1 className="mt-2.5 text-[32px] font-medium leading-[1.05] tracking-tight text-white sm:text-[42px]">
            {name}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-muted lg:mx-0">
            One assistant for all of it — {businessName}&rsquo;s campaigns, the budget, the ads
            themselves, and anything else about how MAIRO works. It reads your real account,
            not a general idea of advertising.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <MairoButton href="#talk">Start a conversation</MairoButton>
            <MairoButton href="/dashboard/settings#assistant" tone="ghost">
              {smsOn ? "Text settings" : "Get updates by text"}
            </MairoButton>
            <Link
              href="/dashboard/settings#assistant"
              className="text-[13px] text-muted underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Rename {name}
            </Link>
          </div>
        </div>
      </div>

      {stats && (
        <div className="relative mt-9 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border" style={{ borderColor: "var(--mairo-line)", background: "var(--mairo-line)" }}>
          <Stat label="Campaigns running" value={stats.live} />
          <Stat label="Ads written for you" value={stats.creatives} />
          <Stat label="Changes MAIRO made" value={stats.changes} />
        </div>
      )}
    </GlassPanel>
  );
}

/**
 * A count, or a dash.
 *
 * Zero and "nothing yet" read differently to somebody looking at their own
 * account: a bold 0 looks like a failure, a dash looks like a thing that has
 * not started. The second one is true.
 */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-4 text-center" style={{ background: "rgba(8,13,30,0.85)" }}>
      <p className="text-[22px] font-medium leading-none text-white sm:text-[26px]">
        {value > 0 ? value.toLocaleString("en-US") : "—"}
      </p>
      <p className="mt-2 text-[11px] leading-snug text-faint sm:text-[11.5px]">{label}</p>
    </div>
  );
}

/**
 * The orb.
 *
 * Pure CSS so this stays a server component — an animated avatar is not worth
 * shipping a client bundle for, and everything here is a transform or an
 * opacity, which the compositor handles without JavaScript. It stops entirely
 * under prefers-reduced-motion, since a permanently spinning thing on the page
 * you go to for answers is the worst place for one.
 */
function AssistantOrb() {
  return (
    <div className="relative h-[124px] w-[124px] shrink-0 sm:h-[140px] sm:w-[140px]">
      <span
        aria-hidden
        className="mairo-orb-ring absolute inset-0 rounded-full border"
        style={{ borderColor: "rgba(122,162,255,0.28)" }}
      />
      <span
        aria-hidden
        className="mairo-orb-ring-slow absolute inset-[10px] rounded-full border border-dashed"
        style={{ borderColor: "rgba(122,162,255,0.22)" }}
      />
      <span
        aria-hidden
        className="mairo-orb-pulse absolute inset-[22px] rounded-full"
        style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-white sm:h-10 sm:w-10" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M12 3.8v16.4M3.8 9.6h16.4M3.8 14.4h16.4" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </span>

      <style>{`
        .mairo-orb-ring { animation: mairo-orb-spin 22s linear infinite; }
        .mairo-orb-ring-slow { animation: mairo-orb-spin 34s linear infinite reverse; }
        .mairo-orb-pulse { animation: mairo-orb-breathe 5s ease-in-out infinite; }
        @keyframes mairo-orb-spin { to { transform: rotate(360deg); } }
        @keyframes mairo-orb-breathe {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.045); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mairo-orb-ring, .mairo-orb-ring-slow, .mairo-orb-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
