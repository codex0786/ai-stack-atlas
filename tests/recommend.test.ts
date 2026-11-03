import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildCatalog, normName } from "../src/feeds/models";
import { readZip } from "../src/feeds/zip";
import type { CatalogModel } from "../src/lib/models";
import { costPerTask, eligible, recommend } from "../src/lib/recommend";
import type { UseCase } from "../src/lib/usecases";

const model = (id: string, eci: number, input: number, output: number, extra: Partial<CatalogModel> = {}): CatalogModel => ({
  id, name: id, lab: "Lab", openWeights: false, released: "2026-01-01", eci, eciLow: eci - 2, eciHigh: eci + 2,
  price: { input, output }, context: 1_000_000, inputs: ["text"], tools: true, structured: true, reasoning: true, bench: {}, ...extra,
});
const uc = (o: Partial<UseCase> = {}): UseCase => ({
  id: "t", name: "Test", problem: "", example: "", inputTokens: 10_000, outputTokens: 1_000, cachedShare: 0, batchable: false,
  monthlyTasks: 1_000, requires: {}, benchmarks: [], qualityWeight: 0.5, caveat: "", ...o,
});

describe("cost per task", () => {
  it("prices input and output per million tokens, with cache and batch discounts", () => {
    const m = model("a", 160, 2, 10, { price: { input: 2, output: 10, cachedInput: 0.2 }, batchPrice: { input: 1, output: 5 } });
    expect(costPerTask(m, uc()).usd).toBeCloseTo(0.03);                       // 10k×$2 + 1k×$10 per M
    expect(costPerTask(m, uc({ cachedShare: 0.5 })).usd).toBeCloseTo(0.021);  // 5k×$2 + 5k×$0.2 + 1k×$10
    expect(costPerTask(m, uc({ batchable: true }))).toMatchObject({ batch: true });
    expect(costPerTask(m, uc({ batchable: true })).usd).toBeCloseTo(0.015);
  });
});

describe("eligibility", () => {
  it("enforces context, vision, tools and open-weight requirements", () => {
    const m = model("a", 160, 1, 1, { context: 100_000, openWeights: false });
    expect(eligible(m, uc({ requires: { minContext: 200_000 } }))).toBe(false);
    expect(eligible(m, uc({ requires: { vision: true } }))).toBe(false);
    expect(eligible(m, uc({ requires: { openWeights: true } }))).toBe(false);
    expect(eligible(m, uc())).toBe(true);
  });
});

