# AI Stack Atlas — Build Plan (working name)

> An economic intelligence system that maps the whole AI stack — from power plants to applications — shows who contributes and who captures value at each layer, models the unit costs that connect them, and forecasts how it all evolves.

Date: 2026-11-02 · Status: plan, nothing built yet · Home: `~/economet/ai-stack-atlas`

---

## 1. The questions this system must answer

Everything in the build should serve one of these. If a feature doesn't, cut it.

1. **Where does the money go?** Of every $1 an end user spends on AI, how much reaches the app, the model lab, the cloud, the chip designer, the foundry, the memory maker, the utility?
2. **What does a unit of AI really cost?** Cost per GPU-hour, per training run, per million tokens, per kWh — and how far is the market price from that cost (who has margin, who is subsidising)?
3. **Frontier vs neolabs vs open-weight:** who leads on capability, usage, revenue, and cost efficiency, and how fast is the gap closing?
4. **Is the build-out paying for itself?** Capex vs revenue coverage, neocloud leverage, depreciation risk.
5. **What breaks first?** Which physical constraint (CoWoS packaging, HBM, power, grid interconnection, capital) binds the next 1–5 years?
6. **What happens next?** Scenario forecasts for compute, cost per token, energy demand, capex, and lab revenue — with stated confidence and a track record.

---

## 2. What the research shows (context the design must handle)

Snapshot from a first research pass. These numbers are the kind of facts the system will store — and they show why it needs a source-and-confidence model, because sources disagree.

| Area | Current signal (2026) | Why it matters for the design |
|---|---|---|
| Hyperscaler capex | ~$600–725B for 2026 across MSFT/GOOGL/AMZN/META/ORCL; Alphabet guided $190B, Amazon $200B | Top-of-funnel money; needs quarterly ingestion from 10-Q/10-K |
| Neoclouds | CoreWeave ~$104B backlog vs ~$35B debt; Nebius capex up ~670% YoY; Meta commitments of $35B (CoreWeave) and up to $27B (Nebius) | A leverage/fragility layer; needs a **contracts & debt** model, not just capex |
| Frontier lab revenue | Anthropic run-rate reported $30B (Apr) → ~$65B (Jul); OpenAI ~$40B (Aug), with ~$14B projected 2026 loss | "Run-rate" ≠ revenue — store the metric definition with each number |
| Revenue per compute $ | Anthropic reportedly ~$1.80 revenue per compute dollar in H1 | A key efficiency ratio to compute for every lab |
| Neolabs | Thinking Machines valuation reported anywhere from $12B to $50B; SSI ~$32B with no product; Reflection $1.5B–$4.6B raised | Highly conflicting data → confidence scores and source ranking are mandatory |
| Training cost | Epoch: frontier run cost growing ~2.4×/yr; training compute ~5×/yr | Core trend lines for the forecast engine |
| Token prices | Decline estimates range from ~10×/yr (a16z) to 50–200×/yr (Epoch, benchmark-dependent); BenchLM median ~$1 in / $4 out per M tokens | Price must be measured **at constant capability**, not raw |
| GPU rental | H100 1-yr contracts rose ~$1.70 → $2.35/hr (Oct 25 → Mar 26, SemiAnalysis); on-demand median ~$3–4.20; Nebius raised to $4.50 | Prices went *up* in 2026 — a forecast that assumes monotonic decline is wrong |
| Open vs closed | Open-weight (mostly Chinese: DeepSeek, Qwen, Kimi, MiniMax) ≈ 30–69% of tokens on routers but **<4% of spend** | Must track volume and value separately |
| Supply chain | SK Hynix sold out 2026 HBM; CoWoS is the binding constraint; bulk CoWoS expansion lands 2027 | Forecasts must be **supply-constrained**, not just demand curves |
| Energy | IEA: data centres ~945 TWh by 2030 (range 700–1,700 TWh by 2035); DC demand +17% in 2025 vs +3% total; EIA: US load +1.9% (2026), +2.5% (2027), ERCOT and PJM fastest | Energy layer needs regional granularity (grid regions), not just global totals |
| India | IndiaAI portal ~38k GPUs, ~₹65–92/GPU-hr subsidised vs ₹217–362 commercial H100 | A natural differentiator, and it fits your existing India work |

