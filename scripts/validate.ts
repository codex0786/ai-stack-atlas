/**
 * Fact-base health report: npm run validate [-- --as-of YYYY-MM-DD]
 * Schema and reference errors (exit 1 if any), warnings, source-conflicts, and how much of
 * the base rests on unverified or low-tier sources.
 */
import { loadCatalog } from "../src/lib/catalog";
import { latest, resolve } from "../src/lib/resolver";

const asOfArg = process.argv.indexOf("--as-of");
const asOf = asOfArg > 0 ? process.argv[asOfArg + 1] : undefined;

const { catalog: c, errors, warnings } = await loadCatalog();
console.log(`Catalog: ${c.metrics.length} metrics · ${c.sources.length} sources · ${c.entities.length} entities · ${c.edges.length} edges · ${c.observations.length} observations${asOf ? ` · as of ${asOf}` : ""}\n`);

if (errors.length) {
  console.log(`ERRORS (${errors.length})\n  ${errors.join("\n  ")}\n`);
}
const unsourcedEdges = warnings.filter((w) => w.includes("structural edge")).length;
const otherWarnings = warnings.filter((w) => !w.includes("structural edge"));
console.log(`Warnings: ${unsourcedEdges} structural edge(s) without a source${otherWarnings.length ? `\n  ${otherWarnings.join("\n  ")}` : ""}\n`);

const sources = new Map(c.sources.map((s) => [s.id, s]));
const byTier = [1, 2, 3].map((t) => c.observations.filter((o) => sources.get(o.source_id)?.tier === t).length);
const unverified = c.observations.filter((o) => !sources.get(o.source_id)?.verified).length;
console.log(`Evidence: tier 1 ${byTier[0]} · tier 2 ${byTier[1]} · tier 3 ${byTier[2]} · from unverified sources ${unverified}/${c.observations.length}\n`);

const facts = resolve(c.observations, c.sources, { asOf });
const conflicts = facts.filter((f) => f.conflict);
console.log(`Facts: ${facts.length} · conflicts ${conflicts.length}`);
for (const f of conflicts) {
  console.log(`  ${f.entity_id}.${f.metric_id} ${f.period}: best ${f.best.value} (${f.best.source_id}), spread ${f.spread.min}–${f.spread.max} across ${f.candidates.length}`);
}

const current = latest(facts);
console.log(`\nCurrent values (latest actual per series): ${current.size}`);
for (const f of [...current.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  const dims = Object.entries(f.dims).map(([k, v]) => `${k}=${v}`).join(",");
  console.log(`  ${`${f.entity_id}.${f.metric_id}${dims ? `[${dims}]` : ""}`.padEnd(70)} ${String(f.best.value).padStart(12)} ${f.currency ?? ""}  @${f.period}  conf ${f.best.confidence}`);
}

if (errors.length) process.exit(1);
