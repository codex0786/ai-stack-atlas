/**
 * Rebuild data/atlas.db from data/metrics.yaml + data/seed/*.json: npm run seed
 * Refuses to write if the catalog has any validation error.
 */
import { loadCatalog } from "../src/lib/catalog";
import { DB_FILE, openDb, writeCatalog } from "../src/server/db";

const { catalog, errors, warnings } = await loadCatalog();
if (errors.length) {
  console.error(`${errors.length} error(s); database not written:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
const db = await openDb();
writeCatalog(db, catalog);
const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
console.log(`Wrote ${DB_FILE}`);
for (const t of ["metrics", "sources", "entities", "edges", "observations"]) console.log(`  ${t.padEnd(13)} ${count(t)}`);
if (warnings.length) console.log(`${warnings.length} warning(s) — run npm run validate for details`);
db.close();
