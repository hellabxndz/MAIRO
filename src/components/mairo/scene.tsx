// The hero scene, as the render.
//
// This is the actual reference artwork — sky, rock, the wet floor, the lit
// platform, the core with its creatives in orbit, the light streams — with the
// interface that was baked into it painted out. The plate is built by
// scripts/build-hero-plate.py; re-run that if the render is ever replaced.
//
// Three SVG components used to stand here (environment, streams, core) and they
// were a good approximation and still an approximation. The render is raytraced
// with volumetric light and depth of field, and no amount of gradient stacking
// was going to land on it. Using the real thing is exact by construction.
//
// What is NOT baked in, and is deliberately still HTML on top of it: the nav,
// the headline, the buttons, the four cards, the corner labels and the strip.
// Those have to be selectable, translatable, focusable, reflowable and
// crawlable, and a picture of them is none of those. The one exception is the
// MAIRO wordmark inside the sphere, which is part of the artwork itself.
//
// Two placements, because one cannot serve both:
//
//   lg and up   The plate is absolute and full-bleed from the top of the
//               section, so the composition lands exactly as the render
//               composes it — rock at the edges, core dead centre behind the
//               headline block.
//
//   below lg    The headline wraps to four lines and the whole vertical rhythm
//               changes, so an absolute plate would sit behind the text. There
//               it runs in the flow instead, directly under the buttons,
//               overhanging both edges so the core still reads at size.
//
// Both point at the same file, so it is one download either way.

import Image from "next/image";

const SRC = "/hero/scene.webp";
// The phone crop. Same render, framed on the core — see build-hero-plate.py.
const SRC_NARROW = "/hero/scene-narrow.webp";

/** Natural size of the plate. Given so the browser reserves the box and the
 *  page does not jump when it decodes. */
const W = 1448;
const H = 1086;

export function MairoSceneWide() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 -z-10 hidden justify-center overflow-hidden lg:flex"
      // Nudged down rather than pinned to the top of the section. The render
      // sets its own headline in a tighter block than the live type does — real
      // text at real sizes runs about forty pixels lower by the time it reaches
      // the buttons — so pinning the plate at zero put the core's glow through
      // the second button. Expressed against --plate-w so the offset scales
      // with the artwork instead of drifting at wide widths.
      style={{ top: "calc(var(--plate-w) * 0.082)" }}
    >
      <Image
        src={SRC}
        alt=""
        width={W}
        height={H}
        priority
        sizes="(min-width: 2000px) 2000px, 100vw"
        className="mairo-par-scene h-auto max-w-none select-none"
        style={{ width: "var(--plate-w)" }}
        draggable={false}
      />
    </div>
  );
}

export function MairoSceneNarrow() {
  return (
    <div className="relative -mx-5 overflow-hidden sm:-mx-8 lg:hidden">
      <Image
        src={SRC_NARROW}
        alt=""
        width={756}
        height={682}
        priority
        sizes="112vw"
        className="mairo-par-scene ml-[-6%] h-auto w-[112%] max-w-none select-none"
        draggable={false}
      />
    </div>
  );
}
