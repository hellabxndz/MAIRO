// The environment the site lives in, after the galaxy.
//
// The galaxy was a beautiful thing that said the wrong word. A photograph of
// space says "vast" and "expensive"; it does not say "this software makes
// decisions for you", which is the entire proposition. It also carried a bug
// nobody could catch — small hard-edged squares on phones that survived five
// separate fixes — and every one of those squares came out of the WebGL scene.
// Replacing it answers the brief and closes the bug in the same move.
//
// What replaces it is compute rather than cosmos: a deep field with slow
// luminous blooms drifting through it, a measured lattice on top, and one scan.
// It is the look of something thinking, not somewhere far away.
//
// Built entirely from gradients. There is no canvas, no WebGL, no sprite and no
// particle anywhere in this file — the only things that move are three blooms
// the size of the screen and one soft band, all of them driven by transforms
// the compositor handles on the GPU without repainting. Nothing here is small
// enough to read as debris, which after this page's history is a requirement
// rather than a preference.

export function IntelligenceField({
  /**
   * How much of it to show. The marketing page wants the full thing; a
   * dashboard is somewhere people work, and a backdrop that competes with the
   * numbers is a backdrop that has to go.
   */
  intensity = 1,
  /** The scrims that keep type readable over it. Not wanted behind a table. */
  scrim = true,
  /**
   * Freeze it.
   *
   * A landing page is somewhere you look; a dashboard is somewhere you work,
   * and a backdrop that drifts competes with the numbers someone is trying to
   * read. Still, this costs one paint and then nothing at all — no compositing
   * work per frame, which is what a screen full of tables should be spending
   * its budget on.
   */
  still = false,
}: {
  intensity?: number;
  scrim?: boolean;
  still?: boolean;
} = {}) {
  const frozen = still ? " if-still" : "";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[20] overflow-hidden bg-[#04050a]">
      {/* The blooms.

          Three, not more: each one is a screen-sized layer the compositor has
          to blend every frame, and the fourth added cost without adding
          anything anybody could see. They are radial gradients rather than
          blurred shapes on purpose — `filter: blur()` on something this large
          is the single most expensive thing you can put on a phone, and a
          gradient with a long falloff is already soft.

          The colours are a deliberate spread rather than a palette: indigo
          carries the mass, cyan is the cold edge that keeps it from turning
          purple and sweet, and the violet is small and warm and stops the
          whole thing reading as corporate blue. */}
      <div className={`if-bloom if-bloom-a${frozen}`} style={{ opacity: 0.85 * intensity }} />
      <div className={`if-bloom if-bloom-b${frozen}`} style={{ opacity: 0.7 * intensity }} />
      <div className={`if-bloom if-bloom-c${frozen}`} style={{ opacity: 0.55 * intensity }} />

      {/* The lattice: measured, and completely still. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.9 * intensity,
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(255,255,255,0.03) 0 1px, transparent 1px 88px)," +
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.03) 0 1px, transparent 1px 88px)",
          WebkitMaskImage:
            "radial-gradient(ellipse 125% 80% at 50% 40%, #000 12%, rgba(0,0,0,0.5) 60%, transparent 94%)",
          maskImage:
            "radial-gradient(ellipse 125% 80% at 50% 40%, #000 12%, rgba(0,0,0,0.5) 60%, transparent 94%)",
        }}
      />

      {/* One travelling thing on a page is a signature. Two is a screensaver. */}
      {!still && <div className="if-scan" style={{ opacity: intensity }} />}

      {scrim && (
        <>
          {/* Legibility, weighted to where the type actually is.

              Wide screens put the copy in a left-hand column, so the weight
              goes left and the rest of the frame is left alone. Narrow screens
              run the type full width, so the same left-to-right wash would
              cover the whole picture — those get a vertical fall instead,
              heaviest across the headline and easing down the frame. */}
          <div className="absolute inset-0 hidden bg-[linear-gradient(to_right,rgba(4,5,10,0.78)_0%,rgba(4,5,10,0.5)_28%,rgba(4,5,10,0.14)_58%,rgba(4,5,10,0)_82%)] md:block" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(4,5,10,0.72)_0%,rgba(4,5,10,0.4)_26%,rgba(4,5,10,0.26)_52%,rgba(4,5,10,0.3)_78%,rgba(4,5,10,0.6)_100%)] md:hidden" />
          {/* Top and bottom, so the nav and the footer always have ground. */}
          <div className="absolute inset-0 hidden bg-[linear-gradient(to_bottom,rgba(4,5,10,0.6)_0%,rgba(4,5,10,0)_16%,rgba(4,5,10,0)_80%,rgba(4,5,10,0.55)_100%)] md:block" />
        </>
      )}

      <style>{`
        .if-bloom {
          position: absolute;
          border-radius: 9999px;
          will-change: transform;
        }

        /* Placement is set by the scrims, not by taste.
           
           The first arrangement put the indigo mass top-left, which is exactly
           where the legibility wash is heaviest on a wide screen — 88% black
           over the one bloom carrying most of the colour. It rendered as a
           near-black page with a faint teal corner, which is a lot of work to
           arrive at flat. The colour now lives in the middle and low-right of
           the frame, through the gap between the left-hand wash and the
           console, where there is nothing to fight it. */

        /* Indigo, the mass of it, centre-right and low. */
        .if-bloom-a {
          top: 2%; left: 26%; width: 88%; height: 112%;
          background: radial-gradient(closest-side, rgba(88,86,244,0.42), rgba(88,86,244,0.14) 52%, transparent 78%);
          animation: if-drift-a 54s ease-in-out infinite;
        }

        /* Cyan, the cold edge, low left under the copy where the wash eases. */
        .if-bloom-b {
          bottom: -40%; left: -14%; width: 84%; height: 96%;
          background: radial-gradient(closest-side, rgba(34,200,228,0.34), rgba(34,200,228,0.11) 50%, transparent 76%);
          animation: if-drift-b 67s ease-in-out infinite;
        }

        /* Violet, small and warm, top right. Keeps it from going corporate. */
        .if-bloom-c {
          top: -30%; right: -12%; width: 62%; height: 84%;
          background: radial-gradient(closest-side, rgba(190,110,255,0.30), rgba(190,110,255,0.09) 48%, transparent 74%);
          animation: if-drift-c 81s ease-in-out infinite;
        }

        /* Long, slow and never returning to the same place at the same time —
           three different periods, none a multiple of another, so the field
           does not visibly loop. Transform only: no layout, no repaint. */
        @keyframes if-drift-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50%      { transform: translate3d(6%, 4%, 0) scale(1.12); }
        }
        @keyframes if-drift-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1.06); }
          50%      { transform: translate3d(-7%, 6%, 0) scale(1); }
        }
        @keyframes if-drift-c {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50%      { transform: translate3d(5%, -5%, 0) scale(1.16); }
        }

        .if-scan {
          position: absolute;
          top: 0; bottom: 0;
          width: 36%;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(150,190,255,0.04) 38%,
            rgba(200,220,255,0.06) 50%,
            rgba(150,190,255,0.04) 62%,
            transparent 100%
          );
          animation: if-scan 26s linear infinite;
          will-change: transform;
        }

        /* Starts and ends fully off the frame, so it enters and leaves rather
           than appearing in the middle of the screen. */
        @keyframes if-scan {
          from { transform: translate3d(-120%, 0, 0); }
          to   { transform: translate3d(400%, 0, 0); }
        }

        /* Frozen mid-drift rather than at the start of it, so a still field
           is not the same composition every time it is used. */
        .if-still { animation: none !important; }
        .if-bloom-a.if-still { transform: translate3d(3%, 2%, 0) scale(1.06); }
        .if-bloom-b.if-still { transform: translate3d(-4%, 3%, 0) scale(1.03); }
        .if-bloom-c.if-still { transform: translate3d(3%, -3%, 0) scale(1.08); }

        @media (prefers-reduced-motion: reduce) {
          .if-bloom { animation: none; }
          .if-scan { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
