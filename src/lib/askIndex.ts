import { readFileSync } from "node:fs";
import path from "node:path";
import type { AskDoc } from "./ask";
import { DATA_DIR } from "./catalog";
import { flowDefaults } from "./flowDefaults";
import { fmt, fmtPeriod } from "./format";
import type { LoggedForecast } from "./ledger";
import { LAYERS } from "./ontology";
import { recommend } from "./recommend";
import { periodEnd, seriesKey, type Fact } from "./resolver";
import { modelCatalog, type SiteData } from "./site";
import { USE_CASE_WORDS, USE_CASES } from "./usecases";
import { captured, valueFlow } from "./valueflow";

// Builds the Ask index at build time: one document per series (current and previous value with
// full provenance), per business problem (the dashboard's pick), per logged forecast, per
// precomputed insight (most capable model, where $1 goes…) and per site page.

const PAGES: { href: string; title: string; summary: string; keywords: string }[] = [
  { href: "/dashboard", title: "Executive model dashboard", summary: "The executive dashboard compares every priced model on capability, cost and fit and recommends one per business problem.", keywords: "which model should we use compare models llm best cheapest recommendation enterprise" },
  { href: "/calculators", title: "Cost calculators", summary: "The calculators work out GPU-hour cost of ownership, training-run cost, inference cost per million tokens and data-centre power.", keywords: "calculator gpu hour tco training run cost inference cost per token energy per token power mw twh depreciation utilisation" },
  { href: "/value-flow", title: "Where $1 of AI spend goes", summary: "The value-flow page follows one dollar of AI spending down the stack to apps, labs, clouds, chips, data centres and energy.", keywords: "value capture margin who makes money sankey dollar flow profit nvidia margin" },
  { href: "/india", title: "India lens", summary: "The India lens covers IndiaAI compute prices in rupees, data-centre capacity and investment, and Indian IT services.", keywords: "india indiaai rupee inr data centre capacity mw infosys wipro it services subsidy" },
  { href: "/forecasts", title: "Forecasts", summary: "The forecasts page has trend forecasts with intervals and backtests, supply-constrained scenarios to 2030, and the scored forecast ledger.", keywords: "forecast prediction projection scenario 2030 future track record ledger backtest" },
  { href: "/methodology", title: "Methodology", summary: "The methodology explains source tiers, conflict resolution, live feeds, the anomaly gate and every model used on the site.", keywords: "method how source tier verified conflict anomaly feed" },
  { href: "/downloads", title: "Downloads", summary: "Every number is downloadable as CSV or JSON, with a citation and a weekly versioned release.", keywords: "download csv json data api cite citation license" },
];

