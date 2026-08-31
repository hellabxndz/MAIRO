"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Masks its content behind an overflow-hidden clip and slides it up into
// view on scroll — the classic editorial "text reveal" used by high-end
// agency sites. Wrap a line (or short phrase) of text with it.
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
    <span className={`block overflow-hidden ${className}`}>
      <motion.span
        className="block"
        initial={{ y: "110%" }}
        animate={{ y: "0%" }}
        transition={{ duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.span>
    </span>
  );
}
