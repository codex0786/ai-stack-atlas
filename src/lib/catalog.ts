import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { Edge, Entity, Metric, Observation, Source } from "./schema";

// The catalog is the whole fact base as plain files (data/metrics.yaml + data/seed/*.json).
// Loading it parses every record and checks every cross-reference; nothing reaches the
// database unless this reports zero errors.

export interface Catalog {
  metrics: Metric[];
  sources: Source[];
  entities: Entity[];
  edges: Edge[];
  observations: Observation[];
}

export interface CatalogReport {
  catalog: Catalog;
  errors: string[];
  warnings: string[];
}

// Resolved from the project root (npm scripts, vitest and `next build` all run there);
// import.meta.dirname is not stable once Next bundles this module.
export const DATA_DIR = path.resolve(process.cwd(), "data");

async function readList<T>(file: string, schema: z.ZodType<T>, label: string, errors: string[]): Promise<T[]> {
  const text = await readFile(file, "utf8");
  const raw: unknown = file.endsWith(".yaml") ? parseYaml(text) : JSON.parse(text);
  if (!Array.isArray(raw)) {
    errors.push(`${label}: expected a list`);
    return [];
  }
  const out: T[] = [];
  raw.forEach((item, i) => {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
    else errors.push(`${label}[${i}] ${(item as { id?: string })?.id ?? ""}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
  });
  return out;
}

export async function loadCatalog(dir = DATA_DIR): Promise<CatalogReport> {
  const errors: string[] = [];
  const seed = (f: string) => path.join(dir, "seed", f);
  const catalog: Catalog = {
    metrics: await readList(path.join(dir, "metrics.yaml"), Metric, "metrics", errors),
    sources: await readList(seed("sources.json"), Source, "sources", errors),
    entities: await readList(seed("entities.json"), Entity, "entities", errors),
    edges: await readList(seed("edges.json"), Edge, "edges", errors),
    observations: await readList(seed("observations.json"), Observation, "observations", errors),
  };
  const { errors: refErrors, warnings } = checkReferences(catalog);
  return { catalog, errors: [...errors, ...refErrors], warnings };
}

export function checkReferences(c: Catalog): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const index = <T extends { id: string }>(list: T[], label: string) => {
    const m = new Map<string, T>();
    for (const x of list) {
      if (m.has(x.id)) errors.push(`${label}: duplicate id ${x.id}`);
      m.set(x.id, x);
    }
    return m;
  };
  const metrics = index(c.metrics, "metrics");
  const sources = index(c.sources, "sources");
  const entities = index(c.entities, "entities");
  const observations = index(c.observations, "observations");

  for (const m of c.metrics) {
    for (const ref of m.formula?.match(/[a-z][a-z0-9_]*/g) ?? []) {
      if (!metrics.has(ref)) errors.push(`metric ${m.id}: formula references unknown metric ${ref}`);
    }
  }

  for (const o of c.observations) {
    const where = `observation ${o.id}`;
    const metric = metrics.get(o.metric_id);
    if (!entities.has(o.entity_id)) errors.push(`${where}: unknown entity ${o.entity_id}`);
    if (!sources.has(o.source_id)) errors.push(`${where}: unknown source ${o.source_id}`);
    if (!metric) {
      errors.push(`${where}: unknown metric ${o.metric_id}`);
      continue;
    }
    if (metric.monetary && !o.currency) errors.push(`${where}: metric ${metric.id} is monetary, currency required`);
    if (!metric.monetary && o.currency) errors.push(`${where}: metric ${metric.id} is not monetary, remove currency`);
    for (const k of Object.keys(o.dims)) {
      if (!metric.dims.includes(k)) errors.push(`${where}: dim "${k}" not allowed for ${metric.id} (allowed: ${metric.dims.join(", ") || "none"})`);
    }
    if (o.supersedes) {
      const old = observations.get(o.supersedes);
      if (!old) errors.push(`${where}: supersedes unknown observation ${o.supersedes}`);
      else if (old.entity_id !== o.entity_id || old.metric_id !== o.metric_id || old.period !== o.period) {
        errors.push(`${where}: supersedes ${old.id}, which is a different fact`);
      }
    }
    if (metric.kind === "share" && (o.value < 0 || o.value > 1)) errors.push(`${where}: share must be between 0 and 1`);
  }

  for (const e of c.edges) {
    const where = `edge ${e.from} -${e.kind}-> ${e.to}`;
    if (!entities.has(e.from)) errors.push(`${where}: unknown entity ${e.from}`);
    if (!entities.has(e.to)) errors.push(`${where}: unknown entity ${e.to}`);
    if (e.source_id && !sources.has(e.source_id)) errors.push(`${where}: unknown source ${e.source_id}`);
    if (!e.source_id) warnings.push(`${where}: structural edge with no source`);
  }

  const used = new Set([...c.observations.map((o) => o.source_id), ...c.edges.flatMap((e) => (e.source_id ? [e.source_id] : []))]);
  for (const s of c.sources) if (!used.has(s.id)) warnings.push(`source ${s.id}: never cited`);

  return { errors, warnings };
}
