import { describe, expect, it } from "vitest";
import { fmt, fmtPeriod } from "../src/lib/format";

const f = (value: number, unit: string, kind = "level", currency?: string) => fmt({ value, unit, kind, currency });

describe("fmt", () => {
  it("formats money with magnitude and unit", () => {
    expect(f(65e9, "per year", "flow", "USD")).toBe("$65B/yr");
    expect(f(66.7e9, "", "flow", "USD")).toBe("$66.7B");
    expect(f(4.2, "per GPU-hour", "price", "USD")).toBe("$4.20/GPU-hr");
    expect(f(115.85, "per GPU-hour", "price", "INR")).toBe("₹115.85/GPU-hr");
    expect(f(1, "per million tokens", "price", "USD")).toBe("$1.00/M tokens");
  });

  it("formats shares, growth and multiples", () => {
    expect(f(0.33, "share", "share")).toBe("33%");
    expect(f(0.015, "share", "share")).toBe("1.5%");
    expect(f(6.71, "ratio", "growth")).toBe("+671%");
    expect(f(-0.88, "ratio", "growth")).toBe("−88%");
    expect(f(1.8, "ratio", "ratio")).toBe("1.8×");
    expect(f(2.4, "x per year", "growth")).toBe("2.4×/yr");
  });

  it("formats physical units", () => {
    expect(f(989.5e12, "FLOP/s", "spec")).toBe("989.5 TFLOPS");
    expect(f(945, "TWh per year", "flow")).toBe("945 TWh");
    expect(f(72500, "wafers per month", "level")).toBe("72.5k wafers/mo");
    expect(f(38000, "GPUs", "level")).toBe("38,000 GPUs");
    expect(f(700, "W", "spec")).toBe("700 W");
  });
});

describe("fmtPeriod", () => {
  it("reads every period granularity", () => {
    expect(fmtPeriod("2026")).toBe("2026");
    expect(fmtPeriod("2026-H1")).toBe("H1 2026");
    expect(fmtPeriod("2026-Q2")).toBe("Q2 2026");
    expect(fmtPeriod("2026-07")).toBe("Jul 2026");
    expect(fmtPeriod("2026-07-23")).toBe("23 Jul 2026");
  });
});
