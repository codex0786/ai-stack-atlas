import type { Metadata } from "next";
import Link from "next/link";
import { BarList, TimeChart } from "@/components/charts";
import { Cite } from "@/components/Cite";
import { CountUp, Reveal } from "@/components/motion";
import { fmt, fmtPeriod, parts } from "@/lib/format";
import { getSite, latestOf, series, type Cited } from "@/lib/site";

export const metadata: Metadata = {
  title: "India lens",
  description: "India in the AI stack: subsidised IndiaAI compute vs global GPU prices in rupees, data-centre capacity and investment, and what AI means for Indian IT services.",
};

/** A USD figure restated in rupees at the given rate; keeps the original source. */
function toInr(c: Cited, fx: Cited): Cited {
  return { ...c, id: `${c.id}_inr`, currency: "INR", value: Math.round(c.value * fx.value * 100) / 100, low: c.low && c.low * fx.value, high: c.high && c.high * fx.value,
    note: `Converted from $${c.value.toFixed(2)} at ₹${fx.value.toFixed(2)}/$ (ECB rate, ${fmtPeriod(fx.period)}).${c.note ? ` ${c.note}` : ""}` };
}

function Tile({ label, c, ctx, extra }: { label: string; c: Cited; ctx: React.ReactNode; extra?: Cited }) {
  return (
    <div className="card tile">
      <span className="label">{label}</span>
      <span className="value"><CountUp parts={parts(c)} /></span>
      <span className="ctx">{ctx}</span>
      <span className="foot"><Cite c={c} />{extra && extra.source.id !== c.source.id && <Cite c={extra} />}</span>
    </div>
  );
}

