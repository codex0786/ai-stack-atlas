import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Catalog } from "../lib/catalog";
import { dimsKey } from "../lib/resolver";

// System of record: SQLite through Node's built-in `node:sqlite` (a file on disk, no native
// modules). Same dialect as libSQL/Turso, so a hosted driver can slot in later as FrontierIQ does.
// The seed files are the source of truth; `writeCatalog` rebuilds the tables from them.

export const DB_FILE = path.resolve(import.meta.dirname, "../../data/atlas.db");

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, name TEXT NOT NULL, layer TEXT NOT NULL, unit TEXT NOT NULL, monetary INTEGER NOT NULL, kind TEXT NOT NULL, definition TEXT NOT NULL, caveats TEXT, formula TEXT, dims TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, title TEXT NOT NULL, publisher TEXT NOT NULL, url TEXT NOT NULL, tier INTEGER NOT NULL, kind TEXT NOT NULL, published TEXT, accessed TEXT NOT NULL, verified INTEGER NOT NULL, note TEXT);
   CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, layers TEXT NOT NULL, segments TEXT NOT NULL, country TEXT, note TEXT);
   CREATE TABLE IF NOT EXISTS edges (from_id TEXT NOT NULL REFERENCES entities(id), to_id TEXT NOT NULL REFERENCES entities(id), kind TEXT NOT NULL, value REAL, currency TEXT, period TEXT, source_id TEXT REFERENCES sources(id), note TEXT);
   CREATE INDEX IF NOT EXISTS edges_from ON edges(from_id);
   CREATE INDEX IF NOT EXISTS edges_to ON edges(to_id);
   CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), metric_id TEXT NOT NULL REFERENCES metrics(id), value REAL NOT NULL, low REAL, high REAL, currency TEXT, dims TEXT NOT NULL, dims_key TEXT NOT NULL, period TEXT NOT NULL, period_type TEXT NOT NULL, status TEXT NOT NULL, method TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id), published TEXT NOT NULL, confidence REAL NOT NULL, supersedes TEXT, note TEXT);
   CREATE INDEX IF NOT EXISTS obs_series ON observations(entity_id, metric_id, dims_key, period);`,
];

export async function openDb(file = DB_FILE): Promise<DatabaseSync> {
  const { DatabaseSync } = await import("node:sqlite");
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)");
  const row = db.prepare("SELECT v FROM schema_version").get() as { v: number } | undefined;
  for (let i = row?.v ?? 0; i < MIGRATIONS.length; i++) db.exec(MIGRATIONS[i]!);
  if (!row) db.prepare("INSERT INTO schema_version (v) VALUES (?)").run(MIGRATIONS.length);
  else db.prepare("UPDATE schema_version SET v = ?").run(MIGRATIONS.length);
  return db;
}

const json = (v: unknown) => JSON.stringify(v);
const opt = <T>(v: T | undefined) => (v === undefined ? null : v);

/** Replace the whole fact base with the catalog, atomically. */
export function writeCatalog(db: DatabaseSync, c: Catalog): void {
  db.exec("BEGIN");
  try {
    for (const t of ["observations", "edges", "entities", "sources", "metrics"]) db.exec(`DELETE FROM ${t}`);
    const m = db.prepare("INSERT INTO metrics VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const x of c.metrics) m.run(x.id, x.name, x.layer, x.unit, x.monetary ? 1 : 0, x.kind, x.definition, opt(x.caveats), opt(x.formula), json(x.dims));
    const s = db.prepare("INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const x of c.sources) s.run(x.id, x.title, x.publisher, x.url, x.tier, x.kind, opt(x.published), x.accessed, x.verified ? 1 : 0, opt(x.note));
    const e = db.prepare("INSERT INTO entities VALUES (?,?,?,?,?,?,?)");
    for (const x of c.entities) e.run(x.id, x.name, x.kind, json(x.layers), json(x.segments), opt(x.country), opt(x.note));
    const g = db.prepare("INSERT INTO edges VALUES (?,?,?,?,?,?,?,?)");
    for (const x of c.edges) g.run(x.from, x.to, x.kind, opt(x.value), opt(x.currency), opt(x.period), opt(x.source_id), opt(x.note));
    const o = db.prepare("INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    for (const x of c.observations) {
      o.run(x.id, x.entity_id, x.metric_id, x.value, opt(x.low), opt(x.high), opt(x.currency), json(x.dims), dimsKey(x.dims), x.period, x.period_type, x.status, x.method, x.source_id, x.published, x.confidence, opt(x.supersedes), opt(x.note));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
