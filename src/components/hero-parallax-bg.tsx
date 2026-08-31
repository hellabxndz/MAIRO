"use client";

import { useScroll, useTransform, motion } from "framer-motion";
import { AmbientNetwork } from "@/components/ambient-network";

// The hero's ambient background drifts slower than the page scrolls,
// creating a sense of depth as you move past it.
export function HeroParallaxBg() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, 180]);
  const opacity = useTransform(scrollY, [0, 700], [1, 0]);

  return (
    <motion.div style={{ y, opacity }} className="absolute inset-0">
      <AmbientNetwork className="h-full w-full" />
    </motion.div>
  );
}
