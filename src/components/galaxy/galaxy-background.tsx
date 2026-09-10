"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MilkyWay } from "@/components/milky-way";
import type { Scene, Tier } from "./scene";

// The environment the whole site lives inside.
//
// It is fixed behind everything and never unmounts, so scrolling from the hero
// to the footer is one continuous flight rather than a series of backgrounds.
// The page's own markup sits on top of it untouched — nothing about the
// content had to change to put it in here.
//
// Three things about how it loads matter more than the rendering does.
//
// The WebGL is dynamically imported. It is the largest piece of JavaScript on
// the page and none of it is needed to read the words, so it is fetched after
// the page is interactive rather than in the critical path.
//
// There is a real fallback, not a black screen. Anything without WebGL2 — and
// anyone who has asked their system for reduced motion — gets the rendered
// panorama instead: a still, 4K photograph of the same galaxy that costs
// 144KB and holds sixty frames a second on anything. The site is never worse
// than it was; the scene is what it becomes when the machine can take it.
//
// And the quality tier is not guessed once and left. The renderer watches its
// own frame times and steps itself down if it cannot hold the budget, which is
// the only honest way to handle a laptop that looks capable and is not.

function initialTier(): { tier: Tier; stars: number } {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 900;

  // Phones start low. Not because they cannot render it — a recent phone GPU
  // is quick — but because the volume pass is fill-rate bound and a phone has
  // three times the pixels of a laptop and a battery to think about.
  // Roughly forty per cent fewer than this started with. A dense carpet of
  // stars is what makes a real exposure look deep, but this is a page with
  // words on it, and past a certain density every headline sits on texture
  // instead of on sky. The galaxy still reads; the type wins.
  if (coarse || narrow) return { tier: 0, stars: 82_000 };
  if (cores <= 4 || mem <= 4) return { tier: 1, stars: 150_000 };
  return { tier: 2, stars: 240_000 };
}

/**
 * Whether this browser should be offered the scene at all.
 *
 * Cached, because `useSyncExternalStore` may ask more than once a render and
 * creating a WebGL context to answer is not free. Nothing it depends on can
 * change during a session, so the subscription is a no-op and the server
 * always answers "no" — which is what puts the still panorama into the HTML
 * that ships, rather than a black rectangle waiting for JavaScript.
 */
let capability: boolean | null = null;

function readCapability(): boolean {
  if (capability !== null) return capability;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    capability = false;
  } else {
    capability = Boolean(document.createElement("canvas").getContext("webgl2"));
  }
  return capability;
}

const neverChanges = () => () => {};

export function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capable = useSyncExternalStore(neverChanges, readCapability, () => false);
  const [live, setLive] = useState(false);
  // The panorama stays mounted underneath through the crossfade and only goes
  // once the canvas is fully opaque over it. Unmounting it the moment the
  // scene took over meant the two never overlapped, so whatever the canvas had
  // not finished fading in was black.
  const [showStill, setShowStill] = useState(true);

  useEffect(() => {
    if (!capable) return;

    let scene: Scene | null = null;
    let cancelled = false;
    let resizeTimer: number | undefined;
    let handoverTimer: number | undefined;

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scene?.setProgress(max > 0 ? window.scrollY / max : 0);
    };
    const onPointer = (e: PointerEvent) => {
      scene?.setPointer(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1
      );
    };
    const onResize = () => {
      // Rebuilding four render targets on every pixel of a window drag is
      // wasted work; this waits for the drag to finish.
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => scene?.resize(), 180);
    };

    (async () => {
      try {
        const { createScene } = await import("./scene");
        if (cancelled || !canvasRef.current) return;

        const { tier, stars } = initialTier();
        scene = createScene({
          canvas: canvasRef.current,
          starCount: stars,
          tier,
          onReady: () => {
            // The sky is lit; cross to it. Until this fires the page is
            // showing the still panorama, which is in the server-rendered
            // HTML and therefore up from the first paint.
            setLive(true);
            handoverTimer = window.setTimeout(() => setShowStill(false), 1000);
          },
          onGiveUp: () => {
            // Back to the panorama, and stop rendering entirely. The crossfade
            // is the same one that brought the scene in, so this reads as a
            // deliberate settle rather than a failure.
            // Cancel the handover if it has not happened yet. Giving up
            // inside that one-second window would otherwise put the panorama
            // back and then have the pending timer take it away again, and
            // the page would be left with a disposed canvas over nothing.
            window.clearTimeout(handoverTimer);
            setLive(false);
            setShowStill(true);
            scene?.dispose();
            scene = null;
          },
        });
        if (!scene) return;

        onScroll();
        scene.start();

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("resize", onResize);
      } catch (error) {
        // A shader that will not compile on some driver is not a reason to
        // show a broken page — the panorama is already on screen and simply
        // stays there. It is worth saying so out loud, though: silence here
        // cost an hour once, with the scene falling back correctly and no
        // indication anywhere of why.
        console.warn("Galaxy scene unavailable, using the still sky instead.", error);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
      window.clearTimeout(handoverTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      scene?.dispose();
    };
  }, [capable]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[20] bg-black">
      {/* Present from the first frame, so the page has a real sky while the
          renderer is still being fetched, and keeps one for good if it can't
          run. It fades out under the canvas rather than being pulled away in
          front of it. */}
      {showStill && (
        <div
          className="absolute inset-0"
          style={{ opacity: live ? 0 : 1, transition: "opacity 900ms ease" }}
        >
          <MilkyWay />
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: live ? 1 : 0, transition: "opacity 900ms ease" }}
      />

      {/* Legibility, without flattening the picture.

          A flat wash over the whole frame would be the easy fix and it is the
          wrong one: it lifts the black sky to grey, and the darkness is what
          makes the galaxy look bright. So this darkens only where the type
          actually is — which is a different place on the two shapes of screen,
          and the reason there are two of these.

          Wide: the type lives in a left-hand column, so the left third gets
          the weight and the rest of the frame is left alone.

          Narrow: it does not. The type runs the full width, and this same
          left-to-right wash was covering eighty per cent of a 390px phone at
          two-thirds black or heavier — a black slab over the picture, which is
          exactly what it looks like. What a phone needs is a vertical fall:
          heaviest across the headline at the top, easing off down the frame so
          the galaxy has somewhere to be. */}
      <div className="absolute inset-0 hidden bg-[linear-gradient(to_right,rgba(0,0,0,0.86)_0%,rgba(0,0,0,0.66)_26%,rgba(0,0,0,0.24)_54%,rgba(0,0,0,0)_80%)] md:block" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.70)_0%,rgba(0,0,0,0.48)_24%,rgba(0,0,0,0.30)_48%,rgba(0,0,0,0.18)_70%,rgba(0,0,0,0.14)_88%,rgba(0,0,0,0.40)_100%)] md:hidden" />
      <div className="absolute inset-0 hidden bg-[linear-gradient(to_bottom,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0)_18%,rgba(0,0,0,0)_82%,rgba(0,0,0,0.55)_100%)] md:block" />
    </div>
  );
}
