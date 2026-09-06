// The coloured depth over the starfield: distant nebulae and one large
// formation, drifting slowly enough that you notice it only if you stop and
// look for it.
//
// These are CSS elements rather than more canvas work on purpose. Transform and
// opacity are the two properties a browser animates on the compositor — the
// layer is rasterised once and then moved, with no repaint per frame — so this
// costs almost nothing on top of the star canvas underneath it.
//
// Restraint is the whole point. Each one is a wide, very low-opacity radial
// gradient with no hard edge anywhere. Anything more saturated stops reading as
// deep space and starts reading as a screensaver.

const FORMATIONS = [
  {
    id: "veil-a",
    css: "left:-18%; top:-22%; width:86vw; height:86vw; max-width:1250px; max-height:1250px;",
    from: "rgba(86,64,175,0.30)",
    mid: "rgba(60,44,130,0.11)",
    seconds: 74,
  },
  {
    id: "veil-b",
    css: "right:-24%; top:12%; width:70vw; height:70vw; max-width:1000px; max-height:1000px;",
    from: "rgba(28,64,150,0.26)",
    mid: "rgba(20,44,105,0.10)",
    seconds: 96,
  },
  {
    id: "veil-c",
    css: "left:6%; bottom:-30%; width:78vw; height:78vw; max-width:1120px; max-height:1120px;",
    from: "rgba(112,52,160,0.22)",
    mid: "rgba(70,34,110,0.08)",
    seconds: 118,
  },
];

/**
 * @param className Overrides the positioning and stacking. The default puts the
 *   veil behind the marketing page; the intro overlay passes its own so the
 *   same nebulae can sit inside it, which is the point — the film and the site
 *   are meant to be the same sky, not two that resemble each other.
 */
export function CosmicVeil({
  className = "pointer-events-none fixed inset-0 -z-[9] overflow-hidden",
}: {
  className?: string;
} = {}) {
  return (
    <div aria-hidden className={className}>
      {FORMATIONS.map((f) => (
        <div
          key={f.id}
          className={f.id}
          style={{
            position: "absolute",
            background: `radial-gradient(circle, ${f.from} 0%, ${f.mid} 42%, rgba(0,0,0,0) 72%)`,
          }}
        />
      ))}

      {/* Settles the edges of the frame so nothing bright drifts into a corner
          and pulls the eye off the type.

          The centre stop is transparent. It was 55% black, which put a heavy
          wash straight over the middle of the screen — the one place the sky is
          meant to be clearest — and flattened both the stars and the formations
          into the background. White type on near-black does not need the help. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.22)_55%,rgba(0,0,0,0.72)_100%)]" />

      <style>{`
        .veil-a, .veil-b, .veil-c { will-change: transform; }
        .veil-a { ${FORMATIONS[0].css} animation: veil-a ${FORMATIONS[0].seconds}s ease-in-out infinite; }
        .veil-b { ${FORMATIONS[1].css} animation: veil-b ${FORMATIONS[1].seconds}s ease-in-out infinite; }
        .veil-c { ${FORMATIONS[2].css} animation: veil-c ${FORMATIONS[2].seconds}s ease-in-out infinite; }

        @keyframes veil-a {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          50%     { transform: translate3d(4vw,3vh,0) scale(1.1); }
        }
        @keyframes veil-b {
          0%,100% { transform: translate3d(0,0,0) scale(1.06); }
          50%     { transform: translate3d(-4vw,4vh,0) scale(1); }
        }
        @keyframes veil-c {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          50%     { transform: translate3d(5vw,-3vh,0) scale(1.12); }
        }

        @media (prefers-reduced-motion: reduce) {
          .veil-a, .veil-b, .veil-c { animation: none; }
        }
      `}</style>
    </div>
  );
}
