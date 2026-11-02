import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { checkReferences, loadCatalog } from "../lib/catalog";
import type { Observation, Source } from "../lib/schema";
import { compareRuns } from "./anomaly";
import { edgarFeed } from "./edgar";
import { eiaFeed } from "./eia";
import { redact } from "./http";
import { openrouterFeed } from "./openrouter";
import type { Anomaly, ChangelogEntry, Feed, FeedFile, FeedOutput, FeedStatus, Revision } from "./types";

export const FEEDS: Feed[] = [edgarFeed, openrouterFeed, eiaFeed];

const MAX_CHANGELOG = 300;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return fallback; }
}
const write = (file: string, data: unknown) => writeFile(file, `${JSON.stringify(data, null, 1)}\n`);

/** Merge one run into a feed's file. Append mode keeps periods the new run didn't return. */
export function mergeFeed(prev: FeedFile | undefined, out: FeedOutput, feed: Feed, now: string): FeedFile {
  const observations = new Map<string, Observation>(feed.mode === "append" ? (prev?.observations ?? []).map((o) => [o.id, o]) : []);
  for (const o of out.observations) observations.set(o.id, o);
  const used = new Set([...observations.values()].map((o) => o.source_id));
  const sources = new Map<string, Source>((prev?.sources ?? []).map((s) => [s.id, s]));
  for (const s of out.sources) sources.set(s.id, s);
  return {
    feed: feed.id, updated: now,
    sources: [...sources.values()].filter((s) => used.has(s.id)).sort((a, b) => a.id.localeCompare(b.id)),
    observations: [...observations.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export interface RunReport { entry: ChangelogEntry | null; anomalies: Anomaly[]; statuses: Record<string, FeedStatus>; changed: boolean }

export async function runFeeds(opts: { dataDir: string; only?: string[]; today?: string; now?: string; env?: Record<string, string | undefined> }): Promise<RunReport> {
  const now = opts.now ?? new Date().toISOString();
  const today = opts.today ?? now.slice(0, 10);
  const env = opts.env ?? process.env;
  const feedDir = path.join(opts.dataDir, "feeds");
  await mkdir(feedDir, { recursive: true });

  const before = await loadCatalog(opts.dataDir);
  if (before.errors.length) throw new Error(`Catalog invalid before ingest:\n${before.errors.join("\n")}`);
  const metrics = new Map(before.catalog.metrics.map((m) => [m.id, m]));
  const known = new Set(before.catalog.entities.map((e) => e.id));

  const statusFile = path.join(feedDir, "status.json");
  const statuses = await readJson<Record<string, FeedStatus>>(statusFile, {});
  const feedSummaries: NonNullable<ChangelogEntry["feeds"]> = [];
  const revisions: Revision[] = [];
  const anomalies: Anomaly[] = [];
  let changed = false;

  for (const feed of FEEDS.filter((f) => !opts.only?.length || opts.only.includes(f.id))) {
    const file = path.join(feedDir, `${feed.id}.json`);
    const prev = await readJson<FeedFile | undefined>(file, undefined);
    const status: FeedStatus = { name: feed.name, cadenceHours: feed.cadenceHours, homepage: feed.homepage, lastRun: now, lastSuccess: statuses[feed.id]?.lastSuccess, ok: false, observations: prev?.observations.length ?? 0 };
    try {
      const out = await feed.run({ today, env });
      // Drop anything pointing at an entity the atlas doesn't know, rather than failing the run.
      out.observations = out.observations.filter((o) => known.has(o.entity_id));
      const merged = mergeFeed(prev, out, feed, now);
      // Validate the merged file against the rest of the catalog before writing it.
      const prevIds = new Set((prev?.observations ?? []).map((o) => o.id));
      const prevSourceIds = new Set((prev?.sources ?? []).map((s) => s.id));
      const others = before.catalog.observations.filter((o) => !prevIds.has(o.id));
      const otherSources = before.catalog.sources.filter((s) => !prevSourceIds.has(s.id));
      const check = checkReferences({ ...before.catalog, sources: [...otherSources, ...merged.sources], observations: [...others, ...merged.observations] });
      if (check.errors.length) throw new Error(`validation: ${check.errors.slice(0, 5).join("; ")}`);

      const diff = compareRuns(prev?.observations ?? [], merged.observations, metrics);
      const mergedIds = new Set(merged.observations.map((o) => o.id));
      const removed = [...prevIds].filter((id) => !mergedIds.has(id)).length;
      revisions.push(...diff.revisions);
      anomalies.push(...diff.anomalies.map((a) => ({ ...a, reason: `[${feed.id}] ${a.reason}` })));
      const dataChanged = diff.added.length > 0 || diff.revisions.length > 0 || removed > 0;
      if (dataChanged) {
        await write(file, merged);
        changed = true;
      }
      feedSummaries.push({ feed: feed.id, ok: true, added: diff.added.length, revised: diff.revisions.length });
      Object.assign(status, { ok: true, lastSuccess: now, observations: merged.observations.length });
    } catch (err) {
      const msg = redact((err as Error).message).slice(0, 300);
      status.error = msg;
      feedSummaries.push({ feed: feed.id, ok: false, added: 0, revised: 0, error: msg });
    }
    statuses[feed.id] = status;
  }

  await write(statusFile, statuses);
  await write(path.join(feedDir, "anomalies.json"), anomalies);

  let entry: ChangelogEntry | null = null;
  if (changed || feedSummaries.some((f) => !f.ok)) {
    entry = {
      at: now, kind: "ingest",
      title: `Data update: ${feedSummaries.filter((f) => f.ok && (f.added || f.revised)).map((f) => `${f.feed} +${f.added}${f.revised ? ` (${f.revised} revised)` : ""}`).join(", ") || "no new values"}`,
      feeds: feedSummaries, revisions: revisions.slice(0, 100), anomalies,
    };
    const logFile = path.join(opts.dataDir, "changelog.json");
    const log = await readJson<ChangelogEntry[]>(logFile, []);
    await write(logFile, [entry, ...log].slice(0, MAX_CHANGELOG));
  }
  return { entry, anomalies, statuses, changed };
}
