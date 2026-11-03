import { gpuHourCost } from "./calculators";
import { series, type Cited, type SiteData } from "./site";
import type { FlowInputs } from "./valueflow";

// Sourced defaults for "Where $1 goes", shared by the value-flow page and Ask so both tell
// the same story. Uses the GPU-hour calculator's defaults for the cloud's cost structure.

/** Trailing four-quarter gross margin from filed revenue and cost of revenue. */
export function ttmMargin(site: SiteData, entity: string): { margin: number; quarters: string; source: Cited } | undefined {
  const rev = series(site, entity, "revenue").filter((c) => c.source.automated);
  const cor = new Map(series(site, entity, "cost_of_revenue").map((c) => [c.period, c]));
  const both = rev.filter((c) => cor.has(c.period)).slice(-4);
  if (both.length < 4) return undefined;
  const R = both.reduce((a, c) => a + c.value, 0), C = both.reduce((a, c) => a + cor.get(c.period)!.value, 0);
  return { margin: 1 - C / R, quarters: `${both[0]!.period} to ${both.at(-1)!.period}`, source: both.at(-1)! };
}

export function flowDefaults(site: SiteData) {
  const o = site.obs;
  const gpu = gpuHourCost({ capexPerGpu: 30_000, lifeYears: 5, wacc: 0.1, wattsPerGpu: o("h100_tdp").value + 300, pue: 1.2, powerPrice: 0.08, opexShare: 0.08, utilisation: 0.7 });
  const market = o("h100_market_median");
  const labCompute = o("anthropic_rev_per_compute_2026h1");
  const nvda = ttmMargin(site, "nvidia");
  const inputs: FlowInputs = {
    appApiShare: 0.35,
    labComputeShare: 1 / labCompute.value,
    cloudMargin: Math.max(0, 1 - gpu.total / market.value),
    cloudCost: { capital: gpu.capital / gpu.total, power: gpu.power / gpu.total, opex: gpu.opex / gpu.total },
    gpuVendorShare: 0.6,
    gpuVendorMargin: nvda?.margin ?? 0.75,
    vendorCogs: { memory: 0.45, foundry: 0.3, other: 0.25 },
  };
  return { inputs, gpu, market, labCompute, nvda };
}
