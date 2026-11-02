"use client";

import { animate, MotionConfig, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { joinParts, type Parts } from "@/lib/format";

/** Respect the OS reduced-motion setting everywhere. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fade-and-rise when scrolled into view. */
export function Reveal({ children, delay = 0, className, style }: { children: ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to the final value once visible; units stay fixed so the width barely moves. */
export function CountUp({ parts, duration = 1.4 }: { parts: Parts; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(parts.num);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!inView || reduce) return;
    setStarted(true);
    const controls = animate(0, parts.num, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setN });
    return () => controls.stop();
  }, [inView, reduce, parts.num, duration]);

  // Server HTML and first paint show the real value (no flash of zeros without JS).
  return <span ref={ref} aria-label={joinParts(parts)}>{joinParts(parts, started ? n : parts.num)}</span>;
}
