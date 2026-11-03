import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { ValueFlow, type FlowSources } from "@/components/ValueFlow";
import { gpuHourCost } from "@/lib/calculators";
import { getSite, series, type Cited, type SiteData } from "@/lib/site";

export const metadata: Metadata = {
  title: "Where $1 of AI spend goes",
  description: "Follow one dollar of AI spending down the stack — apps, model labs, clouds, chips, data centres and energy — and see who keeps each cent.",
};

/** Trailing four-quarter gross margin from filed revenue and cost of revenue. */
function ttmMargin(site: SiteData, entity: string): { margin: number; quarters: string; source: Cited } | undefined {
  const rev = series(site, entity, "revenue").filter((c) => c.source.automated);
  const cor = new Map(series(site, entity, "cost_of_revenue").map((c) => [c.period, c]));
  const both = rev.filter((c) => cor.has(c.period)).slice(-4);
  if (both.length < 4) return undefined;
  const R = both.reduce((a, c) => a + c.value, 0), C = both.reduce((a, c) => a + cor.get(c.period)!.value, 0);
  return { margin: 1 - C / R, quarters: `${both[0]!.period} to ${both.at(-1)!.period}`, source: both.at(-1)! };
}

export default async function ValueFlowPage() {
  const site = await getSite();
  const o = site.obs;
  // The same defaults as the GPU-hour calculator, so both pages tell one story.
  const gpu = gpuHourCost({ capexPerGpu: 30_000, lifeYears: 5, wacc: 0.1, wattsPerGpu: o("h100_tdp").value + 300, pue: 1.2, powerPrice: 0.08, opexShare: 0.08, utilisation: 0.7 });
  const market = o("h100_market_median");
  const labCompute = o("anthropic_rev_per_compute_2026h1");
  const nvda = ttmMargin(site, "nvidia");
  const peers = ([["NVIDIA", "nvidia"], ["Broadcom", "broadcom"], ["AMD", "amd"], ["Microsoft", "microsoft"], ["Alphabet", "alphabet"], ["Amazon", "amazon"], ["Meta", "meta"], ["CoreWeave", "coreweave"]] as const)
    .map(([name, e]) => ({ name, ...ttmMargin(site, e)! }))
    .filter((p) => p.source);

  const src: FlowSources = {
    defaults: {
      appApiShare: 0.35,
      labComputeShare: 1 / labCompute.value,
      cloudMargin: Math.max(0, 1 - gpu.total / market.value),
      cloudCost: { capital: gpu.capital / gpu.total, power: gpu.power / gpu.total, opex: gpu.opex / gpu.total },
      gpuVendorShare: 0.6,
      gpuVendorMargin: nvda?.margin ?? 0.75,
      vendorCogs: { memory: 0.45, foundry: 0.3, other: 0.25 },
    },
    labCompute,
    vendorMargin: nvda ? { value: nvda.margin, source: nvda.source, quarters: nvda.quarters } : { value: 0.75, source: market, quarters: "n/a" },
    cloudMargin: { value: 1 - gpu.total / market.value, price: market, ownCost: gpu.total },
    peers,
  };

  return (
    <>
      <section style={{ paddingBottom: 12 }}>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Value capture</div>
            <h1 className="sec-title" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>Where does $1 of AI spend go?</h1>
            <p className="sec-lede">
              Follow one dollar down the stack. Each layer keeps its margin and pays its suppliers, until every cent lands — with an app company, a model lab, a cloud,
              a chipmaker, a data centre or a power plant. Margins come from filings and market prices where possible (source chips); the rest are labelled
              assumptions you can move. <Link href="/calculators">Cost calculators</Link> · <Link href="/methodology#value-flow">Methodology</Link>.
            </p>
          </Reveal>
        </div>
      </section>
      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <ValueFlow src={src} />
        </div>
      </section>
    </>
  );
}
