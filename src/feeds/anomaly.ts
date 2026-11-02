import { periodEnd, seriesKey } from "../lib/resolver";
import type { Metric, Observation } from "../lib/schema";
import type { Anomaly, Revision } from "./types";

// The anomaly gate. Anything flagged here makes the scheduled workflow open a pull request
// for human review instead of publishing straight to main.

/** Largest period-over-period change accepted without review, by metric kind (relative). */
export const THRESHOLDS: Record<Metric["kind"], number> = {
  price: 0.5,
  flow: 0.75,
  level: 0.5,
  share: 0.25,
  ratio: 0.5,
  spec: 0,
  growth: 0.08, // absolute: 8 percentage points (growth values are already ratios)
};

/** A revision of an already-published value larger than this is always reviewed. */
export const REVISION_THRESHOLD = 0.02;

export function compareRuns(previous: Observation[], next: Observation[], metrics: Map<string, Metric>): { added: Observation[]; revisions: Revision[]; anomalies: Anomaly[] } {
  const prevById = new Map(previous.map((o) => [o.id, o]));
  const prevBySeries = new Map<string, Observation[]>();
  for (const o of previous) {
    const k = seriesKey(o);
    prevBySeries.set(k, [...(prevBySeries.get(k) ?? []), o]);
  }

  const added: Observation[] = [];
  const revisions: Revision[] = [];
  const anomalies: Anomaly[] = [];

  for (const o of next) {
    const series = seriesKey(o);
    const old = prevById.get(o.id);
    if (old) {
      if (old.value === o.value) continue;
      revisions.push({ id: o.id, series, period: o.period, from: old.value, to: o.value });
      const change = rel(old.value, o.value);
      if (Math.abs(change) > REVISION_THRESHOLD) {
        anomalies.push({ id: o.id, series, period: o.period, previous: old.value, next: o.value, change, reason: `revised by ${pct(change)}` });
      }
      continue;
    }
    added.push(o);
    // Compare a new period with the latest earlier period already published in this series.
    const before = (prevBySeries.get(series) ?? [])
      .filter((p) => periodEnd(p.period) < periodEnd(o.period))
      .sort((a, b) => periodEnd(b.period).localeCompare(periodEnd(a.period)))[0];
    if (!before) continue;
    const kind = metrics.get(o.metric_id)?.kind ?? "level";
    const limit = THRESHOLDS[kind];
    const change = kind === "growth" ? o.value - before.value : rel(before.value, o.value);
    if (Math.abs(change) > limit) {
      anomalies.push({
        id: o.id, series, period: o.period, previous: before.value, next: o.value, change,
        reason: kind === "growth" ? `moved ${(change * 100).toFixed(1)} pp vs ${before.period} (limit ${limit * 100} pp)` : `${pct(change)} vs ${before.period} (limit ±${limit * 100}%)`,
      });
    }
  }
  return { added, revisions, anomalies };
}

function rel(a: number, b: number): number {
  if (a === 0) return b === 0 ? 0 : Infinity;
  return (b - a) / Math.abs(a);
}

const pct = (x: number) => (Number.isFinite(x) ? `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%` : "from zero");
