import type { Observation, Source } from "../lib/schema";
import { parseCsv } from "./csv";
import { fetchText } from "./http";
import type { Feed, FeedOutput } from "./types";

// Epoch AI's "large-scale AI models" dataset (models trained with >10^23 FLOP, CC BY).
// Recorded: the largest run released each year, a fitted growth rate for frontier compute,
// open- vs closed-weight releases per year, and each lab's record-setting training runs.

export const EPOCH_CSV = "https://epoch.ai/data/large_scale_ai_models.csv";

/** Atlas entity → organisation names as Epoch writes them. */
export const LAB_ORGS: Record<string, string[]> = {
  openai: ["OpenAI"], anthropic: ["Anthropic"], alphabet: ["Google DeepMind", "Google", "Google Research", "DeepMind", "Google Brain"],
  meta: ["Meta AI", "Meta", "Facebook AI Research"], xai: ["xAI"], deepseek: ["DeepSeek"], alibaba: ["Alibaba"], mistral: ["Mistral AI"],
  moonshot: ["Moonshot"], minimax: ["MiniMax"], nvidia: ["Nvidia", "NVIDIA"], microsoft: ["Microsoft"], amazon: ["Amazon"],
};

export const EPOCH_SOURCE = (today: string): Source => ({
  id: "epoch_large_scale_models", title: "Epoch AI — Large-Scale AI Models dataset", publisher: "Epoch AI", url: EPOCH_CSV,
  tier: 1, kind: "research", accessed: today, verified: true, automated: true, note: "CC BY 4.0, Epoch AI. Compute figures are Epoch's estimates.",
});

interface Model { name: string; orgs: string[]; date: string; flop: number; open: boolean | undefined }

export function toModels(rows: Record<string, string>[]): Model[] {
  return rows
    .map((r) => {
      const access = r["Model accessibility"] ?? "";
      return {
        name: r.Model ?? "", orgs: (r.Organization ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        date: r["Publication date"] ?? "", flop: Number(r["Training compute (FLOP)"]),
        open: access ? access.startsWith("Open weights") : undefined,
      };
    })
    .filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date) && m.name);
}

/** Least-squares slope of y on x. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i]! - mx) * (ys[i]! - my); den += (xs[i]! - mx) ** 2; }
  return num / den;
}

const yearFrac = (d: string) => { const t = Date.parse(d); const y = new Date(t).getUTCFullYear(); return y + (t - Date.UTC(y, 0, 1)) / (365.25 * 86_400_000); };

export function parseEpoch(rows: Record<string, string>[], today: string): FeedOutput {
  const models = toModels(rows);
  const withFlop = models.filter((m) => m.flop > 0).sort((a, b) => a.date.localeCompare(b.date));
  const base = { source_id: "epoch_large_scale_models", status: "actual" as const, published: today };
  const out: Observation[] = [];
  const thisYear = today.slice(0, 4);

  // Largest run released each year.
  const byYear = new Map<string, Model>();
  for (const m of withFlop) { const y = m.date.slice(0, 4); if (!byYear.has(y) || m.flop > byYear.get(y)!.flop) byYear.set(y, m); }
  for (const [y, m] of byYear) {
    if (y < "2020") continue;
    out.push({ ...base, id: `epoch_largest_${y}`, entity_id: "frontier_models", metric_id: "training_compute", value: m.flop, dims: { scope: "largest_released_in_year" },
      period: y, period_type: "annual", method: "estimated", confidence: 0.8, note: `${m.name} (${m.orgs.join(", ")}), released ${m.date}${y === thisYear ? "; year to date" : ""}.` });
  }

  // Growth of frontier compute: models in the running top 10 at release, since 2020.
  const frontier: Model[] = [];
  const seen: number[] = [];
  for (const m of withFlop) {
    seen.push(m.flop);
    const tenth = [...seen].sort((a, b) => b - a)[Math.min(9, seen.length - 1)]!;
    if (m.date >= "2020-01-01" && m.flop >= tenth) frontier.push(m);
  }
  if (frontier.length >= 10) {
    const growth = 10 ** slope(frontier.map((m) => yearFrac(m.date)), frontier.map((m) => Math.log10(m.flop)));
    out.push({ ...base, id: `epoch_growth_fit_${thisYear}`, entity_id: "frontier_models", metric_id: "training_compute_growth", value: Number(growth.toFixed(2)),
      dims: { basis: "atlas_fit_top10_since_2020" }, period: thisYear, period_type: "trend", method: "derived", confidence: 0.7,
      note: `Log-linear fit over ${frontier.length} models that were in the top 10 by training compute when released (2020 to ${today}).` });
  }

  // Releases per year by weight access.
  const counts = new Map<string, { open: number; closed: number }>();
  for (const m of models) {
    if (m.open === undefined || m.date < "2020") continue;
    const y = m.date.slice(0, 4);
    const c = counts.get(y) ?? { open: 0, closed: 0 };
    if (m.open) c.open++; else c.closed++;
    counts.set(y, c);
  }
  for (const [y, c] of counts) {
    for (const access of ["open_weights", "closed"] as const) {
      out.push({ ...base, id: `epoch_releases_${access}_${y}`, entity_id: "frontier_models", metric_id: "large_models_released", value: access === "open_weights" ? c.open : c.closed,
        dims: { access }, period: y, period_type: "annual", method: "derived", confidence: 0.85,
        note: `Models above 10^23 FLOP${y === thisYear ? "; year to date" : ""}. Open = open weights (any license).` });
    }
  }

  // Each lab's record-setting runs (a new observation each time a lab beats its own record).
  for (const [entity, names] of Object.entries(LAB_ORGS)) {
    let best = 0;
    for (const m of withFlop) {
      if (!m.orgs.some((o) => names.includes(o)) || m.flop <= best) continue;
      best = m.flop;
      out.push({ ...base, id: `epoch_${entity}_record_${m.date.slice(0, 7).replace("-", "_")}`, entity_id: entity, metric_id: "training_compute", value: m.flop,
        dims: { scope: "lab_record" }, period: m.date.slice(0, 7), period_type: "point", method: "estimated", confidence: 0.8, note: `${m.name}, released ${m.date}.` });
    }
  }
  // Two records in one month keep the larger.
  const unique = new Map<string, Observation>();
  for (const o of out) if (!unique.has(o.id) || o.value > unique.get(o.id)!.value) unique.set(o.id, o);
  return { sources: [EPOCH_SOURCE(today)], observations: [...unique.values()] };
}

export const epochFeed: Feed = {
  id: "epoch",
  name: "Epoch AI model compute",
  cadenceHours: 168,
  mode: "replace",
  homepage: "https://epoch.ai/data",
  async run({ today }) {
    const rows = parseCsv(await fetchText(EPOCH_CSV));
    if (rows.length < 100) throw new Error(`Unexpected Epoch CSV (${rows.length} rows)`);
    return parseEpoch(rows, today);
  },
};