Note on "neolans": I've read this as **neolabs** (new well-funded labs like Thinking Machines, SSI, Reflection) and also covered **neoclouds** (CoreWeave, Nebius, Lambda, IREN), since both are distinct layers. Say if you meant something else.

---

## 3. The layer model (the backbone of the knowledge system)

Seven horizontal layers plus one vertical (capital). Every entity, metric and dollar flow is tagged to a layer.

```
L7  Demand & macro        enterprise adoption, consumer usage, productivity, labour, sector impact
L6  Applications/agents   Cursor, Perplexity, Harvey, copilots, vertical SaaS
L5  Distribution          first-party APIs, Bedrock/Vertex/Azure AI, OpenRouter, Together, Fireworks, Groq
L4  Models                Frontier closed (OpenAI, Anthropic, Google, xAI) · Neolabs (TML, SSI, Reflection…)
                          · Open-weight (Meta, DeepSeek, Qwen, Mistral, Kimi, MiniMax)
L3  Compute operators     Hyperscalers · Neoclouds · Sovereign/national (IndiaAI) · ex-crypto miners
L2  Data-centre physical  facilities, MW, cooling, land, construction, PUE, water
L1  Semiconductors        Nvidia/AMD/custom ASICs (TPU, Trainium, MTIA) · TSMC wafers + CoWoS · HBM (SK Hynix,
                          Samsung, Micron) · ASML · networking (Broadcom, Arista, optics)
L0  Energy                generation mix, gas turbines, nuclear/SMR PPAs, grid interconnection queues, power prices
──────────────────────────────────────────────────────────────────────────────────────────────
 ║  Capital (vertical)    VC rounds, debt/ABS/GPU-backed loans, circular deals (vendor financing),
                          public-market valuations, credit spreads
```

**Adjacent/associated sectors** sit off the stack as "spillover nodes": power utilities, gas, nuclear, copper and transmission equipment, construction/REITs, cooling (Vertiv), and downstream: IT services (very relevant to India — TCS, Infosys), BPO, legal, education.

---

## 4. Knowledge system design

### 4.1 Entities (nodes)
`Company` · `Model` · `Chip/SKU` · `Facility` (data centre) · `GridRegion` · `PowerAsset` · `Deal` (compute contract, investment, PPA, offtake) · `Benchmark` · `Country` · `Sector`

### 4.2 Relationships (edges)
`supplies` (TSMC→Nvidia) · `rents_compute_from` (OpenAI→CoreWeave) · `invests_in` · `trains_on` (Model→Chip/Facility) · `hosts` (Provider→Model) · `powered_by` (Facility→GridRegion/PowerAsset) · `competes_with` · `derived_from` (fine-tunes, distillation)

### 4.3 Facts — the most important design decision
Every number is an **observation**, never a bare value:

```ts
Observation {
  entity_id, metric_id,          // "anthropic", "revenue_run_rate"
  value, unit, currency, as_of,  // 65e9, "USD/yr", "2026-07"
  period_type,                   // run_rate | quarterly | annual | point | guidance
  source_id, source_tier,        // tier 1 = filing/company; 2 = major press; 3 = analyst/blog
  method,                        // reported | derived | estimated | modelled
  confidence (0–1), notes,
  supersedes?                    // for revisions
}
```

A **resolver** picks the "current best value" per entity × metric (highest tier, most recent, highest confidence) while keeping every conflicting observation visible. The Thinking Machines valuation spread ($12B vs $50B) is exactly the case it is built for.

### 4.4 Metric dictionary
A single `metrics.yaml` defines each metric once: name, unit, layer, definition, formula (if derived), and caveats ("run-rate = latest month × 12"). Derived metrics (revenue per compute $, capex coverage, $/M tokens at fixed capability) are computed from it, never hand-entered.

---

## 5. Economics engine — the unit-cost models