describe("recommend", () => {
  const top = model("top", 170, 10, 50);
  const value = model("value", 168, 1, 5);
  const cheap = model("cheap", 130, 0.1, 0.4, { openWeights: true });
  const all = [top, value, cheap];

  it("quality-heavy work picks near-top quality, cost-heavy work picks cheap", () => {
    expect(recommend(all, uc({ qualityWeight: 0.8 })).recommended!.model.id).toBe("value");
    expect(recommend(all, uc({ qualityWeight: 1 })).recommended!.model.id).toBe("top");
    // Cost-heavy work picks the cheap model only when it clears the quality floor.
    expect(recommend(all, uc({ qualityWeight: 0.1, qualityFloor: 0 })).recommended!.model.id).toBe("cheap");
    expect(recommend(all, uc({ qualityWeight: 0.1 })).recommended!.model.id).toBe("value");
  });

  it("names best quality, best value and best open-weight, and explains the pick", () => {
    const r = recommend(all, uc({ qualityWeight: 0.8 }));
    expect(r.bestQuality!.model.id).toBe("top");
    expect(r.bestValue!.model.id).toBe("value");
    expect(r.bestOpen!.model.id).toBe("cheap");
    expect(r.rationale[0]).toMatch(/value reaches \d+% of the top model's quality \(top\) at 10× lower cost/);
    expect(r.recommended!.monthlyCost).toBeCloseTo(r.recommended!.costPerTask * 1_000);
  });

  it("lists models below the quality floor last and never recommends them", () => {
    const r = recommend(all, uc({ qualityWeight: 0.1 }));
    expect(r.eligible.map((s) => s.model.id)).toEqual(["value", "top", "cheap"]);
    expect(r.eligible.at(-1)!.belowFloor).toBe(true);
  });

  it("applies the quality bar within open-weight models too", () => {
    const strongOpen = model("open-strong", 160, 2, 8, { openWeights: true });
    const r = recommend([...all, strongOpen], uc({ qualityWeight: 0.1 }));
    expect(r.bestOpen!.model.id).toBe("open-strong");
  });

  it("blends task benchmarks when a model has them", () => {
    const a = model("a", 160, 1, 1, { bench: { X: 0.9 } }), b = model("b", 160, 1, 1, { bench: { X: 0.1 } });
    const r = recommend([a, b, cheap], uc({ benchmarks: ["X"], qualityWeight: 1 }));
    expect(r.recommended!.model.id).toBe("a");
    expect(r.recommended!.qualityBasis).toEqual(["X"]);
  });

  it("discounts a model never measured on the task's benchmarks", () => {
    const tested = model("tested", 168, 2, 10, { bench: { X: 0.6 } }), untested = model("untested", 169, 2, 10);
    const r = recommend([tested, untested, cheap], uc({ benchmarks: ["X"], qualityWeight: 1 }));
    expect(r.eligible.find((s) => s.model.id === "untested")!.qualityBasis[0]).toMatch(/Untested/);
    expect(r.recommended!.model.id).toBe("tested");
  });
});

describe("catalog join", () => {
  it("normalises names across Epoch and OpenRouter", () => {
    expect(normName("Gemini 2.5 Flash (Jun 2025)")).toBe(normName("Gemini 2.5 Flash"));
    expect(normName("Qwen 3.6 Max (Preview)")).toBe("qwen36max");
  });
  it("joins prices, batch variants and benchmarks; skips unpriced models", () => {
    const or = [
      { id: "anthropic/claude-x", name: "Anthropic: Claude X", context_length: 200000, pricing: { prompt: "0.000003", completion: "0.000015" }, supported_parameters: ["tools"], architecture: { input_modalities: ["text", "image"] } },
      { id: "anthropic/claude-x:batch", name: "Anthropic: Claude X (batch)", pricing: { prompt: "0.0000015", completion: "0.0000075" } },
      { id: "acme/free-model", name: "Acme: Free Model", pricing: { prompt: "0", completion: "0" } },
    ];
    const eci = [
      { Model: "Claude X", "Display name": "Claude X", eci: "160", eci_ci_low: "158", eci_ci_high: "162", date: "2026-05-01", Organization: "Anthropic", "Accessibility group": "Closed weights" },
      { Model: "Free Model", "Display name": "Free Model", eci: "140", eci_ci_low: "1", eci_ci_high: "2", date: "2026-05-01", Organization: "Acme", "Accessibility group": "Open weights" },
    ];
    const c = buildCatalog(or, eci, [{ Model: "Claude X", benchmark: "GPQA diamond", performance: "0.8" }], "2026-11-03T00:00:00.000Z");
    expect(c.models).toHaveLength(1);
    expect(c.models[0]).toMatchObject({ id: "anthropic/claude-x", labEntity: "anthropic", price: { input: 3, output: 15 }, batchPrice: { input: 1.5, output: 7.5 }, tools: true, inputs: ["text", "image"], bench: { "GPQA diamond": 0.8 } });
  });
});

describe("zip reader", () => {
  it("reads deflated entries through the central directory", () => {
    const name = Buffer.from("a/eci_scores.csv"), data = Buffer.from("x,y\n1,2\n"), comp = deflateRawSync(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
    const body = Buffer.concat([local, name, comp]);
    const cd = Buffer.concat([central, name]);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(body.length, 16);
    const zip = Buffer.concat([body, cd, eocd]);
    expect(readZip(zip, (n) => n.endsWith(".csv")).get("a/eci_scores.csv")!.toString()).toBe("x,y\n1,2\n");
  });
});
