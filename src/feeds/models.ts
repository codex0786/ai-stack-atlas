import type { CatalogModel, ModelCatalog } from "../lib/models";
import { parseCsv } from "./csv";
import { fetchJson } from "./http";
import { LAB_ORGS } from "./epoch";
import { LABS } from "./openrouter";
import type { Feed, FeedOutput } from "./types";
import { readZip } from "./zip";

// Model catalog for the executive dashboard: OpenRouter list prices and capabilities joined
// to Epoch AI's Capabilities Index (ECI) and per-benchmark scores. Writes data/models.json.

export const BENCH_ZIP = "https://epoch.ai/data/benchmark_data.zip";
const SINCE = "2025-01-01";

export interface OrFullModel {
  id: string;
  name: string;
  created?: number;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string; input_cache_read?: string };
  top_provider?: { max_completion_tokens?: number | null };
  supported_parameters?: string[];
}

/** Lowercase alphanumerics, minus dates, "(preview)", "(hosted …)", "beta", "-it". */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(preview|beta|instruct-?\d*|it)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const perM = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6 * 1e4) / 1e4 : undefined;
};

/** Pick the best OpenRouter listing for an ECI model name (base listing, not :batch/:free). */
export function matchListing(names: string[], index: Map<string, OrFullModel>): OrFullModel | undefined {
  for (const n of names) {
    const hit = index.get(normName(n));
    if (hit) return hit;
  }
  return undefined;
}

export function buildCatalog(orModels: OrFullModel[], eciRows: Record<string, string>[], benchRows: Record<string, string>[], now: string): ModelCatalog {
  const base = orModels.filter((m) => !m.id.includes(":"));
  const variants = new Map(orModels.filter((m) => m.id.endsWith(":batch")).map((m) => [m.id.replace(/:batch$/, ""), m]));
  const index = new Map<string, OrFullModel>();
  for (const m of base) {
    for (const key of [normName(m.name.split(":").slice(1).join(":") || m.name), normName(m.id.split("/")[1] ?? m.id)]) {
      if (key && !index.has(key)) index.set(key, m);
    }
  }

  const bench = new Map<string, Record<string, number>>();
  for (const r of benchRows) {
    const v = Number(r.performance);
    if (!r.Model || !r.benchmark || !Number.isFinite(v)) continue;
    const b = bench.get(r.Model) ?? {};
    b[r.benchmark] = Math.max(b[r.benchmark] ?? -Infinity, v);
    bench.set(r.Model, b);
  }

  const labOf = (orgs: string) => Object.entries(LAB_ORGS).find(([, names]) => orgs.split(",").some((o) => names.includes(o.trim())))?.[0];
  const models: CatalogModel[] = [];
  const seen = new Set<string>();
  for (const r of eciRows) {
    if ((r.date ?? "") < SINCE) continue;
    const listing = matchListing([r.Model ?? "", r["Display name"] ?? ""], index);
    const price = { input: perM(listing?.pricing?.prompt), output: perM(listing?.pricing?.completion) };
    if (!listing || price.input === undefined || price.output === undefined || seen.has(listing.id)) continue;
    seen.add(listing.id);
    const batch = variants.get(listing.id);
    const params = new Set(listing.supported_parameters ?? []);
    const prefix = listing.id.split("/")[0]!;
    models.push({
      id: listing.id,
      name: r["Display name"] || r.Model!,
      lab: r.Organization || prefix,
      labEntity: labOf(r.Organization ?? "") ?? LABS[prefix],
      openWeights: (r["Accessibility group"] ?? "").startsWith("Open"),
      released: r.date!,
      eci: Number(r.eci), eciLow: Number(r.eci_ci_low), eciHigh: Number(r.eci_ci_high),
      price: { input: price.input, output: price.output, cachedInput: perM(listing.pricing?.input_cache_read) },
      batchPrice: batch && perM(batch.pricing?.prompt) !== undefined && perM(batch.pricing?.completion) !== undefined
        ? { input: perM(batch.pricing?.prompt)!, output: perM(batch.pricing?.completion)! } : undefined,
      context: listing.context_length ?? 0,
      maxOutput: listing.top_provider?.max_completion_tokens ?? undefined,
      inputs: listing.architecture?.input_modalities ?? ["text"],
      tools: params.has("tools"),
      structured: params.has("structured_outputs") || params.has("response_format"),
      reasoning: params.has("reasoning"),
      bench: bench.get(r.Model!) ?? {},
    });
  }
  models.sort((a, b) => b.eci - a.eci);
  const today = now.slice(0, 10);
  return {
    generated: now, pricesAsOf: today,
    benchmarksAsOf: eciRows.map((r) => r.date ?? "").sort().at(-1) ?? today,
    sources: { pricing: "https://openrouter.ai/api/v1/models", capabilities: "https://openrouter.ai/models", benchmarks: "https://epoch.ai/benchmarks" },
    models,
  };
}

export const modelsFeed: Feed = {
  id: "models",
  name: "Model catalog (prices × benchmarks)",
  cadenceHours: 24,
  mode: "replace",
  homepage: "https://epoch.ai/benchmarks",
  async run({ today }): Promise<FeedOutput> {
    const or = await fetchJson<{ data: OrFullModel[] }>("https://openrouter.ai/api/v1/models");
    const res = await fetch(BENCH_ZIP, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from Epoch benchmark data`);
    const files = readZip(Buffer.from(await res.arrayBuffer()), (n) => /eci_scores\.csv$|processed_data_for_eci\.csv$/.test(n));
    const get = (re: RegExp) => [...files.entries()].find(([n]) => re.test(n))?.[1]?.toString("utf8");
    const eci = get(/eci_scores\.csv$/), proc = get(/processed_data_for_eci\.csv$/);
    if (!eci || !proc) throw new Error("Epoch benchmark ZIP is missing the capabilities index files");
    const catalog = buildCatalog(or.data, parseCsv(eci), parseCsv(proc), `${today}T00:00:00.000Z`);
    if (catalog.models.length < 20) throw new Error(`Only ${catalog.models.length} models matched; name matching may have broken`);
    return { sources: [], observations: [], artifacts: { models: catalog } };
  },
};
