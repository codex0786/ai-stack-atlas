import type { Observation, Source } from "../lib/schema";
import { fetchJson } from "./http";
import type { Feed, FeedOutput } from "./types";

// OpenRouter's public model list: list prices for every model it routes to. Each run records
// daily medians (all paid models, and per lab) plus the model count — a daily price index.

export interface OrModel { id: string; pricing?: { prompt?: string; completion?: string } }

/** OpenRouter author prefix → atlas entity. */
export const LABS: Record<string, string> = {
  openai: "openai", anthropic: "anthropic", google: "alphabet", "meta-llama": "meta", deepseek: "deepseek",
  qwen: "alibaba", mistralai: "mistral", "x-ai": "xai", moonshotai: "moonshot", minimax: "minimax",
};

export const OR_SOURCE = (today: string): Source => ({
  id: "openrouter_models_api", title: "OpenRouter models API (list prices)", publisher: "OpenRouter", url: "https://openrouter.ai/api/v1/models",
  tier: 1, kind: "company", accessed: today, verified: true, automated: true, note: "First-party list prices, read daily.",
});

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** USD per million tokens, or undefined for free/variable-price entries. */
function perM(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6 * 1e6) / 1e6 : undefined;
}

export function parseModels(models: OrModel[], today: string): FeedOutput {
  const day = today.replace(/-/g, "");
  const base = { currency: "USD" as const, period: today, period_type: "point" as const, status: "actual" as const, method: "derived" as const, source_id: "openrouter_models_api", published: today, confidence: 0.9 };
  const observations: Observation[] = [
    { ...base, id: `or_models_listed_${day}`, entity_id: "openrouter", metric_id: "models_listed", value: models.length, currency: undefined, dims: {}, method: "reported", confidence: 0.95 },
  ];
  const groups: [string, OrModel[], Record<string, string>][] = [["openrouter", models, {}]];
  for (const [prefix, entity] of Object.entries(LABS)) groups.push([entity, models.filter((m) => m.id.startsWith(`${prefix}/`)), { platform: "openrouter" }]);
  for (const [entity, list, extra] of groups) {
    for (const [direction, key] of [["input", "prompt"], ["output", "completion"]] as const) {
      const prices = list.map((m) => perM(m.pricing?.[key])).filter((x): x is number => x !== undefined);
      if (!prices.length) continue;
      observations.push({
        ...base, id: `or_${entity}_${direction}_${day}`, entity_id: entity, metric_id: "llm_api_price_median", value: Number(median(prices).toFixed(4)),
        low: Math.min(...prices), high: Math.max(...prices), dims: { direction, ...extra },
        note: `Median of ${prices.length} paid models${entity === "openrouter" ? "" : ` from ${entity}`}; range is cheapest–dearest.`,
      });
    }
  }
  return { sources: [OR_SOURCE(today)], observations };
}

export const openrouterFeed: Feed = {
  id: "openrouter",
  name: "OpenRouter list prices",
  cadenceHours: 24,
  mode: "append",
  homepage: "https://openrouter.ai/models",
  async run({ today }) {
    const res = await fetchJson<{ data: OrModel[] }>("https://openrouter.ai/api/v1/models");
    if (!Array.isArray(res.data) || res.data.length < 10) throw new Error(`Unexpected OpenRouter response (${res.data?.length ?? 0} models)`);
    return parseModels(res.data, today);
  },
};
