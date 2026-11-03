// The model catalog behind the executive dashboard: every priced model on OpenRouter that
// Epoch AI has benchmarked, with list prices, capabilities and quality scores.

export interface CatalogModel {
  /** OpenRouter model id, e.g. "anthropic/claude-sonnet-5.5". */
  id: string;
  name: string;
  lab: string;
  /** Atlas entity id for the lab, when the atlas tracks it. */
  labEntity?: string;
  openWeights: boolean;
  released: string;
  /** Epoch Capabilities Index with its 90% interval. */
  eci: number;
  eciLow: number;
  eciHigh: number;
  /** USD per million tokens. */
  price: { input: number; output: number; cachedInput?: number };
  batchPrice?: { input: number; output: number };
  context: number;
  maxOutput?: number;
  inputs: string[];
  tools: boolean;
  structured: boolean;
  reasoning: boolean;
  /** Raw benchmark scores (0–1) by Epoch benchmark name. */
  bench: Record<string, number>;
}

export interface ModelCatalog {
  generated: string;
  pricesAsOf: string;
  benchmarksAsOf: string;
  sources: { pricing: string; capabilities: string; benchmarks: string };
  models: CatalogModel[];
}
