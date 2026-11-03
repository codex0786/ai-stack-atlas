import { describe, expect, it } from "vitest";
import { backtest, fitTrend, growthPerYear, predict, randomWalk, supplyChain, t90 } from "../src/lib/forecast";

describe("trend fits", () => {
  const exact = [0, 1, 2, 3, 4].map((t) => ({ t, y: 100 * 2 ** t })); // doubles every year

  it("recovers an exact exponential and predicts it with a zero-width interval", () => {
    const f = fitTrend(exact);
    expect(growthPerYear(f)).toBeCloseTo(2, 10);
    const p = predict(f, 5);
    expect(p.mean).toBeCloseTo(3200, 6);
    expect(p.hi - p.lo).toBeCloseTo(0, 6);
  });

  it("widens the interval with noise and with distance from the data", () => {
    const noisy = exact.map((p, i) => ({ t: p.t, y: p.y * (i % 2 ? 1.1 : 0.92) }));
    const f = fitTrend(noisy);
    const near = predict(f, 5), far = predict(f, 8);
    expect(near.lo).toBeLessThan(near.mean);
    expect(far.hi / far.lo).toBeGreaterThan(near.hi / near.lo);
  });

  it("uses Student-t critical values that shrink toward 1.645", () => {
    expect(t90(1)).toBeCloseTo(6.314, 3);
    expect(t90(10)).toBeCloseTo(1.812, 3);
    expect(t90(500)).toBe(1.645);
  });

  it("backtests on held-out points", () => {
    const b = backtest(exact, 2);
    expect(b.mape).toBeCloseTo(0, 6);
    expect(b.rows).toHaveLength(2);
  });
});

describe("random walk", () => {
  it("centres on the last value with an interval growing with √days", () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 * (i % 2 ? 1.01 : 0.99));
    const a = randomWalk(vals, 1), b = randomWalk(vals, 4);
    expect(a.mean).toBe(vals.at(-1));
    expect(Math.log(b.hi / b.mean)).toBeCloseTo(2 * Math.log(a.hi / a.mean), 6);
  });
  it("falls back to a default volatility when history is short", () => {
    expect(randomWalk([10, 11], 1).sd).toBe(0.02);
  });
});

describe("supply chain", () => {
  const base = {
    big4CapexTtm: 600e9, big4Share: 0.6, systemsShare: 0.5, costPerAccelerator: 50_000, capexGrowth: [0, 0, 0], cowosStart: 80_000, cowosGrowth: 0,
    acceleratorsPerWafer: 8, installedStart: 20e6, lifeYears: 4, kwPerAccelerator: 1.5, loadFactor: 0.7, startYear: 2026, years: 3,
  };
  it("deploys the lesser of spending-implied demand and packaging supply", () => {
    const [y] = supplyChain(base);
    expect(y!.demand).toBeCloseTo(10e6);            // $1T × 50% ÷ $50k
    expect(y!.supply).toBeCloseTo(80_000 * 12 * 8); // 7.68M
    expect(y!.deployed).toBe(y!.supply);
    expect(y!.binding).toBe("packaging");
  });
  it("retires old vintages and converts the fleet to GW and TWh", () => {
    const r = supplyChain({ ...base, cowosStart: 1e6 }); // supply never binds
    expect(r[0]!.binding).toBe("spending");
    expect(r[0]!.installed).toBeCloseTo(20e6 * 0.75 + 10e6); // one 5M vintage retired, 10M added
    expect(r[0]!.gw).toBeCloseTo((25e6 * 1.5) / 1e6);
    expect(r[0]!.twh).toBeCloseTo(r[0]!.gw * 0.7 * 8.76);
  });
});

import { mergeLedger, proposeForecasts, scoreLedger, type LoggedForecast } from "../src/lib/ledger";
import type { Fact } from "../src/lib/resolver";

const fact = (entity: string, metric: string, period: string, value: number, dims: Record<string, string> = {}): Fact =>
  ({ key: "", entity_id: entity, metric_id: metric, dims, period, best: { id: `${entity}_${period}`, value, status: "actual" } as never, candidates: [], spread: { min: value, max: value }, conflict: false });

describe("forecast ledger", () => {
  const facts = [
    ...["2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4", "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4"].map((p, i) => fact("hyperscalers", "capex", p, 50e9 * 1.1 ** i)),
    ...Array.from({ length: 20 }, (_, i) => fact("india", "fx_rate", `2026-10-${String(i + 1).padStart(2, "0")}`, 94 + (i % 3) * 0.1)),
  ];
  const series = (e: string, m: string, d: Record<string, string> = {}) => facts.filter((f) => f.entity_id === e && f.metric_id === m && JSON.stringify(f.dims) === JSON.stringify(d));
  const units = () => ({ unit: "", kind: "flow" });

  it("proposes next-quarter capex and a 30-day FX forecast with intervals", () => {
    const p = proposeForecasts(series, "2026-11-03", units);
    const capex = p.find((f) => f.id === "capex_big4_2026_q1")!;
    expect(capex.mean).toBeGreaterThan(50e9 * 1.1 ** 7);
    expect(capex.lo).toBeLessThan(capex.mean);
    expect(p.find((f) => f.id === "fx_usdinr_20261203")!.target.period).toBe("2026-12-03");
  });

  it("never re-logs a forecast and makes daily-market ones at most weekly", () => {
    const p = proposeForecasts(series, "2026-11-03", units);
    const l1 = mergeLedger([], p, "2026-11-03");
    expect(mergeLedger(l1, p, "2026-11-03")).toHaveLength(l1.length);
    const later = proposeForecasts(series, "2026-11-05", units);
    expect(mergeLedger(l1, later, "2026-11-05").length).toBe(l1.length); // FX made 2 days ago → skip
    expect(mergeLedger(l1, proposeForecasts(series, "2026-11-11", units), "2026-11-11").length).toBe(l1.length + 1);
  });

  it("scores only after the target period ends, against the actual value", () => {
    const f: LoggedForecast = { id: "x", made: "2026-01-01", label: "", target: { entity_id: "hyperscalers", metric_id: "capex", dims: {}, period: "2025-Q4" },
      unit: "", kind: "flow", method: "", mean: 95e9, lo: 90e9, hi: 100e9, status: "pending" };
    const actual = 50e9 * 1.1 ** 7; // 97.4B
    const [s] = scoreLedger([f], series, "2026-02-01");
    expect(s).toMatchObject({ status: "hit", actual, resolved: "2026-02-01" });
    expect(s!.error).toBeCloseTo(95e9 / actual - 1);
    expect(scoreLedger([{ ...f, target: { ...f.target, period: "2026-Q4" } }], series, "2026-11-03")[0]!.status).toBe("pending");
  });

  it("resolves a daily target from the next published day", () => {
    const f: LoggedForecast = { id: "fx", made: "2026-09-01", label: "", target: { entity_id: "india", metric_id: "fx_rate", dims: {}, period: "2026-09-30" },
      unit: "", kind: "price", method: "", mean: 94, lo: 93, hi: 95, status: "pending" };
    expect(scoreLedger([f], series, "2026-11-03")[0]).toMatchObject({ status: "hit", actual: 94 });
  });
});
