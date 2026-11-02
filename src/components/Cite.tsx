"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fmt, fmtPeriod, STATUS_LABEL, TIER_LABEL } from "@/lib/format";
import type { Cited } from "@/lib/site";

const POP_W = 320;

/**
 * Source chip for one number: tier + verified dot. Hover, focus or tap opens the full
 * provenance. The popover is position: fixed so scrolling tables and cards can't clip it.
 */
export function Cite({ c, showValue = false }: { c: Cited; showValue?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 220;
    const w = Math.min(POP_W, innerWidth - 24);
    const above = r.top - h - 8 > 64;
    setPos({ left: Math.max(12, Math.min(r.left, innerWidth - w - 12)), top: above ? r.top - h - 8 : r.bottom + 8, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    addEventListener("scroll", close, true);
    addEventListener("resize", close);
    addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      removeEventListener("scroll", close, true);
      removeEventListener("resize", close);
      removeEventListener("keydown", esc);
    };
  }, [open]);

  const enter = () => { clearTimeout(hoverTimer.current); setOpen(true); };
  const leave = () => { hoverTimer.current = setTimeout(() => setOpen(false), 120); };

  const s = c.source;
  return (
    <span className="cite" ref={wrap} onMouseEnter={enter} onMouseLeave={leave}>
      <button
        ref={btn}
        type="button"
        className={`chip ${s.verified ? "v" : "u"}`}
        aria-expanded={open}
        aria-label={`Source: ${s.publisher}, tier ${s.tier}, ${s.verified ? "verified" : "not verified"}`}
        onClick={() => setOpen((o) => !o)}
        onFocus={enter}
      >
        <span className="dot" aria-hidden />
        T{s.tier} · {s.publisher.length > 18 ? `${s.publisher.slice(0, 17)}…` : s.publisher}
      </button>
      {open && (
        <span
          ref={pop}
          className="pop"
          role="dialog"
          aria-label={`Source details: ${s.title}`}
          style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, bottom: "auto", width: `min(${POP_W}px, calc(100vw - 24px))`, visibility: "visible", opacity: pos ? 1 : 0, transform: "none" }}
        >
          {showValue && <b style={{ fontSize: 18 }}>{fmt(c)}</b>}
          <span className="t" style={{ display: "block" }}>{s.title}</span>
          <span className="muted">{s.publisher}{s.published ? ` · ${s.published}` : ""}</span>
          <dl>
            <dt>Tier</dt><dd>{s.tier} — {TIER_LABEL[s.tier]}</dd>
            <dt>Checked</dt><dd>{s.verified ? "✓ Verified against the page" : "○ Not yet verified"}</dd>
            <dt>Period</dt><dd>{fmtPeriod(c.period)}</dd>
            <dt>Status</dt><dd>{STATUS_LABEL[c.status]} · {c.method}</dd>
            <dt>Confidence</dt><dd>{Math.round(c.confidence * 100)}%</dd>
            {c.low !== undefined && c.high !== undefined && (<><dt>Range</dt><dd>{fmt(c, c.low)} – {fmt(c, c.high)}</dd></>)}
          </dl>
          {c.note && <span className="note" style={{ display: "block" }}>{c.note}</span>}
          <a href={s.url} target="_blank" rel="noopener noreferrer">Open source ↗</a>
        </span>
      )}
    </span>
  );
}
