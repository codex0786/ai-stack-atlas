import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import { TIER_LABEL } from "@/lib/format";
import { getSite } from "@/lib/site";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage() {
  const site = await getSite();
  const uses = new Map<string, number>();
  for (const o of site.catalog.observations) uses.set(o.source_id, (uses.get(o.source_id) ?? 0) + 1);
  const sources = [...site.catalog.sources].sort((a, b) => a.tier - b.tier || Number(b.verified) - Number(a.verified) || (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0));

  return (
    <section>
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">Provenance</div>
          <h1 className="sec-title">Sources</h1>
          <p className="sec-lede">
            Every source behind the atlas. <b>Tier 1</b> is primary (filings, company statements, IEA/EIA, research organisations, datasheets);
            <b> tier 2</b> relays a primary source or is an established analyst; <b>tier 3</b> is secondary. <b>Verified</b> means the page was opened
            and the cited figures checked against it.
          </p>
        </Reveal>
        <Reveal>
          <div className="card table-scroll" style={{ marginTop: 24 }}>
            <table>
              <thead><tr><th>Source</th><th>Tier</th><th>Kind</th><th>Checked</th><th>Numbers</th><th>Published</th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title} ↗</a>
                      <div className="small muted">{s.publisher}{s.note ? ` — ${s.note}` : ""}</div>
                    </td>
                    <td className="num">T{s.tier} <span className="small muted">{TIER_LABEL[s.tier]}</span></td>
                    <td>{s.kind}</td>
                    <td>{s.verified ? <span style={{ color: "var(--good-ink)" }}>✓ Verified</span> : <span className="muted">○ Not yet</span>}</td>
                    <td className="num">{uses.get(s.id) ?? 0}</td>
                    <td className="num">{s.published ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