export default async function IndiaPage() {
  const site = await getSite();
  const o = site.obs;
  const fxSeries = series(site, "india", "fx_rate");
  const fx = fxSeries.at(-1);
  const yearAgo = fx && [...fxSeries].reverse().find((c) => Date.parse(c.period) <= Date.parse(fx.period) - 365 * 86_400_000);
  const portal = o("indiaai_portal_2026"), bid = o("indiaai_avg_bid_2025");
  const gpus = series(site, "indiaai_compute", "gpus_available", { basis: "empanelled" });
  const median = o("h100_market_median"), aws = o("h100_aws_od");
  const vast = latestOf(site, "h100", "gpu_rental_price", { provider: "vast_ai", contract: "marketplace" });
  const dcNow = o("cbre_india_dc_2026h1"), dcProj = o("cbre_india_dc_2026_proj"), jamnagar = o("reliance_jamnagar_planned");
  const investH1 = o("cbre_india_dc_invest_2026h1"), investCum = o("cbre_india_dc_invest_cum");
  const commits = [
    { label: "Amazon (all businesses, to 2030)", c: o("amzn_india_commit_2025") },
    { label: "Microsoft (4 years)", c: o("msft_india_commit_2025") },
    { label: "Google — Visakhapatnam (5 years)", c: o("googl_india_commit_2025") },
    { label: "AWS cloud only (to 2030)", c: o("aws_india_commit_2030") },
  ];
  const infy = series(site, "infosys", "revenue"), wipro = series(site, "wipro", "revenue");
  const growth = (s: Cited[]) => (s.length > 1 ? s.at(-1)!.value / s.at(-2)!.value - 1 : undefined);
  const iea2024 = o("iea_dc_twh_2024");
  // India's data-centre electricity: capacity (IT MW) × PUE 1.4 × 70% average load (assumptions).
  const indiaTwh = (dcNow.value * 1.4 * 0.7 * 8760) / 1e6;

  return (
    <>
      <section style={{ paddingBottom: 12 }}>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">India lens</div>
            <h1 className="sec-title" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>India in the AI stack</h1>
            <p className="sec-lede">
              Subsidised public compute, a data-centre build-out heading past 2 GW, $60B+ of Big Tech commitments — and an IT-services industry whose growth has stalled.
              Global prices are shown in rupees at today&apos;s ECB rate{fx ? ` (₹${fx.value.toFixed(2)} per $, ${fmtPeriod(fx.period)})` : ""}.
            </p>
          </Reveal>
          <div className="tiles">
            {[
              gpus.at(-1) && <Tile key="g" label="GPUs on the IndiaAI compute portal" c={gpus.at(-1)!} ctx={<>Up from {fmt(gpus[0]!)} in {fmtPeriod(gpus[0]!.period)}</>} />,
              <Tile key="p" label="Subsidised GPU-hour (IndiaAI)" c={portal} extra={median}
                ctx={fx ? <>≈ ${(portal.value / fx.value).toFixed(2)} — {Math.round((1 - portal.value / (median.value * fx.value)) * 100)}% below the global market median (₹{Math.round(median.value * fx.value)})</> : null} />,
              <Tile key="d" label="Data-centre capacity (operational)" c={dcNow} ctx={<>{fmt(dcProj)} expected by end-2026 (CBRE)</>} />,
              <Tile key="i" label="Data-centre investment committed, H1 2026" c={investH1} ctx={<>{fmt(investCum)} cumulative since 2021</>} />,
              infy.at(-1) && <Tile key="it" label="Infosys revenue, latest fiscal year" c={infy.at(-1)!} ctx={<>{growth(infy) !== undefined ? `${growth(infy)! >= 0 ? "+" : ""}${(growth(infy)! * 100).toFixed(1)}% on the year before` : ""} · from its 20-F</>} />,
              fx && <Tile key="fx" label="Rupees per US dollar" c={fx} ctx={<>{yearAgo ? `${fx.value >= yearAgo.value ? "+" : ""}${(((fx.value / yearAgo.value) - 1) * 100).toFixed(1)}% vs a year earlier (₹${yearAgo.value.toFixed(2)}) — imported GPUs cost more` : "Live ECB reference rate"}</>} />,
            ].filter(Boolean).map((t, i) => <Reveal key={i} delay={(i % 3) * 0.06}>{t}</Reveal>)}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Compute</div>
            <h2 className="sec-title">What a GPU-hour costs in India</h2>
            <p className="sec-lede">IndiaAI&apos;s portal price is subsidised (up to 40% for students, startups and researchers) and covers a mix of GPUs; global figures are H100 list prices converted to rupees.</p>
          </Reveal>
          <div className="charts">
            <Reveal>
              {fx ? (
                <BarList title="A GPU-hour, in rupees" sub={`Converted at ₹${fx.value.toFixed(2)} per $ where the source is in dollars`}
                  rows={[
                    { label: "IndiaAI portal (subsidised)", c: portal, emphasis: true },
                    { label: "IndiaAI average bid", c: bid, emphasis: true },
                    ...(vast ? [{ label: "Vast.ai marketplace (H100)", c: toInr(vast, fx) }] : []),
                    { label: "Global market median (H100)", c: toInr(median, fx) },
                    { label: "AWS on-demand (H100)", c: toInr(aws, fx) },
                  ]}
                  note="Orange = IndiaAI. The portal price is per GPU-hour across a mix of GPU models, so it is not a like-for-like H100 price." />
              ) : null}
            </Reveal>
            <Reveal delay={0.05}>
              <TimeChart title="IndiaAI common compute capacity" sub="GPUs empanelled on the IndiaAI compute portal" series={[{ name: "GPUs", color: "var(--s2)", points: gpus.map((c) => ({ c, hollow: !c.source.verified })) }]} />
            </Reveal>
            {fxSeries.length > 10 && (
              <Reveal>
                <TimeChart title="Rupees per US dollar" sub="ECB reference rate, weekly sample — updated daily"
                  series={[{ name: "₹ per $", color: "var(--s1)", points: fxSeries.filter((_, i, a) => i % 5 === 0 || i === a.length - 1).map((c) => ({ c })) }]}
                  yMax={Math.ceil(Math.max(...fxSeries.map((c) => c.value)) / 10) * 10} />
              </Reveal>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Data centres &amp; capital</div>
            <h2 className="sec-title">The build-out</h2>
            <p className="sec-lede">
              Operational capacity is still small next to the US, but commitments are large. At India&apos;s current capacity, data centres would use roughly {indiaTwh.toFixed(0)} TWh a year
              — about {((indiaTwh / iea2024.value) * 100).toFixed(1)}% of global data-centre electricity in 2024 <Cite c={iea2024} /> (assuming PUE 1.4 and 70% average load).
            </p>
          </Reveal>
          <div className="charts">
            <Reveal>
              <BarList title="Data-centre capacity, MW" sub="Operational, projected, and the largest single planned campus"
                rows={[{ label: "Operational, H1 2026", c: dcNow }, { label: "Expected, end-2026", c: dcProj }, { label: "Reliance Jamnagar (planned)", c: jamnagar, emphasis: true }]}
                note="One planned campus (Jamnagar) would exceed India's entire operational capacity today." />
            </Reveal>
            <Reveal delay={0.05}>
              <BarList title="Announced investment in India" sub="Company announcements, USD — plans, not money spent" rows={commits}
                note="Scopes differ: Amazon's $35B covers all its businesses; the $12.7B AWS figure is cloud only and partly overlaps it. Don't add them up." />
            </Reveal>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">IT services</div>
            <h2 className="sec-title">The exposure: India&apos;s IT services</h2>
            <p className="sec-lede">
              Indian IT services sell people-hours of exactly the work AI agents increasingly do. Their own filings show revenue growth stalling — Wipro&apos;s rupee revenue has
              shrunk for two years. Revenue from 20-F filings with the SEC, by fiscal year (April–March).
            </p>
          </Reveal>
          <div className="charts">
            {infy.length > 1 && <Reveal><TimeChart title="Infosys revenue" sub="Fiscal years, USD — 20-F" series={[{ name: "Infosys", color: "var(--s1)", points: infy.map((c) => ({ c })) }]} /></Reveal>}
            {wipro.length > 1 && <Reveal delay={0.05}><TimeChart title="Wipro revenue" sub="Fiscal years, INR — 20-F" series={[{ name: "Wipro", color: "var(--s2)", points: wipro.map((c) => ({ c })) }]} /></Reveal>}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap prose">
          <h2>What it means</h2>
          <ul>
            <li><b>Cheap compute is real but rationed.</b> At ₹{portal.value}/hr, IndiaAI&apos;s subsidised GPUs cost a fraction of global rates — but they go to approved startups, researchers and the mission&apos;s foundation-model teams, not to any buyer.</li>
            <li><b>A weaker rupee raises the bill.</b> GPUs and cloud are priced in dollars; every rupee of depreciation feeds straight into Indian AI companies&apos; costs.</li>
            <li><b>Capacity is a power question.</b> Getting from ~2 GW to the 3 GW Jamnagar campus alone needs grid connections and generation on a scale India is only starting to plan.</li>
            <li><b>For Indian enterprises choosing models:</b> data that must stay in India points to open-weight models run locally — see the <Link href="/dashboard">dashboard&apos;s &ldquo;private deployment&rdquo; problem</Link>; for costs, the <Link href="/calculators">calculators</Link> take any electricity price.</li>
          </ul>
          <p className="small muted">IndiaAI&apos;s ₹10,372 crore outlay (approved March 2024) <Cite c={o("indiaai_budget")} /> funds the compute portal, foundation models, datasets and skilling.</p>
        </div>
      </section>
    </>
  );
}
