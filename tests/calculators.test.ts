import { describe, expect, it } from "vitest";
import { crf, dataCentrePower, flopFromModel, gpuHourCost, inferenceCost, sensitivity, trainingCost } from "../src/lib/calculators";

const H100 = 989.5e12; // dense BF16 FLOP/s (NVIDIA datasheet, in the atlas)

describe("capital recovery", () => {
  it("matches the annuity formula and the zero-rate case", () => {
    expect(crf(0.1, 5)).toBeCloseTo(0.263797, 5);
    expect(crf(0, 4)).toBe(0.25);
  });
});

describe("E1 GPU-hour cost", () => {
  const base = { capexPerGpu: 30_000, lifeYears: 5, wacc: 0.1, wattsPerGpu: 1000, pue: 1.2, powerPrice: 0.08, opexShare: 0.08, utilisation: 0.7 };
  it("splits capital, power and opex per used hour", () => {
    const r = gpuHourCost(base);
    expect(r.capital).toBeCloseTo(1.2906, 3);   // 30k × 0.2638 / (8760 × 0.7)
    expect(r.power).toBeCloseTo(0.13714, 4);    // 1.2 kW × 8760 h × $0.08 / 6132 h
    expect(r.opex).toBeCloseTo(0.39139, 4);
    expect(r.total).toBeCloseTo(1.8191, 3);
    expect(r.gridKw).toBeCloseTo(1.2);
  });
  it("gets cheaper with longer life and higher utilisation", () => {
    expect(gpuHourCost({ ...base, lifeYears: 6 }).total).toBeLessThan(gpuHourCost(base).total);
    expect(gpuHourCost({ ...base, utilisation: 0.9 }).total).toBeLessThan(gpuHourCost(base).total);
  });
  it("ranks inputs by impact for the tornado chart: utilisation beats capex, power matters least", () => {
    const s = sensitivity(base, (i) => gpuHourCost(i).total, ["capexPerGpu", "powerPrice", "utilisation"]);
    expect(s.map((x) => x.key)).toEqual(["utilisation", "capexPerGpu", "powerPrice"]);
    expect(s[0]!.high - s[0]!.low).toBeCloseTo(0.758, 2); // every cost is spread over fewer sold hours
  });
});

describe("E2 training cost", () => {
  it("prices the largest 2026 run at about $1.3B at $2/GPU-hour and 40% MFU", () => {
    const r = trainingCost({ flop: 9.4e26, peakFlops: H100, mfu: 0.4, gpuHourPrice: 2, gpus: 100_000, gridKwPerGpu: 1.2 });
    expect(r.gpuHours).toBeCloseTo(6.597e8, -6);
    expect(r.cost / 1e9).toBeCloseTo(1.319, 2);
    expect(r.days).toBeCloseTo(274.9, 0);
    expect(r.mwh).toBeCloseTo(791_669, -3);
  });
  it("derives compute from parameters and tokens (6ND)", () => {
    expect(flopFromModel(70e9, 15e12)).toBeCloseTo(6.3e24);
  });
});

describe("E3 inference cost", () => {
  it("prices a 37B-active model at about $0.21 per million tokens on a $2 GPU-hour", () => {
    const r = inferenceCost({ activeParams: 37e9, peakFlops: H100, servingMfu: 0.2, gpuHourPrice: 2, gridKwPerGpu: 1.2 });
    expect(r.tokensPerSecond).toBeCloseTo(2674, 0);
    expect(r.costPerMillion).toBeCloseTo(0.2077, 3);
    expect(r.margin(1)).toBeCloseTo(0.792, 2);
    expect(r.whPerThousand).toBeCloseTo(0.1246, 3);
  });
});

describe("E4 data-centre power", () => {
  it("turns a 100k-GPU cluster into MW and TWh per year", () => {
    const r = dataCentrePower({ gpus: 100_000, wattsPerGpu: 1000, pue: 1.2, loadFactor: 0.8 });
    expect(r.itMw).toBe(100);
    expect(r.facilityMw).toBeCloseTo(120);
    expect(r.twhPerYear).toBeCloseTo(0.841, 3);
  });
});
