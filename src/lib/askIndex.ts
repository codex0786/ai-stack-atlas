import type { AskDoc } from "./ask";
import { LAYERS } from "./ontology";
import { recommend } from "./recommend";
import { periodEnd, seriesKey, type Fact } from "./resolver";
import { modelCatalog, type SiteData } from "./site";
import { USE_CASES } from "./usecases";

// Builds the Ask index at build time: one document per series (its current value with full
// provenance), one per business problem (the dashboard's live pick), one per site page.

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
    const e = site.entity(f.entity_id), m = site.metric(f.metric_id);
    const dims = Object.values(f.dims).map((v) => v.replace(/_/g, " "));
    docs.push({
      id: `s:${key}`, kind: "series",
      title: `${e.name} — ${m.name}${dims.length ? ` (${dims.join(", ")})` : ""}`,
      text: [e.id.replace(/_/g, " "), e.kind, e.country ?? "", ...e.segments, ...e.layers.map((l) => layerName.get(l) ?? ""), m.id.replace(/_/g, " "), m.definition, ...Object.entries(f.dims).map(([k, v]) => `${k} ${v.replace(/_/g, " ")}`), e.note ?? ""].join(" "),
      href: `/entity/${e.id}`, cited: site.cite(f.best),
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
        text: `${uc.name} ${uc.problem} ${uc.example} which model should we use best llm recommend`,
        href: `/dashboard#${uc.id}`,
        summary: `For ${uc.name.toLowerCase()}, the dashboard recommends ${s.model.name} (${s.model.lab}) at about $${(s.costPerTask * 1000).toFixed(2)} per 1,000 tasks, quality ${Math.round(s.quality * 100)}/100${r.bestOpen && r.bestOpen.model.id !== s.model.id ? `; best open-weight option: ${r.bestOpen.model.name}` : ""} (list prices ${catalog.pricesAsOf}).`,
      });
    }
  }
  for (const p of PAGES) docs.push({ id: `p:${p.href}`, kind: "page", title: p.title, text: p.keywords, href: p.href, summary: p.summary });
  return docs;
}
