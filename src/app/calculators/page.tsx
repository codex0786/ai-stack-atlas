import type { Metadata } from "next";
import Link from "next/link";
import { Calculators, type CalcSources } from "@/components/Calculators";
import { Reveal } from "@/components/motion";
import { fmtPeriod } from "@/lib/format";
import { median } from "@/feeds/openrouter";
import { getSite, latestOf, modelCatalog, series } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cost calculators",
  description: "What a GPU-hour, a frontier training run, a million tokens and a GPU cluster's electricity really cost — with sourced defaults you can change.",
};

export default async function CalculatorsPage() {
  const site = await getSite();
  const o = site.obs;
  const vast = latestOf(site, "h100", "gpu_rental_price", { provider: "vast_ai", contract: "marketplace" });
  const largest = series(site, "frontier_models", "training_compute", { scope: "largest_released_in_year" });
  const preset = (year: string) => largest.find((c) => c.period === year);
  const catalog = modelCatalog();
  const openOut = catalog?.models.filter((m) => m.openWeights).map((m) => m.price.output) ?? [];

  const src: CalcSources = {
    tdp: o("h100_tdp"),
    peakBf16: o("h100_bf16_dense"),
    rentals: [
      { label: "AWS on-demand", c: o("h100_aws_od") },
      { label: "Market median (16 clouds)", c: o("h100_market_median") },
      ...(vast ? [{ label: "Vast.ai marketplace", c: vast }] : []),
    ],
    presets: [
      ...largest.slice(-1).map((c) => ({ label: `Largest ${c.period} run`, c })),
      ...(["2024", "2023", "2020"] as const).map((y) => preset(y)).filter((c) => !!c).map((c) => ({ label: `${c!.note?.split(" (")[0] ?? c!.period}`, c: c! })),
    ],
    dcTwh2024: o("iea_dc_twh_2024"),
    dcTwh2030: o("iea_dc_twh_2030"),
    openWeightOutputMedian: openOut.length ? { value: median(openOut), n: openOut.length, asOf: catalog!.pricesAsOf } : undefined,
  };

  return (
    <>
      <section style={{ paddingBottom: 12 }}>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Unit economics</div>
            <h1 className="sec-title" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>Cost calculators</h1>
            <p className="sec-lede">
              What a GPU-hour, a frontier training run, a million tokens and a cluster&apos;s electricity really cost. Inputs with a source chip come from the atlas
              (latest: H100 rentals {fmtPeriod(src.rentals.at(-1)!.c.period)}); inputs marked <span className="badge">assumption</span> are starting points — change them.
              The GPU-hour tab feeds the others. <Link href="/methodology">Methodology</Link>.
            </p>
          </Reveal>
        </div>
      </section>
      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Calculators src={src} />
        </div>
      </section>
    </>
  );
}
