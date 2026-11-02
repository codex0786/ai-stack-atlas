import { describe, expect, it } from "vitest";
import { latest, periodEnd, resolve } from "../src/lib/resolver";
import type { Observation, Source } from "../src/lib/schema";

const src = (id: string, tier: 1 | 2 | 3): Source => ({ id, title: id, publisher: id, url: `https://example.com/${id}`, tier, kind: "press", accessed: "2026-11-01", verified: true });
const sources = [src("filing", 1), src("press", 2), src("blog", 3)];

let n = 0;
const obs = (o: Partial<Observation>): Observation => ({
  id: `o${++n}`, entity_id: "acme", metric_id: "revenue", value: 100, currency: "USD", dims: {}, period: "2026",
  period_type: "annual", status: "actual", method: "reported", source_id: "press", published: "2026-06-01", confidence: 0.8, ...o,
});

describe("periodEnd", () => {
  it("normalises every period granularity to its last day", () => {
    expect(periodEnd("2026")).toBe("2026-12-31");
    expect(periodEnd("2026-Q1")).toBe("2026-03-31");
    expect(periodEnd("2026-H1")).toBe("2026-06-30");
    expect(periodEnd("2024-02")).toBe("2024-02-29");
    expect(periodEnd("2026-07-23")).toBe("2026-07-23");
  });
});

describe("resolve", () => {
  it("prefers a better tier over a newer, weaker source for the same fact", () => {
    const [f] = resolve([obs({ value: 100, source_id: "filing", published: "2026-01-01" }), obs({ value: 140, source_id: "blog", published: "2026-09-01" })], sources);
    expect(f!.best.value).toBe(100);
    expect(f!.conflict).toBe(true);
    expect(f!.spread).toEqual({ min: 100, max: 140 });
  });

  it("ranks actual above rumoured regardless of tier", () => {
    const [f] = resolve([obs({ value: 50, status: "rumoured", source_id: "filing" }), obs({ value: 12, status: "actual", source_id: "blog" })], sources);
    expect(f!.best.value).toBe(12);
  });

  it("does not flag small disagreements as conflicts", () => {
    const [f] = resolve([obs({ value: 100 }), obs({ value: 110, source_id: "blog" })], sources);
    expect(f!.conflict).toBe(false);
  });

  it("drops superseded observations entirely", () => {
    const old = obs({ value: 180, status: "guidance" });
    const facts = resolve([old, obs({ value: 190, status: "guidance", supersedes: old.id })], sources);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.candidates.map((c) => c.value)).toEqual([190]);
    expect(facts[0]!.conflict).toBe(false);
  });

  it("keeps different periods, dims and currencies as separate facts", () => {
    const facts = resolve([
      obs({ period: "2025" }), obs({ period: "2026" }),
      obs({ dims: { provider: "aws" } }), obs({ currency: "INR" }),
    ], sources);
    expect(facts).toHaveLength(4);
  });

  it("gives a point-in-time view that ignores later publications, including later supersessions", () => {
    const old = obs({ value: 180, published: "2026-02-01" });
    const all = [old, obs({ value: 190, published: "2026-06-18", supersedes: old.id })];
    expect(resolve(all, sources, { asOf: "2026-03-01" })[0]!.best.value).toBe(180);
    expect(resolve(all, sources)[0]!.best.value).toBe(190);
  });
});

describe("latest", () => {
  it("returns the most recent actual period and ignores projections and rumours", () => {
    const facts = resolve([
      obs({ period: "2025-12", value: 9 }), obs({ period: "2026-04", value: 30 }),
      obs({ period: "2027", value: 99, status: "projection" }), obs({ period: "2026-09", value: 70, status: "rumoured" }),
    ], sources);
    const cur = [...latest(facts).values()];
    expect(cur).toHaveLength(1);
    expect(cur[0]!.best.value).toBe(30);
    expect([...latest(facts, ["actual", "rumoured"]).values()][0]!.best.value).toBe(70);
  });
});