Each model is a pure function with explicit, editable assumptions and is exposed in the UI as a calculator. Defaults are sourced observations; users can override.

| # | Model | Core formula | Key inputs | Output |
|---|---|---|---|---|
| E1 | **GPU-hour TCO** | (capex·CRF(life, WACC) + opex + power·PUE·$/kWh) ÷ (8760·utilisation) | GPU+server+network capex, depreciation life (4 vs 6 yrs is the big debate), WACC, kW/GPU, PUE, power price, utilisation | Cost floor $/GPU-hr vs market rental → **operator margin** |
| E2 | **Training run cost** | FLOPs ≈ 6·N·D → GPU-hrs = FLOPs ÷ (peak·MFU·3600) → × $/GPU-hr × R&D multiplier | params, tokens, chip, MFU, price, experiment overhead | $ per run, MWh per run, time-to-train |
| E3 | **Inference cost per M tokens** | $/GPU-hr ÷ (tokens/s/GPU · 3600) × 1e6 | model size/active params (MoE), precision, batch, context length, chip | Cost vs list price → **gross margin by model/provider**; open vs closed comparison |
| E4 | **Energy per token & per facility** | Wh/token = (GPU W·PUE) ÷ tokens/s ÷ 3600 | same as E3 + PUE | Wh/token, MW per facility, TWh aggregate |
| E5 | **Lab P&L** | revenue − (training + inference compute + staff + other) | revenue, compute contracts, headcount | burn, revenue per compute $, runway |
| E6 | **Capex coverage** ("$600B question") | required AI revenue = capex × (1/life + target return) | hyperscaler + neocloud capex, depreciation | revenue gap the industry must close |
| E7 | **Value-capture waterfall** | split $1 of end-user spend across layers using gross margins at each hop | app margin, API margin, cloud margin, Nvidia GM (~70%+), TSMC GM, power share | **The signature Sankey** |
| E8 | **Price at constant capability** | cheapest $/M tokens to reach benchmark score ≥ X over time | prices + benchmark scores | true deflation rate per capability tier |

