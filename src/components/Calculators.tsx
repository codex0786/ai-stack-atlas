"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { dataCentrePower, gpuHourCost, inferenceCost, sensitivity, trainingCost, type GpuHourInputs } from "@/lib/calculators";
import type { Cited } from "@/lib/site";
import { Cite } from "./Cite";

// Interactive unit-economics calculators. Inputs marked with a source chip come from the
// atlas; everything else is a labelled assumption you can change.

export interface CalcSources {
  tdp: Cited; peakBf16: Cited;
  rentals: { label: string; c: Cited }[];
  presets: { label: string; c: Cited }[];
  dcTwh2024: Cited; dcTwh2030?: Cited;
  openWeightOutputMedian?: { value: number; n: number; asOf: string };
}

type Tab = "gpu" | "training" | "inference" | "power";
const TABS: { id: Tab; name: string; q: string }[] = [
  { id: "gpu", name: "GPU-hour cost", q: "What does one GPU-hour really cost to own and run?" },
  { id: "training", name: "Training run", q: "What does it cost to train a frontier model?" },
  { id: "inference", name: "Inference", q: "What does a million tokens cost to serve?" },
  { id: "power", name: "Data-centre power", q: "How much electricity does a GPU cluster use?" },
];

const usd = (x: number) => (x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}k` : x >= 10 ? `$${x.toFixed(0)}` : `$${x.toFixed(2)}`);
const num = (x: number, d = 0) => x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const sci = (x: number) => { const e = Math.floor(Math.log10(x)); return `${(x / 10 ** e).toFixed(1)}×10${String(e).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]!)}`; };

function Field({ label, value, onChange, min, max, step, unit, fmt, source, note }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string;
  fmt?: (v: number) => string; source?: Cited; note?: string;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <label>{label}</label>
        {source ? <Cite c={source} /> : <span className="badge" title="An assumption — change it to match your case">assumption</span>}
      </div>
      <div className="field-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <span className="field-val">
          <input type="number" min={min} max={max} step={step} value={Number(value.toPrecision(6))} onChange={(e) => onChange(Number(e.target.value))} aria-label={`${label} value`} />
          {unit && <span className="small muted">{unit}</span>}
        </span>
      </div>
      {(fmt || note) && <span className="small muted">{fmt ? fmt(value) : ""}{fmt && note ? " · " : ""}{note}</span>}
    </div>
  );
}

function Out({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="out">
      <span className="small muted">{label}</span>
      <motion.b key={value} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>{value}</motion.b>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

/** Horizontal bars on one scale; `own` row highlighted. */
function Compare({ rows, unit }: { rows: { label: string; value: number; own?: boolean; source?: Cited }[]; unit: string }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="compare">
      {rows.map((r) => (
        <div key={r.label} className="compare-row">
          <span className="small">{r.label}</span>
          <span className="compare-track"><motion.i style={{ background: r.own ? "var(--s2)" : "var(--s1)" }} initial={{ width: 0 }} animate={{ width: `${(r.value / max) * 100}%` }} transition={{ duration: 0.5 }} /></span>
          <span className="small num" style={{ fontWeight: 600 }}>{usd(r.value)}{unit}</span>
          <span>{r.source && <Cite c={r.source} />}</span>
        </div>
      ))}
    </div>
  );
}

export function Calculators({ src }: { src: CalcSources }) {
  const [tab, setTab] = useState<Tab>("gpu");
  useEffect(() => {
    // Deep links (/calculators#training) work on load and when the hash changes in place.
    const sync = () => { const h = location.hash.slice(1) as Tab; if (TABS.some((t) => t.id === h)) setTab(h); };
    sync();
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };

  // Shared hardware and cost assumptions (one place, used by every calculator).
  const [gpu, setGpu] = useState<GpuHourInputs>({
    capexPerGpu: 30_000, lifeYears: 5, wacc: 0.1, wattsPerGpu: src.tdp.value + 300, pue: 1.2, powerPrice: 0.08, opexShare: 0.08, utilisation: 0.7,
  });
  const set = (k: keyof GpuHourInputs) => (v: number) => setGpu((g) => ({ ...g, [k]: v }));
  const own = useMemo(() => gpuHourCost(gpu), [gpu]);
  const marketMedian = src.rentals.find((r) => r.label.toLowerCase().includes("median"))?.c.value ?? own.total;
  const [priceMode, setPriceMode] = useState<"own" | "market">("own");
  const gpuHourPrice = priceMode === "own" ? own.total : marketMedian;

  return (
    <>
      <div className="calc-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`uc-card ${tab === t.id ? "on" : ""}`} onClick={() => go(t.id)}>
            <b>{t.name}</b><span>{t.q}</span>
          </button>
        ))}
      </div>

      {tab !== "gpu" && tab !== "power" && (
        <div className="price-mode small">
          GPU-hour price used:
          <button className={priceMode === "own" ? "on" : ""} onClick={() => setPriceMode("own")}>own cost {usd(own.total)}</button>
          <button className={priceMode === "market" ? "on" : ""} onClick={() => setPriceMode("market")}>market rental {usd(marketMedian)}</button>
          <span className="muted">(set own cost on the GPU-hour tab)</span>
        </div>
      )}

      {/* Fade the new panel in; no exit animation, so rapid tab switches can never leave it blank. */}
      <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {tab === "gpu" && <GpuTab gpu={gpu} set={set} own={own} src={src} />}
          {tab === "training" && <TrainingTab src={src} gpuHourPrice={gpuHourPrice} gridKw={own.gridKw} powerPrice={gpu.powerPrice} />}
          {tab === "inference" && <InferenceTab src={src} gpuHourPrice={gpuHourPrice} gridKw={own.gridKw} />}
          {tab === "power" && <PowerTab src={src} watts={gpu.wattsPerGpu} pue={gpu.pue} powerPrice={gpu.powerPrice} />}
      </motion.div>
    </>
  );
}

function GpuTab({ gpu, set, own, src }: { gpu: GpuHourInputs; set: (k: keyof GpuHourInputs) => (v: number) => void; own: ReturnType<typeof gpuHourCost>; src: CalcSources }) {
  const tornado = sensitivity(gpu, (i) => gpuHourCost(i).total, ["utilisation", "capexPerGpu", "lifeYears", "wacc", "opexShare", "powerPrice", "pue"]);
  const label: Record<string, string> = { utilisation: "Utilisation", capexPerGpu: "Capex per GPU", lifeYears: "Depreciation life", wacc: "Cost of capital", opexShare: "Opex share", powerPrice: "Electricity price", pue: "PUE" };
  const lo = Math.min(...tornado.map((t) => t.low)), hi = Math.max(...tornado.map((t) => t.high));
  const at = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const parts = [{ k: "Capital", v: own.capital, c: "var(--s1)" }, { k: "Opex", v: own.opex, c: "var(--s3)" }, { k: "Power", v: own.power, c: "var(--s2)" }];
  return (
    <div className="calc">
      <div className="card calc-in">
        <h3>Inputs</h3>
        <Field label="All-in capex per GPU" value={gpu.capexPerGpu} onChange={set("capexPerGpu")} min={5_000} max={80_000} step={500} unit="USD" note="GPU + share of server, network, install" />
        <Field label="Depreciation life" value={gpu.lifeYears} onChange={set("lifeYears")} min={2} max={8} step={0.5} unit="years" note="4–6 years is the industry debate" />
        <Field label="Cost of capital (WACC)" value={gpu.wacc} onChange={set("wacc")} min={0} max={0.25} step={0.005} fmt={(v) => `${(v * 100).toFixed(1)}%`} note="neoclouds borrow at higher rates" />
        <Field label="Power per GPU (incl. host share)" value={gpu.wattsPerGpu} onChange={set("wattsPerGpu")} min={300} max={2000} step={10} unit="W" source={src.tdp} note={`GPU TDP ${src.tdp.value} W + ~300 W host`} />
        <Field label="PUE" value={gpu.pue} onChange={set("pue")} min={1.05} max={2} step={0.01} note="cooling and facility overhead" />
        <Field label="Electricity price" value={gpu.powerPrice} onChange={set("powerPrice")} min={0.02} max={0.3} step={0.005} unit="$/kWh" />
        <Field label="Opex per year" value={gpu.opexShare} onChange={set("opexShare")} min={0} max={0.3} step={0.005} fmt={(v) => `${(v * 100).toFixed(1)}% of capex`} note="facility, staff, maintenance, software" />
        <Field label="Utilisation" value={gpu.utilisation} onChange={set("utilisation")} min={0.1} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}% of hours sold`} />
      </div>
      <div className="calc-out">
        <div className="card calc-hero">
          <Out label="Cost per used GPU-hour" value={usd(own.total)} sub={`${usd(own.total * 8760 * gpu.utilisation)} per GPU per year`} />
          <div className="bar100" style={{ height: 22, marginTop: 6 }}>
            {parts.map((p) => <motion.span key={p.k} style={{ background: p.c, borderRadius: 4 }} animate={{ flexGrow: p.v }} initial={false} title={`${p.k}: ${usd(p.v)}`} />)}
          </div>
          <div className="legend">{parts.map((p) => <span key={p.k}><i style={{ background: p.c, width: 10, height: 10, borderRadius: 3 }} />{p.k} {usd(p.v)} ({Math.round((p.v / own.total) * 100)}%)</span>)}</div>
        </div>
        <div className="card calc-card">
          <h3>Your cost vs what the market charges</h3>
          <p className="sub">H100 rental prices in the atlas. The gap is the operator&apos;s gross margin — or loss.</p>
          <Compare unit="/hr" rows={[{ label: "Your cost", value: own.total, own: true }, ...src.rentals.map((r) => ({ label: r.label, value: r.c.value, source: r.c }))]} />
          <p className="small" style={{ marginTop: 10 }}>
            {src.rentals.map((r) => `${r.label}: ${Math.round(((r.c.value - own.total) / r.c.value) * 100)}%`).join(" · ")} gross margin at your cost.
          </p>
        </div>
        <div className="card calc-card">
          <h3>What moves the answer most</h3>
          <p className="sub">Each input moved ±20%; bars show the resulting cost per GPU-hour.</p>
          <div className="tornado">
            {tornado.map((t) => (
              <div key={String(t.key)} className="compare-row">
                <span className="small">{label[String(t.key)]}</span>
                <span className="compare-track" style={{ position: "relative" }}>
                  <motion.i style={{ position: "absolute", left: at(t.low), background: "var(--s1)", height: "100%" }} animate={{ width: `calc(${at(t.high)} - ${at(t.low)})` }} initial={false} />
                  <i style={{ position: "absolute", left: at(t.base), width: 2, background: "var(--ink)", height: "100%", top: 0 }} />
                </span>
                <span className="small num">{usd(t.low)}–{usd(t.high)}</span>
                <span />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrainingTab({ src, gpuHourPrice, gridKw, powerPrice }: { src: CalcSources; gpuHourPrice: number; gridKw: number; powerPrice: number }) {
  const [flop, setFlop] = useState(src.presets[0]?.c.value ?? 1e26);
  const [mfu, setMfu] = useState(0.4);
  const [gpus, setGpus] = useState(100_000);
  const r = trainingCost({ flop, peakFlops: src.peakBf16.value, mfu, gpuHourPrice, gpus, gridKwPerGpu: gridKw });
  const preset = src.presets.find((p) => p.c.value === flop);
  return (
    <div className="calc">
      <div className="card calc-in">
        <h3>Inputs</h3>
        <div className="field">
          <div className="field-head"><label>Training compute</label>{preset ? <Cite c={preset.c} /> : <span className="badge">assumption</span>}</div>
          <div className="presets">{src.presets.map((p) => <button key={p.label} className={flop === p.c.value ? "on" : ""} onClick={() => setFlop(p.c.value)}>{p.label}</button>)}</div>
          <div className="field-row">
            <input type="range" min={23} max={28} step={0.05} value={Math.log10(flop)} onChange={(e) => setFlop(10 ** Number(e.target.value))} aria-label="Training compute (log10 FLOP)" />
            <span className="field-val"><b>{sci(flop)}</b><span className="small muted">FLOP</span></span>
          </div>
          <span className="small muted">≈ 6 × parameters × training tokens</span>
        </div>
        <Field label="Model FLOP utilisation (MFU)" value={mfu} onChange={setMfu} min={0.15} max={0.7} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} note="30–50% is typical at scale" />
        <Field label="GPUs in the cluster" value={gpus} onChange={setGpus} min={1_000} max={500_000} step={1_000} unit="H100-equiv." />
        <div className="field"><div className="field-head"><label>Peak throughput per GPU</label><Cite c={src.peakBf16} /></div><span>{num(src.peakBf16.value / 1e12, 1)} TFLOPS (BF16 dense)</span></div>
      </div>
      <div className="calc-out">
        <div className="card calc-hero">
          <div className="outs">
            <Out label="Compute cost of the run" value={usd(r.cost)} sub={`at ${usd(gpuHourPrice)} per GPU-hour`} />
            <Out label="GPU-hours" value={`${num(r.gpuHours / 1e6, 1)}M`} />
            <Out label="Wall-clock time" value={`${num(r.days, 0)} days`} sub={`on ${num(gpus)} GPUs`} />
            <Out label="Electricity" value={`${num(r.mwh / 1000, 0)} GWh`} sub={`${usd(r.energyCost(powerPrice))} of power`} />
          </div>
        </div>
        <div className="card calc-card">
          <h3>Read it as</h3>
          <ul className="why">
            <li>Compute is the bulk of a frontier model&apos;s cost, but not all of it: Epoch AI estimates staff are 29–49% of development cost.</li>
            <li>The final run is one of many: experiments and failed runs typically multiply total compute several times.</li>
            <li>Electricity is a small share of the bill ({Math.round((r.energyCost(powerPrice) / r.cost) * 100)}% here) but a large share of the siting problem: {num(r.mwh / 1000 / (r.days * 24) * 1000, 0)} MW of continuous load.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function InferenceTab({ src, gpuHourPrice, gridKw }: { src: CalcSources; gpuHourPrice: number; gridKw: number }) {
  const [active, setActive] = useState(37e9);
  const [mfu, setMfu] = useState(0.2);
  const r = inferenceCost({ activeParams: active, peakFlops: src.peakBf16.value, servingMfu: mfu, gpuHourPrice, gridKwPerGpu: gridKw });
  const list = src.openWeightOutputMedian;
  return (
    <div className="calc">
      <div className="card calc-in">
        <h3>Inputs</h3>
        <Field label="Active parameters per token" value={active / 1e9} onChange={(v) => setActive(v * 1e9)} min={1} max={500} step={1} unit="billion" note="MoE models activate a fraction (e.g. 37B of 671B)" />
        <Field label="Serving utilisation" value={mfu} onChange={setMfu} min={0.05} max={0.5} step={0.01} fmt={(v) => `${Math.round(v * 100)}% of peak`} note="batching raises it; long contexts lower it" />
        <div className="field"><div className="field-head"><label>Peak throughput per GPU</label><Cite c={src.peakBf16} /></div><span>{num(src.peakBf16.value / 1e12, 1)} TFLOPS (BF16 dense)</span></div>
      </div>
      <div className="calc-out">
        <div className="card calc-hero">
          <div className="outs">
            <Out label="Cost per million output tokens" value={`$${r.costPerMillion < 1 ? r.costPerMillion.toFixed(3) : r.costPerMillion.toFixed(2)}`} sub={`at ${usd(gpuHourPrice)} per GPU-hour`} />
            <Out label="Throughput per GPU" value={`${num(r.tokensPerSecond)} tok/s`} />
            <Out label="Energy" value={`${r.whPerThousand.toFixed(3)} Wh`} sub="per 1,000 tokens, incl. PUE" />
            {list && <Out label="Implied margin at list price" value={`${Math.round(r.margin(list.value) * 100)}%`} sub={`vs $${list.value.toFixed(2)}/M median open-weight output price`} />}
          </div>
        </div>
        <div className="card calc-card">
          <h3>Read it as</h3>
          <ul className="why">
            <li>This is the compute-bound cost: roughly 2 FLOP per active parameter per token. Real serving adds memory-bandwidth limits, idle capacity and prompt processing.</li>
            {list && <li>The median open-weight model on OpenRouter lists at ${list.value.toFixed(2)} per million output tokens ({list.n} models, {list.asOf}); the gap to this cost is what hosts keep or compete away.</li>}
            <li>Halving active parameters (a sparser mixture-of-experts) halves the cost — the main reason open-weight prices have collapsed.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function PowerTab({ src, watts, pue, powerPrice }: { src: CalcSources; watts: number; pue: number; powerPrice: number }) {
  const [gpus, setGpus] = useState(100_000);
  const [load, setLoad] = useState(0.8);
  const r = dataCentrePower({ gpus, wattsPerGpu: watts, pue, loadFactor: load });
  return (
    <div className="calc">
      <div className="card calc-in">
        <h3>Inputs</h3>
        <Field label="GPUs" value={gpus} onChange={setGpus} min={1_000} max={2_000_000} step={1_000} unit="H100-equiv." />
        <Field label="Average load" value={load} onChange={setLoad} min={0.2} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}% of peak`} />
        <p className="small muted">Power per GPU ({watts} W), PUE ({pue}) and electricity price (${powerPrice}/kWh) come from the GPU-hour tab.</p>
      </div>
      <div className="calc-out">
        <div className="card calc-hero">
          <div className="outs">
            <Out label="Facility power" value={`${num(r.facilityMw, 0)} MW`} sub={`${num(r.itMw, 0)} MW of IT load`} />
            <Out label="Electricity per year" value={`${r.twhPerYear.toFixed(2)} TWh`} sub={`${usd(r.twhPerYear * 1e9 * powerPrice)} at your price`} />
            <Out label="Share of all data centres" value={`${((r.twhPerYear / src.dcTwh2024.value) * 100).toFixed(1)}%`} sub={<>of global use in 2024 <Cite c={src.dcTwh2024} /></>} />
            <Out label="Homes powered" value={r.homesEquivalent >= 1e6 ? `${num(r.homesEquivalent / 1e6, 2)}M` : `${num(r.homesEquivalent / 1e3, 0)}k`} sub="US average ≈10,500 kWh a year (assumption)" />
          </div>
        </div>
        {src.dcTwh2030 && (
          <div className="card calc-card">
            <h3>Read it as</h3>
            <ul className="why">
              <li>The IEA projects data centres reaching {num(src.dcTwh2030.value)} TWh by 2030; this cluster alone would be {((r.twhPerYear / src.dcTwh2030.value) * 100).toFixed(1)}% of that. <Cite c={src.dcTwh2030} /></li>
              <li>A {num(r.facilityMw, 0)} MW site needs a grid connection the size of a mid-sized power plant — interconnection queues, not chips, often set the timeline.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
