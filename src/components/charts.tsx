"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt, fmtPeriod, joinParts, parts, STATUS_LABEL } from "@/lib/format";
import { periodEnd } from "@/lib/resolver";
import type { Cited } from "@/lib/site";
import { Cite } from "./Cite";

// Hand-built charts (no chart library): thin marks, hairline grid, one axis, hover tooltip
// on every mark, a data table and the source chips under every chart.

function uniqueSources(cs: Cited[]): Cited[] {
  const seen = new Set<string>();
  return cs.filter((c) => (seen.has(c.source.id) ? false : (seen.add(c.source.id), true)));
}

export function ChartFrame({ title, sub, cited, legend, table, children, bare }: { title: string; sub?: string; cited: Cited[]; legend?: ReactNode; table: ReactNode; children: ReactNode; bare?: boolean }) {
  // Bare: embedded in a page that already shows the sources and table (entity pages).
  if (bare) return <div className="chart-card" style={{ padding: 0 }}>{children}{legend}</div>;
  return (
    <div className="card chart-card">
      <h3>{title}</h3>
      {sub && <p className="sub">{sub}</p>}
      {children}
      {legend}
      <div className="chart-sources">
        <span className="small muted">Sources</span>
        {/* One chip per publisher (the latest), so 70 filings don't become 70 chips; the table lists each. */}
        {[...uniqueSources(cited).reduce((m, c) => m.set(c.source.publisher, [...(m.get(c.source.publisher) ?? []), c]), new Map<string, Cited[]>()).values()].map((group) => {
          const latest = [...group].sort((a, b) => (b.source.published ?? b.period).localeCompare(a.source.published ?? a.period))[0]!;
          return (
            <span key={latest.source.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Cite c={latest} />
              {group.length > 1 && <span className="small muted">+{group.length - 1} more {latest.source.kind === "filing" ? "filings" : "sources"} in the table</span>}
            </span>
          );
        })}
      </div>
      <details className="table"><summary>Data table</summary><div className="table-scroll">{table}</div></details>
    </div>
  );
}

function TipBody({ title, c }: { title: string; c: Cited }) {
  return (
    <>
      <div className="muted">{title}</div>
      <b>{fmt(c)}</b>
      {c.low !== undefined && c.high !== undefined && <div className="muted">range {fmt(c, c.low)} – {fmt(c, c.high)}</div>}
      <div>{fmtPeriod(c.period)} · {STATUS_LABEL[c.status]}</div>
      {c.note && <div className="muted" style={{ marginTop: 2 }}>{c.note.length > 90 ? `${c.note.slice(0, 89)}…` : c.note}</div>}
      <div className="muted">T{c.source.tier} · {c.source.publisher} {c.source.automated ? "· ⚙ automated" : c.source.verified ? "· ✓ verified" : "· not verified"}</div>
    </>
  );
}

function CitedTable({ rows }: { rows: { label: string; c: Cited }[] }) {
  return (
    <table>
      <thead><tr><th>Item</th><th>Value</th><th>Period</th><th>Source</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.c.id}>
            <td>{r.label}</td>
            <td className="num">{fmt(r.c)}{r.c.low !== undefined && r.c.high !== undefined ? ` (${fmt(r.c, r.c.low)}–${fmt(r.c, r.c.high)})` : ""}</td>
            <td>{fmtPeriod(r.c.period)}</td>
            <td><a href={r.c.source.url} target="_blank" rel="noopener noreferrer">{r.c.source.publisher}</a> · T{r.c.source.tier}{r.c.source.verified ? " ✓" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Horizontal bars ─────────────────────────────────────────────────────── */

export function BarList({ title, sub, rows, note, log = false }: { title: string; sub?: string; rows: { label: string; c: Cited; emphasis?: boolean }[]; note?: string; log?: boolean }) {
  // Scale to the values; a whisker reaching past the edge is clipped and drawn open-ended,
  // so one extreme outlier can't flatten every bar.
  const maxValue = Math.max(...rows.map((r) => r.c.value));
  const maxHigh = Math.max(...rows.map((r) => r.c.high ?? r.c.value));
  const max = Math.min(maxHigh, maxValue * 1.6);
  const [tip, setTip] = useState<number | null>(null);
  // Log scale (for values spanning orders of magnitude): bars start half a decade below the smallest value.
  const lo = Math.log10(Math.min(...rows.map((r) => r.c.value))) - 0.5;
  const pct = (v: number) => (log ? `${Math.max(0, (Math.log10(v) - lo) / (Math.log10(max) - lo)) * 100}%` : `${(v / max) * 100}%`);
  return (
    <ChartFrame title={title} sub={sub} cited={rows.map((r) => r.c)} table={<CitedTable rows={rows} />}
      legend={note ? <p className="small muted" style={{ marginTop: 10 }}>{note}</p> : undefined}>
      <div style={{ marginTop: 16, display: "grid", gap: 10 }} onMouseLeave={() => setTip(null)}>
        {rows.map((r, i) => (
          <div key={r.c.id} style={{ display: "grid", gridTemplateColumns: "minmax(72px, 28%) minmax(0, 1fr) auto", gap: 10, alignItems: "center", position: "relative" }}
            onMouseEnter={() => setTip(i)} onFocus={() => setTip(i)} tabIndex={0} aria-label={`${r.label}: ${fmt(r.c)}`}>
            <span className="small" style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <div style={{ position: "relative", height: 22 }}>
              <motion.div
                style={{ position: "absolute", left: 0, top: 4, height: 14, borderRadius: "0 4px 4px 0", background: r.emphasis ? "var(--s2)" : "var(--s1)" }}
                initial={{ width: 0 }}
                whileInView={{ width: pct(r.c.value) }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              />
              {r.c.low !== undefined && r.c.high !== undefined && (
                <motion.div aria-hidden initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.9 + i * 0.06 }}
                  style={{ position: "absolute", left: pct(r.c.low), width: `calc(${pct(Math.min(r.c.high, max))} - ${pct(r.c.low)})`, top: 10, height: 2, background: "var(--ink-2)", opacity: 0.6 }}>
                  <span style={{ position: "absolute", left: 0, top: -4, width: 2, height: 10, background: "var(--ink-2)" }} />
                  {r.c.high <= max
                    ? <span style={{ position: "absolute", right: 0, top: -4, width: 2, height: 10, background: "var(--ink-2)" }} />
                    : <span title={`up to ${fmt(r.c, r.c.high)}`} style={{ position: "absolute", right: -2, top: -5, fontSize: 10, lineHeight: "12px", color: "var(--ink-2)" }}>▸</span>}
                </motion.div>
              )}
            </div>
            <motion.span className="small" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.7 + i * 0.06 }}
              style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textAlign: "right" }}>
              {fmt(r.c)}
            </motion.span>
            {tip === i && <div className="tip" style={{ right: 0, bottom: "calc(100% + 4px)" }}><TipBody title={r.label} c={r.c} /></div>}
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

/* ── Time series ─────────────────────────────────────────────────────────── */

export interface TimeSeries { name: string; color: string; points: { c: Cited; hollow?: boolean }[] }

const H = 250, M = { t: 14, r: 92, b: 26, l: 46 };

/** Axis ticks drop the unit (the subtitle names it): "$25B/yr" → "$25B", "70k wafers/mo" → "70k". */
function tickLabel(c: Cited, v: number): string {
  const p = parts(c, v);
  return joinParts({ ...p, suffix: p.suffix === "%" ? "%" : p.suffix.replace(/\/.*$/, "").replace(/ .*$/, "") });
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v)!;
}

export function TimeChart({ title, sub, series, yMax, legendExtra, bare, log = false }: { title: string; sub?: string; series: TimeSeries[]; yMax?: number; legendExtra?: ReactNode; bare?: boolean; log?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // Render at the real pixel width so text stays 11px on phones instead of scaling down.
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const all = series.flatMap((s) => s.points);
  // Plot each value at the middle of the period it describes, so "2030" sits inside 2030.
  const t = (c: Cited) => {
    const end = Date.parse(periodEnd(c.period));
    const p = c.period;
    const start = p.length === 4 ? Date.UTC(+p, 0, 1) : p[5] === "H" ? Date.UTC(+p.slice(0, 4), p[6] === "1" ? 0 : 6, 1)
      : p[5] === "Q" ? Date.UTC(+p.slice(0, 4), (+p[6]! - 1) * 3, 1) : p.length === 7 ? Date.UTC(+p.slice(0, 4), +p.slice(5) - 1, 1) : end;
    return (start + end) / 2;
  };
  const x0 = Math.min(...all.map((p) => t(p.c))), x1 = Math.max(...all.map((p) => t(p.c)));
  const top = yMax ?? niceMax(Math.max(...all.map((p) => p.c.high ?? p.c.value)));
  const sx = (c: Cited) => M.l + ((t(c) - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  // Log axis: whole decades from below the smallest value to above the largest.
  const vals = all.flatMap((p) => [p.c.value, p.c.low ?? p.c.value, p.c.high ?? p.c.value]).filter((v) => v > 0);
  const d0 = Math.floor(Math.log10(Math.min(...vals))), d1 = Math.ceil(Math.log10(Math.max(...vals)));
  const sy = (v: number) => log
    ? H - M.b - ((Math.log10(Math.max(v, 10 ** d0)) - d0) / (d1 - d0 || 1)) * (H - M.t - M.b)
    : H - M.b - (v / top) * (H - M.t - M.b);
  const ticks = log ? Array.from({ length: d1 - d0 + 1 }, (_, i) => 10 ** (d0 + i)).filter((_, i, a) => a.length <= 6 || i % 2 === 0) : [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const years: number[] = [];
  for (let y = new Date(x0).getUTCFullYear(); y <= new Date(x1).getUTCFullYear() + 1; y++) {
    const ms = Date.UTC(y, 0, 1);
    if (ms >= x0 - 1 && ms <= x1 + 1) years.push(y);
  }
  const fmtAxis = all[0]!.c;
  const yearStep = Math.ceil(years.length / Math.max(2, Math.floor((W - M.l - M.r) / 44)));
  const [tip, setTip] = useState<{ s: string; c: Cited } | null>(null);

  // End labels: nudge apart so lines that finish close together stay readable.
  const gap = series.length > 1 ? 30 : 0;
  const ends = series.map((s, i) => ({ i, y: sy(s.points[s.points.length - 1]!.c.value) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k]!.y = Math.max(ends[k]!.y, ends[k - 1]!.y + gap);
  const overflow = ends.length ? Math.max(0, ends[ends.length - 1]!.y - (H - M.b)) : 0;
  const labelY = new Map(ends.map((e) => [e.i, e.y - overflow]));

  const path = (pts: { c: Cited }[]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.c).toFixed(1)},${sy(p.c.value).toFixed(1)}`).join("");

  return (
    <ChartFrame
      title={title}
      sub={sub}
      bare={bare}
      cited={all.map((p) => p.c)}
      table={<CitedTable rows={series.flatMap((s) => s.points.map((p) => ({ label: s.name, c: p.c })))} />}
      legend={
        <div className="legend">
          {series.length > 1 && series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
          {all.some((p) => p.c.status === "projection") && <span><i className="dash" />Projection</span>}
          {all.some((p) => p.hollow) && <span><i className="hollow" />Unverified source</span>}
          {legendExtra}
        </div>
      }
    >
      <div ref={box} style={{ position: "relative" }} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth="1" />
              <text className="tick" x={M.l - 8} y={sy(v) + 4} textAnchor="end">{tickLabel(fmtAxis, v)}</text>
            </g>
          ))}
          {years.filter((_, i) => i % yearStep === 0).map((y) => {
            const xx = M.l + ((Date.UTC(y, 0, 1) - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
            return <text key={y} className="tick" x={xx} y={H - 6} textAnchor="middle">{y}</text>;
          })}
          {series.map((s, si) => {
            const actual = s.points.filter((p) => p.c.status !== "projection");
            const proj = s.points.filter((p) => p.c.status === "projection");
            const projPath = proj.length ? path([...actual.slice(-1), ...proj]) : "";
            const last = s.points[s.points.length - 1]!;
            return (
              <g key={s.name}>
                {actual.length > 1 && (
                  <motion.path d={path(actual)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                    initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, delay: si * 0.25, ease: "easeInOut" }} />
                )}
                {projPath && (
                  <motion.path d={projPath} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="5 5"
                    initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 1.2 + si * 0.25 }} />
                )}
                {s.points.map((p, pi) => (
                  <g key={p.c.id}>
                    {p.c.low !== undefined && p.c.high !== undefined && (
                      <g stroke="var(--ink-2)" strokeWidth="1.5" opacity="0.7">
                        <line x1={sx(p.c)} x2={sx(p.c)} y1={sy(p.c.low)} y2={sy(p.c.high)} />
                        <line x1={sx(p.c) - 4} x2={sx(p.c) + 4} y1={sy(p.c.low)} y2={sy(p.c.low)} />
                        <line x1={sx(p.c) - 4} x2={sx(p.c) + 4} y1={sy(p.c.high)} y2={sy(p.c.high)} />
                      </g>
                    )}
                    <motion.circle cx={sx(p.c)} cy={sy(p.c.value)} r="4.5"
                      fill={p.hollow || p.c.status === "projection" ? "var(--surface)" : s.color} stroke={p.hollow || p.c.status === "projection" ? s.color : "var(--surface)"} strokeWidth="2"
                      initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.4 + si * 0.25 + pi * 0.12, type: "spring", stiffness: 300, damping: 18 }} />
                    <circle cx={sx(p.c)} cy={sy(p.c.value)} r="14" fill="transparent" tabIndex={0} style={{ cursor: "pointer", outline: "none" }}
                      aria-label={`${s.name}, ${fmtPeriod(p.c.period)}: ${fmt(p.c)}`}
                      onMouseEnter={() => setTip({ s: s.name, c: p.c })} onFocus={() => setTip({ s: s.name, c: p.c })} onBlur={() => setTip(null)} />
                  </g>
                ))}
                <motion.text className="lbl" x={sx(last.c) + 10} y={labelY.get(si)! + 4} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1.3 + si * 0.25 }}>
                  {fmt(last.c)}
                </motion.text>
                {series.length > 1 && (
                  <text className="lbl2" x={sx(last.c) + 10} y={labelY.get(si)! + 18}>{s.name}</text>
                )}
              </g>
            );
          })}
        </svg>
        {tip && (
          <div className="tip" style={{
            left: `clamp(0px, calc(${(sx(tip.c) / W) * 100}% - 80px), calc(100% - 180px))`,
            top: `calc(${(sy(tip.c.value) / H) * 100}% - 8px)`, transform: "translateY(-100%)",
          }}>
            <TipBody title={tip.s} c={tip.c} />
          </div>
        )}
      </div>
    </ChartFrame>
  );
}

/* ── 100% share bar ──────────────────────────────────────────────────────── */

export function ShareBar({ title, sub, parts }: { title: string; sub?: string; parts: { label: string; color: string; c: Cited }[] }) {
  const total = parts.reduce((a, p) => a + p.c.value, 0);
  const [tip, setTip] = useState<number | null>(null);
  return (
    <ChartFrame title={title} sub={sub} cited={parts.map((p) => p.c)} table={<CitedTable rows={parts} />}
      legend={<div className="legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color, height: 10, width: 10, borderRadius: 3 }} />{p.label} {fmt(p.c)}</span>)}</div>}>
      <div style={{ position: "relative", marginTop: 22 }} onMouseLeave={() => setTip(null)}>
        <div className="bar100" style={{ height: 30, borderRadius: 8 }}>
          {parts.map((p, i) => (
            <motion.div key={p.label} tabIndex={0} aria-label={`${p.label}: ${fmt(p.c)}`}
              style={{ background: p.color, height: "100%", borderRadius: 4, cursor: "pointer" }}
              initial={{ flexBasis: "0%" }} whileInView={{ flexBasis: `${(p.c.value / total) * 100}%` }} viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
              onMouseEnter={() => setTip(i)} onFocus={() => setTip(i)} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
          {parts.map((p) => (
            <span key={p.label} className="small" style={{ flexBasis: `${(p.c.value / total) * 100}%`, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
              {p.c.value / total > 0.12 ? `${p.label} · ${fmt(p.c)}` : ""}
            </span>
          ))}
        </div>
        {tip !== null && <div className="tip" style={{ left: 0, bottom: "calc(100% + 6px)" }}><TipBody title={parts[tip]!.label} c={parts[tip]!.c} /></div>}
      </div>
    </ChartFrame>
  );
}
