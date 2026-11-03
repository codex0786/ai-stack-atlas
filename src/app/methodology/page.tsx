import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { REVISION_THRESHOLD, THRESHOLDS } from "@/feeds/anomaly";
import { FEEDS } from "@/feeds/run";
import { REPO } from "@/lib/constants";
import { LAYERS, METHODS, STATUSES } from "@/lib/ontology";
import { getSite } from "@/lib/site";

export const metadata: Metadata = { title: "Methodology" };

export default async function MethodologyPage() {
  const site = await getSite();
  const metrics = [...site.catalog.metrics].sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));
  return (
    <section>
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">How it works</div>
          <h1 className="sec-title">Methodology</h1>
          <p className="sec-lede">How numbers enter the atlas, how conflicts are resolved, how live data is checked, and what the atlas does not claim.</p>
        </Reveal>

        <div className="prose">
          <h2>1. The stack</h2>
          <p>Every entity and metric belongs to one of these layers. Capital runs across all of them.</p>
          <ul>{LAYERS.map((l) => <li key={l.id}><b>{l.id} · {l.name}</b> — {l.desc}</li>)}</ul>

          <h2>2. Every number is an observation</h2>
          <p>
            Nothing is stored as a bare value. Each observation records the entity, the metric (from a fixed dictionary, below), the <b>period</b> it describes,
            the date it was <b>published</b>, its <b>status</b> ({STATUSES.join(", ")}), how it was produced ({METHODS.join(", ")}), a confidence score, and its source.
            Optional qualifiers (provider, contract type, scenario…) make otherwise identical numbers distinct facts. Revisions are new observations that supersede
            the old one; nothing is edited in place.
          </p>

          <h2>3. Sources and tiers</h2>
          <ul>
            <li><b>Tier 1 — primary:</b> filings, company statements, government agencies (IEA, EIA), research organisations&apos; own publications, vendor datasheets and first-party price lists.</li>
            <li><b>Tier 2 — relay or analyst:</b> established press relaying a primary source, recognised analyst firms.</li>
            <li><b>Tier 3 — secondary:</b> aggregators, trackers and blogs.</li>
          </ul>
          <p>
            Separately, each source is marked <b>verified</b> (the page was opened and the cited figure checked against it), <b>⚙ automated</b> (pulled by a scheduled
            feed directly from the publisher&apos;s API or filing), or <b>not yet verified</b> (shown with a hollow marker and lower confidence).
          </p>

          <h2>4. Resolving conflicts</h2>
          <p>When several observations describe the same fact (same entity, metric, qualifiers, currency and period), the resolver picks one by, in order:</p>
          <ol>
            <li>Status: actual over guidance over projection over rumoured.</li>
            <li>Source tier: lower is better.</li>
            <li>Most recently published.</li>
            <li>Higher confidence, then reported over derived over estimated over modelled.</li>
          </ol>
          <p>
            The others stay visible. If any of them differs from the chosen value by more than <b>10%</b>, the fact is flagged as a conflict and shown on the home page.
            The <b>current</b> value of a series is the latest period whose best observation is an <i>actual</i> — rumours and projections never become current.
            Values for different periods are a time series, not a conflict.
          </p>

          <h2>5. Live feeds</h2>
          <p>A scheduled job (<a href={`${REPO}/blob/main/.github/workflows/ingest.yml`} target="_blank" rel="noopener noreferrer">GitHub Actions</a>) runs every day at 03:17 UTC:</p>
          <ul>
            {FEEDS.map((f) => (
              <li key={f.id}><b>{f.name}</b> (<a href={f.homepage} target="_blank" rel="noopener noreferrer">source</a>) — expected every {f.cadenceHours} h; {f.mode === "replace" ? "full history re-read each run" : "recent periods appended each run"}.</li>
            ))}
          </ul>
          <h3>SEC EDGAR</h3>
          <p>
            Capital expenditure, revenue, cost of revenue, long-term debt and remaining performance obligations (backlog) for Microsoft, Alphabet, Amazon, Meta, Oracle, NVIDIA, AMD, Broadcom and CoreWeave
            — plus annual revenue for Infosys and Wipro from their IFRS 20-F filings (in the currency each reports most),
            from the XBRL facts in their 10-Q and 10-K filings. Cash-flow items are reported year-to-date, so quarters are derived by subtracting consecutive year-to-date totals.
            Periods are labelled by the month the fiscal quarter ends. The first-filed value is kept unless a later filing restates it. Each value cites its own filing.
            Capex is &ldquo;purchases of property and equipment&rdquo; and excludes assets acquired under finance leases, which some hyperscalers use heavily.
          </p>
          <h3>OpenRouter</h3>
          <p>Daily medians of list prices (USD per million tokens) across all paid models, and per lab, plus the number of models listed. Free and variable-price entries are excluded. These are list prices on one router, not what large customers pay.</p>
          <h3>EIA</h3>
          <p>Daily electricity demand (EIA-930) for the US Lower 48, ERCOT and PJM; only completed days are used. Growth compares average daily demand over the trailing 30 days with the same weekdays 364 days earlier.</p>

          <h3>Exchange rate</h3>
          <p>The USD→INR reference rate (European Central Bank, via the Frankfurter API) is read daily for the last 400 days. The India lens converts dollar prices to rupees at the latest rate and says so on each converted figure.</p>
          <h3>Epoch AI</h3>
          <p>
            Epoch AI&apos;s large-scale models dataset (models trained with more than 10²³ FLOP, CC BY). The atlas records the largest run released each year, each lab&apos;s
            record-setting runs, open- versus closed-weight releases per year (any open-weights licence counts as open), and its own log-linear fit of frontier training compute
            since 2020, using models that were in the top 10 by compute when released. Compute figures are Epoch&apos;s estimates.
          </p>
          <h3>GPU marketplace</h3>
          <p>Live on-demand offers on the Vast.ai marketplace for H100 SXM, H200, B200 and A100 SXM4: the median price per GPU-hour (total hourly price ÷ GPUs in the offer) with the 10th–90th percentile spread. Marketplace offers from independent hosts usually sit well below hyperscaler list prices.</p>

          <h3 id="dashboard">Model catalog and the executive dashboard</h3>
          <p>
            Daily, every model on OpenRouter is joined by name to Epoch AI&apos;s Capabilities Index (ECI) and per-benchmark results (CC BY); models without a list price or an ECI score are left out.
            For each business problem the dashboard fixes a workload (tokens per task, cacheable share, batch eligibility, monthly volume) and hard requirements (context length, vision, tools,
            structured output, open weights). Then:
          </p>
          <ul>
            <li><b>Quality</b> = 0.6 × capability index (scaled 0–1 across the catalog) + 0.4 × the model&apos;s average percentile on the problem&apos;s benchmarks, when it has any; otherwise the index alone. A model that has never been measured on a problem&apos;s benchmarks (when other models have) keeps 95% of its index score — a small uncertainty discount, labelled &ldquo;untested on this task&rdquo;.</li>
            <li><b>Cost per task</b> = uncached input × input price + cached input × cache price + output × output price, using batch prices when the work can run overnight.</li>
            <li><b>Score</b> = w × quality + (1 − w) × cheapness (cost on a log scale), where w is the problem&apos;s quality weight (0.3 for bulk extraction up to 0.8 for coding, research and agents).</li>
            <li><b>Recommendation</b> = the highest score among models reaching 85% of the best eligible model&apos;s quality (80% for bulk extraction), so a far cheaper but clearly weaker model never wins on price alone. <b>Near-top quality, lowest cost</b> = the cheapest model within 0.08 of the top quality. <b>Best open-weight</b> applies the same quality bar within open-weight models.</li>
          </ul>
          <p>Prices are list prices and exclude enterprise discounts; benchmarks narrow the shortlist but do not replace a pilot on your own tasks. The use-case definitions live in <a href={`${REPO}/blob/main/src/lib/usecases.ts`} target="_blank" rel="noopener noreferrer">usecases.ts</a>.</p>

          <h3 id="calculators">Cost calculators</h3>
          <ul>
            <li><b>GPU-hour cost</b> = capex × capital-recovery factor (WACC, life) ÷ used hours + grid power (W × PUE) × electricity price × 8,760 h ÷ used hours + annual opex ÷ used hours. Power is charged for every hour, used or not.</li>
            <li><b>Training run</b>: GPU-hours = FLOP ÷ (peak FLOP/s × MFU × 3,600); compute ≈ 6 × parameters × tokens. Excludes staff, experiments and failed runs.</li>
            <li><b>Inference</b>: tokens per second ≈ peak FLOP/s × serving utilisation ÷ (2 × active parameters) — a compute-bound estimate that ignores memory-bandwidth limits and prompt processing.</li>
            <li><b>Data-centre power</b>: MW = GPUs × W × PUE; TWh per year = MW × load × 8,760 h.</li>
          </ul>
          <p>Sourced defaults (H100 power and throughput, rental prices, training runs, IEA consumption) carry source chips; everything else is a labelled assumption. Formulas are in <a href={`${REPO}/blob/main/src/lib/calculators.ts`} target="_blank" rel="noopener noreferrer">calculators.ts</a> with tests.</p>

          <h3 id="value-flow">Where $1 of AI spend goes</h3>
          <p>
            One dollar is followed down the stack: an AI app keeps 1 − (share paid to model APIs); a lab keeps 1 − (share spent on compute, from Anthropic&apos;s reported revenue per
            compute dollar); a cloud keeps its margin (H100 market median price vs the GPU-hour calculator&apos;s cost); the operator&apos;s cost splits into hardware, energy and facilities
            (calculator defaults); hardware splits between the GPU vendor and other equipment; the vendor keeps its gross margin (NVIDIA, last four quarters of 10-Q/10-K filings) and pays
            memory, foundry and other suppliers. Sourced splits carry source chips; the app share, vendor share of capex and supplier split are assumptions. The flow conserves every cent
            (tested). It describes today&apos;s operating spend, not capex bought ahead of demand.
          </p>

          <h2>6. The anomaly gate</h2>
          <p>Before anything publishes, each new value is compared with the previous period in its series. The run opens a pull request for human review instead of publishing when:</p>
          <ul>
            {Object.entries(THRESHOLDS).filter(([k]) => k !== "spec").map(([kind, t]) => (
              <li key={kind}><b>{kind}</b> metrics move by more than {kind === "growth" ? `${t * 100} percentage points` : `±${t * 100}%`};</li>
            ))}
            <li>any already-published value for an earlier day or period is revised by more than {REVISION_THRESHOLD * 100}%. Today&apos;s value for a live market (prices, demand) is still forming, so a later run the same day may update it without review.</li>
          </ul>
          <p>Every run must also pass schema validation, the test suite and a full site build. If a feed fails, the others still publish and the failure shows on that feed&apos;s freshness badge.</p>

          <h2>7. Freshness</h2>
          <p>Each feed shows when it last succeeded. A feed is <b>stale</b> (amber) once its last success is older than twice its expected cadence plus six hours, and red when its latest run failed.</p>

          <h2>8. What the atlas does not claim</h2>
          <ul>
            <li>Router data (OpenRouter) is a sample of usage and list prices, not the whole market.</li>
            <li>Run-rate revenue is annualised and not the same as booked revenue.</li>
            <li>Private-company figures (valuations, revenue, compute spend) mostly come from press reports and carry lower confidence.</li>
            <li>Projections are reported as published by their authors; the atlas&apos;s own forecasts are not yet live.</li>
          </ul>

          <h2>9. Corrections</h2>
          <p>Every source chip has a <b>Report an issue</b> link that opens a pre-filled GitHub issue. Corrections are new observations with a source, never silent edits, and appear in the <Link href="/changelog">changelog</Link>.</p>

          <h2>10. Metric dictionary</h2>
        </div>
        <Reveal>
          <div className="card table-scroll" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Metric</th><th>Layer</th><th>Unit</th><th>Definition</th></tr></thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.name}</b><div className="small muted"><code>{m.id}</code>{m.dims.length ? ` · qualifiers: ${m.dims.join(", ")}` : ""}</div></td>
                    <td>{m.layer}</td>
                    <td>{m.monetary ? `currency ${m.unit}`.trim() : m.unit || "—"}</td>
                    <td>{m.definition}{m.caveats && <div className="small muted" style={{ marginTop: 4 }}>{m.caveats}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
