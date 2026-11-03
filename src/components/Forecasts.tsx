"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supplyChain, type ChainInputs, type Scenario } from "@/lib/forecast";

/* ── Fan chart: actuals, a forecast with its 90% band, and backtest points ── */

export interface FanPoint { t: number; label: string; value: number }
export interface FanForecast { t: number; label: string; mean: number; lo: number; hi: number }

const sci = (x: number) => { const e = Math.floor(Math.log10(x)); return `${(x / 10 ** e).toFixed(1)}×10${String(e).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]!)}`; };
const usdB = (x: number) => `$${(x / 1e9).toFixed(0)}B`;
const fmtFor = (kind: "usd" | "flop") => (kind === "usd" ? usdB : sci);

function useWidth(min = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w] as const;
}

export function FanChart({ title, sub, actual, forecast, backtest, kind, log = false, footer }: {
  title: string; sub: string; actual: FanPoint[]; forecast: FanForecast[]; backtest?: FanForecast[]; kind: "usd" | "flop"; log?: boolean; footer?: React.ReactNode;
}) {
  const [box, W] = useWidth();
  const H = 270, M = { t: 14, r: 16, b: 28, l: 58 };
  const fmt = fmtFor(kind);
  const all = [...actual.map((p) => p.value), ...forecast.flatMap((f) => [f.lo, f.hi]), ...(backtest ?? []).flatMap((f) => [f.lo, f.hi])].filter((v) => v > 0);
  const ts = [...actual.map((p) => p.t), ...forecast.map((f) => f.t)];
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const lo = log ? Math.floor(Math.log10(Math.min(...all))) : 0, hi = log ? Math.ceil(Math.log10(Math.max(...all))) : Math.max(...all) * 1.08;
  const sx = (t: number) => M.l + ((t - t0) / (t1 - t0 || 1)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((log ? Math.log10(v) - lo : v) / (hi - lo || 1)) * (H - M.t - M.b);
  const ticks = log ? Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i)).filter((_, i, a) => a.length < 7 || i % 2 === 0) : [0, 0.25, 0.5, 0.75, 1].map((f) => f * hi);
  const years = Array.from({ length: Math.floor(t1) - Math.ceil(t0) + 1 }, (_, i) => Math.ceil(t0) + i).filter((_, i, a) => a.length < 9 || i % 2 === 0);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const lastActual = actual.at(-1)!;
  const band = forecast.length ? [`M${r1(sx(lastActual.t))},${r1(sy(lastActual.value))}`, ...forecast.map((f) => `L${r1(sx(f.t))},${r1(sy(f.hi))}`), ...[...forecast].reverse().map((f) => `L${r1(sx(f.t))},${r1(sy(f.lo))}`), "Z"].join("") : "";
  const [tip, setTip] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);

  return (
    <div className="card chart-card">
      <h3>{title}</h3>
      <p className="sub">{sub}</p>
      <div ref={box} style={{ position: "relative" }} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((v) => (
            <g key={v}><line x1={M.l} x2={W - M.r} y1={r1(sy(v || (log ? 1 : 0)))} y2={r1(sy(v || (log ? 1 : 0)))} stroke="var(--grid)" />
              <text className="tick" x={M.l - 8} y={r1(sy(v || 1)) + 4} textAnchor="end">{v === 0 ? "0" : fmt(v)}</text></g>
          ))}
          {years.map((y) => <text key={y} className="tick" x={r1(sx(y))} y={H - 8} textAnchor="middle">{y}</text>)}
          {band && <motion.path d={band} fill="var(--s1)" initial={{ opacity: 0 }} animate={{ opacity: 0.16 }} transition={{ delay: 0.9, duration: 0.6 }} />}
          <motion.path d={actual.map((p, i) => `${i ? "L" : "M"}${r1(sx(p.t))},${r1(sy(p.value))}`).join("")} fill="none" stroke="var(--s1)" strokeWidth="2"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
          {forecast.length > 0 && (
            <motion.path d={[`M${r1(sx(lastActual.t))},${r1(sy(lastActual.value))}`, ...forecast.map((f) => `L${r1(sx(f.t))},${r1(sy(f.mean))}`)].join("")} fill="none" stroke="var(--s1)" strokeWidth="2" strokeDasharray="5 5"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} />
          )}
          {actual.map((p) => (
            <circle key={p.label} cx={r1(sx(p.t))} cy={r1(sy(p.value))} r={4} fill="var(--s1)" stroke="var(--surface)" strokeWidth={1.5} tabIndex={0} style={{ cursor: "pointer" }}
              onMouseEnter={() => setTip({ x: sx(p.t), y: sy(p.value), html: <><b>{fmt(p.value)}</b><div className="muted">{p.label} · actual</div></> })} />
          ))}
          {(backtest ?? []).map((b) => (
            <g key={`b${b.label}`}>
              <line x1={r1(sx(b.t))} x2={r1(sx(b.t))} y1={r1(sy(b.lo))} y2={r1(sy(b.hi))} stroke="var(--s2)" strokeWidth={1.5} opacity={0.7} />
              <rect x={r1(sx(b.t)) - 4} y={r1(sy(b.mean)) - 4} width={8} height={8} fill="var(--surface)" stroke="var(--s2)" strokeWidth={2} transform={`rotate(45 ${r1(sx(b.t))} ${r1(sy(b.mean))})`}
                tabIndex={0} style={{ cursor: "pointer" }}
                onMouseEnter={() => setTip({ x: sx(b.t), y: sy(b.mean), html: <><b>Backtest {fmt(b.mean)}</b><div className="muted">{b.label} · fitted without this point · 90% {fmt(b.lo)}–{fmt(b.hi)}</div></> })} />
            </g>
          ))}
          {forecast.map((f) => (
            <circle key={`f${f.label}`} cx={r1(sx(f.t))} cy={r1(sy(f.mean))} r={4.5} fill="var(--surface)" stroke="var(--s1)" strokeWidth={2} tabIndex={0} style={{ cursor: "pointer" }}
              onMouseEnter={() => setTip({ x: sx(f.t), y: sy(f.mean), html: <><b>{fmt(f.mean)}</b><div className="muted">{f.label} · forecast</div><div>90% interval {fmt(f.lo)}–{fmt(f.hi)}</div></> })} />
          ))}
        </svg>
        {tip && <div className="tip" style={{ left: `clamp(0px, calc(${(tip.x / W) * 100}% - 90px), calc(100% - 200px))`, top: `calc(${(tip.y / H) * 100}% - 10px)`, transform: "translateY(-100%)" }}>{tip.html}</div>}
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--s1)" }} />Actual</span>
        <span><i className="dash" />Forecast</span>
        <span><i style={{ background: "var(--s1)", opacity: 0.25, height: 10, width: 14 }} />90% interval</span>
        {backtest && <span><i style={{ background: "var(--surface)", border: "2px solid var(--s2)", width: 9, height: 9, transform: "rotate(45deg)" }} />Backtest</span>}
      </div>
      {footer}
    </div>
  );
}

