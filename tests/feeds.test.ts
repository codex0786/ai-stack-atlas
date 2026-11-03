import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compareRuns } from "../src/feeds/anomaly";
import { hyperscalerSum, parseCompanyFacts, quarterly, type CompanyFacts, type XbrlFact } from "../src/feeds/edgar";
import { parseEia, type EiaRow } from "../src/feeds/eia";
import { redact } from "../src/feeds/http";
import { median, parseModels } from "../src/feeds/openrouter";
import { FEEDS, mergeFeed, runFeeds } from "../src/feeds/run";
import type { Metric, Observation } from "../src/lib/schema";

const fact = (start: string | undefined, end: string, val: number, filed: string, accn = `0000-${end}`, form = "10-Q"): XbrlFact => ({ start, end, val, accn, form, filed });

describe("EDGAR quarters", () => {
  it("derives quarters from year-to-date cash-flow facts", () => {
    const q = quarterly([
      fact("2025-07-01", "2025-09-30", 19, "2025-10-29"),          // Q1 (3 months)
      fact("2025-07-01", "2025-12-31", 42, "2026-01-28"),          // 6-month YTD
      fact("2025-07-01", "2026-03-31", 70, "2026-04-29"),          // 9-month YTD
      fact("2025-07-01", "2026-06-30", 100, "2026-07-30", "k", "10-K"), // full year
    ]);
    expect(q.map((x) => [x.end, x.val, x.derived])).toEqual([
      ["2025-09-30", 19, false], ["2025-12-31", 23, true], ["2026-03-31", 28, true], ["2026-06-30", 30, true],
    ]);
  });

  it("keeps the first-filed value unless a later filing restates it", () => {
    const same = quarterly([fact("2025-01-01", "2025-03-31", 10, "2025-04-30"), fact("2025-01-01", "2025-03-31", 10, "2026-04-30")]);
    expect(same[0]!.fact.filed).toBe("2025-04-30");
    const restated = quarterly([fact("2025-01-01", "2025-03-31", 10, "2025-04-30"), fact("2025-01-01", "2025-03-31", 12, "2026-04-30")]);
    expect(restated[0]).toMatchObject({ val: 12, restated: true });
  });

  const facts: CompanyFacts = {
    cik: 789019, entityName: "MICROSOFT CORPORATION",
    facts: { "us-gaap": {
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fact("2025-07-01", "2025-09-30", 19.4e9, "2025-10-29", "0000950170-25-000001"), fact("2025-07-01", "2025-12-31", 42e9, "2026-01-28", "0000950170-26-000002"), fact("2019-07-01", "2019-09-30", 3e9, "2019-10-24")] } },
      LongTermDebtNoncurrent: { units: { USD: [fact(undefined, "2025-12-31", 40e9, "2026-01-28", "0000950170-26-000002")] } },
      SomethingElse: { units: { USD: [fact("2025-07-01", "2025-09-30", 1, "2025-10-29")] } },
    } },
  };

  it("emits cited observations per filing and ignores history before 2022", () => {
    const out = parseCompanyFacts({ ticker: "MSFT", entity: "microsoft" }, facts, "2026-11-03");
    const capex = out.observations.filter((o) => o.metric_id === "capex");
    expect(capex.map((o) => [o.period, o.value, o.method])).toEqual([["2025-09", 19.4e9, "reported"], ["2025-12", 22.6e9, "derived"]]);
    expect(capex[1]!.id).toBe("edgar_msft_capex_2025_12");
    expect(out.observations.find((o) => o.metric_id === "long_term_debt")?.period).toBe("2025-12");
    const src = out.sources.find((s) => s.id === capex[1]!.source_id)!;
    expect(src).toMatchObject({ tier: 1, kind: "filing", automated: true, url: "https://www.sec.gov/Archives/edgar/data/789019/000095017026000002/" });
  });

  it("sums big-four capex only for quarters where all four reported", () => {
    const o = (entity: string, period: string, value: number) => ({ id: `${entity}_${period}`, entity_id: entity, metric_id: "capex", value, period, published: "2026-01-30" }) as Observation;
    const sum = hyperscalerSum([o("microsoft", "2025-12", 1), o("alphabet", "2025-12", 2), o("amazon", "2025-12", 3), o("meta", "2025-12", 4), o("microsoft", "2026-03", 9)], "2026-11-03");
    expect(sum.observations.map((x) => [x.period, x.value])).toEqual([["2025-Q4", 10]]);
  });
});

