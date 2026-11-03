import type { Observation, Source } from "../lib/schema";
import { fetchJson } from "./http";
import type { Feed, FeedOutput } from "./types";

// Vast.ai marketplace: live on-demand offers from independent hosts. Each run records the
// median price per GPU-hour (with the 10th–90th percentile spread) for each data-centre GPU.

export const GPUS = [
  { name: "H100 SXM", entity: "h100" },
  { name: "H200", entity: "h200" },
  { name: "B200", entity: "b200" },
  { name: "A100 SXM4", entity: "a100" },
] as const;

export interface VastOffer { gpu_name: string; num_gpus: number; dph_total: number; rentable?: boolean }

export const VAST_SOURCE = (today: string): Source => ({
  id: "vast_ai_marketplace", title: "Vast.ai GPU marketplace — live on-demand offers", publisher: "Vast.ai", url: "https://vast.ai/pricing",
  tier: 1, kind: "company", accessed: today, verified: true, automated: true, note: "Read daily from the public offer-search API; total hourly price ÷ GPUs per offer.",
});

const quantile = (s: number[], q: number) => s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]!;

export function parseOffers(gpu: (typeof GPUS)[number], offers: VastOffer[], today: string): Observation | undefined {
  const prices = offers
    .filter((o) => o.gpu_name === gpu.name && o.num_gpus > 0 && o.dph_total > 0 && o.rentable !== false)
    .map((o) => o.dph_total / o.num_gpus)
    .sort((a, b) => a - b);
  if (prices.length < 3) return undefined;
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    id: `vast_${gpu.entity}_${today.replace(/-/g, "")}`, entity_id: gpu.entity, metric_id: "gpu_rental_price", value: r(quantile(prices, 0.5)),
    low: r(quantile(prices, 0.1)), high: r(quantile(prices, 0.9)), currency: "USD", dims: { provider: "vast_ai", contract: "marketplace" },
    period: today, period_type: "point", status: "actual", method: "derived", source_id: "vast_ai_marketplace", published: today, confidence: 0.75,
    note: `Median of ${prices.length} live offers; range is 10th–90th percentile.`,
  };
}

export const vastFeed: Feed = {
  id: "gpu",
  name: "GPU marketplace prices",
  cadenceHours: 24,
  mode: "append",
  homepage: "https://vast.ai/pricing",
  async run({ today }): Promise<FeedOutput> {
    const observations: Observation[] = [];
    for (const g of GPUS) {
      const q = JSON.stringify({ gpu_name: { eq: g.name }, rentable: { eq: true }, type: "on-demand", limit: 400 });
      const res = await fetchJson<{ offers?: VastOffer[] }>(`https://console.vast.ai/api/v0/bundles/?q=${encodeURIComponent(q)}`, { timeoutMs: 120_000 });
      const o = parseOffers(g, res.offers ?? [], today);
      if (o) observations.push(o);
    }
    if (!observations.length) throw new Error("No GPU offers returned");
    return { sources: [VAST_SOURCE(today)], observations };
  },
};
