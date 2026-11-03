"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogModel, ModelCatalog } from "@/lib/models";
import { benchmarkPercentiles, recommend, type Scored } from "@/lib/recommend";
import type { UseCase } from "@/lib/usecases";

// Executive model dashboard: choose a business problem and a monthly volume; get a pick,
// the alternatives, a ranked shortlist, the cost/capability map and the full catalog.

const money = (x: number) =>
  x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `$${(x / 1e3).toFixed(0)}k` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}k`
    : x >= 100 ? `$${x.toFixed(0)}` : x >= 1 ? `$${x.toFixed(2)}` : x >= 0.01 ? `$${x.toFixed(2)}` : x > 0 ? `<$0.01` : "$0";
const perM = (x: number) => `$${x < 1 ? x.toFixed(x < 0.1 ? 3 : 2) : x.toFixed(x < 10 ? 2 : 0)}`;
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const blended = (m: CatalogModel) => (3 * m.price.input + m.price.output) / 4;

function SourceChips({ catalog }: { catalog: ModelCatalog }) {
  return (
    <span className="chart-sources" style={{ marginTop: 0 }}>
      <a className="chip v" href={catalog.sources.pricing} target="_blank" rel="noopener noreferrer"><span className="dot" />⚙ T1 · OpenRouter prices {catalog.pricesAsOf}</a>
      <a className="chip v" href={catalog.sources.benchmarks} target="_blank" rel="noopener noreferrer"><span className="dot" />⚙ T1 · Epoch AI benchmarks {catalog.benchmarksAsOf}</a>
    </span>
  );
}

function Badges({ m, batch }: { m: CatalogModel; batch?: boolean }) {
  return (
    <span className="dims">
      <span className="badge">{m.openWeights ? "open weights" : "closed"}</span>
      {m.inputs.includes("image") && <span className="badge">vision</span>}
      {m.tools && <span className="badge">tools</span>}
      <span className="badge">{tokens(m.context)} context</span>
      {batch && <span className="badge">batch price</span>}
    </span>
  );
}

function QualityBar({ q, color = "var(--s1)" }: { q: number; color?: string }) {
  return (
    <span className="qbar" aria-label={`Quality ${Math.round(q * 100)} of 100`}>
      <motion.i style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, q * 100)}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
      <b>{Math.round(q * 100)}</b>
    </span>
  );
}

export function ExecDashboard({ catalog, useCases }: { catalog: ModelCatalog; useCases: UseCase[] }) {
  const [ucId, setUcId] = useState(useCases[0]!.id);
  const uc = useCases.find((u) => u.id === ucId)!;
  const [volume, setVolume] = useState(uc.monthlyTasks);
  useEffect(() => setVolume(uc.monthlyTasks), [uc]);

  const pct = useMemo(() => benchmarkPercentiles(catalog.models), [catalog]);
  const rec = useMemo(() => recommend(catalog.models, uc, volume, pct), [catalog, uc, volume, pct]);
  const pick = rec.recommended;

  return (
    <>
      <section style={{ paddingTop: 28 }}>
        <div className="wrap">
          <div className="eyebrow">Step 1 · Choose the business problem</div>
          <div className="uc-grid" role="tablist" aria-label="Business problem">
            {useCases.map((u) => (
              <button key={u.id} role="tab" aria-selected={u.id === ucId} className={`uc-card ${u.id === ucId ? "on" : ""}`} onClick={() => setUcId(u.id)}>
                <b>{u.name}</b>
                <span>{u.problem}</span>
              </button>
            ))}
          </div>

          <div className="card uc-workload">
            <div>
              <div className="small muted">Workload assumed for one task</div>
              <div>{uc.example}</div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {tokens(uc.inputTokens)} tokens in · {tokens(uc.outputTokens)} out{uc.cachedShare ? ` · ${Math.round(uc.cachedShare * 100)}% of input cacheable` : ""}{uc.batchable ? " · can run as overnight batch" : ""}
                {Object.entries(uc.requires).filter(([, v]) => v).map(([k, v]) => ` · needs ${k === "minContext" ? `${tokens(v as number)} context` : k === "openWeights" ? "open weights" : k}`).join("")}
              </div>
            </div>
            <label className="vol">
              <span className="small muted">Tasks per month</span>
              <input type="number" min={1} step={1000} value={volume} onChange={(e) => setVolume(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="eyebrow">Step 2 · Recommendation</div>
          <AnimatePresence mode="wait">
            <motion.div key={uc.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              {pick ? (
                <div className="pick-grid">
                  <div className="card pick">
                    <span className="live-tag">Recommended</span>
                    <h2>{pick.model.name}</h2>
                    <div className="muted">{pick.model.lab} · released {pick.model.released}</div>
                    <Badges m={pick.model} batch={pick.usedBatch} />
                    <div className="pick-stats">
                      <div><span className="small muted">Monthly cost</span><b>{money(pick.monthlyCost)}</b><span className="small muted">at {volume.toLocaleString("en-US")} tasks</span></div>
                      <div><span className="small muted">Per 1,000 tasks</span><b>{money(pick.costPerTask * 1000)}</b><span className="small muted">list price</span></div>
                      <div><span className="small muted">Quality score</span><QualityBar q={pick.quality} /><span className="small muted">capability index {pick.model.eci.toFixed(1)}</span></div>
                    </div>
                    <ul className="why">{rec.rationale.map((r) => <li key={r}>{r}</li>)}</ul>
                    <p className="small"><b>Before you commit:</b> {uc.caveat}</p>
                    <SourceChips catalog={catalog} />
                  </div>
                  <div className="alt-col">
                    {([["Highest quality", rec.bestQuality, "var(--s2)"], ["Near-top quality, lowest cost", rec.bestValue, "var(--s3)"], ["Best open-weight", rec.bestOpen, "var(--s4)"]] as const).map(([label, s, color]) =>
                      s ? (
                        <div key={label} className="card alt">
                          <span className="small muted">{label}</span>
                          <b>{s.model.name}</b>
                          <QualityBar q={s.quality} color={color} />
                          <span className="small">{money(s.monthlyCost)}/month · {money(s.costPerTask * 1000)} per 1k{s.usedBatch ? " (batch)" : ""}</span>
                          {pick && s.model.id !== pick.model.id && (
                            <span className="small muted">{s.monthlyCost > pick.monthlyCost ? `+${money(s.monthlyCost - pick.monthlyCost)}` : `−${money(pick.monthlyCost - s.monthlyCost)}`}/month vs the pick · quality {s.quality >= pick.quality ? "+" : "−"}{Math.abs(Math.round((s.quality - pick.quality) * 100))}</span>
                          )}
                          {pick && s.model.id === pick.model.id && <span className="small muted">Same as the recommendation</span>}
                          {s.belowFloor && <span className="small"><span className="badge warn">below this problem&apos;s quality bar</span></span>}
                        </div>
                      ) : null)}
                  </div>
                </div>
              ) : <div className="card pick"><p>No model meets this workload&apos;s requirements.</p></div>}
            </motion.div>
          </AnimatePresence>

          <h3 style={{ margin: "28px 0 4px", fontSize: 18 }}>Shortlist for {uc.name.toLowerCase()} <span className="small muted">({rec.eligible.length} models qualify, {rec.excluded} excluded by requirements)</span></h3>
          <p className="small muted" style={{ marginBottom: 10 }}>Ranked by the balance of quality and cost for this problem. Models below {Math.round((uc.qualityFloor ?? 0.85) * 100)}% of the best quality are listed after the rest and never recommended.</p>
          <div className="card table-scroll">
            <table>
              <thead><tr><th>#</th><th>Model</th><th>Quality</th><th>Per 1,000 tasks</th><th>Monthly</th><th>Basis</th></tr></thead>
              <tbody>
                {rec.eligible.slice(0, 10).map((s, i) => (
                  <tr key={s.model.id} className={s.model.id === pick?.model.id ? "row-on" : ""}>
                    <td className="num">{i + 1}</td>
                    <td><b>{s.model.name}</b><div className="small muted">{s.model.lab} · {s.model.openWeights ? "open" : "closed"}{s.belowFloor ? " · below the quality bar" : ""}</div></td>
                    <td style={{ minWidth: 140 }}><QualityBar q={s.quality} /></td>
                    <td className="num">{money(s.costPerTask * 1000)}{s.usedBatch ? <span className="small muted"> batch</span> : ""}</td>
                    <td className="num">{money(s.monthlyCost)}</td>
                    <td className="small muted">{s.qualityBasis.length > 2 ? `${s.qualityBasis.slice(0, 2).join(", ")} +${s.qualityBasis.length - 2}` : s.qualityBasis.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="eyebrow">Step 3 · The market at a glance</div>
          <CostCapabilityMap models={catalog.models} highlight={pick?.model.id} eligible={new Set(rec.eligible.map((s) => s.model.id))} />
        </div>
      </section>

      <section style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="eyebrow">All models</div>
          <CatalogTable models={catalog.models} />
        </div>
      </section>
    </>
  );
}

/* ── Cost vs capability scatter ──────────────────────────────────────────── */

function CostCapabilityMap({ models, highlight, eligible }: { models: CatalogModel[]; highlight?: string; eligible: Set<string> }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [tip, setTip] = useState<CatalogModel | null>(null);
  const H = 380, M = { t: 16, r: 16, b: 36, l: 44 };
  const xs = models.map(blended), x0 = Math.floor(Math.log10(Math.min(...xs))), x1 = Math.ceil(Math.log10(Math.max(...xs)));
  const y0 = Math.floor(Math.min(...models.map((m) => m.eci)) / 5) * 5, y1 = Math.ceil(Math.max(...models.map((m) => m.eci)) / 5) * 5;
  const sx = (v: number) => M.l + ((Math.log10(v) - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
  // Pareto frontier: no cheaper model is more capable.
  const frontier: CatalogModel[] = [];
  for (const m of [...models].sort((a, b) => blended(a) - blended(b) || b.eci - a.eci)) if (!frontier.length || m.eci > frontier.at(-1)!.eci) frontier.push(m);
  const yTicks = Array.from({ length: Math.floor((y1 - y0) / 10) + 1 }, (_, i) => y0 + i * 10);

  return (
    <div className="card chart-card">
      <h3>Capability vs price — every model</h3>
      <p className="sub">Epoch Capabilities Index (higher is better) against blended list price per million tokens (3 input : 1 output, log scale). The line is the efficient frontier: no model above-left of it exists.</p>
      <div ref={box} style={{ position: "relative" }} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Capability versus price for every model">
          {yTicks.map((v) => (
            <g key={v}><line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" /><text className="tick" x={M.l - 8} y={sy(v) + 4} textAnchor="end">{v}</text></g>
          ))}
          {Array.from({ length: x1 - x0 + 1 }, (_, i) => 10 ** (x0 + i)).map((v) => (
            <g key={v}><line x1={sx(v)} x2={sx(v)} y1={M.t} y2={H - M.b} stroke="var(--grid)" /><text className="tick" x={sx(v)} y={H - 14} textAnchor="middle">{perM(v)}</text></g>
          ))}
          <motion.path d={frontier.map((m, i) => `${i ? "L" : "M"}${sx(blended(m)).toFixed(1)},${sy(m.eci).toFixed(1)}`).join("")} fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="4 4"
            initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2 }} />
          {models.map((m, i) => {
            const on = m.id === highlight, ok = eligible.has(m.id);
            return (
              <motion.circle key={m.id} cx={Math.round(sx(blended(m)) * 10) / 10} cy={Math.round(sy(m.eci) * 10) / 10} r={on ? 9 : 5}
                fill={m.openWeights ? "var(--s3)" : "var(--s1)"} fillOpacity={ok ? 0.9 : 0.25} stroke={on ? "var(--ink)" : "var(--surface)"} strokeWidth={on ? 2.5 : 1.5}
                initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: Math.min(1, i * 0.008), type: "spring", stiffness: 300, damping: 20 }}
                style={{ cursor: "pointer" }} tabIndex={0} aria-label={`${m.name}: index ${m.eci}, ${perM(blended(m))} per million tokens`}
                onMouseEnter={() => setTip(m)} onFocus={() => setTip(m)} />
            );
          })}
          {highlight && (() => { const m = models.find((x) => x.id === highlight)!; return <text className="lbl" x={sx(blended(m)) + 12} y={sy(m.eci) + 4}>{m.name} (pick)</text>; })()}
          <text className="tick" x={W - M.r} y={H - 2} textAnchor="end">price per million tokens →</text>
        </svg>
        {tip && (
          <div className="tip" style={{ left: `clamp(0px, calc(${(sx(blended(tip)) / W) * 100}% - 90px), calc(100% - 200px))`, top: `calc(${(sy(tip.eci) / H) * 100}% - 10px)`, transform: "translateY(-100%)" }}>
            <b>{tip.name}</b>
            <div className="muted">{tip.lab} · {tip.openWeights ? "open weights" : "closed"}</div>
            <div>Capability {tip.eci.toFixed(1)} <span className="muted">({tip.eciLow.toFixed(0)}–{tip.eciHigh.toFixed(0)})</span></div>
            <div>{perM(tip.price.input)} in / {perM(tip.price.output)} out per M</div>
            {!eligible.has(tip.id) && <div className="muted">Doesn&apos;t meet this workload&apos;s requirements</div>}
          </div>
        )}
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--s1)", height: 10, width: 10, borderRadius: "50%" }} />Closed weights</span>
        <span><i style={{ background: "var(--s3)", height: 10, width: 10, borderRadius: "50%" }} />Open weights</span>
        <span><i className="dash" />Efficient frontier</span>
        <span>Faded = excluded by this workload&apos;s requirements</span>
      </div>
    </div>
  );
}

/* ── Sortable catalog ────────────────────────────────────────────────────── */

type SortKey = "eci" | "input" | "output" | "context" | "released" | "name";

function CatalogTable({ models }: { models: CatalogModel[] }) {
  const [q, setQ] = useState("");
  const [access, setAccess] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "eci", desc: true });
  const val = (m: CatalogModel, k: SortKey) => (k === "eci" ? m.eci : k === "input" ? m.price.input : k === "output" ? m.price.output : k === "context" ? m.context : k === "released" ? m.released : m.name.toLowerCase());
  const rows = models
    .filter((m) => !access || (access === "open") === m.openWeights)
    .filter((m) => !q || `${m.name} ${m.lab} ${m.id}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => { const x = val(a, sort.key), y = val(b, sort.key); return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1); });
  const th = (k: SortKey, label: string) => (
    <th><button className="sort" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== "name" }))} aria-label={`Sort by ${label}`}>
      {label}{sort.key === k ? (sort.desc ? " ↓" : " ↑") : ""}
    </button></th>
  );
  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search model or lab…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search models" />
        <select value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Weights">
          <option value="">Open and closed</option><option value="open">Open weights</option><option value="closed">Closed</option>
        </select>
      </div>
      <p className="small muted" style={{ marginBottom: 10 }}>{rows.length} of {models.length} models · prices in USD per million tokens</p>
      <div className="card table-scroll">
        <table>
          <thead><tr>{th("name", "Model")}{th("eci", "Capability")}{th("input", "Input")}{th("output", "Output")}<th>Batch</th>{th("context", "Context")}<th>Capabilities</th>{th("released", "Released")}</tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td><b>{m.name}</b><div className="small muted">{m.lab} · {m.openWeights ? "open" : "closed"}</div></td>
                <td className="num">{m.eci.toFixed(1)} <span className="small muted">±{((m.eciHigh - m.eciLow) / 2).toFixed(0)}</span></td>
                <td className="num">{perM(m.price.input)}</td>
                <td className="num">{perM(m.price.output)}</td>
                <td className="num">{m.batchPrice ? `${perM(m.batchPrice.input)} / ${perM(m.batchPrice.output)}` : "—"}</td>
                <td className="num">{tokens(m.context)}</td>
                <td className="small">{[m.inputs.includes("image") && "vision", m.tools && "tools", m.structured && "JSON", m.reasoning && "reasoning"].filter(Boolean).join(" · ")}</td>
                <td className="num">{m.released}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export type { Scored };