describe("OpenRouter", () => {
  it("records medians in USD per million tokens, skipping free and variable-price models", () => {
    const out = parseModels([
      { id: "openai/a", pricing: { prompt: "0.000002", completion: "0.000008" } },
      { id: "openai/b", pricing: { prompt: "0.000004", completion: "0.000016" } },
      { id: "anthropic/c", pricing: { prompt: "0.000003", completion: "0.000015" } },
      { id: "meta-llama/free", pricing: { prompt: "0", completion: "0" } },
      { id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" } },
    ], "2026-11-03");
    const get = (id: string) => out.observations.find((o) => o.id === id)!;
    expect(get("or_models_listed_20261103").value).toBe(5);
    expect(get("or_openrouter_output_20261103")).toMatchObject({ value: 15, low: 8, high: 16, dims: { direction: "output" } });
    expect(get("or_openai_input_20261103")).toMatchObject({ value: 3, dims: { direction: "input", platform: "openrouter" } });
    expect(out.observations.some((o) => o.entity_id === "meta")).toBe(false);
    expect(median([1, 3, 2, 10])).toBe(2.5);
  });
});

describe("EIA", () => {
  const rows: EiaRow[] = [];
  const day = (d: Date) => d.toISOString().slice(0, 10);
  for (let i = 1; i <= 400; i++) {
    const d = new Date(Date.UTC(2026, 10, 3) - i * 86_400_000);
    const yearAgo = i > 300;
    rows.push({ period: day(d), respondent: "ERCO", type: "D", timezone: "Central", value: yearAgo ? 1_000_000 : 1_100_000 });
    rows.push({ period: day(d), respondent: "ERCO", type: "D", timezone: "Eastern", value: 1 });
  }
  rows.push({ period: "2026-11-03", respondent: "ERCO", type: "D", timezone: "Central", value: 5 }); // partial day

  it("records completed days in GWh and trailing-30-day YoY growth", () => {
    const out = parseEia(rows, "2026-11-03").observations;
    const demand = out.filter((o) => o.metric_id === "grid_demand");
    expect(demand).toHaveLength(14);
    expect(demand[0]).toMatchObject({ period: "2026-11-02", value: 1100 });
    expect(out.find((o) => o.metric_id === "electricity_load_growth")).toMatchObject({ value: 0.1, dims: { window: "trailing_30d" }, entity_id: "ercot" });
  });
});

describe("anomaly gate", () => {
  const metrics = new Map<string, Metric>([["llm_api_price_median", { kind: "price" } as Metric], ["electricity_load_growth", { kind: "growth" } as Metric]]);
  const o = (id: string, period: string, value: number, metric = "llm_api_price_median"): Observation =>
    ({ id, entity_id: "openrouter", metric_id: metric, value, currency: "USD", dims: {}, period, period_type: "point", status: "actual", method: "derived", source_id: "s", published: period, confidence: 1 });

  it("flags large period-over-period moves and revisions, passes normal ones", () => {
    const prev = [o("a1", "2026-11-01", 4)];
    expect(compareRuns(prev, [o("a2", "2026-11-02", 4.4)], metrics).anomalies).toHaveLength(0);
    expect(compareRuns(prev, [o("a2", "2026-11-02", 9)], metrics).anomalies[0]!.reason).toContain("+125.0%");
    const rev = compareRuns(prev, [o("a1", "2026-11-01", 4.4)], metrics);
    expect(rev.revisions).toHaveLength(1);
    expect(rev.anomalies[0]!.reason).toContain("revised");
  });

  it("uses absolute percentage points for growth metrics", () => {
    const prev = [o("g1", "2026-10-01", 0.03, "electricity_load_growth")];
    expect(compareRuns(prev, [o("g2", "2026-11-01", 0.06, "electricity_load_growth")], metrics).anomalies).toHaveLength(0);
    expect(compareRuns(prev, [o("g2", "2026-11-01", 0.2, "electricity_load_growth")], metrics).anomalies).toHaveLength(1);
  });

  it("raises nothing on a first run with no history", () => {
    expect(compareRuns([], [o("x", "2026-11-01", 999)], metrics).anomalies).toHaveLength(0);
  });
});

describe("runFeeds", () => {
  it("merges, records status and changelog, and survives a failing feed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atlas-"));
    await cp(path.resolve("data/metrics.yaml"), path.join(dir, "metrics.yaml"));
    await cp(path.resolve("data/seed"), path.join(dir, "seed"), { recursive: true });
    const or = FEEDS.find((f) => f.id === "openrouter")!;
    const eia = FEEDS.find((f) => f.id === "eia")!;
    const spyOr = vi.spyOn(or, "run").mockResolvedValue(parseModels([{ id: "openai/a", pricing: { prompt: "0.000002", completion: "0.000008" } }], "2026-11-03"));
    const spyEia = vi.spyOn(eia, "run").mockRejectedValue(new Error("HTTP 429 from https://api.eia.gov/x?api_key=SECRET123"));

    const r = await runFeeds({ dataDir: dir, only: ["openrouter", "eia"], now: "2026-11-03T02:00:00.000Z" });
    expect(r.changed).toBe(true);
    expect(r.statuses.openrouter).toMatchObject({ ok: true, lastSuccess: "2026-11-03T02:00:00.000Z" });
    expect(r.statuses.eia!.ok).toBe(false);
    expect(r.statuses.eia!.error).not.toContain("SECRET123");
    const file = JSON.parse(await readFile(path.join(dir, "feeds/openrouter.json"), "utf8"));
    expect(file.observations.length).toBe(5); // models listed + market and OpenAI medians (in/out)
    const log = JSON.parse(await readFile(path.join(dir, "changelog.json"), "utf8"));
    expect(log[0].title).toContain("openrouter +5");

    // A second day appends rather than replaces; a 10× price jump trips the gate.
    spyOr.mockResolvedValue(parseModels([{ id: "openai/a", pricing: { prompt: "0.00002", completion: "0.00008" } }], "2026-11-04"));
    const r2 = await runFeeds({ dataDir: dir, only: ["openrouter"], now: "2026-11-04T02:00:00.000Z" });
    const file2 = JSON.parse(await readFile(path.join(dir, "feeds/openrouter.json"), "utf8"));
    expect(file2.observations.length).toBe(10);
    expect(r2.anomalies.length).toBeGreaterThan(0);
    spyOr.mockRestore();
    spyEia.mockRestore();
  });

  it("append mode keeps earlier periods; replace mode does not", () => {
    const o = (id: string) => ({ id, source_id: "s" }) as Observation;
    const prev = { feed: "x", updated: "", sources: [{ id: "s" }] as never, observations: [o("old")] };
    expect(mergeFeed(prev, { sources: [], observations: [o("new")] }, { mode: "append", id: "x" } as never, "t").observations.map((x) => x.id)).toEqual(["new", "old"]);
    expect(mergeFeed(prev, { sources: [], observations: [o("new")] }, { mode: "replace", id: "x" } as never, "t").observations.map((x) => x.id)).toEqual(["new"]);
  });
});

