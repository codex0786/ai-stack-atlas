import type { Observation, Source } from "../lib/schema";
import { fetchJson } from "./http";
import type { Feed, FeedOutput } from "./types";

// EIA-930 daily demand by balancing area. Records recent daily demand (GWh) and the trailing
// 30-day year-on-year change, aligned 364 days back so weekdays match.

export const REGIONS = [
  { respondent: "US48", entity: "us_lower48", timezone: "Eastern" },
  { respondent: "ERCO", entity: "ercot", timezone: "Central" },
  { respondent: "PJM", entity: "pjm", timezone: "Eastern" },
] as const;

export interface EiaRow { period: string; respondent: string; type: string; timezone: string; value: string | number | null; "value-units"?: string }

export const EIA_SOURCE = (today: string): Source => ({
  id: "eia_930_daily", title: "EIA-930 Hourly Electric Grid Monitor — daily demand by balancing area", publisher: "U.S. Energy Information Administration",
  url: "https://www.eia.gov/electricity/gridmonitor/", tier: 1, kind: "government", accessed: today, verified: true, automated: true,
  note: "Read via the EIA Open Data API (electricity/rto/daily-region-data).",
});

const DAY = 86_400_000;
const shift = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const WINDOW = 30, KEEP_DAYS = 14;

export function parseRegion(region: (typeof REGIONS)[number], rows: EiaRow[], today: string): Observation[] {
  const mwh = new Map<string, number>();
  for (const r of rows) {
    // Today's total is still accumulating, so only completed days count.
    if (r.respondent !== region.respondent || r.type !== "D" || r.timezone !== region.timezone || r.period >= today) continue;
    const v = Number(r.value);
    if (Number.isFinite(v) && v > 0) mwh.set(r.period, v);
  }
  if (!mwh.size) return [];
  const last = [...mwh.keys()].sort().at(-1)!;
  const base = { source_id: "eia_930_daily", status: "actual" as const, confidence: 0.9, dims: {} };
  const out: Observation[] = [];

  for (let i = 0; i < KEEP_DAYS; i++) {
    const d = shift(last, -i);
    const v = mwh.get(d);
    if (v === undefined) continue;
    out.push({ ...base, id: `eia_${region.entity}_demand_${d.replace(/-/g, "")}`, entity_id: region.entity, metric_id: "grid_demand", value: Math.round(v / 100) / 10,
      period: d, period_type: "point", method: "reported", published: today });
  }

  const sum = (endDay: string) => {
    let total = 0, n = 0;
    for (let i = 0; i < WINDOW; i++) { const v = mwh.get(shift(endDay, -i)); if (v !== undefined) { total += v; n++; } }
    return { total, n };
  };
  const now = sum(last), ago = sum(shift(last, -364));
  if (now.n >= WINDOW - 2 && ago.n >= WINDOW - 2) {
    const growth = now.total / now.n / (ago.total / ago.n) - 1;
    out.push({ ...base, id: `eia_${region.entity}_yoy30_${last.replace(/-/g, "")}`, entity_id: region.entity, metric_id: "electricity_load_growth",
      value: Number(growth.toFixed(4)), dims: { window: "trailing_30d" }, period: last, period_type: "point", method: "derived", published: today,
      note: `Average daily demand over the 30 days to ${last} vs the same weekdays a year earlier.` });
  }
  return out;
}

export function parseEia(rows: EiaRow[], today: string): FeedOutput {
  return { sources: [EIA_SOURCE(today)], observations: REGIONS.flatMap((r) => parseRegion(r, rows, today)) };
}

export const eiaFeed: Feed = {
  id: "eia",
  name: "EIA grid demand",
  cadenceHours: 24,
  mode: "append",
  homepage: "https://www.eia.gov/electricity/gridmonitor/",
  async run({ today, env }) {
    const key = env.EIA_API_KEY || "DEMO_KEY";
    const start = shift(today, -(364 + WINDOW + 10));
    const rows: EiaRow[] = [];
    for (const r of REGIONS) {
      const q = new URLSearchParams({ api_key: key, frequency: "daily", "data[0]": "value", "facets[respondent][]": r.respondent, "facets[type][]": "D",
        "facets[timezone][]": r.timezone, start, end: today, "sort[0][column]": "period", "sort[0][direction]": "desc", length: "5000" });
      const res = await fetchJson<{ response?: { data?: EiaRow[] }; error?: string }>(`https://api.eia.gov/v2/electricity/rto/daily-region-data/data/?${q}`);
      if (!res.response?.data) throw new Error(`EIA ${r.respondent}: ${res.error ?? "no data"}`);
      rows.push(...res.response.data);
    }
    const out = parseEia(rows, today);
    if (!out.observations.length) throw new Error("EIA returned no usable demand rows");
    return out;
  },
};
