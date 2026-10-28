"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

// The product's movement, in two pieces: something arriving (Reveal) and a
// group arriving in order (Stagger). Short, one easing (the design system's
// --ease-mairo), and nothing at all for anyone who asked for less motion —
// content is never hidden waiting for an animation.

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({ delay = 0, y = 10, ...rest }: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  const still = useReducedMotion();
  if (still) return <motion.div {...rest} />;
  return <motion.div initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay }} {...rest} />;
}

export function Stagger({ step = 0.05, ...rest }: HTMLMotionProps<"div"> & { step?: number }) {
  const still = useReducedMotion();
  return <motion.div initial={still ? false : "hidden"} animate="shown" variants={{ hidden: {}, shown: { transition: { staggerChildren: step } } }} {...rest} />;
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return <motion.div variants={{ hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }} {...props} />;
}