describe("redact", () => {
  it("hides API keys", () => expect(redact("https://x?a=1&api_key=abc&b=2")).toBe("https://x?a=1&api_key=***&b=2"));
});


import { parseCsv } from "../src/feeds/csv";
import { parseEpoch } from "../src/feeds/epoch";
import { parseOffers } from "../src/feeds/vast";

describe("CSV", () => {
  it("handles quotes, commas and newlines inside fields", () => {
    expect(parseCsv('a,b\n"x, ""y""","line1\nline2"\n1,2\n')).toEqual([{ a: 'x, "y"', b: "line1\nline2" }, { a: "1", b: "2" }]);
  });
});

describe("Epoch", () => {
  const row = (Model: string, Organization: string, date: string, flop: number, access = "API access") =>
    ({ Model, Organization, "Publication date": date, "Training compute (FLOP)": String(flop), "Model accessibility": access });
  const rows = [
    ...Array.from({ length: 12 }, (_, i) => row(`M${i}`, "Lab X", `${2020 + Math.floor(i / 2)}-0${1 + (i % 2) * 5}-15`, 1e23 * 3 ** i, i % 3 ? "API access" : "Open weights (unrestricted)")),
    row("Big", "OpenAI", "2025-08-07", 5e26),
    row("Bigger", "OpenAI, Microsoft", "2026-09-03", 9.4e26),
    row("Small", "OpenAI", "2026-10-01", 1e24),
  ];
  const out = parseEpoch(rows, "2026-11-03").observations;

  it("records the largest run per year", () => {
    expect(out.find((o) => o.id === "epoch_largest_2026")).toMatchObject({ value: 9.4e26, dims: { scope: "largest_released_in_year" } });
  });
  it("records a lab's record runs only when it beats itself", () => {
    const records = out.filter((o) => o.entity_id === "openai").map((o) => o.period);
    expect(records).toEqual(["2025-08", "2026-09"]);
    expect(out.some((o) => o.entity_id === "microsoft" && o.value === 9.4e26)).toBe(true);
  });
  it("fits a growth rate and counts open vs closed releases", () => {
    const g = out.find((o) => o.metric_id === "training_compute_growth")!;
    expect(g.value).toBeGreaterThan(2);
    expect(out.find((o) => o.id === "epoch_releases_open_weights_2020")!.value).toBe(1);
  });
});

describe("Vast.ai", () => {
  it("takes the median per-GPU price and skips thin markets", () => {
    const offers = [1, 2, 3, 4, 100].map((p, i) => ({ gpu_name: "H100 SXM", num_gpus: i === 4 ? 1 : 2, dph_total: p * (i === 4 ? 1 : 2) }));
    expect(parseOffers({ name: "H100 SXM", entity: "h100" }, offers, "2026-11-03")).toMatchObject({ value: 3, low: 1, high: 4, dims: { provider: "vast_ai" } });
    expect(parseOffers({ name: "B200", entity: "b200" }, offers, "2026-11-03")).toBeUndefined();
  });
});
