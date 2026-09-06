"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Masks its content behind an overflow-hidden clip and slides it up into view.
// Wrap a line (or short phrase) of text with it.
//
// Two things here are not obvious.
//
// 1. The reveal triggers on scroll, not on mount. With `animate` every heading
//    on the page played at load, so by the time you scrolled down to one it had
//    already finished — and ~15 transform animations starting at once made the
//    first scroll of the session measure 38fps against 59fps for the same
//    scroll afterwards.
//
// 2. The element that watches the viewport is the OUTER span, not the one that
//    moves. The outer span is the clip, and the inner one starts translated
//    fully below it — so an IntersectionObserver on the inner span sees a
//    completely clipped element, reports "not intersecting", and the reveal can
//    never fire. It hides itself out of its own trigger. Observing the wrapper
//    and passing the state down as a variant avoids that.
//
// Anything already on screen at load animates immediately, so the hero is
// unaffected.

const line = {
  hidden: { y: "110%" },
  shown: { y: "0%" },
};

export function TextReveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.span
      className={`pointer-events-none block overflow-hidden ${className}`}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-80px" }}
    >
      <motion.span
        className="block"
        variants={line}
        transition={{ duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.span>
    </motion.span>
  );
}
