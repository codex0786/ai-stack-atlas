import type { Observation, Source } from "../lib/schema";

// A feed pulls one external source and turns it into observations in the atlas schema.
// `fetch` does the network I/O; `parse` is pure so tests can run it on fixtures.

export interface FeedOutput {
  sources: Source[];
  observations: Observation[];
  /** Side files written to data/<name>.json (e.g. the model catalog), replaced when their content changes. */
  artifacts?: Record<string, { models?: unknown[]; generated?: string }>;
}

export interface Feed {
  id: string;
  name: string;
  /** How often the upstream data changes; drives the freshness badge and stale check. */
  cadenceHours: number;
  /**
   * "replace": each run returns the full history (EDGAR re-reads all filings).
   * "append": each run returns only recent periods; older ones are kept from earlier runs.
   */
  mode: "replace" | "append";
  homepage: string;
  run(ctx: FeedContext): Promise<FeedOutput>;
}

export interface FeedContext {
  /** Today's date (YYYY-MM-DD, UTC); injected so tests are deterministic. */
  today: string;
  env: Record<string, string | undefined>;
}

/** On-disk shape of data/feeds/<id>.json. */
export interface FeedFile {
  feed: string;
  updated: string;
  sources: Source[];
  observations: Observation[];
}

export interface FeedStatus {
  name: string;
  cadenceHours: number;
  homepage: string;
  lastRun: string;
  lastSuccess?: string;
  ok: boolean;
  error?: string;
  observations: number;
  /** What `observations` counts, when it isn't sourced numbers (e.g. "models"). */
  unit?: string;
}

export interface Revision { id: string; series: string; period: string; from: number; to: number }

export interface Anomaly { id: string; series: string; period: string; previous: number; next: number; change: number; reason: string }

export interface ChangelogEntry {
  at: string;
  kind: "ingest" | "release";
  title: string;
  feeds?: { feed: string; ok: boolean; added: number; revised: number; error?: string }[];
  revisions?: Revision[];
  anomalies?: Anomaly[];
  notes?: string[];
}
