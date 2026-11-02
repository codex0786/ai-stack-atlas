import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import { REPO } from "@/lib/constants";
import { changelog } from "@/lib/site";

export const metadata: Metadata = { title: "Changelog" };

const when = (iso: string) => new Date(iso).toUTCString().replace(/:\d\d GMT$/, " UTC").replace(/^\w+, /, "");

export default async function ChangelogPage() {
  const log = await changelog();
  return (
    <section>
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">What changed</div>
          <h1 className="sec-title">Changelog</h1>
          <p className="sec-lede">
            Every data update and release, newest first. The full history of every number is also in the{" "}
            <a href={`${REPO}/commits/main/data`} target="_blank" rel="noopener noreferrer">repository&apos;s commit log</a>.
          </p>
        </Reveal>
        <div className="log">
          {log.map((e, i) => (
            <Reveal key={`${e.at}-${i}`}>
              <div className={`log-item ${e.kind}`}>
                <div className="small muted">{when(e.at)} · {e.kind === "release" ? "Release" : "Data update"}</div>
                <h3 style={{ fontSize: 17, marginTop: 4 }}>{e.title}</h3>
                {e.notes && <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--ink-2)" }}>{e.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                {e.feeds && (
                  <div className="dims" style={{ marginTop: 8 }}>
                    {e.feeds.map((f) => (
                      <span key={f.feed} className={`badge ${f.ok ? "" : "warn"}`} title={f.error}>
                        {f.ok ? "✓" : "✗"} {f.feed}{f.ok ? ` +${f.added}${f.revised ? ` · ${f.revised} revised` : ""}` : " failed"}
                      </span>
                    ))}
                  </div>
                )}
                {!!e.anomalies?.length && (
                  <p className="small" style={{ marginTop: 8 }}><span className="badge warn">held for review</span> {e.anomalies.length} value{e.anomalies.length > 1 ? "s" : ""} flagged by the anomaly gate.</p>
                )}
                {!!e.revisions?.length && (
                  <details className="table">
                    <summary>{e.revisions.length} revision{e.revisions.length > 1 ? "s" : ""}</summary>
                    <div className="table-scroll">
                      <table>
                        <thead><tr><th>Series</th><th>Period</th><th>From</th><th>To</th></tr></thead>
                        <tbody>{e.revisions.map((r) => <tr key={r.id}><td>{r.series.split("|").slice(0, 2).join(" · ")}</td><td>{r.period}</td><td className="num">{r.from}</td><td className="num">{r.to}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