/* ── Scenario explorer ───────────────────────────────────────────────────── */

export function ScenarioExplorer({ base, scenarios, iea2030 }: { base: Omit<ChainInputs, "capexGrowth" | "cowosGrowth">; scenarios: Scenario[]; iea2030: number }) {
  const [sid, setSid] = useState("base");
  const [cost, setCost] = useState(base.costPerAccelerator);
  const [apw, setApw] = useState(base.acceleratorsPerWafer);
  const [kw, setKw] = useState(base.kwPerAccelerator);
  const runs = useMemo(() => Object.fromEntries(scenarios.map((s) => [s.id, supplyChain({ ...base, costPerAccelerator: cost, acceleratorsPerWafer: apw, kwPerAccelerator: kw, capexGrowth: s.capexGrowth, cowosGrowth: s.cowosGrowth })])), [base, scenarios, cost, apw, kw]);
  const sel = runs[sid]!;
  const scenario = scenarios.find((s) => s.id === sid)!;
  const [box, W] = useWidth();
  const H = 260, M = { t: 14, r: 96, b: 28, l: 52 };
  const maxTwh = Math.max(iea2030, ...Object.values(runs).flat().map((y) => y.twh)) * 1.08;
  const years = sel.map((y) => y.year);
  const sx = (y: number) => M.l + ((y - years[0]!) / (years.at(-1)! - years[0]! || 1)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - (v / maxTwh) * (H - M.t - M.b);
  const color: Record<string, string> = { acceleration: "var(--s2)", base: "var(--s1)", digestion: "var(--s3)" };
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const last = sel.at(-1)!;

  return (
    <div className="calc" style={{ marginTop: 16 }}>
      <div className="card calc-in">
        <h3>Scenario</h3>
        <div className="presets" role="tablist">
          {scenarios.map((s) => <button key={s.id} role="tab" aria-selected={sid === s.id} className={sid === s.id ? "on" : ""} onClick={() => setSid(s.id)}>{s.name}</button>)}
        </div>
        <p className="small" style={{ color: "var(--ink-2)" }}>{scenario.summary}</p>
        <p className="small muted">Capex growth {scenario.capexGrowth.map((g) => `${g >= 0 ? "+" : ""}${Math.round(g * 100)}%`).join(", ")} a year; packaging capacity +{Math.round(scenario.cowosGrowth * 100)}% a year.</p>
        <h3 style={{ marginTop: 6 }}>Assumptions</h3>
        {([
          ["All-in cost per accelerator", cost, setCost, 20_000, 100_000, 1_000, (v: number) => `$${(v / 1000).toFixed(0)}k`],
          ["Accelerators per packaging wafer", apw, setApw, 2, 20, 0.5, (v: number) => `${v} (after yield)`],
          ["Grid power per accelerator", kw, setKw, 0.5, 4, 0.05, (v: number) => `${v.toFixed(2)} kW incl. host & cooling`],
        ] as const).map(([label, v, set, min, max, step, f]) => (
          <div key={label} className="field">
            <div className="field-head"><label>{label}</label><span className="badge">assumption</span></div>
            <div className="field-row"><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} aria-label={label} /><span className="field-val"><b>{f(v)}</b></span></div>
          </div>
        ))}
      </div>
      <div className="calc-out">
        <div className="card calc-hero">
          <div className="outs">
            <div className="out"><span className="small muted">AI accelerators installed, {last.year}</span><b>{(last.installed / 1e6).toFixed(0)}M</b></div>
            <div className="out"><span className="small muted">Power drawn, {last.year}</span><b>{last.gw.toFixed(0)} GW</b></div>
            <div className="out"><span className="small muted">Electricity, {last.year}</span><b>{last.twh.toFixed(0)} TWh</b><span className="small muted">vs IEA&apos;s {iea2030} TWh for all data centres in 2030</span></div>
          </div>
          <div className="binding">
            {sel.map((y) => <span key={y.year} className={`badge ${y.binding === "packaging" ? "warn" : ""}`} title={`Demand ${(y.demand / 1e6).toFixed(1)}M vs packaging supply ${(y.supply / 1e6).toFixed(1)}M accelerators`}>{y.year}: {y.binding === "packaging" ? "packaging binds" : "spending binds"}</span>)}
          </div>
        </div>
        <div className="card chart-card">
          <h3>AI accelerators&apos; electricity use, by scenario</h3>
          <p className="sub">TWh per year from the installed fleet. The dotted line is the IEA&apos;s base case for <i>all</i> data centres in 2030.</p>
          <div ref={box}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scenario electricity use">
              {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={M.l} x2={W - M.r} y1={r1(sy(f * maxTwh))} y2={r1(sy(f * maxTwh))} stroke="var(--grid)" /><text className="tick" x={M.l - 8} y={r1(sy(f * maxTwh)) + 4} textAnchor="end">{Math.round(f * maxTwh)}</text></g>)}
              {years.map((y) => <text key={y} className="tick" x={r1(sx(y))} y={H - 8} textAnchor="middle">{y}</text>)}
              <line x1={M.l} x2={W - M.r} y1={r1(sy(iea2030))} y2={r1(sy(iea2030))} stroke="var(--ink-2)" strokeDasharray="2 4" />
              <text className="lbl2" x={W - M.r + 6} y={r1(sy(iea2030)) + 4}>IEA 2030</text>
              {scenarios.map((s) => {
                const r = runs[s.id]!;
                const on = s.id === sid;
                return (
                  <g key={s.id} opacity={on ? 1 : 0.35}>
                    <motion.path d={r.map((y, i) => `${i ? "L" : "M"}${r1(sx(y.year))},${r1(sy(y.twh))}`).join("")} fill="none" stroke={color[s.id]} strokeWidth={on ? 2.5 : 1.5}
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
                    <text className={on ? "lbl" : "lbl2"} x={r1(sx(r.at(-1)!.year)) + 8} y={r1(sy(r.at(-1)!.twh)) + 4}>{s.name}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
