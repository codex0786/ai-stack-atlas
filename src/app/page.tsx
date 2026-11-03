import Link from "next/link";
import type { ReactNode } from "react";
import { BarList, ShareBar, TimeChart } from "@/components/charts";
import { Cite } from "@/components/Cite";
import { Freshness } from "@/components/Freshness";
import { CountUp, Reveal } from "@/components/motion";
import { StackHero } from "@/components/StackHero";
import { fmt, fmtPeriod, parts, STATUS_LABEL } from "@/lib/format";
import { HYPERSCALER_SUM } from "@/feeds/edgar";
import { LAB_ORGS } from "@/feeds/epoch";
import { evidenceStats, feedStatuses, getSite, latestOf, layerSummaries, series, type Cited } from "@/lib/site";
import { REPO } from "@/lib/constants";

function Tile({ label, c, ctx, extra = [], badge }: { label: string; c: Cited; ctx: ReactNode; extra?: Cited[]; badge?: string }) {
  const unverified = !c.source.verified;
  return (
    <div className="card tile">
      <span className="label">{label}</span>
      <span className="value"><CountUp parts={parts(c)} /></span>
      <span className="ctx">{ctx}</span>
      <span className="foot">
        <Cite c={c} />
        {extra.filter((e, i) => e.source.id !== c.source.id && extra.findIndex((x) => x.source.id === e.source.id) === i).map((e) => <Cite key={e.id} c={e} />)}
        {badge && <span className="badge warn">{badge}</span>}
        {!badge && unverified && <span className="badge">unverified</span>}
      </span>
    </div>
  );
}

