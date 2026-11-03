import { describe, expect, it } from "vitest";
import { captured, valueFlow, type FlowInputs } from "../src/lib/valueflow";

const base: FlowInputs = {
  appApiShare: 0.35, labComputeShare: 1 / 1.8, cloudMargin: 0.5,
  cloudCost: { capital: 0.7, power: 0.1, opex: 0.2 }, gpuVendorShare: 0.6, gpuVendorMargin: 0.75,
  vendorCogs: { memory: 0.45, foundry: 0.3, other: 0.25 },
};

describe("value flow", () => {
  for (const entry of ["app", "api", "compute"] as const) {
    it(`conserves every cent when spend enters at ${entry}`, () => {
      const { nodes, links } = valueFlow(base, entry);
      expect(captured(nodes).reduce((a, n) => a + n.value, 0)).toBeCloseTo(1, 10);
      // Every non-leaf node passes on exactly what it receives.
      for (const n of nodes.filter((x) => !x.leaf && x.id !== "spend")) {
        const inflow = links.filter((l) => l.to === n.id).reduce((a, l) => a + l.value, 0);
        const outflow = links.filter((l) => l.from === n.id).reduce((a, l) => a + l.value, 0);
        expect(outflow).toBeCloseTo(inflow, 10);
        expect(inflow).toBeCloseTo(n.value, 10);
      }
    });
  }

  it("follows the dollar: app → lab → cloud → hardware → vendor", () => {
    const v = Object.fromEntries(valueFlow(base).nodes.map((n) => [n.id, n.value]));
    expect(v.app).toBeCloseTo(0.65);
    expect(v.lab).toBeCloseTo(0.35 * (1 - 1 / 1.8));          // 0.1556
    expect(v.compute).toBeCloseTo(0.35 / 1.8);                 // 0.1944
    expect(v.cloud).toBeCloseTo(0.35 / 1.8 / 2);               // 0.0972
    expect(v.energy).toBeCloseTo(0.0972 * 0.1, 4);
    expect(v.vendorgp).toBeCloseTo(0.0972 * 0.7 * 0.6 * 0.75, 4);
  });

  it("drops the app and lab layers when spend starts further down", () => {
    expect(valueFlow(base, "api").nodes.some((n) => n.id === "app")).toBe(false);
    expect(valueFlow(base, "compute").nodes.some((n) => n.id === "lab")).toBe(false);
    expect(valueFlow(base, "compute").nodes.find((n) => n.id === "cloud")!.value).toBeCloseTo(0.5);
  });
});
