import { IntelligenceField } from "@/components/intelligence-field";

// The signed-in backdrop: the same field as the marketing page, turned right
// down and frozen.
//
// The restraint is the whole point. A landing page is somewhere you look; a
// dashboard is somewhere you work, and a backdrop that moves is a backdrop that
// competes with the numbers someone is trying to read. So this keeps the
// identity and drops the theatre — the blooms are held mid-drift and the scan
// is not rendered at all, which means one paint on mount and then no
// compositing work for as long as the screen is open.
//
// It used to be a 2D canvas of drawn stars over a still panorama of the Milky
// Way, and both of those went with the galaxy. This is not a server component
// by accident: there is no state, no effect and no canvas left in it, so it has
// no reason to ship any JavaScript to the browser.

export function AmbientSky() {
  return (
    <>
      {/* A third of the marketing intensity. Text over this has to stay as
          readable as text over flat black, which is the constraint that set
          the number. */}
      <IntelligenceField intensity={0.34} scrim={false} still />

      {/* Pulls the middle of the screen — where the work is — back towards
          flat, and leaves the colour readable only at the edges. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[19] bg-[radial-gradient(ellipse_at_50%_42%,rgba(4,5,10,0.86)_0%,rgba(4,5,10,0.6)_50%,rgba(4,5,10,0.18)_100%)]"
      />
    </>
  );
}
