import Link from "next/link";
import { money } from "@/lib/dashboard/home";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { BRAIN_FIELDS, SECTION_LABEL, SOURCE_LABEL, type BrainSection } from "@/lib/brain/catalog";
import { displayValue, hasValue } from "@/lib/brain/rules";
import { brainTimeline, loadBrainState } from "@/lib/brain/store";
import { missionGoal } from "@/lib/mission/goals";
import { BusinessBrain as BrainEditor } from "@/components/business/brain-editor";
import { AddFact, AddProduct, BrainQuestion, FactRow, InsightRow, ProductCard, VerifyFact, type FactRowData } from "@/components/business/brain-view";

// The MAIRO Business Brain: what MAIRO knows about this business, in plain
// sections rather than a database. Every fact says where it came from;
// anything MAIRO worked out itself is marked as its best guess until the
// owner confirms it. Current facts, what's temporary, what MAIRO learned from
// results and what used to be true are kept apart, because mixing them up
// is how a weekend sale becomes a "fact" about a business.

export const dynamic = "force-dynamic";

const card = "rounded-[22px] border border-[color:var(--mairo-line)] p-5 sm:p-6";
const surface = { background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.03), rgba(var(--mairo-fg-rgb),0.012))" };
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright";
const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function BusinessBrainPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const [s, timeline] = await Promise.all([loadBrainState(organizationId, new Date(), { accountHistory: true }), brainTimeline(organizationId, 24)]);
  const p = s.profile as unknown as Record<string, unknown>;

  const rows = (section: BrainSection): FactRowData[] =>
    BRAIN_FIELDS.filter((d) => d.section === section && hasValue(p[d.key])).map((d) => {
      const m = s.meta(d.key);
      return { key: d.key, label: d.label, list: d.list, value: d.list ? (p[d.key] as string[]) : displayValue(p[d.key]), source: SOURCE_LABEL[m.source], inferred: m.status === "inferred", purpose: d.purpose };
    });
  const missing = (section: BrainSection) =>
    BRAIN_FIELDS.filter((d) => d.section === section && !hasValue(p[d.key]) && d.key !== "logoUrl" && d.key !== "presence").map((d) => ({ key: d.key, label: d.label, list: d.list, purpose: d.purpose }));

  const renderSection = (section: BrainSection, children?: React.ReactNode) => {
    const r = rows(section);
    return (
      <section className={card} style={surface} aria-labelledby={`brain-${section}`}>
        <h2 id={`brain-${section}`} className={eyebrow}>{SECTION_LABEL[section]}</h2>
        {children}
        {r.length > 0 ? (
          <ul className="mt-1 divide-y divide-[color:var(--mairo-line)]">{r.map((f) => <FactRow key={f.key} fact={f} />)}</ul>
        ) : (
          !children && <p className="mt-3 text-[13.5px] text-muted">MAIRO doesn&rsquo;t know anything here yet.</p>
        )}
        <AddFact missing={missing(section)} />
      </section>
    );
  };

  const promos = s.temporary.filter((t) => t.kind === "promotion");
  const unavailable = [...s.profile.products.filter((x) => x.status === "unavailable").map((x) => x.name), ...s.temporary.filter((t) => t.kind === "unavailable").map((t) => t.text)];
  const learned = s.learned.filter((l) => l.confidence !== "EARLY" || !l.active);
  const learning = s.learned.filter((l) => l.confidence === "EARLY" && l.active);
  const u = s.understanding;
  const askable = s.questions;

  return (
    <div className="mx-auto max-w-[920px]">
      <Link href="/dashboard/settings" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-white">
        <span aria-hidden>←</span> Settings
      </Link>
      <header className="mb-6">
        <p className={eyebrow}>Business Brain</p>
        <h1 className="mt-2 text-[clamp(26px,3.4vw,34px)] font-semibold tracking-[-0.02em] text-white">What MAIRO knows about your business</h1>
        <p className="mt-2 max-w-[680px] text-[14.5px] leading-relaxed text-white/75">
          Every campaign, creative, plan and recommendation starts from this — so you never explain your business twice, and MAIRO gets smarter each time you use it.
        </p>
        <p className="mt-2 max-w-[680px] text-[12.5px] leading-relaxed text-faint">
          This exists only to make MAIRO&rsquo;s marketing for you better. You can correct, update or remove anything. What MAIRO worked out itself is marked as its best guess until you confirm it, and your corrections always win.
        </p>
      </header>

      <div className="space-y-4 sm:space-y-5">
        {/* How much MAIRO understands — never a game, never required to be 100. */}
        <section className={card} style={surface} aria-labelledby="brain-understanding">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="brain-understanding" className={eyebrow}>MAIRO knows your business</h2>
              <p className="mt-2 text-[40px] font-semibold leading-none tabular-nums text-white">{u.percent}%</p>
            </div>
            <p className="max-w-[460px] text-[13.5px] leading-relaxed text-white/80">{u.message}</p>
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-6">
            {u.areas.map((a) => (
              <li key={a.key} className="rounded-xl bg-white/[0.035] px-3 py-2.5" title={a.missing.length ? `Not known yet: ${a.missing.join(", ")}` : "Known"}>
                <p className="text-[11.5px] text-muted">{a.label}</p>
                <p className="mt-0.5 text-[15px] tabular-nums text-white">{a.percent}%</p>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full rounded-full" style={{ width: `${a.percent}%`, backgroundImage: "var(--mairo-ramp)" }} /></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-faint">100% isn&rsquo;t needed. MAIRO runs campaigns with what it has, and learns the rest as you go.</p>
        </section>

        {s.verify && <VerifyFact field={s.verify.key} question={s.verify.question} list={BRAIN_FIELDS.find((d) => d.key === s.verify!.key)?.list ?? false} />}

        {askable.length > 0 && (
          <section className={card} style={{ ...surface, borderColor: "rgba(124,92,255,0.4)" }} aria-labelledby="brain-improve" id="improve">
            <h2 id="brain-improve" className={eyebrow}>Improve MAIRO&rsquo;s understanding</h2>
            <p className="mt-2 text-[14px] text-white/85">
              Answer {askable.length} question{askable.length === 1 ? "" : "s"} to help MAIRO make better recommendations{s.goals.current ? ` for ${s.goals.current.label.toLowerCase()}` : ""}.
            </p>
            <div className="mt-4 space-y-3">
              {askable.map((q) => <BrainQuestion key={q.id} q={{ id: q.id, text: q.text, why: q.why, placeholder: q.placeholder, yesNo: q.yesNo, choices: q.choices }} />)}
            </div>
          </section>
        )}

        {renderSection("business")}

        {/* Goals, with history kept — a new goal never erases the old one. */}
        <section className={card} style={surface} aria-labelledby="brain-goals">
          <div className="flex items-center justify-between gap-3">
            <h2 id="brain-goals" className={eyebrow}>Your Goals</h2>
            <Link href="/dashboard/mission" className="text-[12.5px] text-muted hover:text-white">Change goal →</Link>
          </div>
          {s.goals.current ? (
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div><dt className="text-[12.5px] text-muted">Primary goal</dt><dd className="mt-0.5 text-[15px] text-white">{s.goals.current.label}</dd></div>
              <div><dt className="text-[12.5px] text-muted">Secondary goal</dt><dd className="mt-0.5 text-[15px] text-white">{s.goals.current.secondary ?? "—"}</dd></div>
              <div><dt className="text-[12.5px] text-muted">Since</dt><dd className="mt-0.5 text-[15px] text-white">{date(s.goals.current.from)}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-[13.5px] text-muted">No goal yet. <Link href="/dashboard/mission" className="text-violet-bright hover:text-white">Tell MAIRO what you want to achieve</Link>.</p>
          )}
          {s.goals.history.length > 1 && (
            <ol className="mt-4 space-y-1 border-t border-[color:var(--mairo-line)] pt-3 text-[13px]">
              {s.goals.history.map((g) => (
                <li key={g.from.toISOString()} className="flex justify-between gap-3">
                  <span className={g.to ? "text-white/60" : "text-white"}>{g.label}</span>
                  <span className="text-faint">{date(g.from)}{g.to ? ` – ${date(g.to)}` : " – now"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {renderSection(
          "products",
          <>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {s.profile.products.map((x) => <ProductCard key={x.name} product={x} />)}
            </ul>
            <AddProduct />
          </>,
        )}

        {renderSection("customers")}
        {renderSection("different")}
        {renderSection("brand")}

        {/* Temporary: true until it ends, never a permanent fact. */}
        <section className={card} style={surface} aria-labelledby="brain-now">
          <h2 id="brain-now" className={eyebrow}>Right now</h2>
          <p className="mt-1 text-[12.5px] text-faint">Temporary things MAIRO plans around. They end on their own and are never saved as facts about your business.</p>
          {promos.length === 0 && unavailable.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-muted">No promotion running and nothing marked unavailable. Tell MAIRO about a sale from <Link href="/dashboard/mission" className="text-violet-bright hover:text-white">your goal page</Link> or the assistant.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-[14px]">
              {promos.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.035] px-4 py-2.5">
                  <span className="text-white">🏷️ {x.text}{x.code ? <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px]">{x.code}</span> : null}</span>
                  <span className="text-[12.5px] text-muted">{x.state === "scheduled" ? "Scheduled" : "Active"}{x.startsAt ? ` · ${date(x.startsAt)}` : ""}{x.endsAt ? ` – ${date(x.endsAt)}` : ""}</span>
                </li>
              ))}
              {unavailable.map((x) => <li key={x} className="rounded-xl bg-white/[0.035] px-4 py-2.5 text-white">⛔ {x} — unavailable, so MAIRO won&rsquo;t promote it</li>)}
            </ul>
          )}
        </section>

        {/* Learned: from results, with confidence — kept apart from what the business told MAIRO. */}
        <section className={card} style={surface} aria-labelledby="brain-learned">
          <h2 id="brain-learned" className={eyebrow}>What MAIRO has learned</h2>
          <p className="mt-1 text-[12.5px] text-faint">From your own campaigns and posts. MAIRO only calls something a pattern once it has seen enough to say so.</p>
          {learned.length === 0 && learning.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-muted">💡 MAIRO is still learning. Patterns appear here once your campaigns have run long enough to compare.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[color:var(--mairo-line)]">
              {[...learned, ...learning].map((i) => (
                <InsightRow key={i.id} i={{ id: i.id, said: i.said, mark: i.mark, confidence: i.confidence, detail: i.detail, evidence: i.evidence, goal: i.goal ? missionGoal(i.goal).label : null, sampleSize: i.sampleSize, discovered: date(i.discoveredAt), validated: date(i.validatedAt), active: i.active }} />
              ))}
            </ul>
          )}
        </section>

        {/* Read from the Meta ad account, live: campaigns run outside MAIRO.
            Kept apart from what MAIRO learned from its own. */}
        {s.accountHistory && (
          <section className={card} style={surface} aria-labelledby="brain-meta-history">
            <div className="flex items-center justify-between gap-3">
              <h2 id="brain-meta-history" className={eyebrow}>Your campaigns before MAIRO</h2>
              <Link href="/dashboard/campaigns?tab=meta" className="text-[12.5px] text-muted hover:text-white">See them →</Link>
            </div>
            <p className="mt-1 text-[12.5px] text-faint">From your Meta ad account. MAIRO uses this as context for what your account has already seen — it doesn&rsquo;t change those campaigns.</p>
            <p className="mt-3 text-[14px] text-white">
              {s.accountHistory.count} campaign{s.accountHistory.count === 1 ? "" : "s"} run outside MAIRO · {money(s.accountHistory.spentCents)} spent
            </p>
            {s.accountHistory.best.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-[13.5px] text-white/80">
                {s.accountHistory.best.map((b) => (
                  <li key={b.goal}>
                    Lowest cost per {b.results === 1 ? b.noun : b.noun.replace(/s$/, "")}: <span className="text-white">{b.name}</span> — {b.results.toLocaleString("en-US")} {b.noun}, about {money(b.eachCents)} each
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13.5px] text-muted">None of them recorded sales, leads or website visits Meta could count, so there&rsquo;s no cost per result to learn from yet.</p>
            )}
          </section>
        )}

        {s.history.length > 0 && (
          <section className={card} style={surface} aria-labelledby="brain-past">
            <h2 id="brain-past" className={eyebrow}>Used to be true</h2>
            <p className="mt-1 text-[12.5px] text-faint">Kept so MAIRO remembers why its strategy changed. Never used as current.</p>
            <ul className="mt-3 space-y-1.5 text-[13.5px]">
              {s.history.slice().reverse().slice(0, 10).map((h, i) => (
                <li key={i} className="flex justify-between gap-3"><span className="text-white/75">{h.text}</span><span className="shrink-0 text-faint">until {date(new Date(h.until))}</span></li>
              ))}
            </ul>
          </section>
        )}

        {timeline.length > 0 && (
          <section className={card} style={surface} aria-labelledby="brain-history">
            <h2 id="brain-history" className={eyebrow}>Business history</h2>
            <ol className="mt-3 space-y-2">
              {timeline.map((t, i) => (
                <li key={i} className="grid grid-cols-[96px_1fr] gap-3 text-[13.5px]">
                  <span className="text-faint">{date(t.at)}</span>
                  <span className="text-white/85">{t.text}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <details className={card} style={surface}>
          <summary className="cursor-pointer text-[13.5px] text-white/85 hover:text-white">Edit everything at once</summary>
          <div className="mt-4">
            <BrainEditor profile={s.profile} edited={s.record.editedFields} />
          </div>
          <p className="mt-4 text-[12px] text-faint">
            Want MAIRO to read your website again? <Link href="/dashboard/business" className="text-violet-bright hover:text-white">Analyze my website</Link> — it never overwrites what you&rsquo;ve told MAIRO yourself.
          </p>
        </details>
      </div>
    </div>
  );
}
