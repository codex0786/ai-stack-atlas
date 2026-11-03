import type { Metadata } from "next";
import Link from "next/link";
import { ExecDashboard } from "@/components/ExecDashboard";
import { Freshness } from "@/components/Freshness";
import { Reveal } from "@/components/motion";
import type { CatalogModel } from "@/lib/models";
import { feedStatuses, modelCatalog } from "@/lib/site";
import { USE_CASES } from "@/lib/usecases";

export const metadata: Metadata = {
  title: "Executive model dashboard",
  description: "Which AI model should we use? Every priced model compared on capability, cost and fit for nine business problems, with a recommendation for each.",
};

const blended = (m: CatalogModel) => (3 * m.price.input + m.price.output) / 4;
const $ = (x: number) => `$${x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(2) : x.toFixed(0)}`;

export default async function DashboardPage() {
  const catalog = modelCatalog();
  const status = (await feedStatuses()).models;
  if (!catalog) {
    return <section><div className="wrap"><h1 className="sec-title">Executive model dashboard</h1><p className="sec-lede">The model catalog hasn&apos;t been built yet — it appears after the first scheduled data run.</p></div></section>;
  }
  const ms = catalog.models;
  const leader = ms[0]!;
  const nearLeader = ms.filter((m) => m.eci >= leader.eci - 2).sort((a, b) => blended(a) - blended(b))[0]!;
  const openLeader = ms.find((m) => m.openWeights);
  const frontierClass = ms.filter((m) => m.eci >= leader.eci - 5).map(blended).sort((a, b) => a - b);

  const kpis = [
    { label: "Models compared", value: String(ms.length), ctx: `${ms.filter((m) => m.openWeights).length} open-weight · every priced model Epoch AI has benchmarked` },
    { label: "Most capable", value: leader.name, ctx: `Capability ${leader.eci.toFixed(1)} · ${$(leader.price.input)} in / ${$(leader.price.output)} out per M tokens` },
    { label: "Near-top capability for less", value: nearLeader.name, ctx: nearLeader.id === leader.id ? "The leader is also the cheapest near the top" : `Within 2 points of the leader at ${Math.round(blended(leader) / blended(nearLeader))}× lower price` },
    openLeader && { label: "Best open-weight model", value: openLeader.name, ctx: `Capability ${openLeader.eci.toFixed(1)} · ${(leader.eci - openLeader.eci).toFixed(1)} points behind the leader` },
    { label: "Price spread at the frontier", value: `${Math.round(frontierClass.at(-1)! / frontierClass[0]!)}×`, ctx: `Models within 5 points of the top cost ${$(frontierClass[0]!)}–${$(frontierClass.at(-1)!)} per M tokens (blended)` },
  ].filter(Boolean) as { label: string; value: string; ctx: string }[];

  return (
    <>
      <section style={{ paddingBottom: 12 }}>
        <div className="wrap">
          <Reveal>
            <div className="eyebrow">Executive dashboard</div>
            <h1 className="sec-title" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>Which AI model should we use?</h1>
            <p className="sec-lede">
              Every priced model compared on capability, cost and fit, with a recommendation for nine common business problems. Prices are today&apos;s list prices;
              quality comes from independent benchmarks. Change the problem or your monthly volume and the numbers update.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
              {status && <Freshness at={status.lastSuccess} tried={status.lastRun} cadenceHours={status.cadenceHours} ok={status.ok} label="Prices updated" />}
              <span className="small muted">Benchmarks to {catalog.benchmarksAsOf} · <Link href="/methodology#dashboard">How the scoring works</Link> · <a href="/data/models.csv" download>Download all models (CSV)</a></span>
            </div>
          </Reveal>
          <div className="tiles" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {kpis.map((k, i) => (
              <Reveal key={k.label} delay={i * 0.05}>
                <div className="card tile" style={{ minHeight: 130 }}>
                  <span className="label">{k.label}</span>
                  <span className="value" style={{ fontSize: k.value.length > 14 ? 22 : 30 }}>{k.value}</span>
                  <span className="ctx">{k.ctx}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <ExecDashboard catalog={catalog} useCases={USE_CASES} />
      <section>
        <div className="wrap prose">
          <h2>Read this before deciding</h2>
          <ul>
            <li><b>List prices, not your contract.</b> Enterprise discounts, committed-use deals and your prompt lengths change the totals; the ranking usually holds.</li>
            <li><b>Benchmarks are a shortlist tool.</b> Pick two or three models from the shortlist and run them on a few hundred of your own tasks before committing.</li>
            <li><b>Quality scores are relative.</b> 100 is the best model in the catalog on this blend; a 90 is close, a 70 is noticeably weaker.</li>
            <li><b>Not covered yet:</b> latency, rate limits, data-residency terms and fine-tuning options. Check these with the vendor.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
