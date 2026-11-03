import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChangelogEntry, FeedStatus } from "../feeds/types";
import { DATA_DIR, loadCatalog, type Catalog } from "./catalog";
import { LAYERS } from "./ontology";
import { dimsKey, latest, periodEnd, resolve, type Fact } from "./resolver";
import type { Entity, Metric, Observation, Source } from "./schema";

// Build-time view models for the website. Everything here runs during `next build`
// (static export), so pages ship as plain HTML + JSON with no server or database.

/** A number as the site shows it: value plus everything needed to back it up. */
export interface Cited {
  id: string;
  value: number;
  low?: number;
  high?: number;
  currency?: string;
  unit: string;
  kind: Metric["kind"];
  period: string;
  status: Observation["status"];
  method: Observation["method"];
  confidence: number;
  note?: string;
  source: Pick<Source, "id" | "title" | "publisher" | "url" | "tier" | "kind" | "verified" | "automated"> & { published?: string };
}

export interface SiteData {
  catalog: Catalog;
  facts: Fact[];
  current: Map<string, Fact>;
  cite(o: Observation): Cited;
  metric(id: string): Metric;
  entity(id: string): Entity;
  obs(id: string): Cited;
}

let cached: Promise<SiteData> | undefined;

export function getSite(): Promise<SiteData> {
  cached ??= build();
  return cached;
}

async function build(): Promise<SiteData> {
  const { catalog, errors } = await loadCatalog();
  if (errors.length) throw new Error(`Catalog has ${errors.length} error(s); run npm run validate.\n${errors.join("\n")}`);
  const facts = resolve(catalog.observations, catalog.sources);
  const metrics = new Map(catalog.metrics.map((m) => [m.id, m]));
  const entities = new Map(catalog.entities.map((e) => [e.id, e]));
  const sources = new Map(catalog.sources.map((s) => [s.id, s]));
  const byId = new Map(catalog.observations.map((o) => [o.id, o]));

  const cite = (o: Observation): Cited => {
    const s = sources.get(o.source_id)!;
    const m = metrics.get(o.metric_id)!;
    return {
      id: o.id, value: o.value, low: o.low, high: o.high, currency: o.currency, unit: m.unit, kind: m.kind, period: o.period,
      status: o.status, method: o.method, confidence: o.confidence, note: o.note,
      source: { id: s.id, title: s.title, publisher: s.publisher, url: s.url, tier: s.tier, kind: s.kind, verified: s.verified, automated: s.automated, published: s.published },
    };
  };
  return {
    catalog, facts, current: latest(facts), cite,
    metric: (id) => metrics.get(id)!,
    entity: (id) => entities.get(id)!,
    obs: (id) => {
      const o = byId.get(id);
      if (!o) throw new Error(`Unknown observation ${id}`);
      return cite(o);
    },
  };
}

export interface LayerSummary {
  id: string;
  name: string;
  desc: string;
  entities: { id: string; name: string; segments: string[]; facts: number }[];
  observations: number;
}

export function layerSummaries(site: SiteData): LayerSummary[] {
  const { entities, observations } = site.catalog;
  const perEntity = new Map<string, number>();
  for (const o of observations) perEntity.set(o.entity_id, (perEntity.get(o.entity_id) ?? 0) + 1);
  // Capital cuts across layers: its members are whoever has capital-layer metrics.
  const capObs = observations.filter((o) => site.metric(o.metric_id).layer === "CAP");
  const capIds = new Set(capObs.map((o) => o.entity_id));
  return LAYERS.map((l) => {
    if (l.id === "CAP") {
      const members = entities.filter((e) => capIds.has(e.id));
      const n = (id: string) => capObs.filter((o) => o.entity_id === id).length;
      return { id: l.id, name: l.name, desc: l.desc, entities: members.map((e) => ({ id: e.id, name: e.name, segments: e.segments, facts: n(e.id) })), observations: capObs.length };
    }
    const members = entities.filter((e) => e.layers.includes(l.id));
    return {
      id: l.id, name: l.name, desc: l.desc,
      entities: members.map((e) => ({ id: e.id, name: e.name, segments: e.segments, facts: perEntity.get(e.id) ?? 0 })),
      observations: members.reduce((n, e) => n + (perEntity.get(e.id) ?? 0), 0),
    };
  });
}

export interface EntityView {
  entity: Entity;
  /** One block per series (metric × dims × currency), newest period first. */
  series: { key: string; metric: Metric; dims: Record<string, string>; points: { period: string; best: Cited; others: Cited[]; conflict: boolean }[] }[];
  links: { dir: "out" | "in"; kind: string; other: { id: string; name: string }; note?: string }[];
}

