import { describe, expect, it } from "vitest";
import { checkReferences, loadCatalog, type Catalog } from "../src/lib/catalog";
import { latest, resolve } from "../src/lib/resolver";
import { openDb, writeCatalog } from "../src/server/db";

const report = await loadCatalog();
const c = report.catalog;

describe("seed catalog", () => {
  it("parses and cross-references with zero errors", () => {
    expect(report.errors).toEqual([]);
  });

  it("covers every layer of the stack with at least one entity", () => {
    const layers = new Set(c.entities.flatMap((e) => e.layers));
    for (const l of ["L0", "L1", "L3", "L4", "L5"]) expect(layers).toContain(l);
  });

  it("resolves known facts the way the plan describes", () => {
    const facts = resolve(c.observations, c.sources);
    const cur = latest(facts);
    const find = (entity: string, metric: string) => [...cur.values()].find((f) => f.entity_id === entity && f.metric_id === metric);

    // Rumoured $40–50B rounds never displace the closed $12B round.
    expect(find("thinking_machines", "valuation")?.best.value).toBe(12e9);
    // Run-rate is a time series, not a conflict: latest period wins.
    expect(find("anthropic", "revenue_run_rate")?.period).toBe("2026-07");
    // Guidance revision supersedes the earlier figure.
    const alphabet = facts.find((f) => f.entity_id === "alphabet" && f.metric_id === "capex" && f.period === "2026");
    expect(alphabet?.best.value).toBe(190e9);
    expect(alphabet?.conflict).toBe(false);
    // Differently scoped 2026 hyperscaler totals surface as a conflict.
    expect(facts.find((f) => f.entity_id === "hyperscalers" && f.period === "2026")?.conflict).toBe(true);
  });
});

describe("checkReferences", () => {
  const base: Catalog = { ...c };
  it("rejects a monetary observation without a currency and a dim the metric doesn't allow", () => {
    const bad = { ...c.observations[0]!, id: "bad_obs", metric_id: "capex", entity_id: "alphabet", currency: undefined, dims: { color: "red" } };
    const { errors } = checkReferences({ ...base, observations: [...c.observations, bad] });
    expect(errors.some((e) => e.includes("bad_obs") && e.includes("currency required"))).toBe(true);
    expect(errors.some((e) => e.includes("bad_obs") && e.includes('dim "color"'))).toBe(true);
  });

  it("rejects dangling entity references and duplicate ids", () => {
    const dup = { ...c.observations[0]! };
    const dangling = { ...c.observations[0]!, id: "dangling", entity_id: "nobody" };
    const { errors } = checkReferences({ ...base, observations: [...c.observations, dup, dangling] });
    expect(errors.some((e) => e.includes("duplicate id"))).toBe(true);
    expect(errors.some((e) => e.includes("unknown entity nobody"))).toBe(true);
  });
});

describe("database", () => {
  it("round-trips the catalog and is idempotent", async () => {
    const db = await openDb(":memory:");
    writeCatalog(db, c);
    writeCatalog(db, c);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM observations").get() as { n: number }).n;
    expect(n).toBe(c.observations.length);
    const row = db.prepare("SELECT dims, dims_key FROM observations WHERE id = 'h100_aws_od'").get() as { dims: string; dims_key: string };
    expect(JSON.parse(row.dims)).toEqual({ provider: "aws", contract: "on_demand" });
    expect(row.dims_key).toBe("contract=on_demand,provider=aws");
    db.close();
  });
});
