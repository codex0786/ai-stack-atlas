import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { ValueFlow, type FlowSources } from "@/components/ValueFlow";
import { flowDefaults, ttmMargin } from "@/lib/flowDefaults";
import { getSite } from "@/lib/site";

export const metadata: Metadata = {
  title: "Where $1 of AI spend goes",
  description: "Follow one dollar of AI spending down the stack — apps, model labs, clouds, chips, data centres and energy — and see who keeps each cent.",
};

export default async function ValueFlowPage() {
  const site = await getSite();
  const { inputs, gpu, market, labCompute, nvda } = flowDefaults(site);
  const peers = ([["NVIDIA", "nvidia"], ["Broadcom", "broadcom"], ["AMD", "amd"], ["Microsoft", "microsoft"], ["Alphabet", "alphabet"], ["Amazon", "amazon"], ["Meta", "meta"], ["CoreWeave", "coreweave"]] as const)
    .map(([name, e]) => ({ name, ...ttmMargin(site, e)! }))
    .filter((p) => p.source);

  const src: FlowSources = {
    defaults: inputs,
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
