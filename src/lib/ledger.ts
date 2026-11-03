import { fitTrend, predict, randomWalk } from "./forecast";
import { dimsKey, periodEnd, type Fact } from "./resolver";

// The forecast ledger: every forecast the atlas makes is logged once, frozen, and scored
// against the real outcome when it arrives. Nothing here edits a forecast after it is made.

export interface LoggedForecast {
  id: string;
  made: string;
  label: string;
  target: { entity_id: string; metric_id: string; dims: Record<string, string>; currency?: string; period: string };
  /** For display: the metric's unit and kind. */
  unit: string;
  kind: string;
  method: string;
  mean: number;
  lo: number;
  hi: number;
  status: "pending" | "hit" | "miss";
  actual?: number;
  actualObservation?: string;
  resolved?: string;
  /** (forecast − actual) ÷ actual. */
  error?: number;
}

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const yearsOf = (period: string) => { const e = Date.parse(periodEnd(period)); return 1970 + e / (365.25 * DAY); };

type Series = (entity: string, metric: string, dims?: Record<string, string>) => Fact[];

export function seriesFrom(facts: Fact[]): Series {
  return (entity, metric, dims = {}) =>
    facts.filter((f) => f.entity_id === entity && f.metric_id === metric && dimsKey(f.dims) === dimsKey(dims) && f.best.status === "actual")
      .sort((a, b) => periodEnd(a.period).localeCompare(periodEnd(b.period)));
}

/** Forecasts the atlas would make today. Callers keep only ids not already logged. */
export function proposeForecasts(series: Series, today: string, units: (metric: string) => { unit: string; kind: string }): LoggedForecast[] {
  const out: LoggedForecast[] = [];
  const base = (metric: string) => ({ made: today, status: "pending" as const, ...units(metric) });

  // 1. Next quarter's big-four hyperscaler capex: log-linear trend on the last 12 quarters.
  const capex = series("hyperscalers", "capex").filter((f) => /Q\d$/.test(f.period)).slice(-12);
  if (capex.length >= 8) {
    const last = capex.at(-1)!.period;
    const [y, q] = [Number(last.slice(0, 4)), Number(last.slice(-1))];
    const next = q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
    const p = predict(fitTrend(capex.map((f) => ({ t: yearsOf(f.period), y: f.best.value }))), yearsOf(next));
    out.push({ ...base("capex"), id: `capex_big4_${next.replace("-", "_").toLowerCase()}`, label: `Big-four hyperscaler capex, ${next}`,
      target: { entity_id: "hyperscalers", metric_id: "capex", dims: {}, currency: "USD", period: next }, method: `Log-linear trend on ${capex.length} quarters`, ...p });
  }

  // 2. Largest training run released next calendar year: log-linear on complete years.
  const year = Number(today.slice(0, 4));
  const runs = series("frontier_models", "training_compute", { scope: "largest_released_in_year" }).filter((f) => Number(f.period) < year && Number(f.period) >= 2018);
  if (runs.length >= 4) {
    const target = String(year + 1);
    const p = predict(fitTrend(runs.map((f) => ({ t: Number(f.period), y: f.best.value }))), year + 1);
    out.push({ ...base("training_compute"), id: `largest_run_${target}`, label: `Largest training run released in ${target}`,
      target: { entity_id: "frontier_models", metric_id: "training_compute", dims: { scope: "largest_released_in_year" }, period: target },
      method: `Log-linear trend on ${runs.length} complete years (Epoch AI)`, ...p });
  }

  // 3. 30-day-ahead random walks for daily market series, made at most weekly per series.
  const daily: [string, string, string, Record<string, string>, string | undefined][] = [
    ["fx_usdinr", "india", "fx_rate", {}, undefined],
    ["or_median_output", "openrouter", "llm_api_price_median", { direction: "output" }, "USD"],
    ["vast_h100", "h100", "gpu_rental_price", { provider: "vast_ai", contract: "marketplace" }, "USD"],
  ];
  const labels: Record<string, string> = { fx_usdinr: "Rupees per US dollar", or_median_output: "OpenRouter median output price", vast_h100: "H100 on Vast.ai, median" };
  for (const [key, entity, metric, dims, currency] of daily) {
    const s = series(entity, metric, dims);
    if (!s.length) continue;
    const target = addDays(today, 30);
    const p = randomWalk(s.map((f) => f.best.value), 30);
    out.push({ ...base(metric), id: `${key}_${target.replace(/-/g, "")}`, label: `${labels[key]}, ${target}`,
      target: { entity_id: entity, metric_id: metric, dims, currency, period: target },
      method: `Random walk, volatility from ${s.length >= 11 ? `${s.length - 1} daily changes` : "a default 2%/day (too little history)"}`, mean: p.mean, lo: p.lo, hi: p.hi });
  }
  return out;
}

/** Add proposals the ledger hasn't seen; daily-market ones only if none was made in the last 7 days. */
export function mergeLedger(ledger: LoggedForecast[], proposals: LoggedForecast[], today: string): LoggedForecast[] {
  const ids = new Set(ledger.map((f) => f.id));
  const recent = (prefix: string) => ledger.some((f) => f.id.startsWith(prefix) && Date.parse(today) - Date.parse(f.made) < 7 * DAY);
  const fresh = proposals.filter((p) => !ids.has(p.id) && !(/_\d{8}$/.test(p.id) && recent(p.id.replace(/_\d{8}$/, ""))));
  return [...ledger, ...fresh];
}

/** Score pending forecasts whose target period has ended and has an actual value. */
export function scoreLedger(ledger: LoggedForecast[], series: Series, today: string): LoggedForecast[] {
  return ledger.map((f) => {
    if (f.status !== "pending" || periodEnd(f.target.period) >= today) return f;
    const s = series(f.target.entity_id, f.target.metric_id, f.target.dims);
    // Exact period, or for daily targets the first value within 5 days after (weekends, holidays).
    const hit = s.find((x) => x.period === f.target.period)
      ?? (/^\d{4}-\d{2}-\d{2}$/.test(f.target.period) ? s.find((x) => x.period > f.target.period && x.period <= addDays(f.target.period, 5)) : undefined);
    if (!hit) return f;
    const actual = hit.best.value;
    return { ...f, status: actual >= f.lo && actual <= f.hi ? "hit" : "miss", actual, actualObservation: hit.best.id, resolved: today, error: (f.mean - actual) / actual };
  });
}
