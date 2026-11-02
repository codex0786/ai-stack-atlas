import { z } from "zod";
import { CURRENCIES, EDGE_KINDS, ENTITY_KINDS, LAYER_IDS, METHODS, PERIOD_TYPES, SEGMENTS, SOURCE_KINDS, STATUSES } from "./ontology";

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case id");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
/** The time a value describes: YYYY, YYYY-Qn, YYYY-Hn, YYYY-MM or YYYY-MM-DD. */
export const PERIOD_RE = /^\d{4}(-(Q[1-4]|H[12]|(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?))?$/;
const period = z.string().regex(PERIOD_RE, "period: YYYY | YYYY-Qn | YYYY-Hn | YYYY-MM | YYYY-MM-DD");

export const Source = z.object({
  id,
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.url(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kind: z.enum(SOURCE_KINDS),
  published: isoDate.optional(),
  accessed: isoDate,
  /** True only when the page was opened and the numbers cited from it were checked against it. */
  verified: z.boolean(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const Entity = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(ENTITY_KINDS),
  layers: z.array(z.enum(LAYER_IDS)).min(1),
  segments: z.array(z.enum(SEGMENTS)).default([]),
  country: z.string().length(2).optional(),
  note: z.string().optional(),
});
export type Entity = z.infer<typeof Entity>;

export const Edge = z
  .object({
    from: id,
    to: id,
    kind: z.enum(EDGE_KINDS),
    value: z.number().optional(),
    currency: z.enum(CURRENCIES).optional(),
    period: period.optional(),
    source_id: id.optional(),
    note: z.string().optional(),
  })
  .refine((e) => e.value === undefined || e.source_id !== undefined, { message: "an edge with a value needs a source_id" })
  .refine((e) => e.value === undefined || e.currency !== undefined, { message: "an edge with a value needs a currency" });
export type Edge = z.infer<typeof Edge>;

export const Observation = z
  .object({
    id,
    entity_id: id,
    metric_id: id,
    value: z.number().finite(),
    /** Range reported by the source (uncertainty band or spread across providers). */
    low: z.number().finite().optional(),
    high: z.number().finite().optional(),
    currency: z.enum(CURRENCIES).optional(),
    /** Extra qualifiers that make two values different facts, e.g. {provider: "aws", contract: "on_demand"}. */
    dims: z.record(z.string(), z.string()).default({}),
    period,
    period_type: z.enum(PERIOD_TYPES),
    status: z.enum(STATUSES),
    method: z.enum(METHODS),
    source_id: id,
    /** When the value became public; drives point-in-time (backtest) resolution. */
    published: isoDate,
    confidence: z.number().min(0).max(1),
    supersedes: id.optional(),
    note: z.string().optional(),
  })
  .refine((o) => o.low === undefined || o.high === undefined || o.low <= o.high, { message: "low > high" })
  .refine((o) => o.low === undefined || o.value >= o.low, { message: "value below low" })
  .refine((o) => o.high === undefined || o.value <= o.high, { message: "value above high" });
export type Observation = z.infer<typeof Observation>;

export const Metric = z.object({
  id,
  name: z.string().min(1),
  layer: z.enum(LAYER_IDS),
  /** Unit excluding currency; monetary metrics carry the currency on each observation. */
  unit: z.string(),
  monetary: z.boolean().default(false),
  kind: z.enum(["level", "flow", "price", "share", "growth", "ratio", "spec"]),
  definition: z.string().min(10),
  caveats: z.string().optional(),
  /** Derived metrics only: an expression over other metric ids, evaluated in Phase 2. */
  formula: z.string().optional(),
  dims: z.array(z.string()).default([]),
});
export type Metric = z.infer<typeof Metric>;
