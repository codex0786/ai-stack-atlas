// The fixed vocabulary of the atlas. Everything in the fact base is tagged with these ids,
// so changing one is a migration, not an edit. See PLAN.md §3–4 for the reasoning.

export const LAYERS = [
  { id: "L0", name: "Energy", desc: "Generation, grid interconnection, power prices, PPAs" },
  { id: "L1", name: "Semiconductors", desc: "Accelerators, foundry, advanced packaging, HBM, lithography, networking" },
  { id: "L2", name: "Data-centre physical", desc: "Facilities, MW, cooling, land, construction, PUE, water" },
  { id: "L3", name: "Compute operators", desc: "Hyperscalers, neoclouds, sovereign compute, ex-crypto miners" },
  { id: "L4", name: "Models", desc: "Frontier closed labs, neolabs, open-weight developers" },
  { id: "L5", name: "Distribution", desc: "First-party APIs, cloud model gardens, routers, inference hosts" },
  { id: "L6", name: "Applications", desc: "Copilots, agents, vertical AI software" },
  { id: "L7", name: "Demand & macro", desc: "Adoption, usage, productivity, labour, sector impact" },
  { id: "CAP", name: "Capital", desc: "Venture rounds, debt, vendor financing, public valuations (cuts across layers)" },
] as const;
export type LayerId = (typeof LAYERS)[number]["id"];
export const LAYER_IDS = LAYERS.map((l) => l.id) as [LayerId, ...LayerId[]];

export const ENTITY_KINDS = ["company", "model", "chip", "facility", "grid_region", "power_asset", "country", "segment", "aggregate"] as const;

/** Competitive position within a layer; drives the frontier / neolab / open-weight comparisons. */
export const SEGMENTS = ["frontier", "neolab", "open_weight", "hyperscaler", "neocloud", "sovereign", "chip_designer", "foundry", "memory", "equipment", "router"] as const;

export const EDGE_KINDS = ["supplies", "rents_compute_from", "invests_in", "trains_on", "hosts", "powered_by", "competes_with", "derived_from", "develops"] as const;

/** What kind of time span a value describes. */
export const PERIOD_TYPES = ["point", "run_rate", "quarterly", "half_year", "annual", "trend", "projection"] as const;

/** How firm the number is. The resolver ranks in this order and by default only reports `actual`. */
export const STATUSES = ["actual", "guidance", "projection", "rumoured"] as const;

/** How the number was produced. */
export const METHODS = ["reported", "derived", "estimated", "modelled"] as const;

/**
 * 1 = primary: filing, company statement, government/IEA/EIA, research org's own publication, vendor datasheet
 * 2 = established relay or analyst: major press, recognised analyst firm, first-party list prices captured by a third party
 * 3 = secondary: aggregators, blogs, trackers
 */
export const SOURCE_TIERS = [1, 2, 3] as const;
export const SOURCE_KINDS = ["filing", "company", "government", "research", "datasheet", "press", "analyst", "aggregator", "blog"] as const;

export const CURRENCIES = ["USD", "INR"] as const;
