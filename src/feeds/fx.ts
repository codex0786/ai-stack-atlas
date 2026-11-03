import type { Observation, Source } from "../lib/schema";
import { fetchJson } from "./http";
import type { Feed, FeedOutput } from "./types";

// USD→INR reference rate (ECB, via the Frankfurter API) so the India lens can show global
// prices in rupees. Each run re-reads the last 400 days; earlier days are kept (append).

export const FX_SOURCE = (today: string): Source => ({
  id: "frankfurter_ecb_fx", title: "Euro foreign exchange reference rates (ECB), USD→INR cross rate", publisher: "Frankfurter (European Central Bank data)",
  url: "https://frankfurter.dev", tier: 2, kind: "aggregator", accessed: today, verified: true, automated: true,
  note: "ECB publishes working-day reference rates; USD→INR is derived from the EUR crosses.",
});

const shift = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

export function parseFx(rates: Record<string, { INR?: number }>, today: string): Observation[] {
  return Object.entries(rates)
    .filter(([, r]) => typeof r.INR === "number" && r.INR > 0)
    .map(([date, r]) => ({
      id: `fx_usdinr_${date.replace(/-/g, "")}`, entity_id: "india", metric_id: "fx_rate", value: Math.round(r.INR! * 1e4) / 1e4, dims: {},
      period: date, period_type: "point" as const, status: "actual" as const, method: "reported" as const, source_id: "frankfurter_ecb_fx", published: today, confidence: 0.95,
    }));
}

export const fxFeed: Feed = {
  id: "fx",
  name: "USD→INR exchange rate",
  cadenceHours: 24,
  mode: "append",
  homepage: "https://frankfurter.dev",
  async run({ today }): Promise<FeedOutput> {
    const res = await fetchJson<{ rates: Record<string, { INR?: number }> }>(`https://api.frankfurter.dev/v1/${shift(today, -400)}..${today}?base=USD&symbols=INR`);
    const observations = parseFx(res.rates ?? {}, today);
    if (!observations.length) throw new Error("No USD→INR rates returned");
    return { sources: [FX_SOURCE(today)], observations };
  },
};