export default async function Home() {
  const site = await getSite();
  const o = site.obs;
  const layers = layerSummaries(site);
  const stats = evidenceStats(site);
  const conflicts = site.facts.filter((f) => f.conflict);
  const tml = site.facts.filter((f) => f.entity_id === "thinking_machines" && f.metric_id === "valuation");

  // Live feeds
  const statuses = await feedStatuses();
  const orOut = latestOf(site, "openrouter", "llm_api_price_median", { direction: "output" });
  const orIn = latestOf(site, "openrouter", "llm_api_price_median", { direction: "input" });
  const models = latestOf(site, "openrouter", "models_listed");
  const yoy = (["us_lower48", "ercot", "pjm"] as const).map((e) => ({ e, c: latestOf(site, e, "electricity_load_growth", { window: "trailing_30d" }) }));
  const labPrices = ["anthropic", "openai", "xai", "moonshot", "alphabet", "minimax", "alibaba", "mistral", "deepseek", "meta"]
    .map((e) => ({ label: site.entity(e).name.replace(/ \(.*\)$/, ""), c: latestOf(site, e, "llm_api_price_median", { direction: "output", platform: "openrouter" }) }))
    .filter((r): r is { label: string; c: Cited } => !!r.c)
    .sort((a, b) => b.c.value - a.c.value);
  const capexColors = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
  const capex = HYPERSCALER_SUM.map((e, i) => ({ name: site.entity(e).name.replace(/ \(.*\)$/, ""), color: capexColors[i]!, points: series(site, e, "capex").filter((c) => c.source.automated && c.period >= "2023").map((c) => ({ c })) }))
    .filter((s) => s.points.length > 1);
  const orHistory = series(site, "openrouter", "llm_api_price_median", { direction: "output" });
  const thisYear = new Date().toISOString().slice(0, 4);
  const largest = series(site, "frontier_models", "training_compute", { scope: "largest_released_in_year" });
  const growthFit = latestOf(site, "frontier_models", "training_compute_growth", { basis: "atlas_fit_top10_since_2020" });
  const releases = (access: string) => series(site, "frontier_models", "large_models_released", { access }).filter((c) => c.period < thisYear);
  const labRecords = Object.keys(LAB_ORGS)
    .map((e) => ({ label: site.entity(e).name.replace(/ \(.*\)$/, ""), c: series(site, e, "training_compute", { scope: "lab_record" }).at(-1) }))
    .filter((r): r is { label: string; c: Cited } => !!r.c)
    .sort((a, b) => b.c.value - a.c.value);
  const gpuMarket = (["h100", "h200", "b200", "a100"] as const)
    .map((e) => ({ label: site.entity(e).name.replace("NVIDIA ", ""), c: latestOf(site, e, "gpu_rental_price", { provider: "vast_ai", contract: "marketplace" }) }))
    .filter((r): r is { label: string; c: Cited } => !!r.c);
  const big4 = latestOf(site, "hyperscalers", "capex");

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <Reveal>
            <div className="eyebrow">AI economics · every number sourced</div>
            <h1>Who builds AI, what it <em>costs</em>, and who gets paid.</h1>
            <p className="lede">
              A living map of the AI stack — from power plants and packaging lines to frontier labs, neolabs and open-weight models —
              where each figure carries its source, its tier and whether it has been checked.
            </p>
            <div className="hero-stats">
              <div><b><CountUp parts={{ prefix: "", num: stats.total, decimals: 0, suffix: "" }} /></b>sourced numbers</div>
              <div><b><CountUp parts={{ prefix: "", num: stats.sources, decimals: 0, suffix: "" }} /></b>sources</div>
              <div><b><CountUp parts={{ prefix: "", num: stats.entities, decimals: 0, suffix: "" }} /></b>entities</div>
              <div><b><CountUp parts={{ prefix: "", num: stats.conflicts, decimals: 0, suffix: "" }} /></b>open conflict</div>
            </div>
            <div className="cta">
              <Link className="btn primary" href="/explore">Explore every number →</Link>
              <a className="btn" href={`${REPO}/blob/main/PLAN.md`} target="_blank" rel="noopener noreferrer">Read the plan</a>
            </div>
          </Reveal>
          <StackHero layers={layers.filter((l) => l.id !== "CAP")} cap={layers.find((l) => l.id === "CAP")!} />
        </div>
      </section>


      <section style={{ padding: "8px 0 0" }}>
        <div className="wrap">
          <Reveal>
            <div className="card cta-band">
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>New · Executive dashboard</div>
                <h2 style={{ fontSize: 22 }}>Which AI model should your business use?</h2>
                <p className="muted" style={{ marginTop: 4 }}>Every priced model compared on capability, cost and fit — with a recommendation for nine business problems.</p>
              </div>
              <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="btn primary" href="/dashboard">Open the dashboard →</Link>
                <Link className="btn" href="/value-flow">Where $1 goes</Link>
                <Link className="btn" href="/calculators">Cost calculators</Link>
                <Link className="btn" href="/india">India lens</Link>
                <Link className="btn" href="/forecasts">Forecasts</Link>
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="live">
        <div className="wrap">
          <Reveal>
            <div className="live-tag"><span className="fresh ok"><i aria-hidden /></span>Live · refreshed daily</div>
            <h2 className="sec-title" style={{ marginTop: 10 }}>Live signals</h2>
            <p className="sec-lede">Pulled every morning by a scheduled job straight from SEC filings, OpenRouter&apos;s price list and the EIA grid monitor. Unusual moves are held for human review before they publish.</p>
          </Reveal>
          <div className="feeds">
            {Object.entries(statuses).map(([id, s], i) => (
              <Reveal key={id} delay={i * 0.06}>
                <div className="card feed">
                  <h3>{s.name}</h3>
                  <Freshness at={s.lastSuccess} tried={s.lastRun} cadenceHours={s.cadenceHours} ok={s.ok} />
                  <span className="small muted">{s.observations.toLocaleString("en-US")} {s.unit ?? "numbers"} · every {s.cadenceHours} h · <a href={s.homepage} target="_blank" rel="noopener noreferrer">source ↗</a></span>
                  {!s.ok && s.error && <span className="err">Last run: {s.error.length > 140 ? `${s.error.slice(0, 140)}…` : s.error}</span>}
                </div>
              </Reveal>
            ))}
          </div>
          <div className="tiles">
            {[
              orOut && <Tile key="o" label="Median output price, OpenRouter" c={orOut} ctx={<>Across {models ? fmt(models) : "all paid models"} listed · {fmtPeriod(orOut.period)}</>} />,
              orIn && <Tile key="i" label="Median input price, OpenRouter" c={orIn} ctx={<>Cheapest {fmt(orIn, orIn.low ?? orIn.value)}, dearest {fmt(orIn, orIn.high ?? orIn.value)}</>} />,
              big4?.source.automated && <Tile key="b" label="Big-four hyperscaler capex, latest quarter" c={big4} ctx={<>Microsoft + Alphabet + Amazon + Meta, from filings · {fmtPeriod(big4.period)}</>} />,
              largest.at(-1) && <Tile key="l" label="Largest training run released this year" c={largest.at(-1)!} ctx={<>{largest.at(-1)!.note?.split(",")[0]}</>} />,
              growthFit && <Tile key="g" label="Frontier training compute growth" c={growthFit} ctx={<>Fitted to Epoch AI&apos;s data since 2020</>} />,
              gpuMarket.find((g) => g.label.startsWith("H100")) && <Tile key="h" label="H100 on the open marketplace" c={gpuMarket.find((g) => g.label.startsWith("H100"))!.c} ctx={<>Median live Vast.ai offer, per GPU-hour</>} />,
              ...yoy.filter((y) => y.c).map((y) => (
                <Tile key={y.e} label={`${site.entity(y.e).name} demand, trailing 30 days`} c={y.c!} ctx={<>vs the same weekdays a year earlier · to {fmtPeriod(y.c!.period)}</>} />
              )),
            ].filter(Boolean).map((t, i) => <Reveal key={i} delay={(i % 4) * 0.06}>{t}</Reveal>)}
          </div>
          <div className="charts">
            <Reveal>
              {capex.length ? (
                <TimeChart title="Big-four hyperscaler capex per quarter" sub="Purchases of property and equipment, from each company's 10-Q/10-K (USD)" series={capex} />
              ) : (
                <div className="card chart-card">
                  <h3>Big-four hyperscaler capex per quarter</h3>
                  <p className="sub">Microsoft, Alphabet, Amazon and Meta, from their SEC filings.</p>
                  <p className="small muted" style={{ marginTop: 16 }}>Waiting for the first successful EDGAR run — the scheduled job fills this in automatically.</p>
                </div>
              )}
            </Reveal>
            {labPrices.length > 0 && (
              <Reveal delay={0.05}>
                <BarList title="What a million output tokens costs, by lab" sub={`Median list price across each lab's paid models on OpenRouter, ${fmtPeriod(labPrices[0]!.c.period)}`}
                  rows={labPrices} note="Whiskers span each lab's cheapest to dearest model (▸ = runs off the scale; hover for the full range). Open-weight models are also served by third-party hosts at lower prices." />
              </Reveal>
            )}
            {largest.length > 1 && (
              <Reveal>
                <TimeChart log title="Largest training run released each year" sub="Training compute, FLOP (log scale) — Epoch AI" series={[{ name: "Largest run", color: "var(--s1)", points: largest.map((c) => ({ c })) }]}
                  legendExtra={<span>Each step on the axis is 10× more compute; {thisYear} is year to date</span>} />
              </Reveal>
            )}
            {releases("closed").length > 1 && (
              <Reveal delay={0.05}>
                <TimeChart title="Large models released per year: open vs closed weights" sub={`Models trained with more than 10²³ FLOP, full years to ${Number(thisYear) - 1} — Epoch AI`}
                  series={[{ name: "Open weights", color: "var(--s3)", points: releases("open_weights").map((c) => ({ c })) }, { name: "Closed", color: "var(--s1)", points: releases("closed").map((c) => ({ c })) }]} />
              </Reveal>
            )}
            {labRecords.length > 0 && (
              <Reveal>
                <BarList log title="Each lab's largest training run" sub="Training compute of the lab's biggest model to date, FLOP (log scale) — Epoch AI" rows={labRecords}
                  note={`Log scale: equal steps in length are equal multiples of compute. ${labRecords[0]!.label}'s run is about ${Math.round(labRecords[0]!.c.value / labRecords.at(-1)!.c.value)}× ${labRecords.at(-1)!.label}'s. Hover a bar for the model.`} />
              </Reveal>
            )}
            {gpuMarket.length > 0 && (
              <Reveal delay={0.05}>
                <BarList title="GPU-hour on the open marketplace" sub={`Median live on-demand offer on Vast.ai, ${fmtPeriod(gpuMarket[0]!.c.period)}`} rows={gpuMarket}
                  note="Whiskers span the 10th–90th percentile of offers. Compare the hyperscaler list prices further down." />
              </Reveal>
            )}
            {orHistory.length > 1 && (
              <Reveal>
                <TimeChart title="OpenRouter median output price" sub="USD per million output tokens, all paid models, daily" series={[{ name: "Median", color: "var(--s1)", points: orHistory.map((c) => ({ c })) }]} />
              </Reveal>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Headline numbers</div>
            <h2 className="sec-title">The stack in ten figures</h2>
            <p className="sec-lede">Tap any chip for the source, its tier, the period and how confident we are. Unverified means the page couldn&apos;t be opened and checked yet.</p>
          </Reveal>
          <div className="tiles">
            {[
              <Tile key="a" label="Anthropic revenue run-rate" c={o("anthropic_arr_2026_07")} extra={[o("anthropic_arr_2025")]} ctx={<>Up from {fmt(o("anthropic_arr_2025"))} at end-2025 · {fmtPeriod("2026-07")}</>} />,
              <Tile key="b" label="OpenAI annualised revenue" c={o("openai_arr_2025")} ctx={<>From {fmt(o("openai_arr_2024"))} a year earlier · end-2025, per its CFO</>} />,
              <Tile key="c" label="US hyperscaler capex, 2026" c={o("hyperscalers_capex_2026_nasdaq")} extra={[o("hyperscalers_capex_2026_comsoc"), o("hyperscalers_capex_2026_seni")]} badge="sources disagree" ctx={<>Estimates span {fmt(o("hyperscalers_capex_2026_comsoc"))}–{fmt(o("hyperscalers_capex_2026_seni"))}</>} />,
              <Tile key="d" label="H100 rental, market median" c={o("h100_market_median")} extra={[o("h100_azure_od")]} ctx={<>Azure lists {fmt(o("h100_azure_od"))} — {(o("h100_azure_od").value / o("h100_market_median").value).toFixed(1)}× the median</>} />,
              <Tile key="e" label="Open-weight share of tokens" c={o("open_token_share_mozilla")} extra={[]} ctx={<>…but only {fmt(o("open_spend_share_mozilla"))} of model spend</>} />,
              <Tile key="f" label="Data-centre electricity, 2024" c={o("iea_dc_twh_2024")} extra={[o("iea_dc_twh_2030")]} ctx={<>IEA base case: {fmt(o("iea_dc_twh_2030"))} by 2030 ({fmt(o("iea_dc_share_2024"))} of world use today)</>} />,
              <Tile key="g" label="Frontier training cost growth" c={o("epoch_cost_growth")} ctx={<>95% CI {fmt(o("epoch_cost_growth"), 2.0)}–{fmt(o("epoch_cost_growth"), 3.1)}; $1B+ runs by 2027</>} />,
              <Tile key="h" label="IndiaAI subsidised GPU-hour" c={o("indiaai_portal_2026")} extra={[o("indiaai_avg_bid_2025")]} ctx={<>vs {fmt(o("indiaai_avg_bid_2025"))} average bid in Jan 2025</>} />,
              <Tile key="i" label="TSMC CoWoS packaging capacity" c={o("tsmc_cowos_2025")} ctx={<>End-2025, up from {fmt(o("tsmc_cowos_2023"))} two years earlier</>} />,
              <Tile key="j" label="CoreWeave contracted backlog" c={o("coreweave_backlog_2026q2")} extra={[o("coreweave_debt_2026q2")]} ctx={<>Against {fmt(o("coreweave_debt_2026q2"))} of total debt</>} />,
            ].map((t, i) => <Reveal key={i} delay={(i % 4) * 0.06}>{t}</Reveal>)}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Trends</div>
            <h2 className="sec-title">Revenue, rent, silicon and power</h2>
            <p className="sec-lede">Hover any point for its source. Hollow markers rest on sources not yet verified; dashed lines are projections.</p>
          </Reveal>
          <div className="charts">
            <Reveal>
              <TimeChart
                title="Frontier lab revenue run-rate"
                sub="Annualised revenue, USD"
                series={[
                  { name: "OpenAI", color: "var(--s1)", points: [o("openai_arr_2024"), o("openai_arr_2025")].map((c) => ({ c, hollow: !c.source.verified })) },
                  { name: "Anthropic", color: "var(--s2)", points: [o("anthropic_arr_2024"), o("anthropic_arr_2025"), o("anthropic_arr_2026_04"), o("anthropic_arr_2026_07")].map((c) => ({ c, hollow: !c.source.verified })) },
                ]}
              />
            </Reveal>
            <Reveal delay={0.05}>
              <BarList
                title="What one H100-hour costs"
                sub="On-demand list price per GPU, October 2026"
                rows={[
                  { label: "Azure", c: o("h100_azure_od") },
                  { label: "Google Cloud", c: o("h100_gcp_od") },
                  { label: "Oracle", c: o("h100_oracle_od") },
                  { label: "AWS", c: o("h100_aws_od") },
                  { label: "AWS capacity block", c: o("h100_aws_capblock") },
                  { label: "Market median (16)", c: o("h100_market_median"), emphasis: true },
                ]}
                note="Whisker on the median shows the cheapest–dearest range across 16 providers."
              />
            </Reveal>
            <Reveal>
              <BarList
                title="Rental price by GPU generation"
                sub="Median on-demand price per GPU-hour across providers, 7 Oct 2026"
                rows={[
                  { label: "A100 80GB", c: o("a100_market_median") },
                  { label: "H100 SXM", c: o("h100_market_median") },
                  { label: "H200", c: o("h200_market_median") },
                  { label: "B200", c: o("b200_market_median") },
                ]}
                note="Whiskers show the range across providers."
              />
            </Reveal>
            <Reveal delay={0.05}>
              <TimeChart
                title="TSMC CoWoS packaging capacity"
                sub="Monthly wafer capacity — the binding constraint on AI accelerators"
                series={[{ name: "CoWoS", color: "var(--s1)", points: ["tsmc_cowos_2023", "tsmc_cowos_2024", "tsmc_cowos_2025h1", "tsmc_cowos_2025"].map((id) => ({ c: o(id) })) }]}
                legendExtra={<span>Whiskers: estimate range</span>}
              />
            </Reveal>
            <Reveal>
              <TimeChart
                title="Data-centre electricity use"
                sub="Global, TWh per year (IEA)"
                yMax={2000}
                series={[{ name: "Data centres", color: "var(--s1)", points: ["iea_dc_twh_2024", "iea_dc_twh_2030", "iea_dc_twh_2035"].map((id) => ({ c: o(id) })) }]}
                legendExtra={<span>2035 whisker: range across all IEA cases</span>}
              />
            </Reveal>
            <Reveal delay={0.05}>
              <TimeChart
                title="Chinese open-weight share of OpenRouter tokens"
                sub="Weekly traffic share; a router sample, not all usage"
                yMax={0.5}
                series={[{ name: "Chinese open-weight", color: "var(--s2)", points: ["cn_open_share_2024q4", "cn_open_share_2026_04"].map((id) => ({ c: o(id), hollow: true })) }]}
              />
            </Reveal>
            <Reveal>
              <ShareBar
                title="Where frontier model money goes"
                sub="Share of development cost, midpoints of Epoch AI's ranges"
                parts={[
                  { label: "Hardware", color: "var(--s1)", c: o("epoch_share_hardware") },
                  { label: "R&D staff", color: "var(--s2)", c: o("epoch_share_staff") },
                  { label: "Energy", color: "var(--s3)", c: o("epoch_share_energy") },
                ]}
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Disagreements, kept visible</div>
            <h2 className="sec-title">Where sources disagree</h2>
            <p className="sec-lede">When sources give different values for the same fact, the atlas picks one by status, tier, recency and confidence — and shows the rest instead of hiding them. Rumours never become the current value.</p>
          </Reveal>
          {conflicts.map((f) => {
            const cands = f.candidates.map(site.cite);
            const lo = f.spread.min * 0.95, hi = f.spread.max * 1.05;
            const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
            return (
              <Reveal key={f.key}>
                <div className="card conflict">
                  <div className="layer-head">
                    <h3>{site.entity(f.entity_id).name} · {site.metric(f.metric_id).name}, {fmtPeriod(f.period)}</h3>
                    <span className="badge warn">{cands.length} sources</span>
                  </div>
                  <div className="spread" aria-hidden>
                    <div className="rail" />
                    {cands.map((c, i) => <span key={c.id} className={`pt ${i === 0 ? "best" : "alt"}`} style={{ left: at(c.value) }} title={`${fmt(c)} — ${c.source.publisher}`} />)}
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Value</th><th>Status</th><th>Source</th><th>Note</th></tr></thead>
                      <tbody>
                        {cands.map((c, i) => (
                          <tr key={c.id}>
                            <td className="num"><b>{fmt(c)}</b>{i === 0 && <span className="badge" style={{ marginLeft: 6 }}>chosen</span>}</td>
                            <td>{STATUS_LABEL[c.status]}</td>
                            <td><Cite c={c} /></td>
                            <td className="small muted">{c.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Reveal>
            );
          })}
          <Reveal>
            <div className="card conflict">
              <div className="layer-head">
                <h3>Thinking Machines Lab · valuation</h3>
                <span className="badge">rumours kept separate</span>
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>Reported talks at $40–50B never displace the last closed round.</p>
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>Value</th><th>When</th><th>Status</th><th>Source</th></tr></thead>
                  <tbody>
                    {tml.map((f) => site.cite(f.best)).map((c) => (
                      <tr key={c.id}><td className="num"><b>{fmt(c)}</b></td><td>{fmtPeriod(c.period)}</td><td>{STATUS_LABEL[c.status]}</td><td><Cite c={c} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Evidence quality</div>
            <h2 className="sec-title">How solid is this?</h2>
            <p className="sec-lede">An honest count. The next build phase replaces secondary figures with filings (SEC EDGAR) and primary datasets (Epoch AI, EIA).</p>
          </Reveal>
          <div className="evidence">
            <Reveal className="card" style={{ padding: 18 }}>
              <h3 style={{ fontSize: 16 }}>Numbers by source tier</h3>
              <div className="bar100" role="img" aria-label={`Tier 1: ${stats.tiers[0]}, tier 2: ${stats.tiers[1]}, tier 3: ${stats.tiers[2]}`}>
                {stats.tiers.map((n, i) => <span key={i} style={{ flex: n, background: ["var(--l1)", "var(--l4)", "var(--l7)"][i] }} />)}
              </div>
              <div className="legend">
                {["Primary", "Relay / analyst", "Secondary"].map((t, i) => <span key={t}><i style={{ background: ["var(--l1)", "var(--l4)", "var(--l7)"][i], height: 10, width: 10, borderRadius: 3 }} />T{i + 1} {t} · {stats.tiers[i]}</span>)}
              </div>
            </Reveal>
            <Reveal className="card" style={{ padding: 18 }} delay={0.06}>
              <h3 style={{ fontSize: 16 }}>Checked against the source page</h3>
              <p style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}><CountUp parts={{ prefix: "", num: stats.verified, decimals: 0, suffix: "" }} /> <span className="muted" style={{ fontSize: 18, fontWeight: 500 }}>of {stats.total}</span></p>
              <p className="small muted">The rest come from pages that blocked access or timed out; they carry lower confidence and a hollow marker until verified.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="layers">
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">The stack</div>
            <h2 className="sec-title">Layer by layer</h2>
            <p className="sec-lede">Every company, chip and segment we track, from the grid up. Open one to see all of its numbers and relationships.</p>
          </Reveal>
          {[...layers].map((l) => (
            <Reveal key={l.id}>
              <div className="card layer-block" id={`layer-${l.id}`}>
                <div className="layer-head">
                  <span className="badge" style={{ background: `var(--${l.id.toLowerCase()})`, color: l.id === "CAP" ? "#0d366b" : "#fff", borderColor: "transparent" }}>{l.id}</span>
                  <h3>{l.name}</h3>
                  <span className="small muted">{l.desc}</span>
                </div>
                <div className="ents">
                  {l.entities.length ? l.entities.map((e) => (
                    <Link key={e.id} className="ent" href={`/entity/${e.id}`}>{e.name}<span className="n">{e.facts}</span></Link>
                  )) : <span className="small muted">Arrives with the Phase 1 data ingest (applications, adoption and labour data).</span>}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
