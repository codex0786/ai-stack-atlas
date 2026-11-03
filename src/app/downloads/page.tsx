import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { REPO } from "@/lib/constants";
import { buildDownloads, citation, LICENSE } from "@/lib/downloads";
import { datasetVersion, getSite } from "@/lib/site";

export const metadata: Metadata = { title: "Downloads" };

const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default async function DownloadsPage() {
  const site = await getSite();
  const files = buildDownloads(site);
  const v = datasetVersion();
  return (
    <section>
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">Open data</div>
          <h1 className="sec-title">Downloads</h1>
          <p className="sec-lede">
            Everything on this site, as files. Rebuilt with every data update; the version is the build date and commit, so a citation always points at an exact snapshot in the{" "}
            <a href={REPO} target="_blank" rel="noopener noreferrer">public repository</a>.
          </p>
        </Reveal>

        <Reveal>
          <div className="card table-scroll" style={{ marginTop: 24 }}>
            <table>
              <thead><tr><th>File</th><th>What it contains</th><th>Rows</th><th>Size</th></tr></thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.file}>
                    <td className="num"><a href={`/data/${f.file}`} download>{f.file}</a></td>
                    <td>{f.description}</td>
                    <td className="num">{f.rows.toLocaleString("en-US")}</td>
                    <td className="num">{size(Buffer.byteLength(f.body))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <div className="prose">
          <h2>Version</h2>
          <p>Dataset <code>{v.date}</code>, commit <code>{v.commit}</code>. Every change to the data is a commit; see the <Link href="/changelog">changelog</Link> for what changed and when.</p>

          <p>
            Every Monday a frozen snapshot is published as a{" "}
            <a href={`${REPO}/releases`} target="_blank" rel="noopener noreferrer">GitHub Release</a> (tagged <code>data-YYYY.MM.DD</code>) with all files attached — cite a release when you need a version that never changes.
            The repository also carries a <a href={`${REPO}/blob/main/CITATION.cff`} target="_blank" rel="noopener noreferrer">CITATION.cff</a>, so GitHub shows a &ldquo;Cite this repository&rdquo; button.
          </p>

          <h2>How to cite</h2>
          <pre className="code">{citation(v)}</pre>

          <h2>License</h2>
          <p>
            The compiled dataset is released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">{LICENSE}</a>: reuse it freely with attribution.
            Individual figures remain subject to their original publishers&apos; terms — each row links to its source. SEC EDGAR and EIA data are US government works in the public domain;
            OpenRouter figures are aggregates of its public price list. Code is MIT-licensed.
          </p>

          <h2>Programmatic access</h2>
          <p>The files are static and served from stable URLs, so you can read them directly:</p>
          <pre className="code">{`curl -sL ${"https://ai-stack-atlas-bay.vercel.app"}/data/current.json\ncurl -sL ${"https://ai-stack-atlas-bay.vercel.app"}/data/observations.csv -o atlas.csv`}</pre>
          <p>Field definitions are in <a href="/data/metrics.json">metrics.json</a> and on the <Link href="/methodology">methodology</Link> page.</p>
        </div>
      </div>
    </section>
  );
}
