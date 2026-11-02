/**
 * Pull the live feeds into data/feeds/: npm run ingest [-- --only edgar,openrouter]
 * Writes each feed file, status.json, anomalies.json and a changelog entry. Exits 0 even when
 * a feed fails (its status records the error) so one broken upstream doesn't block the rest.
 * The workflow reads anomalies.json: non-empty → open a PR for review instead of pushing.
 */
import { DATA_DIR } from "../src/lib/catalog";
import { runFeeds } from "../src/feeds/run";

const i = process.argv.indexOf("--only");
const only = i > 0 ? process.argv[i + 1]?.split(",") : undefined;

const report = await runFeeds({ dataDir: DATA_DIR, only });
for (const [id, s] of Object.entries(report.statuses)) {
  console.log(`${s.ok ? "✓" : "✗"} ${id.padEnd(11)} ${s.ok ? `${s.observations} observations` : s.error}`);
}
console.log(report.entry ? `\n${report.entry.title}` : "\nNo data changes.");
if (report.anomalies.length) {
  console.log(`\n${report.anomalies.length} anomal${report.anomalies.length === 1 ? "y" : "ies"} — needs review:`);
  for (const a of report.anomalies) console.log(`  ${a.series} ${a.period}: ${a.previous} → ${a.next} ${a.reason}`);
}
