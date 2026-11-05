// The public site's backdrop (v3 "Signal"): the homepage's near-black and
// nothing else — no light, no grain. The signed-in app keeps AmbientSky.
export function SiteBackdrop() {
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-[20] bg-[color:var(--v3-ink)]" />;
}
