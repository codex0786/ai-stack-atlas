import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import { ExploreTable, type Row } from "@/components/ExploreTable";
import { LAYERS } from "@/lib/ontology";
import { getSite } from "@/lib/site";

export const metadata: Metadata = { title: "Explore" };

export default async function ExplorePage() {
  const site = await getSite();
  const rows: Row[] = site.catalog.observations.map((o) => {
    const e = site.entity(o.entity_id);
    const m = site.metric(o.metric_id);
    return {
      entityId: e.id, entity: e.name, layers: e.layers, metric: m.name, metricLayer: m.layer,
      dims: Object.entries(o.dims).map(([k, v]) => `${k}: ${v.replace(/_/g, " ")}`).join(" · "),
      c: site.cite(o),
    };
  });
  return (
    <section>
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">Explore</div>
          <h1 className="sec-title">Every number in the atlas</h1>
          <p className="sec-lede">All {rows.length} observations, including superseded figures, rumours and projections. Filter by layer, status or whether the source has been verified.</p>
        </Reveal>
        <ExploreTable rows={rows} layers={LAYERS.map((l) => ({ id: l.id, name: l.name }))} />
      </div>
    </section>
  );
}