export function entityView(site: SiteData, id: string): EntityView {
  const entity = site.entity(id);
  const groups = new Map<string, Fact[]>();
  for (const f of site.facts.filter((f) => f.entity_id === id)) {
    const key = `${f.metric_id}|${f.currency ?? ""}|${Object.entries(f.dims).map(([k, v]) => `${k}=${v}`).join(",")}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const series = [...groups.entries()].map(([key, fs]) => ({
    key,
    metric: site.metric(fs[0]!.metric_id),
    dims: fs[0]!.dims,
    points: fs
      .sort((a, b) => periodEnd(b.period).localeCompare(periodEnd(a.period)))
      .map((f) => ({ period: f.period, best: site.cite(f.best), others: f.candidates.slice(1).map(site.cite), conflict: f.conflict })),
  }));
  const links = site.catalog.edges
    .filter((e) => e.from === id || e.to === id)
    .map((e) => {
      const otherId = e.from === id ? e.to : e.from;
      return { dir: (e.from === id ? "out" : "in") as "out" | "in", kind: e.kind, other: { id: otherId, name: site.entity(otherId).name }, note: e.note };
    });
  return { entity, series, links };
}

export function evidenceStats(site: SiteData) {
  const { observations, sources } = site.catalog;
  const src = new Map(sources.map((s) => [s.id, s]));
  const tiers = [1, 2, 3].map((t) => observations.filter((o) => src.get(o.source_id)?.tier === t).length);
  const verified = observations.filter((o) => src.get(o.source_id)?.verified).length;
  return { total: observations.length, tiers, verified, sources: sources.length, entities: site.catalog.entities.length, facts: site.facts.length, conflicts: site.facts.filter((f) => f.conflict).length };
}

/* ── Live feeds ────────────────────────────────────────────────────────────── */



export async function feedStatuses(): Promise<Record<string, FeedStatus>> {
  try { return JSON.parse(await readFile(path.join(DATA_DIR, "feeds", "status.json"), "utf8")); } catch { return {}; }
}

/** Release notes written by hand, merged with the ingest log. */
const RELEASES: ChangelogEntry[] = [
  { at: "2026-11-02T20:00:00.000Z", kind: "release", title: "Live data feeds, downloads and methodology", notes: [
    "Daily pipeline (GitHub Actions) pulls SEC EDGAR filings, OpenRouter list prices, EIA grid demand, Epoch AI's model compute data and Vast.ai GPU marketplace prices.",
    "Anomaly gate: unusual moves or revisions open a pull request for review instead of publishing.",
    "Freshness badges, open downloads (CSV/JSON), methodology page and this changelog.",
  ] },
  { at: "2026-11-02T19:20:00.000Z", kind: "release", title: "Website launched", notes: ["Animated site with a source chip on every number; 73 hand-curated observations from 30 sources."] },
  { at: "2026-11-02T17:30:00.000Z", kind: "release", title: "Phase 0: sourced fact base", notes: ["Ontology, metric dictionary, observation schema, resolver with conflict detection, 73 seed observations."] },
];

export async function changelog(): Promise<ChangelogEntry[]> {
  let log: ChangelogEntry[] = [];
  try { log = JSON.parse(await readFile(path.join(DATA_DIR, "changelog.json"), "utf8")); } catch {}
  return [...log, ...RELEASES].sort((a, b) => b.at.localeCompare(a.at));
}

/** All observations in one series, oldest first (best value per period). */
export function series(site: SiteData, entity: string, metric: string, dims: Record<string, string> = {}): Cited[] {
  const k = dimsKey(dims);
  return site.facts
    .filter((f) => f.entity_id === entity && f.metric_id === metric && dimsKey(f.dims) === k)
    .sort((a, b) => periodEnd(a.period).localeCompare(periodEnd(b.period)))
    .map((f) => site.cite(f.best));
}

export const latestOf = (site: SiteData, entity: string, metric: string, dims: Record<string, string> = {}): Cited | undefined =>
  series(site, entity, metric, dims).filter((c) => c.status === "actual").at(-1);

/** Dataset version for citations: build date + commit. */
export function datasetVersion(): { date: string; commit: string } {
  const date = new Date().toISOString().slice(0, 10);
  let commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  if (!commit) { try { commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {} }
  return { date, commit: commit.slice(0, 7) || "local" };
}
