// Forecasting (PLAN.md §6). Two kinds, kept apart on purpose:
//  • Trend forecasts: statistical fits to atlas series, with prediction intervals and backtests.
//  • Scenarios: a supply-constrained chain (capex → accelerators → power), driven by labelled
//    assumptions. Scenarios answer "what if", not "what will".

/* ── Statistics ──────────────────────────────────────────────────────────── */

/** Two-sided Student-t critical value for a 90% interval (df ≥ 1), from a small table. */
export function t90(df: number): number {
  const table: [number, number][] = [[1, 6.314], [2, 2.92], [3, 2.353], [4, 2.132], [5, 2.015], [6, 1.943], [8, 1.86], [10, 1.812], [15, 1.753], [20, 1.725], [30, 1.697], [60, 1.671]];
  if (df >= 60) return 1.645;
  for (let i = 0; i < table.length - 1; i++) {
    const [d0, v0] = table[i]!, [d1, v1] = table[i + 1]!;
    if (df <= d1) return v0 + ((v1 - v0) * (df - d0)) / (d1 - d0);
  }
  return 1.645;
}

export interface Fit {
  slope: number;
  intercept: number;
  /** Residual standard deviation (in log10 units for log fits). */
  sd: number;
  n: number;
  tMean: number;
  sxx: number;
  log: boolean;
}

/** Least squares of y (or log10 y) on t. */
export function fitTrend(points: { t: number; y: number }[], log = true): Fit {
  const ys = points.map((p) => (log ? Math.log10(p.y) : p.y));
  const ts = points.map((p) => p.t);
  const n = points.length;
  const tMean = ts.reduce((a, b) => a + b, 0) / n, yMean = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (ts[i]! - tMean) * (ys[i]! - yMean); sxx += (ts[i]! - tMean) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = yMean - slope * tMean;
  const rss = ys.reduce((a, y, i) => a + (y - (intercept + slope * ts[i]!)) ** 2, 0);
  return { slope, intercept, sd: n > 2 ? Math.sqrt(rss / (n - 2)) : 0, n, tMean, sxx, log };
}

/** Point forecast with a 90% prediction interval. */
export function predict(f: Fit, t: number): { mean: number; lo: number; hi: number } {
  const m = f.intercept + f.slope * t;
  const se = f.sd * Math.sqrt(1 + 1 / f.n + (f.sxx ? (t - f.tMean) ** 2 / f.sxx : 0));
  const w = t90(Math.max(1, f.n - 2)) * se;
  return f.log ? { mean: 10 ** m, lo: 10 ** (m - w), hi: 10 ** (m + w) } : { mean: m, lo: m - w, hi: m + w };
}

/** Annual growth multiple implied by a log10 fit with t in years. */
export const growthPerYear = (f: Fit) => 10 ** f.slope;

/** Random-walk forecast `days` ahead from daily log changes (for prices, rates). */
export function randomWalk(values: number[], days: number, fallbackDailySd = 0.02): { mean: number; lo: number; hi: number; sd: number } {
  const last = values.at(-1)!;
  const changes = values.slice(1).map((v, i) => Math.log(v / values[i]!)).filter(Number.isFinite);
  const sd = changes.length >= 10 ? Math.sqrt(changes.reduce((a, c) => a + c * c, 0) / changes.length) : fallbackDailySd;
  const w = 1.645 * sd * Math.sqrt(days);
  return { mean: last, lo: last * Math.exp(-w), hi: last * Math.exp(w), sd };
}

/** Hold out the last `k` points, fit on the rest, and report the errors. */
export function backtest(points: { t: number; y: number }[], k: number, log = true) {
  const train = points.slice(0, -k), test = points.slice(-k);
  const f = fitTrend(train, log);
  const rows = test.map((p) => {
    const pr = predict(f, p.t);
    return { t: p.t, actual: p.y, ...pr, error: (pr.mean - p.y) / p.y, inside: p.y >= pr.lo && p.y <= pr.hi };
  });
  const mape = rows.reduce((a, r) => a + Math.abs(r.error), 0) / rows.length;
  return { fit: f, rows, mape, coverage: rows.filter((r) => r.inside).length / rows.length };
}

