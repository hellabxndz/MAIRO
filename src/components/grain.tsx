// A subtle, fixed film-grain overlay for a cinematic, non-flat feel.
//
// The noise is a repeating background *image* (an SVG data URI the browser
// decodes once), not a live <svg><filter> in the document. A filter element
// participates in compositing on every frame anything moves beneath it, which
// measured as a real slice of the frame budget across the whole viewport; a
// tiled bitmap is painted and then left alone. No mix-blend-mode for the same
// reason — blending a full-viewport layer forces everything under it to be
// re-blended, and at this opacity plain alpha looks the same.
const NOISE_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 opacity-[0.05]"
      style={{ backgroundImage: NOISE_TILE, backgroundRepeat: "repeat" }}
    />
  );
}
