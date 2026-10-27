"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { checkEventsAction, checkInstallationAction } from "@/lib/actions/tracking-actions";
import {
  choosePixelAction,
  createPixelAction,
  declinePixelAction,
  listPixelsAction,
  recheckPixelAction,
  setLeadMeasurementAction,
  type PixelOption,
} from "@/lib/actions/pixel-actions";
import { LEAD_MEASUREMENT, PIXEL_STATUS_LABEL, type LeadMeasurement } from "@/lib/tracking/pixel-rules";
import type { PixelSetupView } from "@/lib/tracking/pixel-setup";

// Choosing the Meta Pixel (Meta also calls it a dataset): why MAIRO asks,
// the Pixels the connected account can actually use, creating one where the
// connection allows it (or the Events Manager steps where it doesn't), and
// saying no. "Chosen in MAIRO" and "receiving events from your website" are
// shown apart, always.

type List =
  | { state: "loading" }
  | { state: "error"; reason: string; error: string }
  | { state: "ready"; adAccountId: string; options: PixelOption[]; canCreate: boolean; missingForCreate: string[]; permissionsUnknown: boolean };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : null);

const host = (url: string | null) => {
  if (!url) return "";
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function PixelSetup({ view, returnTo, reconnectHref }: { view: PixelSetupView; returnTo: string | null; reconnectHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [choosing, setChoosing] = useState(!view.pixel && view.decision !== "declined");
  const [declining, setDeclining] = useState(false);
  const [list, setList] = useState<List>({ state: "loading" });
  const [picked, setPicked] = useState<string | null>(null);
  const [domain, setDomain] = useState(host(view.website));
  const [domainOk, setDomainOk] = useState(false);
  const [route, setRoute] = useState<LeadMeasurement | "">(view.leadMeasurement ?? "");
  const shop = view.need === "required_for_purchases";

  // Picking a Pixel suggests the website Meta saw it on, and asks for the confirmation again.
  const pick = useCallback((option: PixelOption | undefined) => {
    if (!option) return;
    setPicked(option.id);
    setDomainOk(false);
    if (option.hosts[0]) setDomain((d) => d || option.hosts[0]);
  }, []);

  const fetchList = useCallback(() => {
    void listPixelsAction().then((r) => {
      if (!r.ok) return setList({ state: "error", reason: r.reason, error: r.error });
      setList({ state: "ready", ...r });
      const best = r.options.find((o) => o.recommended && !o.unavailable);
      setPicked((p) => p ?? best?.id ?? null);
      if (best?.hosts[0]) setDomain((d) => d || best.hosts[0]);
    });
  }, []);
  const load = useCallback(() => {
    setList({ state: "loading" });
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (choosing && view.connected) fetchList();
  }, [choosing, view.connected, fetchList]);

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) after?.();
      router.refresh();
    });

  const pickedOption = list.state === "ready" ? list.options.find((o) => o.id === picked) ?? null : null;

  const receiving = view.status === "receiving" || view.status === "purchases_verified";

  return (
    <div className="space-y-6">
      {/* 1. Why */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-labelledby="why-title">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="why-title" className="text-base font-medium text-white">Why MAIRO is asking</h2>
          {shop ? <Badge tone="yellow">Needed for purchase measurement</Badge> : <Badge tone="neutral">Optional for your business</Badge>}
        </div>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-white">
          This connection helps MAIRO measure actions on your website, including purchases, so you can understand your ad results.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-300">
          MAIRO uses your website&rsquo;s Meta Pixel to measure actions such as product views, add-to-cart events, checkout starts, and
          purchases. This helps us report what happened after an ad click and make better campaign recommendations. You control which
          Meta business and Pixel you connect.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400">
          {shop
            ? "For an online shop, a working Pixel is needed to measure purchases, and before MAIRO launches a campaign aimed at website purchases. MAIRO doesn't need it to reach any of your other business data."
            : "For your business it's optional: calls, Meta's lead forms, MAIRO's forms and the leads you mark are counted without it. Connect one if people enquire or buy on your website."}
        </p>
      </section>

      {!view.connected && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-5 text-sm text-neutral-200">
          <p className="font-medium text-white">Connect Meta first</p>
          <p className="mt-1 text-neutral-300">Pixels live in your Meta ad account, so MAIRO can only list them once Meta is connected.</p>
          <a href={reconnectHref} className={`${primaryButtonClass} mt-3`}>Connect Meta</a>
        </section>
      )}

      {/* 2. Where things stand */}
      {view.connected && (view.pixel || view.decision === "declined") && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-labelledby="status-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="status-title" className="text-base font-medium text-white">Your Pixel</h2>
            <Badge tone={receiving ? "green" : view.status === "access_lost" ? "red" : view.status === "declined" && !shop ? "neutral" : "yellow"}>{PIXEL_STATUS_LABEL[view.status]}</Badge>
          </div>
          {view.pixel ? (
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Row label="Connected in MAIRO" value={`${view.pixel.name} · ID ${view.pixel.id}`} />
              <Row label="Ad account" value={view.pixel.adAccountId ?? view.adAccountId ?? "—"} />
              <Row label="Website (you confirmed)" value={view.pixel.websiteDomain ?? "Not confirmed"} />
              <Row label="Chosen" value={fmt(view.pixel.selectedAt) ?? "—"} />
              <Row
                label="Receiving website events"
                value={
                  view.pixel.lastFiredAt
                    ? `Yes — Meta's last event: ${fmt(view.pixel.lastFiredAt)}`
                    : view.install?.status === "VERIFIED"
                      ? "Code found on your website — Meta hasn't reported an event yet"
                      : "Not yet — Meta hasn't received any events from your website"
                }
              />
              {shop && (
                <Row
                  label="Purchases"
                  value={
                    view.purchase?.status === "VERIFIED"
                      ? `Meta received ${view.purchase.count ?? "some"} in the last 7 days (checked ${fmt(view.purchase.checkedAt)})`
                      : view.purchase
                        ? `${view.purchase.detail ?? "Not seen yet"} (checked ${fmt(view.purchase.checkedAt)})`
                        : "Not checked yet — make a test purchase, then check with Meta"
                  }
                />
              )}
              <Row label="Access last checked" value={view.pixel.accessLostAt ? `Lost — ${fmt(view.pixel.accessLostAt)}` : (fmt(view.pixel.lastCheckedAt) ?? "—")} />
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">
              {shop
                ? "You chose not to connect a Pixel. MAIRO can't verify purchases on your website or optimise for them, so campaigns aimed at website purchases won't launch. Campaigns for website visits, calls or messages can."
                : `You chose not to connect a Pixel — website events aren't tracked.${view.leadMeasurement ? ` How you measure leads: ${LEAD_MEASUREMENT[view.leadMeasurement].label}.` : ""}`}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {view.pixel && (
              <>
                <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(recheckPixelAction)}>Re-check access</button>
                <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(checkInstallationAction)}>Check my website</button>
                <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(checkEventsAction)}>Check with Meta</button>
              </>
            )}
            {!choosing && (
              <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => setChoosing(true)}>
                {view.pixel ? "Change Pixel" : "Connect a Pixel"}
              </button>
            )}
          </div>
          {view.pixel && !receiving && (
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">
              Choosing a Pixel in MAIRO doesn&rsquo;t put it on your website. MAIRO never adds code to your site by itself:{" "}
              <Link href="/dashboard/tracking" className="text-violet-bright underline underline-offset-4">install it with the steps on the Tracking page</Link>, then check here.
            </p>
          )}
        </section>
      )}

      {/* 3. Choose (or create) */}
      {view.connected && choosing && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-labelledby="choose-title" aria-busy={list.state === "loading"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="choose-title" className="text-base font-medium text-white">Choose your Pixel</h2>
            <button type="button" className="min-h-11 text-sm text-violet-bright underline underline-offset-4 sm:pointer-fine:min-h-0" onClick={load} disabled={list.state === "loading"}>
              Refresh the list
            </button>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            The Pixels your Meta connection can use{list.state === "ready" ? ` in ad account ${list.adAccountId}` : ""}. Meta now also calls them datasets.
          </p>

          {list.state === "loading" && <p className="mt-4 text-sm text-neutral-400" role="status">Asking Meta for your Pixels…</p>}

          {list.state === "error" && (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/[0.05] p-4 text-sm" role="alert">
              <p className="text-red-200">{list.error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {list.reason === "missing_permission" || list.reason === "not_connected" ? (
                  <a href={reconnectHref} className={secondaryButtonClass}>Reconnect Meta</a>
                ) : null}
                <button type="button" className={secondaryButtonClass} onClick={load}>Try again</button>
              </div>
            </div>
          )}

          {list.state === "ready" && (
            <>
              {list.options.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-300">No Pixels found in ad account {list.adAccountId}. Create one below — through MAIRO, or in Meta Events Manager — then refresh the list.</p>
              ) : (
                <fieldset className="mt-4 space-y-2">
                  <legend className="sr-only">Your Pixels</legend>
                  {list.options.map((o) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-4 text-sm ${o.unavailable ? "cursor-not-allowed opacity-50" : ""} ${picked === o.id ? "border-violet/60 bg-violet/[0.08]" : "border-white/10 hover:border-white/25"}`}
                    >
                      <input type="radio" name="pixel" value={o.id} className="mt-1 h-4 w-4 shrink-0" disabled={o.unavailable} checked={picked === o.id} onChange={() => pick(o)} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">{o.name}</span>
                          {o.recommended && <Badge tone="green">Suggested</Badge>}
                          {view.pixel?.id === o.id && <Badge tone="neutral">In use</Badge>}
                        </span>
                        <span className="mt-0.5 block break-all text-xs text-neutral-500">ID {o.id}{o.owner ? ` · owned by ${o.owner}` : ""}</span>
                        <span className="mt-1 block text-neutral-400">{o.why}</span>
                        {o.hosts.length > 0 && <span className="mt-1 block text-neutral-400">Events seen from: {o.hosts.join(", ")}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {pickedOption && (
                <div className="mt-5 rounded-xl border border-white/10 p-4">
                  <label htmlFor="pixel-domain" className="text-sm font-medium text-white">Which website is this Pixel for?</label>
                  <input
                    id="pixel-domain"
                    value={domain}
                    onChange={(e) => {
                      setDomain(e.target.value);
                      setDomainOk(false);
                    }}
                    placeholder="yourshop.com"
                    inputMode="url"
                    autoCapitalize="none"
                    className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
                  />
                  {pickedOption.hosts.length > 0 && domain && !pickedOption.hosts.some((h) => h === host(domain)) && (
                    <p className="mt-2 text-xs text-amber-200">Meta has seen this Pixel&rsquo;s events from {pickedOption.hosts.join(", ")}, not {host(domain)}. Make sure it&rsquo;s the right one.</p>
                  )}
                  <label className="mt-3 flex items-start gap-2 text-sm text-neutral-300">
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={domainOk} onChange={(e) => setDomainOk(e.target.checked)} />
                    <span>Use “{pickedOption.name}” (ID {pickedOption.id}){host(domain) ? ` for ${host(domain)}` : ""}.</span>
                  </label>
                  <button
                    type="button"
                    className={`${primaryButtonClass} mt-4`}
                    disabled={pending || !domainOk}
                    onClick={() => run(() => choosePixelAction(pickedOption.id, domain.trim() || null), () => setChoosing(false))}
                  >
                    {pending ? "Checking with Meta…" : "Confirm this Pixel"}
                  </button>
                </div>
              )}

              {/* Create */}
              {!view.pixel && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <h3 className="text-sm font-medium text-white">Create a new Pixel</h3>
                  {list.canCreate ? (
                    <>
                      <p className="mt-1 text-sm text-neutral-400">
                        MAIRO asks Meta to create one in ad account {list.adAccountId} and only says it&rsquo;s done once Meta confirms it.
                        {list.permissionsUnknown ? " MAIRO couldn't read your connection's permissions, so Meta's answer decides." : ""}
                      </p>
                      <button type="button" className={`${secondaryButtonClass} mt-3`} disabled={pending} onClick={() => run(() => createPixelAction(domain.trim() || null), () => setChoosing(false))}>
                        {pending ? "Creating…" : "Create a new Pixel"}
                      </button>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-neutral-400">
                      Your Meta connection doesn&rsquo;t include {list.missingForCreate.join(", ")}, which creating a Pixel needs. Create it in Events Manager (below), or{" "}
                      <a href={reconnectHref} className="text-violet-bright underline underline-offset-4">reconnect Meta</a> and allow it.
                    </p>
                  )}
                  <details className="mt-4 rounded-xl border border-white/10 p-4">
                    <summary className="min-h-11 cursor-pointer text-sm text-white sm:pointer-fine:min-h-0">Create it yourself in Meta Events Manager</summary>
                    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
                      <li>
                        Open{" "}
                        <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener noreferrer" className="text-violet-bright underline underline-offset-4">Meta Events Manager</a>{" "}
                        with the Facebook login that manages ad account {list.adAccountId}.
                      </li>
                      <li>Choose <strong className="font-medium text-white">Connect data sources</strong> (the + button), pick <strong className="font-medium text-white">Web</strong>, then Connect.</li>
                      <li>Name it (your business name works) and enter your website if asked, then Create.</li>
                      <li>When Meta asks how to install it, choose to do it later — MAIRO shows you how.</li>
                      <li>In Business Settings → Data sources → Datasets, check it&rsquo;s shared with ad account {list.adAccountId}.</li>
                      <li>Come back here and press <strong className="font-medium text-white">Refresh the list</strong>, then choose it.</li>
                    </ol>
                    <p className="mt-2 text-xs text-neutral-500">Meta renames these menus from time to time; the steps stay the same.</p>
                  </details>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 4. Decline */}
      {view.connected && view.decision !== "declined" && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
          {!declining ? (
            <button type="button" className="min-h-11 text-sm text-neutral-300 underline underline-offset-4 hover:text-white sm:pointer-fine:min-h-0" onClick={() => setDeclining(true)}>
              I don&rsquo;t want to connect a Pixel
            </button>
          ) : (
            <div>
              <h2 className="text-base font-medium text-white">Continue without a Pixel</h2>
              {shop ? (
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                  Without a Pixel, MAIRO can&rsquo;t reliably verify purchases on your website or optimise campaigns for purchases. Campaigns aimed at
                  website purchases won&rsquo;t launch until you connect one; campaigns for website visits, calls or messages still can. You can
                  connect a Pixel here any time.{view.pixel ? " MAIRO stops using the Pixel you chose — it stays in your Meta account." : ""}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                    That&rsquo;s fine for your business. MAIRO records that website events aren&rsquo;t tracked. How do you measure leads instead?
                  </p>
                  <fieldset className="mt-3 space-y-2">
                    <legend className="sr-only">How you measure leads</legend>
                    {(Object.keys(LEAD_MEASUREMENT) as LeadMeasurement[]).map((k) => (
                      <label key={k} className="flex items-start gap-2 text-sm text-neutral-300">
                        <input type="radio" name="lead-route" className="mt-1 h-4 w-4 shrink-0" checked={route === k} onChange={() => setRoute(k)} />
                        <span>
                          <span className="text-white">{LEAD_MEASUREMENT[k].label}</span>
                          <span className="block text-xs text-neutral-500">{LEAD_MEASUREMENT[k].detail}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={secondaryButtonClass} disabled={pending || (!shop && !route)} onClick={() => run(() => declinePixelAction(route || null), () => {
                    setDeclining(false);
                    setChoosing(false);
                  })}>
                  {shop ? "Continue without a Pixel" : "Save and continue"}
                </button>
                <button type="button" className="min-h-11 px-3 text-sm text-neutral-400 hover:text-white" onClick={() => setDeclining(false)}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      {view.connected && view.decision === "declined" && !shop && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm">
          <label htmlFor="lead-route-select" className="text-white">How you measure leads</label>
          <select
            id="lead-route-select"
            value={route}
            onChange={(e) => {
              const v = e.target.value as LeadMeasurement | "";
              setRoute(v);
              run(() => setLeadMeasurementAction(v || null));
            }}
            className="mt-2 block w-full max-w-md rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
          >
            <option value="">Not said</option>
            {(Object.keys(LEAD_MEASUREMENT) as LeadMeasurement[]).map((k) => (
              <option key={k} value={k}>{LEAD_MEASUREMENT[k].label}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-neutral-500">What you tell MAIRO, not a connection: nothing here connects to your CRM or phone system.</p>
        </section>
      )}

      {note && (
        <p role="status" className={`text-sm ${note.ok ? "text-emerald-300" : "text-red-300"}`}>
          {note.text}
        </p>
      )}

      {returnTo && (view.pixel || view.decision === "declined") && (
        <Link href={returnTo} className={primaryButtonClass}>
          Continue setup
        </Link>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-neutral-200">{value}</dd>
    </div>
  );
}