/* ── Supply-constrained scenario chain ───────────────────────────────────── */

export interface ChainInputs {
  /** Big-four hyperscaler capex over the last four quarters (USD, from filings). */
  big4CapexTtm: number;
  /** Big four's share of all AI data-centre capex worldwide. */
  big4Share: number;
  /** Share of AI capex spent on accelerator systems (the rest: buildings, power, networking). */
  systemsShare: number;
  /** All-in cost per accelerator incl. its share of the server (USD). */
  costPerAccelerator: number;
  /** Capex growth per year, by year from the first forecast year. */
  capexGrowth: number[];
  /** Advanced-packaging (CoWoS) capacity at the start, wafers per month (from the atlas). */
  cowosStart: number;
  /** Packaging capacity growth per year. */
  cowosGrowth: number;
  /** Accelerator packages per wafer, after yield and the share of capacity going to AI. */
  acceleratorsPerWafer: number;
  /** Accelerators already installed at the start, and accelerator life in years. */
  installedStart: number;
  lifeYears: number;
  /** Grid power per accelerator incl. host and PUE (kW), and average load. */
  kwPerAccelerator: number;
  loadFactor: number;
  startYear: number;
  years: number;
}

export interface ChainYear {
  year: number;
  capex: number;
  demand: number;
  supply: number;
  deployed: number;
  binding: "packaging" | "spending";
  installed: number;
  gw: number;
  twh: number;
}

export function supplyChain(i: ChainInputs): ChainYear[] {
  const out: ChainYear[] = [];
  let capex = i.big4CapexTtm / i.big4Share;
  // Assume the start-of-period installed base arrived evenly over the accelerator life.
  const vintages: number[] = Array(Math.max(1, Math.round(i.lifeYears))).fill(i.installedStart / Math.max(1, Math.round(i.lifeYears)));
  for (let y = 0; y < i.years; y++) {
    capex *= 1 + (i.capexGrowth[y] ?? i.capexGrowth.at(-1) ?? 0);
    const demand = (capex * i.systemsShare) / i.costPerAccelerator;
    const wpm = i.cowosStart * (1 + i.cowosGrowth) ** (y + 0.5); // average over the year
    const supply = wpm * 12 * i.acceleratorsPerWafer;
    const deployed = Math.min(demand, supply);
    vintages.push(deployed);
    vintages.shift(); // retire the oldest year
    const installed = vintages.reduce((a, b) => a + b, 0);
    const gw = (installed * i.kwPerAccelerator) / 1e6;
    out.push({ year: i.startYear + y, capex, demand, supply, deployed, binding: supply < demand ? "packaging" : "spending", installed, gw, twh: gw * i.loadFactor * 8.76 });
  }
  return out;
}

export interface Scenario { id: string; name: string; summary: string; capexGrowth: number[]; cowosGrowth: number }

export const SCENARIOS: Scenario[] = [
  { id: "acceleration", name: "Acceleration", summary: "AI revenue keeps compounding; capex grows 30% a year and packaging races to keep up.", capexGrowth: [0.3, 0.3, 0.25, 0.25, 0.2], cowosGrowth: 0.45 },
  { id: "base", name: "Base", summary: "Capex growth fades from 20% to zero by 2030 as spending meets revenue reality.", capexGrowth: [0.2, 0.15, 0.1, 0.05, 0], cowosGrowth: 0.35 },
  { id: "digestion", name: "Digestion", summary: "Enterprise pull-back: capex falls 20% in 2027 and stays flat; GPU rental prices slump.", capexGrowth: [0.1, -0.2, 0, 0, 0], cowosGrowth: 0.2 },
];
