"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { NeuralBrain } from "@/components/neural-brain";

// Wraps the neural-brain visual so it can be picked up and dragged around —
// it snaps back with a springy rubber-band feel on release.
export function HeroBrain({ className = "" }: { className?: string }) {
  const [dragging, setDragging] = useState(false);

  return (
    <motion.div
      className={className}
      drag
      dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
      dragElastic={0.65}
      dragTransition={{ bounceStiffness: 280, bounceDamping: 18 }}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      whileHover={{ scale: 1.03 }}
      whileDrag={{ scale: 1.08 }}
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
    >
      <NeuralBrain className="h-full w-full drop-shadow-[0_0_60px_rgba(168,85,247,0.25)]" />
    </motion.div>
  );
}
