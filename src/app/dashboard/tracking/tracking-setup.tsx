"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  checkEventsAction,
  checkInstallationAction,
  createPixelAction,
  listPixelChoicesAction,
  markInstalledAction,
  selectPixelAction,
  setConsentPolicyAction,
  setInstallRouteAction,
  type PixelChoiceView,
} from "@/lib/actions/tracking-actions";
import { Badge, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { CONSENT_POLICY_LABEL, INSTALL_ROUTES, MENUS_CHANGE_NOTE, STAGE_LABEL, STAGE_ORDER, type CheckStatus, type ConsentPolicy, type InstallRoute, type TrackingStage } from "@/lib/tracking/state";

// "Help your ad platform understand when someone becomes a lead or customer."
//
// Three steps — choose the pixel, install it, check it — with the stage shown
// as Meta and the website prove it, not as MAIRO remembers doing it. Every
// change is the owner's: nothing is picked or created for them, and creating
// asks first. Each check's answer keeps its own meaning: not detected, not
// seen and missing permission are answers with a next step; only a failed
// check is a failure.

export type Check = { status: CheckStatus; source: string; detail: string | null; count: number | null; checkedAt: string };
export type SetupView = {
  connected: boolean;
  allowed: boolean;
  pixel: { id: string; name: string; origin: string; owner: string | null; lastFiredAt: string | null } | null;
  stage: { stage: TrackingStage; label: string; next: string };
  requiredEvent: string | null;
  install: Check | null;
  events: Record<string, Check>;
  route: InstallRoute | null;
  suggestedRoute: InstallRoute;
  detectedPlatform: string | null;
  consent: ConsentPolicy;
  handoff: { ready: boolean; optimiseFor: string; note: string };
  creating: boolean;
  businessName: string;
  baseSnippet: string | null;
  eventSnippet: string | null;
  recommended: { name: string; required: boolean; when: string; notWhen: string }[];
};

const CHECK_TONE: Record<CheckStatus, { label: string; tone: "green" | "yellow" | "red" | "neutral" }> = {
  VERIFIED: { label: "Verified", tone: "green" },
  NOT_DETECTED: { label: "Not detected", tone: "yellow" },
  NOT_SEEN: { label: "Not seen yet", tone: "yellow" },
  MISSING_PERMISSION: { label: "Missing permission", tone: "yellow" },
  FAILED: { label: "Check failed", tone: "red" },
};
const SOURCE: Record<string, string> = { meta_stats: "Meta's event counts", meta_last_fired: "Meta's last-received time", public_scan: "MAIRO's reading of your website" };

type Result = { ok: true; message: string } | { ok: false; error: string };

export function TrackingSetup({ view }: { view: SetupView }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [choices, setChoices] = useState<PixelChoiceView[] | null>(null);
  const [choosing, setChoosing] = useState(!view.pixel);
  const [picked, setPicked] = useState<string>("");
  const [manualId, setManualId] = useState("");
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) after?.();
    });

  const loadChoices = () =>
    start(async () => {
      setListError(null);
      const r = await listPixelChoicesAction();
      if (!r.ok) {
        setListError(r.error);
        setChoices([]);
        return;
      }
      setChoices(r.choices);
      const rec = r.choices.find((c) => c.recommended);
      if (rec) setPicked(rec.id);
    });

  const at = STAGE_ORDER.indexOf(view.stage.stage);
  const route = view.route ?? view.suggestedRoute;
  const steps = INSTALL_ROUTES[route];

  if (!view.allowed) return <p className="text-sm text-neutral-400">Tracking is set up for Meta advertising, which isn&rsquo;t on your plan.</p>;

  return (
    <section aria-labelledby="tracking-setup-title" className="space-y-6">
      <div>
        <h2 id="tracking-setup-title" className="text-base font-medium text-white">Help your ad platform understand when someone becomes a lead or customer.</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-400">
          Meta can only find more people like your customers if it hears when someone enquires, books or buys. That&rsquo;s what the pixel does — a few lines on your website, owned by your ad account.
        </p>
        {/* Where things stand, as checked. */}
        <ol aria-label="Tracking progress" className="mt-4 flex flex-wrap gap-1.5">
          {STAGE_ORDER.slice(1).map((s, i) => {
            const done = at > i + 1 || view.stage.stage === "verified";
            const here = view.stage.stage === s;
            return (
              <li key={s} aria-current={here ? "step" : undefined} className={`rounded-full px-2.5 py-1 text-[11.5px] ${here ? "bg-violet/20 font-medium text-white" : done ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.04] text-neutral-500"}`}>
                {done && !here ? "✓ " : ""}
                {STAGE_LABEL[s]}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-sm text-neutral-300">
          <span className="font-medium text-white">{view.stage.label}.</span> {view.stage.next}
        </p>
      </div>

      {note && (
        <p role="status" className={`rounded-xl border px-4 py-2.5 text-sm ${note.ok ? "border-emerald-400/25 text-emerald-200" : "border-amber-400/30 text-amber-100"}`}>
          {note.text}
        </p>
      )}

      {/* 1. The pixel */}
      <div className="rounded-2xl border border-white/10 p-5">
        <h3 className="text-sm font-medium text-white">1. Choose your pixel</h3>
        {!view.connected ? (
          <p className="mt-2 text-sm text-neutral-400">
            Connect Meta first — pixels live in your own ad account. <Link href="/dashboard/meta" className="text-violet-bright underline underline-offset-4">Connect Meta</Link>
          </p>
        ) : (
          <>
            {view.pixel && (
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-4 py-3">
                <div className="text-sm">
                  <p className="text-white">{view.pixel.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    ID {view.pixel.id} · {view.pixel.origin === "CREATED_BY_MAIRO" ? "Created by MAIRO at your request" : "Your existing pixel"} · {view.pixel.owner ? `Owned by ${view.pixel.owner}` : "Meta lists no business owner"}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{view.pixel.lastFiredAt ? `Meta last received an event ${new Date(view.pixel.lastFiredAt).toLocaleString()}` : "Meta hasn't received an event from it yet"}</p>
                </div>
                {!choosing && (
                  <button type="button" className={secondaryButtonClass} onClick={() => setChoosing(true)}>
                    Use a different pixel
                  </button>
                )}
              </div>
            )}
            {choosing && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-neutral-400">If you&rsquo;ve advertised before, you probably have one — reusing it keeps what Meta has learned. MAIRO shows each one with who owns it.</p>
                {choices === null ? (
                  <button type="button" className={primaryButtonClass} disabled={pending} onClick={loadChoices}>
                    {pending ? "Looking…" : "Show the pixels in my ad account"}
                  </button>
                ) : (
                  <>
                    {listError && <p className="text-sm text-amber-100">{listError}</p>}
                    {choices.length > 0 && (
                      <fieldset>
                        <legend className="sr-only">Your pixels</legend>
                        <ul className="space-y-2">
                          {choices.map((c) => (
                            <li key={c.id}>
                              <label className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 text-sm ${picked === c.id ? "border-violet/60 bg-violet/[0.06]" : "border-white/10"} ${c.unavailable ? "cursor-not-allowed opacity-60" : ""}`}>
                                <input type="radio" name="pixel" value={c.id} checked={picked === c.id} disabled={c.unavailable} onChange={() => setPicked(c.id)} className="mt-1 accent-[#7c5cff]" />
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-center gap-2 text-white">
                                    {c.name}
                                    {c.recommended && <Badge tone="green">Recommended</Badge>}
                                  </span>
                                  <span className="block text-xs text-neutral-400">ID {c.id} · {c.owner ? `Owned by ${c.owner}` : "No business owner listed"}</span>
                                  <span className="block text-xs text-neutral-500">{c.why}</span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        <button type="button" className={`${primaryButtonClass} mt-3`} disabled={pending || !picked} onClick={() => run(() => selectPixelAction(picked), () => setChoosing(false))}>
                          Use this pixel
                        </button>
                      </fieldset>
                    )}
                    {choices.length === 0 && !listError && <p className="text-sm text-neutral-400">No pixels in this ad account yet.</p>}
                  </>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-neutral-300">My pixel isn&rsquo;t listed — enter its ID</summary>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="pixel-id" className="sr-only">Pixel ID</label>
                    <input id="pixel-id" value={manualId} onChange={(e) => setManualId(e.target.value)} inputMode="numeric" placeholder="e.g. 123456789012345" className={inputClass} />
                    <button type="button" className={secondaryButtonClass} disabled={pending || !manualId.trim()} onClick={() => run(() => selectPixelAction(manualId), () => setChoosing(false))}>
                      Check and use
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">MAIRO asks Meta to confirm the ID before saving it.</p>
                </details>
                <div className="rounded-xl border border-white/10 px-4 py-3 text-sm">
                  {!confirmCreate ? (
                    <button type="button" className="text-violet-bright underline underline-offset-4" disabled={pending || view.creating} onClick={() => setConfirmCreate(true)}>
                      {view.creating ? "Creating a pixel…" : "I don't have one — create a pixel for me"}
                    </button>
                  ) : (
                    <div>
                      <p className="text-neutral-300">MAIRO will create one pixel named &ldquo;{`${view.businessName} — MAIRO`.slice(0, 50)}&rdquo; in your own ad account. If you already have a pixel, use that instead — a second one starts with no history.</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" className={primaryButtonClass} disabled={pending} onClick={() => run(createPixelAction, () => { setConfirmCreate(false); setChoosing(false); })}>
                          {pending ? "Creating…" : "Create the pixel"}
                        </button>
                        <button type="button" className={secondaryButtonClass} onClick={() => setConfirmCreate(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. Install */}
      {view.pixel && (
        <div className="rounded-2xl border border-white/10 p-5">
          <h3 className="text-sm font-medium text-white">2. Install it on your website</h3>
          <fieldset className="mt-3">
            <legend className="text-xs text-neutral-400">How will you install it?{view.detectedPlatform ? ` Your website looks like ${view.detectedPlatform}.` : ""}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(INSTALL_ROUTES) as InstallRoute[]).map((r) => (
                <button key={r} type="button" aria-pressed={route === r} disabled={pending} onClick={() => run(() => setInstallRouteAction(r))} className={`rounded-full border px-3 py-1.5 text-xs ${route === r ? "border-violet/60 bg-violet/15 text-white" : "border-white/12 text-neutral-300 hover:border-white/30"}`}>
                  {INSTALL_ROUTES[r].label.split(" — ")[0]}
                  {r === view.suggestedRoute && !view.route ? " · suggested" : ""}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-sm font-medium text-white">{steps.label}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-300">
            {steps.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          {steps.note && <p className="mt-2 text-xs text-neutral-500">{steps.note}</p>}
          {(route === "manual" || route === "wix" || route === "squarespace") && view.baseSnippet && (
            <div className="mt-4 space-y-4">
              <Snippet title="Base code — every page, inside <head>" code={view.baseSnippet} />
              {view.eventSnippet && view.requiredEvent && <Snippet title={`${view.requiredEvent} — where the outcome happens`} code={view.eventSnippet} />}
            </div>
          )}
          <p className="mt-3 text-xs text-neutral-500">{MENUS_CHANGE_NOTE}</p>
          <button type="button" className={`${primaryButtonClass} mt-4`} disabled={pending} onClick={() => run(markInstalledAction)}>
            {pending ? "Checking…" : "I've installed it — check now"}
          </button>
        </div>
      )}

      {/* 3. Check */}
      {view.pixel && (
        <div className="rounded-2xl border border-white/10 p-5">
          <h3 className="text-sm font-medium text-white">3. Check that Meta hears about outcomes</h3>
          <CheckRow title="Installed on your website" check={view.install} action={<button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(checkInstallationAction)}>Check installation</button>} />
          {view.requiredEvent ? (
            <CheckRow
              title={`${view.requiredEvent} events reaching Meta (last 7 days)`}
              check={view.events[view.requiredEvent] ?? null}
              action={<button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(checkEventsAction)}>Check events</button>}
            />
          ) : (
            <p className="mt-3 text-sm text-neutral-400">Your first campaign uses a form inside the ad, which Meta counts on its own — no website event needed yet.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            To test: open your website in a private window, complete the action yourself (a test enquiry, booking or order you can cancel), wait a few minutes, then check. In Meta Events Manager, the Test events tab shows events arriving live.
          </p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-neutral-300">Which events your business should send, and when</summary>
            <ul className="mt-2 space-y-2">
              {view.recommended.map((e) => (
                <li key={e.name} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="font-medium text-white">{e.name}</span> <span className="text-xs text-neutral-500">{e.required ? "· needed" : "· useful"}</span>
                  <p className="text-xs text-neutral-300">{e.when}</p>
                  <p className="text-xs text-neutral-500">{e.notWhen}</p>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Server events and consent */}
      {view.pixel && (
        <div className="rounded-2xl border border-white/10 p-5">
          <h3 className="text-sm font-medium text-white">Orders sent from your store, and consent</h3>
          <p className="mt-1 text-sm text-neutral-400">
            When your store tells MAIRO about an order, MAIRO sends it to Meta from the server too, with the same event ID as the browser&rsquo;s — so a sale reported both ways counts once. Choose how consent applies:
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(Object.keys(CONSENT_POLICY_LABEL) as ConsentPolicy[]).map((p) => (
              <button key={p} type="button" aria-pressed={view.consent === p} disabled={pending} onClick={() => run(() => setConsentPolicyAction(p))} className={`rounded-xl border px-4 py-3 text-left text-sm ${view.consent === p ? "border-violet/60 bg-violet/[0.08]" : "border-white/10 hover:border-white/25"}`}>
                <span className="font-medium text-white">{CONSENT_POLICY_LABEL[p].title}</span>
                <span className="mt-0.5 block text-xs text-neutral-400">{CONSENT_POLICY_LABEL[p].detail}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">Orders that aren&rsquo;t sent are still counted in your own results, without anything that identifies the shopper. Your store&rsquo;s consent banner still decides what the browser pixel may do.</p>
        </div>
      )}

      {/* What the campaign gets */}
      <div className={`rounded-2xl border p-5 ${view.handoff.ready ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-amber-400/25 bg-amber-400/[0.04]"}`}>
        <h3 className="text-sm font-medium text-white">For your campaign</h3>
        <p className="mt-1 text-sm text-neutral-300">
          {view.handoff.ready ? "Ready" : "Not ready yet"} — optimising for: <span className="text-white">{view.handoff.optimiseFor}</span>
        </p>
        <p className="mt-1 text-xs text-neutral-400">{view.handoff.note}</p>
      </div>
    </section>
  );
}

function CheckRow({ title, check, action }: { title: string; check: Check | null; action: React.ReactNode }) {
  const tone = check ? CHECK_TONE[check.status] : null;
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2 text-white">
          {title} {tone ? <Badge tone={tone.tone}>{tone.label}</Badge> : <Badge>Not checked yet</Badge>}
        </p>
        {check && (
          <>
            {check.detail && <p className="mt-0.5 text-xs text-neutral-300">{check.detail}</p>}
            <p className="mt-0.5 text-xs text-neutral-500">From {SOURCE[check.source] ?? check.source} · {new Date(check.checkedAt).toLocaleString()}</p>
          </>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-300">{title}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setCopied(false))}
          className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-neutral-400 hover:border-white/30 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-white/10 bg-field-2 p-3 text-[11px] leading-relaxed text-neutral-400"><code>{code}</code></pre>
    </div>
  );
}
