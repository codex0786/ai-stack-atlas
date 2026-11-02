"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

interface Layer { id: string; name: string; desc: string; observations: number; entities: { name: string }[] }

const goTo = (id: string) => document.getElementById(`layer-${id}`)?.scrollIntoView({ behavior: "smooth" });

/** The seven-layer stack, built bottom-up: energy at the base, demand on top, capital alongside. */
export function StackHero({ layers, cap }: { layers: Layer[]; cap: Layer }) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div>
      <div className="stack" style={{ gridTemplateColumns: "18px 1fr 44px" }}>
        <FlowRail />
        <div className="slabs" onMouseLeave={() => setHover(null)}>
          {layers.map((l, i) => {
            const open = hover === l.id;
            return (
              <motion.button
                type="button"
                key={l.id}
                className="slab"
                style={{ background: `var(--${l.id.toLowerCase()})` }}
                initial={{ opacity: 0, y: 40, scaleX: 0.92 }}
                animate={{ opacity: 1, y: 0, scaleX: 1 }}
                transition={{ delay: 0.15 + i * 0.09, type: "spring", stiffness: 220, damping: 24 }}
                whileHover={{ x: 6 }}
                onMouseEnter={() => setHover(l.id)}
                onFocus={() => setHover(l.id)}
                onClick={() => goTo(l.id)}
                aria-label={`${l.name}: ${l.entities.length} entities, ${l.observations} sourced numbers. Jump to section.`}
              >
                <motion.span
                  className="shine"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ delay: 1.1 + i * 0.12, duration: 1.1, repeat: Infinity, repeatDelay: 7 + i * 0.3, ease: "easeInOut" }}
                />
                <span className="lid">{l.id}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="lname">{l.name}</span>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.span
                        className="slab-detail"
                        style={{ display: "block" }}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        {l.entities.length ? l.entities.slice(0, 6).map((e) => e.name).join(" · ") + (l.entities.length > 6 ? ` +${l.entities.length - 6}` : "") : l.desc}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="lcount">{l.observations ? `${l.observations} facts` : "Phase 1"}</span>
              </motion.button>
            );
          })}
        </div>
        <motion.button
          type="button"
          className="cap"
          initial={{ opacity: 0, scaleY: 0.4 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ delay: 0.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => goTo(cap.id)}
          aria-label={`Capital, across every layer: ${cap.observations} sourced numbers. Jump to section.`}
        >
          Capital · {cap.observations} facts
        </motion.button>
      </div>
      <div className="flow-legend">
        <span>↑ Power and silicon flow up the stack</span>
        <span>↓ Spending flows down it</span>
        <span>Hover a layer to see who's in it</span>
      </div>
    </div>
  );
}

/** A dot climbing the rail: value moving from energy toward demand. */
function FlowRail() {
  return (
    <svg viewBox="0 0 18 400" preserveAspectRatio="none" aria-hidden style={{ width: 18, height: "100%" }}>
      <line x1="9" y1="4" x2="9" y2="396" stroke="var(--axis)" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" />
      {[0, 1.6, 3.2].map((d) => (
        <motion.circle
          key={d}
          cx="9"
          r="4"
          fill="var(--accent)"
          initial={{ cy: 396, opacity: 0 }}
          animate={{ cy: [396, 4], opacity: [0, 1, 1, 0] }}
          transition={{ delay: 1.2 + d, duration: 4.8, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </svg>
  );
}