export function buildAskIndex(site: SiteData): AskDoc[] {
  const docs: AskDoc[] = [];
  const layerName = new Map(LAYERS.map((l) => [l.id, l.name]));

  // Series: latest actual value (or latest of any status when no actual exists).
  const bySeries = new Map<string, Fact[]>();
  for (const f of site.facts) bySeries.set(seriesKey(f.best), [...(bySeries.get(seriesKey(f.best)) ?? []), f]);
  for (const [key, list] of bySeries) {
    const sorted = [...list].sort((a, b) => periodEnd(b.period).localeCompare(periodEnd(a.period)));
    const f = sorted.find((x) => x.best.status === "actual") ?? sorted[0]!;
    const prev = sorted.filter((x) => x.best.status === f.best.status && periodEnd(x.period) < periodEnd(f.period))[0];
    const e = site.entity(f.entity_id), m = site.metric(f.metric_id);
    const dims = Object.values(f.dims).map((v) => v.replace(/_/g, " "));
    docs.push({
      id: `s:${key}`, kind: "series",
      title: `${e.name} — ${m.name}${dims.length ? ` (${dims.join(", ")})` : ""}`,
      text: [e.id.replace(/_/g, " "), e.kind, e.country ?? "", ...e.segments, ...e.layers.map((l) => layerName.get(l) ?? ""), m.id.replace(/_/g, " "), m.definition, ...Object.entries(f.dims).map(([k, v]) => `${k} ${v.replace(/_/g, " ")}`), e.note ?? ""].join(" "),
      href: `/entity/${e.id}`, cited: site.cite(f.best), prev: prev && site.cite(prev.best), entity: e.id, metric: m.id,
    });
  }

  // Business problems: the dashboard's current recommendation.
  const catalog = modelCatalog();
  if (catalog) {
    for (const uc of USE_CASES) {
      const r = recommend(catalog.models, uc);
      const s = r.recommended;
      if (!s) continue;
      docs.push({
        id: `u:${uc.id}`, kind: "usecase", title: `Best model for ${uc.name.toLowerCase()}`,
        text: `${uc.name} ${uc.problem} ${uc.example} ${USE_CASE_WORDS[uc.id] ?? ""} which model should we use best llm recommend`,
        href: `/dashboard#${uc.id}`,
        summary: `For ${uc.name.toLowerCase()}, the dashboard recommends ${s.model.name} (${s.model.lab}) at about $${(s.costPerTask * 1000).toFixed(2)} per 1,000 tasks, quality ${Math.round(s.quality * 100)}/100${r.bestOpen && r.bestOpen.model.id !== s.model.id ? `; best open-weight option: ${r.bestOpen.model.name}` : ""} (list prices ${catalog.pricesAsOf}).`,
      });
    }
  }
  // Logged forecasts: frozen predictions and, once resolved, how they scored.
  let ledger: LoggedForecast[] = [];
  try { ledger = JSON.parse(readFileSync(path.join(DATA_DIR, "forecasts.json"), "utf8")); } catch {}
  for (const f of ledger) {
    const u = { value: f.mean, unit: f.unit, kind: f.kind, currency: f.target.currency };
    const status = f.status === "pending" ? `It resolves after ${fmtPeriod(f.target.period)}.` : `Outcome: ${fmt(u, f.actual!)} — ${f.status === "hit" ? "inside" : "outside"} the interval.`;
    docs.push({
      id: `f:${f.id}`, kind: "forecast", title: `Forecast: ${f.label}`,
      text: `forecast prediction projection outlook expect will next ${f.label} ${site.entity(f.target.entity_id).name} ${site.metric(f.target.metric_id).name} ${f.target.period}`,
      href: "/forecasts",
      summary: `The atlas forecasts ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)} at ${fmt(u)}, with a 90% interval of ${fmt(u, f.lo)}–${fmt(u, f.hi)} (${f.method.charAt(0).toLowerCase()}${f.method.slice(1)}; logged ${f.made}). ${status}`,
    });
  }

  // Precomputed insights.
  if (catalog?.models.length) {
    const ms = catalog.models;
    const blended = (m: (typeof ms)[number]) => (3 * m.price.input + m.price.output) / 4;
    const leader = ms[0]!;
    const near = ms.filter((m) => m.eci >= leader.eci - 2).sort((a, b) => blended(a) - blended(b))[0]!;
    const open = ms.find((m) => m.openWeights);
    const cheapest = [...ms].sort((a, b) => blended(a) - blended(b))[0]!;
    const $ = (x: number) => `$${x < 1 ? x.toFixed(2) : x.toFixed(x < 10 ? 2 : 0)}`;
    const ins = (id: string, title: string, text: string, summary: string) => docs.push({ id: `i:${id}`, kind: "insight", title, text, href: "/dashboard", summary });
    ins("most-capable", "Most capable AI model", "most capable best smartest strongest top leading frontier model llm highest capability",
      `The most capable model in the catalog is ${leader.name} (${leader.lab}), with an Epoch Capabilities Index of ${leader.eci.toFixed(1)}, at ${$(leader.price.input)} in / ${$(leader.price.output)} out per million tokens (list prices ${catalog.pricesAsOf}).`);
    ins("near-top-cheap", "Near-top capability for less", "best value cheap cheaper cheapest affordable frontier capability model value for money cost effective",
      `${near.name} (${near.lab}) is within 2 capability points of the leader at about ${Math.round(blended(leader) / blended(near))}× lower blended price — ${$(near.price.input)} in / ${$(near.price.output)} out per million tokens.`);
    if (open) ins("best-open", "Best open-weight model", "best open weight open source model llama deepseek qwen self host private",
      `The most capable open-weight model is ${open.name} (${open.lab}), capability ${open.eci.toFixed(1)} — ${(leader.eci - open.eci).toFixed(1)} points behind the leader — at ${$(open.price.input)} in / ${$(open.price.output)} out per million tokens on hosted APIs.`);
    ins("cheapest", "Cheapest AI model", "cheapest lowest price least expensive budget model llm",
      `The cheapest model in the catalog is ${cheapest.name} (${cheapest.lab}) at ${$(cheapest.price.input)} in / ${$(cheapest.price.output)} out per million tokens, with capability ${cheapest.eci.toFixed(1)} versus ${leader.eci.toFixed(1)} for the leader.`);
  }
  const flow = captured(valueFlow(flowDefaults(site).inputs, "app").nodes);
  docs.push({ id: "i:value-flow", kind: "insight", title: "Where $1 of AI spend goes", text: "where does dollar money go value capture who makes money margin profit split share of spend",
    href: "/value-flow", summary: `Of $1 spent on an AI app, ${flow.slice(0, 5).map((n) => `${n.label.replace(/ keep$/, "")} ${(n.value * 100).toFixed(n.value < 0.1 ? 1 : 0)}¢`).join(", ")} — the rest goes to memory, the foundry and other suppliers. Margins come from filings and market prices; some splits are labelled assumptions.` });
  const h100 = site.facts.filter((f) => f.entity_id === "h100" && f.metric_id === "gpu_rental_price" && f.best.status === "actual");
  if (h100.length) {
    const latest = new Map<string, Fact>();
    for (const f of h100) { const k = JSON.stringify(f.dims); if (!latest.has(k) || periodEnd(f.period) > periodEnd(latest.get(k)!.period)) latest.set(k, f); }
    const vals = [...latest.values()].map((f) => site.cite(f.best)).sort((a, b) => a.value - b.value);
    docs.push({ id: "i:h100-range", kind: "insight", title: "What an H100 GPU-hour costs", text: "h100 gpu hour cost price rent rental how much per hour cloud nvidia",
      href: "/entity/h100", summary: `Renting an NVIDIA H100 costs from ${fmt(vals[0]!)} to ${fmt(vals.at(-1)!)} across the ${vals.length} prices tracked — cheapest on open marketplaces, dearest on hyperscaler on-demand list prices.` });
  }

  for (const p of PAGES) docs.push({ id: `p:${p.href}`, kind: "page", title: p.title, text: p.keywords, href: p.href, summary: p.summary });
  return docs;
}
