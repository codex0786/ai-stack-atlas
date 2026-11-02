import { METHODS, STATUSES } from "./ontology";
import type { Observation, Source } from "./schema";

// Turns a pile of possibly conflicting observations into one best value per fact, without
// hiding the others. A "fact" is entity × metric × currency × dims × period: two values for
// the same fact are a conflict between sources; values for different periods are a time series.
//
// Ranking within a fact: status (actual > guidance > projection > rumoured), then source tier,
// then most recently published, then confidence, then method (reported > … > modelled).

export interface Fact {
  key: string;
  entity_id: string;
  metric_id: string;
  currency?: string;
  dims: Record<string, string>;
  period: string;
  best: Observation;
  /** Every live observation for this fact, best first (superseded ones excluded). */
  candidates: Observation[];
  spread: { min: number; max: number };
  /** True when live candidates differ from the best value by more than the threshold. */
  conflict: boolean;
}

export interface ResolveOptions {
  /** Point-in-time view: ignore anything published after this date (YYYY-MM-DD). */
  asOf?: string;
  /** Relative difference from the best value that counts as a conflict. */
  conflictThreshold?: number;
}

export function dimsKey(dims: Record<string, string>): string {
  return Object.keys(dims).sort().map((k) => `${k}=${dims[k]}`).join(",");
}

export function seriesKey(o: Pick<Observation, "entity_id" | "metric_id" | "currency" | "dims">): string {
  return [o.entity_id, o.metric_id, o.currency ?? "", dimsKey(o.dims)].join("|");
}

/** Last calendar day a period covers, so periods of different granularity sort together. */
export function periodEnd(period: string): string {
  const [y, rest] = [period.slice(0, 4), period.slice(5)];
  if (!rest) return `${y}-12-31`;
  if (rest.startsWith("Q")) return `${y}-${["03-31", "06-30", "09-30", "12-31"][Number(rest[1]) - 1]}`;
  if (rest.startsWith("H")) return `${y}-${rest[1] === "1" ? "06-30" : "12-31"}`;
  if (rest.length === 2) {
    const last = new Date(Date.UTC(Number(y), Number(rest), 0)).getUTCDate();
    return `${y}-${rest}-${String(last).padStart(2, "0")}`;
  }
  return period;
}

const rank = <T extends readonly string[]>(list: T, v: T[number]) => list.indexOf(v);

function compare(tierOf: (id: string) => number) {
  return (a: Observation, b: Observation): number =>
    rank(STATUSES, a.status) - rank(STATUSES, b.status) ||
    tierOf(a.source_id) - tierOf(b.source_id) ||
    b.published.localeCompare(a.published) ||
    b.confidence - a.confidence ||
    rank(METHODS, a.method) - rank(METHODS, b.method) ||
    a.id.localeCompare(b.id);
}

export function resolve(observations: Observation[], sources: Source[], opts: ResolveOptions = {}): Fact[] {
  // 10%: for capex- and revenue-sized numbers a larger gap between sources is material.
  const threshold = opts.conflictThreshold ?? 0.1;
  const tiers = new Map(sources.map((s) => [s.id, s.tier]));
  const tierOf = (id: string) => tiers.get(id) ?? 3;

  const visible = opts.asOf ? observations.filter((o) => o.published <= opts.asOf!) : observations;
  const superseded = new Set(visible.flatMap((o) => (o.supersedes ? [o.supersedes] : [])));
  const live = visible.filter((o) => !superseded.has(o.id));

  const groups = new Map<string, Observation[]>();
  for (const o of live) {
    const key = `${seriesKey(o)}|${o.period}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }

  const facts: Fact[] = [];
  for (const [key, group] of groups) {
    const candidates = [...group].sort(compare(tierOf));
    const best = candidates[0]!;
    const values = candidates.map((c) => c.value);
    const spread = { min: Math.min(...values), max: Math.max(...values) };
    const scale = Math.abs(best.value) || 1;
    const conflict = candidates.some((c) => Math.abs(c.value - best.value) / scale > threshold);
    facts.push({ key, entity_id: best.entity_id, metric_id: best.metric_id, currency: best.currency, dims: best.dims, period: best.period, best, candidates, spread, conflict });
  }
  return facts.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Current value per series: the fact with the latest period whose best observation has one of
 * the accepted statuses (default: actual only, so rumours and projections never become "current").
 */
export function latest(facts: Fact[], statuses: readonly Observation["status"][] = ["actual"]): Map<string, Fact> {
  const out = new Map<string, Fact>();
  for (const f of facts) {
    if (!statuses.includes(f.best.status)) continue;
    const k = seriesKey(f.best);
    const cur = out.get(k);
    if (!cur || periodEnd(f.period) > periodEnd(cur.period)) out.set(k, f);
  }
  return out;
}
