// Unit-economics calculators (PLAN.md §5, E1–E4). Pure functions so the page, tests and any
// future API share one implementation. Every input is either sourced (an observation in the
// atlas) or an explicit, editable assumption — the page labels which.

const HOURS_PER_YEAR = 8760;

/** Capital recovery factor: the annual payment that repays $1 over `years` at rate `r`. */
export function crf(r: number, years: number): number {
  return r === 0 ? 1 / years : (r * (1 + r) ** years) / ((1 + r) ** years - 1);
}

/* ── E1 · GPU-hour cost of ownership ─────────────────────────────────────── */

export interface GpuHourInputs {
  /** All-in capex per GPU: the GPU plus its share of server, networking and installation (USD). */
  capexPerGpu: number;
  /** Depreciation life in years (4–6 is the industry debate). */
  lifeYears: number;
  /** Cost of capital (WACC), e.g. 0.10. */
  wacc: number;
  /** Board power per GPU (W) — the GPU's TDP plus its share of host power. */
  wattsPerGpu: number;
  /** Power usage effectiveness of the facility. */
  pue: number;
  /** Electricity price, USD per kWh. */
  powerPrice: number;
  /** Facility, staff, maintenance and software per year, as a share of capex. */
  opexShare: number;
  /** Share of hours the GPU is sold or used. */
  utilisation: number;
}

export interface GpuHourResult {
  /** Cost per *used* GPU-hour, split into components (USD). */
  capital: number;
  power: number;
  opex: number;
  total: number;
  /** Power drawn per GPU from the grid (kW, incl. PUE). */
  gridKw: number;
}

export function gpuHourCost(i: GpuHourInputs): GpuHourResult {
  const usedHours = HOURS_PER_YEAR * i.utilisation;
  const capital = (i.capexPerGpu * crf(i.wacc, i.lifeYears)) / usedHours;
  const gridKw = (i.wattsPerGpu / 1000) * i.pue;
  // Power is drawn for every hour the GPU is on; idle draw is assumed similar (conservative).
  const power = (gridKw * HOURS_PER_YEAR * i.powerPrice) / usedHours;
  const opex = (i.capexPerGpu * i.opexShare) / usedHours;
  return { capital, power, opex, total: capital + power + opex, gridKw };
}

/** ±`swing` change in each input → resulting total, sorted by impact (for a tornado chart). */
export function sensitivity<T extends object>(inputs: T, fn: (i: T) => number, keys: (keyof T)[], swing = 0.2) {
  const base = fn(inputs);
  return keys
    .map((k) => {
      const v = inputs[k] as unknown as number;
      const lo = fn({ ...inputs, [k]: v * (1 - swing) });
      const hi = fn({ ...inputs, [k]: v * (1 + swing) });
      return { key: k, low: Math.min(lo, hi), high: Math.max(lo, hi), base };
    })
    .sort((a, b) => b.high - b.low - (a.high - a.low));
}

/* ── E2 · Training-run cost ──────────────────────────────────────────────── */

export interface TrainingInputs {
  /** Training compute in FLOP (or derive from 6 × params × tokens). */
  flop: number;
  /** Peak dense throughput per GPU at the training precision (FLOP/s). */
  peakFlops: number;
  /** Model FLOP utilisation actually achieved (0.3–0.5 is typical). */
  mfu: number;
  /** Cost per GPU-hour (USD). */
  gpuHourPrice: number;
  /** GPUs in the cluster (sets wall-clock time). */
  gpus: number;
  /** Grid power per GPU (kW, incl. PUE). */
  gridKwPerGpu: number;
}

export const flopFromModel = (params: number, tokens: number) => 6 * params * tokens;

export function trainingCost(i: TrainingInputs) {
  const gpuHours = i.flop / (i.peakFlops * i.mfu * 3600);
  const cost = gpuHours * i.gpuHourPrice;
  const days = gpuHours / i.gpus / 24;
  const mwh = (gpuHours * i.gridKwPerGpu) / 1000;
  return { gpuHours, cost, days, mwh, energyCost: (p: number) => mwh * 1000 * p };
}

/* ── E3 · Inference cost per million tokens ──────────────────────────────── */

export interface InferenceInputs {
  /** Parameters active per token (MoE models activate a fraction of the total). */
  activeParams: number;
  peakFlops: number;
  /** Utilisation achieved while serving (batching helps; 0.1–0.4). */
  servingMfu: number;
  gpuHourPrice: number;
  gridKwPerGpu: number;
}

export function inferenceCost(i: InferenceInputs) {
  // ~2 FLOP per active parameter per generated token (forward pass).
  const tokensPerSecond = (i.peakFlops * i.servingMfu) / (2 * i.activeParams);
  const costPerMillion = (i.gpuHourPrice / (tokensPerSecond * 3600)) * 1e6;
  const whPerThousand = ((i.gridKwPerGpu * 1000) / tokensPerSecond / 3600) * 1000;
  return { tokensPerSecond, costPerMillion, whPerThousand, margin: (listPrice: number) => (listPrice - costPerMillion) / listPrice };
}

/* ── E4 · Data-centre power ──────────────────────────────────────────────── */

export interface PowerInputs {
  gpus: number;
  wattsPerGpu: number;
  pue: number;
  /** Average load as a share of peak. */
  loadFactor: number;
}

export function dataCentrePower(i: PowerInputs) {
  const itMw = (i.gpus * i.wattsPerGpu) / 1e6;
  const facilityMw = itMw * i.pue;
  const twhPerYear = (facilityMw * i.loadFactor * HOURS_PER_YEAR) / 1e6;
  return { itMw, facilityMw, twhPerYear, homesEquivalent: (twhPerYear * 1e9) / 10_500 };
}
