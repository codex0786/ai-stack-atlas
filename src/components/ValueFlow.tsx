"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cited } from "@/lib/site";
import { captured, valueFlow, type Entry, type FlowInputs, type FlowLink, type FlowNode } from "@/lib/valueflow";
import { Cite } from "./Cite";

export interface FlowSources {
  defaults: FlowInputs;
  labCompute: Cited;
  vendorMargin: { value: number; source: Cited; quarters: string };
  cloudMargin: { value: number; price: Cited; ownCost: number };
  peers: { name: string; margin: number; quarters: string; source: Cited }[];
}

const cents = (v: number) => (v >= 0.1 ? `${(v * 100).toFixed(0)}¢` : v >= 0.01 ? `${(v * 100).toFixed(1)}¢` : `${(v * 100).toFixed(2)}¢`);
const LAYER_COLOR: Record<string, string> = { L0: "var(--l0)", L1: "var(--l2)", L2: "var(--l3)", L3: "var(--l4)", L4: "var(--s2)", L5: "var(--l6)", L6: "var(--s3)", L7: "var(--l7)" };

/* ── Sankey layout ───────────────────────────────────────────────────────── */

interface Placed extends FlowNode { x: number; y: number; h: number }

function layout(nodes: FlowNode[], links: FlowLink[], W: number, H: number) {
  // Every destination (leaf) lines up in one final column so "who keeps what" reads top to
  // bottom; intermediate steps keep their own columns.
  const lastMid = Math.max(...nodes.filter((n) => !n.leaf).map((n) => n.col));
  const cols = lastMid + 2;
  const colOf = (n: FlowNode) => (n.leaf ? cols - 1 : n.col);
  const nodeW = 12, labelRoom = Math.min(230, W * 0.34), gap = 8, slot = 17;
  const colX = (c: number) => (c * (W - labelRoom - nodeW)) / (cols - 1);
  const byCol = Array.from({ length: cols }, (_, c) => nodes.filter((n) => colOf(n) === c));
  // Largest scale (px per $) at which every column fits, giving each leaf room for its label.
  const height = (k: number) => Math.max(...byCol.map((list, c) => list.reduce((a, n) => a + Math.max(c === cols - 1 ? slot : 2, n.value * k), 0) + gap * (list.length - 1)));
  let k = H;
  while (height(k) > H && k > 10) k *= 0.97;
  const placed = new Map<string, Placed>();
  // Destinations stack down the final column.
  let y = 0;
  for (const n of byCol[cols - 1]!) {
    const h = Math.max(2, n.value * k);
    placed.set(n.id, { ...n, col: cols - 1, x: colX(cols - 1), y, h });
    y += Math.max(slot, h) + gap;
  }
  // Intermediate steps sit level with the band that feeds them, so the cascade runs straight.
  for (const n of nodes.filter((x) => !x.leaf)) {
    const feed = links.find((l) => l.to === n.id);
    let ny = 0;
    if (feed) {
      const s = placed.get(feed.from)!;
      // Offset of this link inside its source = sum of earlier outgoing links from that source.
      const before = links.slice(0, links.indexOf(feed)).filter((l) => l.from === feed.from).reduce((a, l) => a + l.value * k, 0);
      ny = s.y + before;
    }
    placed.set(n.id, { ...n, col: n.col, x: colX(n.col), y: ny, h: Math.max(2, n.value * k) });
  }
  const outY = new Map<string, number>(), inY = new Map<string, number>();
  const bands = links.map((l) => {
    const s = placed.get(l.from)!, t = placed.get(l.to)!;
    const w = Math.max(1, l.value * k);
    const y0 = s.y + (outY.get(s.id) ?? 0), y1 = t.y + (inY.get(t.id) ?? 0);
    outY.set(s.id, (outY.get(s.id) ?? 0) + w);
    inY.set(t.id, (inY.get(t.id) ?? 0) + w);
    const x0 = s.x + nodeW, x1 = t.x, mx = (x0 + x1) / 2;
    const d = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + w} C${mx},${y1 + w} ${mx},${y0 + w} ${x0},${y0 + w} Z`;
    return { ...l, d, color: LAYER_COLOR[t.layer] ?? "var(--l4)", col: s.col };
  });
  return { placed: [...placed.values()], bands, nodeW, lastCol: cols - 1 };
}

function Sankey({ nodes, links }: { nodes: FlowNode[]; links: FlowLink[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(960);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 640 ? 520 : 460;
  const { placed, bands, nodeW, lastCol } = useMemo(() => layout(nodes, links, W, H - 34), [nodes, links, W, H]);
  const [hover, setHover] = useState<string | null>(null);
  const related = (id: string) => !hover || hover === id || links.some((l) => (l.from === hover && l.to === id) || (l.to === hover && l.from === id));
  const narrow = W < 640;

  return (
    <div ref={box} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Where one dollar of AI spending goes, layer by layer">
        <g transform="translate(0,24)">
          {bands.map((b, i) => (
            <motion.path key={`${b.from}-${b.to}`} d={b.d} fill={b.color}
              initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
              animate={{ opacity: !hover || hover === b.from || hover === b.to ? 0.42 : 0.1, clipPath: "inset(0 0% 0 0)" }}
              transition={{ clipPath: { duration: 0.7, delay: 0.15 + b.col * 0.35 + i * 0.02, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2 } }} />
          ))}
          {placed.map((n) => (
            <g key={n.id} onMouseEnter={() => setHover(n.id)} onFocus={() => setHover(n.id)} tabIndex={0} style={{ cursor: "pointer", outline: "none" }}
              aria-label={`${n.label}: ${cents(n.value)} of every dollar`}>
              <motion.rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={3} fill={LAYER_COLOR[n.layer] ?? "var(--l4)"}
                initial={{ scaleY: 0 }} animate={{ scaleY: 1, opacity: related(n.id) ? 1 : 0.35 }} style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                transition={{ scaleY: { delay: n.col * 0.35, duration: 0.4 } }} />
              {n.col === lastCol ? (
                <motion.text x={n.x + nodeW + 6} y={n.y + Math.max(n.h, 2) / 2} dominantBaseline="middle" className="lbl"
                  initial={{ opacity: 0 }} animate={{ opacity: related(n.id) ? 1 : 0.3 }} transition={{ delay: 0.3 + lastCol * 0.3 }}
                  style={{ fontSize: narrow ? 10.5 : 12 }}>
                  {narrow && n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label} <tspan fontWeight={700}>{cents(n.value)}</tspan>
                </motion.text>
              ) : !narrow || n.col === 0 ? (
                // Intermediate steps: a small caption above the node, clear of the bands.
                <motion.text x={n.x} y={n.y - 6} className="lbl2" initial={{ opacity: 0 }} animate={{ opacity: related(n.id) ? 1 : 0.3 }}
                  transition={{ delay: 0.2 + n.col * 0.3 }} style={{ fontSize: 11 }}>
                  {n.label} {cents(n.value)}
                </motion.text>
              ) : null}
            </g>
          ))}
        </g>
      </svg>
      {hover && (() => {
        const n = placed.find((x) => x.id === hover)!;
        return (
          <div className="tip" style={{ left: `clamp(0px, calc(${(n.x / W) * 100}% - 40px), calc(100% - 220px))`, top: n.y + n.h + 18 }}>
            <b>{n.label}</b>
            <div>{cents(n.value)} of every dollar</div>
            {n.note && <div className="muted">{n.note}</div>}
          </div>
        );
      })()}
    </div>
  );
}

/* ── Page body ───────────────────────────────────────────────────────────── */

function Slider({ label, value, set, min = 0, max = 1, step = 0.01, source, note }: { label: string; value: number; set: (v: number) => void; min?: number; max?: number; step?: number; source?: Cited; note?: string }) {
  return (
    <div className="field">
      <div className="field-head"><label>{label}</label>{source ? <Cite c={source} /> : <span className="badge">assumption</span>}</div>
      <div className="field-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} aria-label={label} />
        <span className="field-val"><b style={{ minWidth: 48, textAlign: "right" }}>{Math.round(value * 100)}%</b></span>
      </div>
      {note && <span className="small muted">{note}</span>}
    </div>
  );
}

export function ValueFlow({ src }: { src: FlowSources }) {
  const [i, setI] = useState<FlowInputs>(src.defaults);
  const [entry, setEntry] = useState<Entry>("app");
  const set = (k: keyof FlowInputs) => (v: number) => setI((x) => ({ ...x, [k]: v }));
  const setCogs = (k: keyof FlowInputs["vendorCogs"]) => (v: number) => setI((x) => ({ ...x, vendorCogs: { ...x.vendorCogs, [k]: v } }));
  const flow = useMemo(() => valueFlow(i, entry), [i, entry]);
  const leaves = captured(flow.nodes);
  const max = leaves[0]?.value ?? 1;
  const v = Object.fromEntries(flow.nodes.map((n) => [n.id, n.value]));
  const silicon = (v.vendorgp ?? 0) + (v.memory ?? 0) + (v.foundry ?? 0) + (v.suppliers ?? 0) + (v.otherhw ?? 0);

  return (
    <>
      <div className="price-mode small" role="tablist" aria-label="Where the dollar enters">
        Follow a dollar spent on:
        {([["app", "an AI app"], ["api", "a model API"], ["compute", "GPU rental"]] as const).map(([e, l]) => (
          <button key={e} role="tab" aria-selected={entry === e} className={entry === e ? "on" : ""} onClick={() => setEntry(e)}>{l}</button>
        ))}
      </div>

      <div className="card chart-card" style={{ marginTop: 14 }}>
        <motion.div key={entry} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <Sankey nodes={flow.nodes} links={flow.links} />
        </motion.div>
        <div className="legend">
          {(["L6", "L4", "L3", "L2", "L1", "L0"] as const).map((l) => (
            <span key={l}><i style={{ background: LAYER_COLOR[l], width: 10, height: 10, borderRadius: 3 }} />{{ L6: "Applications", L4: "Model labs", L3: "Compute", L2: "Data centres", L1: "Silicon", L0: "Energy" }[l]}</span>
          ))}
          <span>Hover a node to trace its flows</span>
        </div>
      </div>

      <div className="calc" style={{ marginTop: 16 }}>
        <div className="card calc-in">
          <h3>Splits</h3>
          {entry === "app" && <Slider label="App revenue paid to model APIs" value={i.appApiShare} set={set("appApiShare")} note="An AI app's main cost of revenue" />}
          {entry !== "compute" && <Slider label="Lab revenue spent on compute" value={i.labComputeShare} set={set("labComputeShare")} source={src.labCompute} note={`1 ÷ ${src.labCompute.value} revenue per compute dollar (Anthropic, H1 2026)`} />}
          <Slider label="Cloud operator margin" value={i.cloudMargin} set={set("cloudMargin")} source={src.cloudMargin.price}
            note={`H100 market price vs the modelled cost of $${src.cloudMargin.ownCost.toFixed(2)}/hr (calculators)`} />
          <Slider label="Server capex paid to the GPU vendor" value={i.gpuVendorShare} set={set("gpuVendorShare")} note="The rest: networking, CPUs, servers, storage" />
          <Slider label="GPU vendor gross margin" value={i.gpuVendorMargin} set={set("gpuVendorMargin")} source={src.vendorMargin.source} note={`NVIDIA, last four quarters (${src.vendorMargin.quarters})`} />
          <Slider label="Vendor's costs: memory (HBM)" value={i.vendorCogs.memory} set={setCogs("memory")} />
          <Slider label="Vendor's costs: foundry & packaging" value={i.vendorCogs.foundry} set={setCogs("foundry")} />
          <Slider label="Vendor's costs: other suppliers" value={i.vendorCogs.other} set={setCogs("other")} note="The three cost shares are rescaled to sum to 100%" />
          <p className="small muted">The operator&apos;s cost split (hardware {Math.round(i.cloudCost.capital * 100)}%, facilities {Math.round(i.cloudCost.opex * 100)}%, energy {Math.round(i.cloudCost.power * 100)}%) comes from the GPU-hour calculator&apos;s defaults.</p>
        </div>
        <div className="calc-out">
          <div className="card calc-card">
            <h3>Who keeps each cent</h3>
            <p className="sub">Where the dollar finally lands, largest first.</p>
            <div className="compare">
              {leaves.map((n) => (
                <div key={n.id} className="compare-row" style={{ gridTemplateColumns: "minmax(120px, 38%) 1fr auto" }}>
                  <span className="small">{n.label}</span>
                  <span className="compare-track"><motion.i style={{ background: LAYER_COLOR[n.layer] }} animate={{ width: `${(n.value / max) * 100}%` }} initial={false} transition={{ duration: 0.4 }} /></span>
                  <span className="small num" style={{ fontWeight: 600 }}>{cents(n.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card calc-card">
            <h3>Read it as</h3>
            <ul className="why">
              {entry === "app" && <li>Most of an app dollar never leaves the app: only {cents(i.appApiShare)} reaches the model labs, and {cents(v.compute ?? 0)} reaches the clouds.</li>}
              <li>All of silicon — GPUs, memory, foundry and other hardware — gets {cents(silicon)} of this dollar; the GPU vendor alone keeps {cents(v.vendorgp ?? 0)} as gross profit, more than {v.memory && v.foundry ? "memory and the foundry combined" : "its suppliers"} ({cents((v.memory ?? 0) + (v.foundry ?? 0))}).</li>
              <li>Energy gets {cents(v.energy ?? 0)}: power is a siting and grid problem far more than a cost problem.</li>
              <li>These are flows of today&apos;s spending. Hardware bought ahead of demand (capex) is far larger than this dollar suggests — see the capex charts on the home page.</li>
            </ul>
          </div>
          <div className="card calc-card">
            <h3>Reported gross margins, for comparison</h3>
            <p className="sub">Last four quarters, from 10-Q/10-K filings. Gross margin = 1 − cost of revenue ÷ revenue.</p>
            <div className="table-scroll">
              <table>
                <tbody>
                  {src.peers.map((p) => (
                    <tr key={p.name}><td>{p.name}</td><td className="num"><b>{Math.round(p.margin * 100)}%</b></td><td className="small muted">{p.quarters}</td><td><Cite c={p.source} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>CoreWeave&apos;s reported cost of revenue excludes depreciation (its largest cost), so its gross margin overstates its economics — which is why the cloud margin above is modelled from rental prices instead.</p>
          </div>
        </div>
      </div>
    </>
  );
}