Unit tests (vitest) pin each model to known reference cases (e.g. Epoch's published training-cost estimates, public H100 throughput benchmarks).

---

## 6. Prediction layer

Three complementary methods, combined into scenarios. The goal is forecasts with **stated uncertainty and a public track record**, not single numbers.

### 6.1 Structural, supply-constrained model (the core)
A chain where each step has a capacity ceiling:

```
CoWoS wafers/qtr → accelerators shipped → installed GPUs (with retirement curve)
   → MW of IT load → TWh (× utilisation × PUE) → by grid region
HBM bits ─┘                        ↑
Capex guidance ($) ÷ $/GPU installed ┘    deployed = min(demand-implied, supply-constrained)
```
This answers "what breaks first" directly: whichever ceiling binds in each quarter is the bottleneck.

### 6.2 Trend / experience-curve models
- Training compute (~5×/yr), frontier run cost (~2.4×/yr), $/token at constant capability, $/GPU-hr per chip generation (a chip-vintage decay curve — older chips' rental prices fall as new ones ship)
- Fit with log-linear regression + breakpoints; report doubling times with confidence intervals

### 6.3 Time-series nowcasts
- GPU rental index, token price index, OpenRouter token volume, open-weight share
- ETS / ARIMA / Bayesian structural time series (Python `statsmodels`), refit weekly

### 6.4 Scenarios
Three named scenarios with explicit drivers, applied across all models:
- **Acceleration** — revenue keeps compounding, capex rises, power is the bottleneck
- **Base** — capex growth slows from 2027, CoWoS loosens, token prices keep falling ~10×/yr
- **Digestion/bust** — enterprise pullback (cf. the UBS survey of firms cutting AI spend), depreciation write-downs, neocloud credit stress, GPU rental price slump

### 6.5 Leading-indicator dashboard
Hyperscaler capex guidance · TSMC monthly revenue · SK Hynix/Micron HBM commentary · GPU rental spreads (contract vs spot) · OpenRouter token volumes · neocloud bond/loan spreads · interconnection queue additions · PPA announcements · lab ARR announcements.

### 6.6 Calibration
- Log every forecast with a date; score against outcomes (Brier/CRPS)
- Benchmark against Metaculus/Manifold/Polymarket where questions overlap
- Backtest trend models on Epoch's historical data before trusting them

---

## 7. Data sources

| Layer | Source | Access | Cadence | Notes |
|---|---|---|---|---|
| L4 models, compute, cost | **Epoch AI data hub** (notable models, large-scale models, ML hardware, AI companies) | CSV downloads | weekly | CC-BY; the single most valuable source |
| L4/L5 prices & quality | Artificial Analysis | API (check terms) | daily | Prices, throughput, benchmark indices |
| L5 usage | OpenRouter | public models API + rankings pages | daily | Token volume by model; biased sample — label it |
| L4 open-weight | Hugging Face Hub API | API | daily | downloads, likes, derivatives (fine-tune graph) |
| L3/L1 financials | SEC EDGAR XBRL (companyfacts) | free API | quarterly | Capex, revenue, PP&E, depreciation for MSFT, GOOGL, AMZN, META, ORCL, NVDA, CRWV, NBIS, AMD, AVGO |
| L1 foundry/memory | TSMC monthly revenue, SK Hynix/Samsung/Micron filings | scrape/manual | monthly | |
| L3 GPU prices | provider pricing pages (Lambda, Runpod, Nebius, CoreWeave, AWS/Azure/GCP), plus public indices | scraper | daily | Build your own index: on-demand vs reserved, by SKU |
| L0 energy (US) | EIA Open Data API (STEO, AEO, 930 hourly grid) | free API | monthly/hourly | Regional load (ERCOT, PJM) |
| L0 energy (global) | Ember API, IEA (report tables) | API / manual | monthly/annual | |
| L0 grid | LBNL interconnection queue data, ISO queues | CSV | annual/quarterly | |
| L2 facilities | public announcements, company filings | manual + LLM extraction | event-driven | Facility table: owner, MW, location, status |
| Capital | press releases, Crunchbase-style data (manual), EDGAR 8-Ks | manual + LLM extraction | event-driven | Deals table |
| India | IndiaAI portal, MeitY releases, CEA power data | manual/scrape | monthly | GPU count, ₹/hr, DC MW pipeline |
| Forecast benchmarks | Metaculus, Manifold, Polymarket APIs | API | daily | Calibration targets |

**News-to-fact pipeline:** for event-driven layers (deals, facilities, valuations), use Claude to extract structured observations from articles into a **review queue** — nothing enters the fact base without a source URL and a human approve click.

---

## 8. Architecture

Reuse what already works in FrontierIQ (`~/economet/iip-platform`) so you're not rebuilding plumbing.

```
ingest/ (TypeScript, tsx)     models/ (Python)             app/ (Next.js 16)
 ├─ sources/*.ts  ──► raw/    ├─ forecasts/*.py            ├─ /stack      (layer map + Sankey)
 ├─ normalise (zod)           ├─ scenarios.py              ├─ /layer/[id]
 └─ resolver                  └─ writes forecasts.json     ├─ /entity/[id]
        │                              │                   ├─ /calculators (E1–E8)
        ▼                              ▼                   ├─ /open-vs-closed
     libSQL / SQLite  ◄────────────────┘                   ├─ /energy
     (observations, entities, edges, deals, forecasts)     ├─ /forecasts
                                                           ├─ /india
                                                           └─ /ask   (Q&A with citations)
```

- **Stack:** Next.js 16 + React 19, `@libsql/client`, zod, Recharts (+ d3-sankey for flows, a force graph for the knowledge graph), vitest — same as FrontierIQ
- **Python** only for forecasting (statsmodels, scipy); it reads SQLite and writes forecast tables, so the web app stays TS-only
- **Deploy:** static export to Vercel like FrontierIQ for v1; move to Turso + server routes only if you need live ingestion
- **Ask page:** Claude API over the fact base (retrieve observations → answer with cited sources); refuses to state numbers that aren't in the store

---

## 9. Product surfaces

1. **Stack Map** — the home page: the seven layers as a vertical diagram, each showing market size, growth, concentration (HHI), and margin; a Sankey of the $1 value-capture waterfall
2. **Layer pages** — leaders, market share, unit economics, key constraints, related forecasts
3. **Entity pages** — every company/model/chip/facility with its observations, conflicting sources, and graph neighbours ("who does CoreWeave depend on, and who depends on it?")
4. **Calculators** — E1–E8 with sliders and sourced defaults; shareable URLs
5. **Frontier vs Neolabs vs Open-weight** — capability frontier over time, price at constant capability, token share vs spend share, revenue per compute $
6. **Energy** — TWh and GW by region, Wh/token trend, power mix, interconnection queue, AI share of load growth
7. **Forecast Lab** — scenario switcher, fan charts, bottleneck timeline, forecast track record
8. **India Lens** — IndiaAI compute vs global prices, DC capacity pipeline, sovereign models (Sarvam etc.), IT-services exposure
9. **Ask** — natural-language questions with cited answers

---

## 10. Phased roadmap

| Phase | Duration | Deliverable | Done when |
|---|---|---|---|
| **0. Foundation** | Week 1 | Layer ontology, `metrics.yaml`, DB schema (entities, edges, observations, sources, deals), resolver, seed ~150 hand-entered observations from §2 | Schema tests pass; resolver picks correct values on conflicting seed data |
| **1. Core data** | Weeks 2–3 | Ingesters: Epoch, EDGAR capex/revenue, OpenRouter, Hugging Face, EIA, GPU price scraper | `npm run data:ingest` refreshes everything; validation report shows no schema errors |
| **2. Unit economics** | Weeks 4–5 | E1–E6 as tested pure functions + calculator UI | Each model reproduces a published reference case within ±15% |
| **3. Knowledge graph + value flow** | Weeks 6–7 | Entity pages, graph view, deals table, E7 Sankey, E8 constant-capability price index | Stack Map page is complete and every number links to its source |
| **4. Forecasting** | Weeks 8–10 | Supply-constrained chain, trend fits, nowcasts, 3 scenarios, forecast log | Backtest on 2020–2024 data; forecasts carry CIs; track record page live |
| **5. India lens + Ask + polish** | Weeks 11–12 | India page, LLM Q&A with citations, news-to-fact review queue, deploy | Public deploy; Ask answers 20 test questions with correct citations |

A useful v1 for showing people is the end of Phase 3 (~7 weeks): a sourced map of the stack with working calculators. Forecasting is the hardest part and should not block that.

---

## 11. Risks and how to handle them

| Risk | Mitigation |
|---|---|
| Private-company data is thin and contradictory (neolabs, OpenAI, Anthropic) | Observation model with tiers and confidence; show ranges, not points |
| "Run-rate", "ARR", "bookings", "backlog" get mixed up | Metric dictionary enforces definitions; period_type on every observation |
| Assumptions dominate outputs (GPU depreciation life, utilisation, MFU) | Every calculator shows a sensitivity tornado; defaults cite sources |
| Router data (OpenRouter) is a biased sample of real usage | Label as sample; triangulate with spend data (Ramp-style indices, lab revenue) |
| Licensing/terms of scraped sources | Check terms per source before ingesting (Artificial Analysis especially); prefer CC-BY/public data |
| Scope creep — "everything about AI" | The six questions in §1 are the scope filter |
| Forecasts look authoritative but are weak | Publish track record and calibration; show scenario ranges |

---

## 12. Decisions needed from you

1. **Audience:** personal research tool, portfolio/LinkedIn showcase, or a product for investors/policy people? This changes how much goes into polish vs depth.
2. **Geography:** global with an India lens (recommended), or India-first?
3. **Repo:** new standalone project (recommended), or a module inside FrontierIQ?
4. **Paid data:** stay on free/public sources for v1 (recommended), or budget for something like SemiAnalysis or Artificial Analysis API access?
5. **"neolans":** confirm whether you meant neolabs, neoclouds, or both.

---

## Sources (first research pass)
- Capex & neoclouds: [heygotrade](https://www.heygotrade.com/en/news/ai-capex-500-billion-michael-burry-semiconductor-short/), [IEEE ComSoc](https://techblog.comsoc.org/2025/12/22/hyperscaler-capex-600-bn-in-2026-a-36-increase-over-2025/), [American Century](https://www.americancentury.com/insights/hyperscaler-ai-capex-spending-cycle/), [Capital & Compute](https://capitalandcompute.net/blog/ai-data-center-stocks/), [Nasdaq](https://www.nasdaq.com/articles/neocloud-boom-comparing-nebius-coreweave-iren)
- Training cost & compute: [Epoch – Finances of AI](https://epoch.ai/topics/finances), [Epoch – training costs](https://epoch.ai/publications/how-much-does-it-cost-to-train-frontier-ai-models), [Epoch data hub](https://epoch.ai/blog/announcing-epoch-ai-data-hub)
- Energy: [IEA Energy and AI](https://www.iea.org/reports/energy-and-ai/executive-summary), [EIA Today in Energy](https://www.eia.gov/todayinenergy/detail.php?id=67344), [Power Engineering](https://www.power-eng.com/business/policy-and-regulation/eias-2026-outlook-projects-massive-capacity-buildout-as-data-centers-reshape-electricity-demand/)
- Token prices: [a16z LLMflation](https://www.a16z.com/llmflation-llm-inference-cost), [The Price of Progress (arXiv)](https://arxiv.org/html/2511.23455v1), [BenchLM](https://www.benchlm.ai/stats/llm-pricing)
- GPU prices: [IntuitionLabs](https://intuitionlabs.ai/articles/h100-rental-prices-cloud-comparison), [Uvik GPU index](https://uvik.net/blog/gpu-price-index/), [tech-insider](https://tech-insider.org/what-renting-an-nvidia-h100-costs-per-hour-in-2026-and-when-renting-beats-buying/)
- Neolabs: [FutureSearch](https://futuresearch.ai/neolab-challengers-forecast/), [presenc.ai tracker](https://presenc.ai/research/frontier-lab-tracker-thinking-machines-ssi-xai-2026), [implicator](https://www.implicator.ai/mira-muratis-thinking-machines-seeks-50-billion-it-has-one-api/)
- Lab revenue: [Analytics India Mag](https://analyticsindiamag.com/ai-news/anthropic-hits-30-bn-revenue-run-rate-overtakes-openai), [Sovereign Magazine](https://sovereignmagazine.com/article/anthropic-65-billion-run-rate-ai-bubble-case), [FourWeekMBA](https://fourweekmba.com/ai-anthropic-took-in-about-1-80-per-compute-dollar-in-h1/)
- Open vs closed: [OpenRouter – token state of play](https://openrouter.ai/data/newsletter/the-token-state-of-play), [tech-insider](https://tech-insider.org/open-source-ai-usage-revenue-gap-2026/), [trendingtopics](https://www.trendingtopics.eu/open-weight-models-from-china-are-capturing-a-growing-share-of-ai-usage/)
- Supply chain: [Silicon Analysts – CoWoS](https://siliconanalysts.com/market-data/cowos-capacity), [KGI TSMC note](https://www.kgi.com.hk/en/-/media/files/kgishk/research-reports/tw-reports/tsmc_2330-tt_09032026e.pdf), [Fusion Worldwide](https://info.fusionww.com/blog/inside-the-ai-bottleneck-cowos-hbm-and-2-3nm-capacity-constraints-through-2027)
- India: [Outlook Business](https://www.outlookbusiness.com/start-up/ai-computing-in-india-costs-less-than-half-of-global-market-rate-says-vaishnaw), [Business Standard](https://business-standard.com/technology/artificial-intelligence/india-ai-compute-race-subsidised-gpu-capability-gap-126062900734_1.html), [Communications Today](https://communicationstoday.co.in/indiaai-mission-faces-gap-between-capacity-and-deployed-gpus)

Many 2026 figures above come from secondary sources and were not checked against primary filings. Phase 0 re-verifies every seed number before it goes into the database.
