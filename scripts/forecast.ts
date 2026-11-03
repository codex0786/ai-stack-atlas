/**
 * Update the forecast ledger: npm run forecast
 * Scores pending forecasts whose target has arrived, then logs new ones. Logged forecasts are
 * never edited — that is what makes the track record honest. Runs in the daily workflow after ingest.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, loadCatalog } from "../src/lib/catalog";
import { mergeLedger, proposeForecasts, scoreLedger, seriesFrom, type LoggedForecast } from "../src/lib/ledger";
import { resolve } from "../src/lib/resolver";

const file = path.join(DATA_DIR, "forecasts.json");
const today = new Date().toISOString().slice(0, 10);
const { catalog, errors } = await loadCatalog();
if (errors.length) throw new Error(`Catalog invalid:\n${errors.join("\n")}`);
const series = seriesFrom(resolve(catalog.observations, catalog.sources));
const metrics = new Map(catalog.metrics.map((m) => [m.id, m]));

const before: LoggedForecast[] = JSON.parse(await readFile(file, "utf8").catch(() => "[]"));
const scored = scoreLedger(before, series, today);
const ledger = mergeLedger(scored, proposeForecasts(series, today, (m) => ({ unit: metrics.get(m)?.unit ?? "", kind: metrics.get(m)?.kind ?? "level" })), today);
await writeFile(file, `${JSON.stringify(ledger, null, 1)}\n`);

const newlyScored = scored.filter((f, i) => f.status !== before[i]!.status);
console.log(`Ledger: ${ledger.length} forecasts (${ledger.filter((f) => f.status === "pending").length} pending, ${ledger.filter((f) => f.status === "hit").length} hit, ${ledger.filter((f) => f.status === "miss").length} miss)`);
for (const f of newlyScored) console.log(`  scored ${f.id}: ${f.status} (forecast ${f.mean.toPrecision(4)}, actual ${f.actual?.toPrecision(4)})`);
for (const f of ledger.slice(before.length)) console.log(`  new ${f.id}: ${f.mean.toPrecision(4)} [${f.lo.toPrecision(3)}–${f.hi.toPrecision(3)}]`);
