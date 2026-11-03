import { SITE_URL } from "./constants";
import { datasetVersion, modelCatalog, type SiteData } from "./site";

// Open downloads, generated at build time from the same catalog the pages use.

export interface Download { file: string; type: string; title: string; description: string; rows: number; body: string }

function csv(rows: (string | number | boolean | undefined | null)[][]): string {
  const cell = (v: string | number | boolean | undefined | null) => {
    if (v === undefined || v === null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export const LICENSE = "CC BY 4.0";

export function citation(v = datasetVersion()): string {
  return `AI Stack Atlas (${v.date.slice(0, 4)}). AI Stack Atlas dataset, version ${v.date} (commit ${v.commit}). ${SITE_URL}. Licensed CC BY 4.0.`;
}

export function buildDownloads(site: SiteData): Download[] {
  const { catalog } = site;
  const entities = new Map(catalog.entities.map((e) => [e.id, e]));
  const metrics = new Map(catalog.metrics.map((m) => [m.id, m]));
  const sources = new Map(catalog.sources.map((s) => [s.id, s]));
  const dims = (d: Record<string, string>) => Object.entries(d).map(([k, v]) => `${k}=${v}`).join(";");

  const obsHeader = ["id", "entity_id", "entity_name", "metric_id", "metric_name", "unit", "currency", "dims", "period", "period_type", "value", "low", "high",
    "status", "method", "confidence", "published", "source_id", "source_publisher", "source_url", "source_tier", "source_verified", "source_automated", "note"];
  const obsRows = [...catalog.observations].sort((a, b) => a.id.localeCompare(b.id)).map((o) => {
    const s = sources.get(o.source_id)!;
    const m = metrics.get(o.metric_id)!;
    return [o.id, o.entity_id, entities.get(o.entity_id)?.name, o.metric_id, m.name, m.unit, o.currency, dims(o.dims), o.period, o.period_type, o.value, o.low, o.high,
      o.status, o.method, o.confidence, o.published, s.id, s.publisher, s.url, s.tier, s.verified, s.automated, o.note];
  });

  const current = [...site.current.values()].sort((a, b) => a.key.localeCompare(b.key)).map((f) => ({
    entity_id: f.entity_id, metric_id: f.metric_id, currency: f.currency ?? null, dims: f.dims, period: f.period, value: f.best.value,
    observation_id: f.best.id, source_id: f.best.source_id, conflict: f.conflict, alternatives: f.candidates.length - 1,
  }));

  const srcRows = [...catalog.sources].sort((a, b) => a.id.localeCompare(b.id)).map((s) => [s.id, s.title, s.publisher, s.url, s.tier, s.kind, s.published, s.accessed, s.verified, s.automated, s.note]);
  const version = datasetVersion();

  const files: Download[] = [];
  const add = (d: Download) => files.push(d);
  add({ file: "observations.csv", type: "text/csv; charset=utf-8", title: "All observations (CSV)", rows: obsRows.length,
    description: "Every number with its period, status, method, confidence and full source details. One row per observation, including rumours, projections and superseded values.",
    body: csv([obsHeader, ...obsRows]) });
  add({ file: "observations.json", type: "application/json", title: "All observations (JSON)", rows: catalog.observations.length,
    description: "The same observations in the atlas schema (see methodology).", body: JSON.stringify(catalog.observations) });
  add({ file: "current.json", type: "application/json", title: "Current values", rows: current.length,
    description: "The resolver's current value per series: latest actual period, best source, and whether sources conflict.", body: JSON.stringify(current) });
  add({ file: "sources.csv", type: "text/csv; charset=utf-8", title: "Sources (CSV)", rows: srcRows.length,
    description: "Every source with tier, kind, publication date, and whether it was verified by hand or pulled automatically.",
    body: csv([["id", "title", "publisher", "url", "tier", "kind", "published", "accessed", "verified", "automated", "note"], ...srcRows]) });
  add({ file: "entities.json", type: "application/json", title: "Entities", rows: catalog.entities.length, description: "Companies, chips, segments and grid regions with their layers and segments.", body: JSON.stringify(catalog.entities) });
  add({ file: "metrics.json", type: "application/json", title: "Metric dictionary", rows: catalog.metrics.length, description: "Definitions, units, allowed qualifiers and caveats for every metric.", body: JSON.stringify(catalog.metrics) });
  add({ file: "edges.json", type: "application/json", title: "Relationships", rows: catalog.edges.length, description: "Supply, investment, compute-rental and hosting links between entities.", body: JSON.stringify(catalog.edges) });

  const models = modelCatalog();
  if (models) {
    const rows = models.models.map((m) => [m.id, m.name, m.lab, m.openWeights, m.released, m.eci, m.eciLow, m.eciHigh, m.price.input, m.price.output, m.price.cachedInput,
      m.batchPrice?.input, m.batchPrice?.output, m.context, m.maxOutput, m.inputs.join(";"), m.tools, m.structured, m.reasoning,
      Object.entries(m.bench).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(";")]);
    add({ file: "models.csv", type: "text/csv; charset=utf-8", title: "Model catalog (CSV)", rows: rows.length,
      description: `Every priced model Epoch AI has benchmarked: list prices (USD per million tokens, OpenRouter, ${models.pricesAsOf}), capability index with 90% interval, context, capabilities and benchmark scores.`,
      body: csv([["openrouter_id", "name", "lab", "open_weights", "released", "eci", "eci_low", "eci_high", "price_input", "price_output", "price_cached_input",
        "batch_input", "batch_output", "context_tokens", "max_output_tokens", "inputs", "tools", "structured_outputs", "reasoning", "benchmarks"], ...rows]) });
  }

  const manifest = {
    name: "AI Stack Atlas", version: version.date, commit: version.commit, generated: new Date().toISOString(), license: LICENSE, citation: citation(version), homepage: SITE_URL,
    files: files.map((f) => ({ file: f.file, url: `${SITE_URL}/data/${f.file}`, rows: f.rows, description: f.description })),
  };
  add({ file: "manifest.json", type: "application/json", title: "Manifest", rows: files.length, description: "Version, commit, license, citation and the list of files.", body: JSON.stringify(manifest, null, 1) });
  return files;
}
