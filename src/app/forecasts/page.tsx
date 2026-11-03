import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { Cite } from "@/components/Cite";
import { FanChart, ScenarioExplorer, type FanForecast, type FanPoint } from "@/components/Forecasts";
import { Reveal } from "@/components/motion";
import { DATA_DIR } from "@/lib/catalog";
import { backtest, fitTrend, growthPerYear, predict, SCENARIOS } from "@/lib/forecast";
import { fmt, fmtPeriod } from "@/lib/format";
import type { LoggedForecast } from "@/lib/ledger";
import { periodEnd } from "@/lib/resolver";
import { getSite, series } from "@/lib/site";

export const metadata: Metadata = {
  title: "Forecasts",
  description: "Trend forecasts with intervals and backtests, a supply-constrained scenario model for AI compute and power, and a public, automatically scored forecast ledger.",
};

const YEAR = 365.25 * 86_400_000;
const yearsOf = (period: string) => 1970 + Date.parse(periodEnd(period)) / YEAR;
const nextQuarter = (p: string) => { const y = +p.slice(0, 4), q = +p.slice(-1); return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`; };

export default async function ForecastsPage() {
  const site = await getSite();
  const o = site.obs;
  let ledger: LoggedForecast[] = [];
  try { ledger = JSON.parse(readFileSync(path.join(DATA_DIR, "forecasts.json"), "utf8")); } catch {}
  const resolved = ledger.filter((f) => f.status !== "pending");
  const hits = resolved.filter((f) => f.status === "hit").length;
  const firstDue = ledger.filter((f) => f.status === "pending").map((f) => periodEnd(f.target.period)).sort()[0];

  // Big-four capex: fit the last 12 quarters, forecast 4 ahead; backtest by holding out the last 4.
  const capex = series(site, "hyperscalers", "capex").filter((c) => /Q\d$/.test(c.period) && c.source.automated);
  const capexPts = capex.map((c) => ({ t: yearsOf(c.period), y: c.value, label: c.period }));
  const capexFit = fitTrend(capexPts.slice(-12));
  const capexFuture: FanForecast[] = [];
  for (let p = capex.at(-1)!.period, i = 0; i < 4; i++) { p = nextQuarter(p); capexFuture.push({ t: yearsOf(p), label: p, ...predict(capexFit, yearsOf(p)) }); }
  const capexBt = backtest(capexPts.slice(-12), 4);

  // Largest training run: complete years since 2018, forecast to 2030; backtest the last 2 years.
  const year = new Date().getUTCFullYear();
  const runs = series(site, "frontier_models", "training_compute", { scope: "largest_released_in_year" }).filter((c) => +c.period < year && +c.period >= 2018);
  const runPts = runs.map((c) => ({ t: +c.period, y: c.value }));
  const runFit = fitTrend(runPts);
  const runFuture: FanForecast[] = Array.from({ length: 2030 - year + 1 }, (_, i) => year + i).map((y) => ({ t: y, label: String(y), ...predict(runFit, y) }));
  const runBt = backtest(runPts, 2);

  // Scenario inputs from the atlas.
  const ttm = capex.slice(-4).reduce((a, c) => a + c.value, 0);
  const cowos = series(site, "tsmc", "packaging_capacity");
  const cowosEnd = cowos.at(-1)!;
  const apw = 8, life = 4;
  // Installed fleet at the start: the last two years' packaging output (≈ 2024–25 shipments).
  const avgWpm = (a: number, b: number) => (a + b) / 2;
  const c = (p: string) => cowos.find((x) => x.period === p)?.value;
  const installedStart = [[c("2023-12"), c("2024-12")], [c("2024-12"), c("2025-12")]].filter(([a, b]) => a && b).reduce((s, [a, b]) => s + avgWpm(a!, b!) * 12 * apw, 0);
  const iea2030 = o("iea_dc_twh_2030");

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const fan = (pts: { t: number; y: number; label?: string }[], lab: (p: { t: number; label?: string }) => string): FanPoint[] => pts.map((p) => ({ t: p.t, value: p.y, label: lab(p) }));

  return (
    <>
      <section style={{ paddingBottom: 12 }}>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Forecasts</div>
            <h1 className="sec-title" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>What happens next — and how often we&apos;re right</h1>
            <p className="sec-lede">
              Statistical forecasts with honest 90% intervals, tested on data they didn&apos;t see; a scenario model of how far spending, chip packaging and power can stretch;
              and a public ledger where every forecast is frozen when made and scored automatically when the real number arrives.
            </p>
          </Reveal>
          <div className="tiles">
            {[
              ["Forecasts logged", String(ledger.length), "Frozen when made; never edited"],
              ["Resolved so far", String(resolved.length), resolved.length ? `${hits} inside their 90% interval` : firstDue ? `First results due ${fmtPeriod(firstDue)}` : "—"],
              ["Hit rate", resolved.length ? pct(hits / resolved.length) : "—", "A well-calibrated 90% interval should hit about 90% of the time"],
              ["Capex trend", `${((growthPerYear(capexFit) - 1) * 100).toFixed(0)}% / yr`, "Big-four capex growth, fitted on 12 quarters of filings"],
            ].map(([label, value, ctx], i) => (
              <Reveal key={label} delay={i * 0.05}><div className="card tile" style={{ minHeight: 120 }}><span className="label">{label}</span><span className="value">{value}</span><span className="ctx">{ctx}</span></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Trend forecasts</div>
            <h2 className="sec-title">Fitted trends, with their track record built in</h2>
            <p className="sec-lede">Each fit is re-run without its most recent points; the orange diamonds show what it would have predicted for them, so you can see how far to trust the dashed line.</p>
          </Reveal>
          <div className="charts">
            <Reveal>
              <FanChart kind="usd" title="Big-four hyperscaler capex per quarter" sub="Microsoft + Alphabet + Amazon + Meta, from filings; log-linear trend on 12 quarters, 4 quarters ahead"
                actual={fan(capexPts, (p) => p.label!)} forecast={capexFuture}
                backtest={capexBt.rows.map((r, i) => ({ t: r.t, label: capexPts.slice(-4)[i]!.label, mean: r.mean, lo: r.lo, hi: r.hi }))}
                footer={<p className="small muted" style={{ marginTop: 8 }}>Backtest (fit on 8 quarters, predict the next 4): average error {pct(capexBt.mape)}, {Math.round(capexBt.coverage * 4)} of 4 actuals inside the 90% interval{capexBt.coverage < 0.9 ? ` — the interval was too narrow: capex ${capexBt.rows.reduce((a, r) => a + r.error, 0) < 0 ? "ran ahead of" : "fell short of"} the trend` : ""}. Next quarter: <b>{fmt(capex.at(-1)!, capexFuture[0]!.mean)}</b> ({fmt(capex.at(-1)!, capexFuture[0]!.lo)}–{fmt(capex.at(-1)!, capexFuture[0]!.hi)}). <Cite c={capex.at(-1)!} /></p>} />
            </Reveal>
            <Reveal delay={0.05}>
              <FanChart kind="flop" log title="Largest training run released each year" sub={`Training compute, FLOP (log scale), Epoch AI; trend on complete years ${runs[0]?.period}–${runs.at(-1)?.period}, to 2030`}
                actual={fan(runPts, (p) => String(p.t))} forecast={runFuture}
                backtest={runBt.rows.map((r) => ({ t: r.t, label: String(r.t), mean: r.mean, lo: r.lo, hi: r.hi }))}
                footer={<p className="small muted" style={{ marginTop: 8 }}>Fitted growth {growthPerYear(runFit).toFixed(1)}× a year. Backtest on the last 2 years: average error {pct(runBt.mape)}, {Math.round(runBt.coverage * 2)} of 2 inside the interval. Yearly maxima are noisy, so the band is wide on purpose. <Cite c={runs.at(-1)!} /></p>} />
            </Reveal>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Scenarios — not predictions</div>
            <h2 className="sec-title">How far can spending, chips and power stretch?</h2>
            <p className="sec-lede">
              A supply-constrained chain: AI capex buys accelerators, but no more can be installed than advanced packaging (CoWoS) can produce; the installed fleet then sets power and
              electricity. Starting points are sourced — big-four capex over the last four quarters ({fmt(capex.at(-1)!, ttm)}) <Cite c={capex.at(-1)!} />, TSMC packaging capacity at
              end-2025 ({fmt(cowosEnd)}) <Cite c={cowosEnd} /> and the IEA&apos;s 2030 outlook <Cite c={iea2030} />. The rest are assumptions you can move.
            </p>
          </Reveal>
          <ScenarioExplorer scenarios={SCENARIOS} iea2030={iea2030.value}
            base={{ big4CapexTtm: ttm, big4Share: 0.6, systemsShare: 0.5, costPerAccelerator: 45_000, cowosStart: cowosEnd.value, acceleratorsPerWafer: apw,
              installedStart, lifeYears: life, kwPerAccelerator: 1.6, loadFactor: 0.7, startYear: year, years: 2030 - year + 1 }} />
          <p className="small muted" style={{ marginTop: 10 }}>
            Fixed assumptions: the big four make 60% of global AI data-centre capex; 50% of it buys accelerator systems; accelerators last {life} years; 70% average load; the starting fleet is
            two years of packaging output. &ldquo;Packaging binds&rdquo; means money is waiting for chips; &ldquo;spending binds&rdquo; means chips are waiting for money.
            Under these assumptions AI accelerators alone would use a large share of the IEA&apos;s 2030 projection for all data centres — either the IEA is conservative, or
            fleets will run cooler, older or less loaded than assumed here; both are worth watching.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Track record</div>
            <h2 className="sec-title">The forecast ledger</h2>
            <p className="sec-lede">Every forecast the atlas has made, newest first. The daily job scores each one when its target date passes. A hit means the outcome landed inside the 90% interval.</p>
          </Reveal>
          <div className="card table-scroll" style={{ marginTop: 20 }}>
            <table>
              <thead><tr><th>Forecast</th><th>Made</th><th>Forecast (90% interval)</th><th>Outcome</th><th>Method</th></tr></thead>
              <tbody>
                {[...ledger].reverse().map((f) => {
                  const asCited = { value: f.mean, unit: f.unit, kind: f.kind, currency: f.target.currency };
                  return (
                    <tr key={f.id}>
                      <td><b>{f.label}</b></td>
                      <td className="num">{f.made}</td>
                      <td className="num">{fmt(asCited)} <span className="small muted">({fmt(asCited, f.lo)} – {fmt(asCited, f.hi)})</span></td>
                      <td>{f.status === "pending" ? <span className="badge">due {fmtPeriod(f.target.period)}</span>
                        : <><span className={`badge ${f.status === "miss" ? "warn" : ""}`}>{f.status === "hit" ? "✓ hit" : "✗ miss"}</span> {fmt(asCited, f.actual!)} <span className="small muted">({f.error! >= 0 ? "+" : ""}{Math.round(f.error! * 100)}%)</span></>}</td>
                      <td className="small muted">{f.method}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>The ledger is <a href="https://github.com/codex0786/ai-stack-atlas/blob/main/data/forecasts.json" target="_blank" rel="noopener noreferrer">data/forecasts.json</a> in the public repository — its git history proves no forecast was changed after the fact. <Link href="/methodology#forecasts">Methodology</Link>.</p>
        </div>
      </section>
    </>
  );
}
