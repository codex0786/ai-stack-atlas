import type { CatalogModel } from "./models";
import type { UseCase } from "./usecases";

// Transparent scoring for the executive dashboard. Every number shown to a reader can be
// traced to: list price × workload, Epoch's capability index, and task benchmarks.
//
//   quality   = 0.6 × capability index (scaled 0–1 across the catalog)
//             + 0.4 × mean percentile on the use case's benchmarks (when the model has any);
//               a model never measured on a task that has benchmarks gets × UNTESTED_DISCOUNT
//   cost      = (uncached input × price + cached input × cache price + output × price) per task;
//               batch prices when the job can run overnight
//   score     = w × quality + (1 − w) × cheapness, where cheapness is cost on a log scale
//               (1 = cheapest eligible model), w = the use case's quality weight
//   pick      = highest score among models reaching the use case's quality floor
//               (default 85% of the best eligible model's quality), so a far cheaper but
//               clearly weaker model never wins on price alone

/** Uncertainty discount for a model untested on any of the task's benchmarks. */
export const UNTESTED_DISCOUNT = 0.95;

export interface Scored {
  model: CatalogModel;
  quality: number;
  /** How the quality was formed: benchmarks used, or capability index only. */
  qualityBasis: string[];
  costPerTask: number;
  monthlyCost: number;
  usedBatch: boolean;
  cheapness: number;
  score: number;
  /** Below the use case's quality floor: listed, but never recommended. */
  belowFloor: boolean;
}

export interface Recommendation {
  useCase: UseCase;
  eligible: Scored[];
  excluded: number;
  recommended?: Scored;
  bestQuality?: Scored;
  bestValue?: Scored;
  bestOpen?: Scored;
  rationale: string[];
}

/** Percentile (0–1) of each model's score within a benchmark, among models that have it. */
export function benchmarkPercentiles(models: CatalogModel[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const names = new Set(models.flatMap((m) => Object.keys(m.bench)));
  for (const b of names) {
    const scored = models.filter((m) => m.bench[b] !== undefined).sort((x, y) => x.bench[b]! - y.bench[b]!);
    const pct = new Map<string, number>();
    scored.forEach((m, i) => pct.set(m.id, scored.length === 1 ? 1 : i / (scored.length - 1)));
    out.set(b, pct);
  }
  return out;
}

export function costPerTask(m: CatalogModel, uc: UseCase): { usd: number; batch: boolean } {
  const batch = uc.batchable && !!m.batchPrice;
  const p = batch ? { ...m.batchPrice!, cachedInput: m.price.cachedInput && m.batchPrice!.input * (m.price.cachedInput / m.price.input) } : m.price;
  const cached = p.cachedInput !== undefined ? uc.inputTokens * uc.cachedShare : 0;
  const usd = ((uc.inputTokens - cached) * p.input + cached * (p.cachedInput ?? p.input) + uc.outputTokens * p.output) / 1e6;
  return { usd, batch };
}

export function eligible(m: CatalogModel, uc: UseCase): boolean {
  const r = uc.requires;
  const needContext = Math.max(r.minContext ?? 0, uc.inputTokens + uc.outputTokens);
  return m.context >= needContext && (!r.vision || m.inputs.includes("image")) && (!r.tools || m.tools)
    && (!r.structured || m.structured) && (!r.openWeights || m.openWeights);
}

export function recommend(models: CatalogModel[], uc: UseCase, monthlyTasks = uc.monthlyTasks, pct = benchmarkPercentiles(models)): Recommendation {
  const eciMin = Math.min(...models.map((m) => m.eci)), eciMax = Math.max(...models.map((m) => m.eci));
  const pool = models.filter((m) => eligible(m, uc));
  const costs = pool.map((m) => costPerTask(m, uc));
  const logMin = Math.log10(Math.min(...costs.map((c) => c.usd))), logMax = Math.log10(Math.max(...costs.map((c) => c.usd)));

  const scored: Scored[] = pool.map((m, i) => {
    const eciN = (m.eci - eciMin) / (eciMax - eciMin || 1);
    const used = uc.benchmarks.filter((b) => pct.get(b)?.has(m.id));
    const taskN = used.length ? used.reduce((a, b) => a + pct.get(b)!.get(m.id)!, 0) / used.length : undefined;
    const untested = taskN === undefined && uc.benchmarks.length > 0;
    const quality = taskN === undefined ? eciN * (untested ? UNTESTED_DISCOUNT : 1) : 0.6 * eciN + 0.4 * taskN;
    const { usd, batch } = costs[i]!;
    const cheapness = logMax === logMin ? 1 : (logMax - Math.log10(usd)) / (logMax - logMin);
    return {
      model: m, quality, qualityBasis: used.length ? used : [untested ? "Untested on this task (capability index × 0.95)" : "Capability index only"], costPerTask: usd, monthlyCost: usd * monthlyTasks,
      usedBatch: batch, cheapness, score: uc.qualityWeight * quality + (1 - uc.qualityWeight) * cheapness, belowFloor: false,
    };
  });

  const bestQuality = [...scored].sort((a, b) => b.quality - a.quality)[0];
  const share = uc.qualityFloor ?? 0.85;
  const floor = share * (bestQuality?.quality ?? 0);
  for (const s of scored) s.belowFloor = s.quality < floor;
  // Shortlist order: models clearing the quality floor first, each group by score.
  scored.sort((a, b) => Number(a.belowFloor) - Number(b.belowFloor) || b.score - a.score);
  const recommended = scored[0];
  // Best value: the cheapest model within 0.08 quality of the best.
  const bestValue = bestQuality ? scored.filter((s) => s.quality >= bestQuality.quality - 0.08).sort((a, b) => a.costPerTask - b.costPerTask)[0] : undefined;
  // Best open-weight: same rule within open models (floor relative to the best open model).
  const open = scored.filter((s) => s.model.openWeights);
  const openTop = Math.max(...open.map((s) => s.quality));
  const bestOpen = open.filter((s) => s.quality >= share * openTop).sort((a, b) => b.score - a.score)[0];

  const rationale: string[] = [];
  if (recommended && bestQuality) {
    if (recommended.model.id === bestQuality.model.id) rationale.push(`${recommended.model.name} is both the highest-quality and the best-balanced choice for this workload.`);
    else {
      const ratio = bestQuality.costPerTask / recommended.costPerTask;
      rationale.push(`${recommended.model.name} reaches ${Math.round((recommended.quality / bestQuality.quality) * 100)}% of the top model's quality (${bestQuality.model.name}) at ${ratio >= 1.5 ? `${ratio.toFixed(ratio >= 10 ? 0 : 1)}× lower` : "a similar"} cost per task.`);
    }
    rationale.push(recommended.qualityBasis[0]!.startsWith("Untested")
      ? "This model hasn't been measured on this task's benchmarks yet, so its quality is its overall capability index, discounted 5% for the uncertainty."
      : recommended.qualityBasis[0] === "Capability index only"
      ? "Quality is based on Epoch's overall capability index; no public benchmark measures this task directly."
      : `Quality blends Epoch's capability index with: ${recommended.qualityBasis.join(", ")}.`);
    if (recommended.usedBatch) rationale.push("Priced with batch (overnight) rates, which this workload can use.");
  }
  return { useCase: uc, eligible: scored, excluded: models.length - pool.length, recommended, bestQuality, bestValue, bestOpen, rationale };
}
