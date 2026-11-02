import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeChart } from "@/components/charts";
import { Cite } from "@/components/Cite";
import { Reveal } from "@/components/motion";
import { fmt, fmtPeriod, STATUS_LABEL } from "@/lib/format";
import { LAYERS } from "@/lib/ontology";
import { entityView, getSite } from "@/lib/site";

export const dynamicParams = false;

export async function generateStaticParams() {
  const site = await getSite();
  return site.catalog.entities.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const site = await getSite();
  const e = site.catalog.entities.find((x) => x.id === id);
  return { title: e?.name ?? "Entity" };
}

const EDGE_LABEL: Record<string, [string, string]> = {
  supplies: ["Supplies", "Supplied by"],
  rents_compute_from: ["Rents compute from", "Rents compute to"],
  invests_in: ["Invests in", "Backed by"],
  hosts: ["Hosts", "Hosted by"],
  develops: ["Develops", "Developed by"],
  competes_with: ["Competes with", "Competes with"],
  trains_on: ["Trains on", "Used to train"],
  powered_by: ["Powered by", "Powers"],
  derived_from: ["Derived from", "Source of"],
};

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await getSite();
  if (!site.catalog.entities.some((e) => e.id === id)) notFound();
  const v = entityView(site, id);
  const layerName = (l: string) => LAYERS.find((x) => x.id === l)?.name ?? l;

  return (
    <section>
      <div className="wrap">
        <Reveal>
          <Link href="/#layers" className="small">← All layers</Link>
          <div className="eyebrow" style={{ marginTop: 18 }}>{v.entity.kind.replace("_", " ")}{v.entity.country ? ` · ${v.entity.country}` : ""}</div>
          <h1 className="sec-title" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>{v.entity.name}</h1>
          <div className="dims" style={{ marginTop: 12 }}>
            {v.entity.layers.map((l) => <span key={l} className="badge" style={{ background: `var(--${l.toLowerCase()})`, color: "#fff", borderColor: "transparent" }}>{l} · {layerName(l)}</span>)}
            {v.entity.segments.map((s) => <span key={s} className="badge">{s.replace("_", " ")}</span>)}
          </div>
          {v.entity.note && <p className="sec-lede">{v.entity.note}</p>}
        </Reveal>

        {v.series.length === 0 && (
          <div className="card series"><p className="muted">No sourced numbers yet — this entity arrives with the Phase 1 data ingest.</p></div>
        )}

        {v.series.map((s) => {
          const timeline = [...s.points].reverse();
          const chartable = timeline.length > 1 && s.metric.kind !== "spec";
          return (
            <Reveal key={s.key}>
              <div className="card series">
                <div className="series-head">
                  <h3 style={{ fontSize: 18 }}>{s.metric.name}</h3>
                  <div className="dims">{Object.entries(s.dims).map(([k, val]) => <span key={k} className="badge">{k}: {val.replace(/_/g, " ")}</span>)}</div>
                </div>
                <p className="small muted" style={{ marginTop: 4 }}>{s.metric.definition}{s.metric.caveats ? ` ${s.metric.caveats}` : ""}</p>
                {chartable && (
                  <div style={{ marginTop: 6 }}>
                    <TimeChart bare title={s.metric.name} series={[{ name: v.entity.name, color: "var(--s1)", points: timeline.map((p) => ({ c: p.best, hollow: !p.best.source.verified })) }]} />
                  </div>
                )}
                <div className="table-scroll" style={{ marginTop: 10 }}>
                  <table>
                    <thead><tr><th>Period</th><th>Value</th><th>Status</th><th>Source</th></tr></thead>
                    <tbody>
                      {s.points.map((p) => (
                        <tr key={p.best.id}>
                          <td>{fmtPeriod(p.period)}</td>
                          <td className="num">
                            <b>{fmt(p.best)}</b>
                            {p.best.low !== undefined && p.best.high !== undefined && <span className="muted"> ({fmt(p.best, p.best.low)}–{fmt(p.best, p.best.high)})</span>}
                            {p.others.length > 0 && (
                              <div className="small muted">also: {p.others.map((c) => `${fmt(c)} (${c.source.publisher})`).join("; ")}</div>
                            )}
                          </td>
                          <td>{STATUS_LABEL[p.best.status]}{p.conflict && <span className="badge warn" style={{ marginLeft: 6 }}>conflict</span>}</td>
                          <td><Cite c={p.best} />{p.best.note && <div className="small muted" style={{ marginTop: 4 }}>{p.best.note}</div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Reveal>
          );
        })}

        {v.links.length > 0 && (
          <Reveal>
            <div className="card series">
              <h3 style={{ fontSize: 18 }}>Relationships</h3>
              <p className="small muted" style={{ marginTop: 4 }}>Structural links; deal values are attached once a source is pinned.</p>
              <div className="links">
                {v.links.map((l, i) => (
                  <Link key={i} className="ent" href={`/entity/${l.other.id}`} title={l.note}>
                    <span className="seg">{EDGE_LABEL[l.kind]?.[l.dir === "out" ? 0 : 1] ?? l.kind}</span>{l.other.name}
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
