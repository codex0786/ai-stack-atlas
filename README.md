# AI Stack Atlas

Economic intelligence on the whole AI stack — energy → chips → data centres → compute operators → models → distribution → applications — with sourced unit economics and forecasts. See [PLAN.md](PLAN.md).

**Live:** https://ai-stack-atlas-bay.vercel.app — every number on the site links to its source, tier and verification status.

## Phase 0: the fact base

```
data/metrics.yaml          metric dictionary (definition, unit, allowed dims, formula)
data/seed/sources.json     every source with tier (1 primary · 2 relay/analyst · 3 secondary) and verified flag
data/seed/entities.json    companies, chips, segments, grid regions, tagged by layer (L0–L7, CAP) and segment
data/seed/edges.json       supplies / invests_in / rents_compute_from / hosts / develops …
data/seed/observations.json  every number: value, period, status, method, source, published date, confidence
src/lib/resolver.ts        best value per fact + conflicts; latest actual per series; point-in-time (asOf) view
```

```bash
npm run validate      # schema + reference checks, conflicts, evidence quality, current values
npm run seed          # rebuild data/atlas.db (refuses on any validation error)
npm test
npm run dev         # website on http://localhost:3000
npm run build       # static export to out/
```

### Rules for adding a number
1. Add the source first; set `verified: true` only if you opened it and checked the figure.
2. `period` is the time the value describes; `published` is when it became public (used for backtests).
3. Rumours, guidance and projections use `status`, never a different metric. Only `actual` becomes a "current" value.
4. A revision gets a new observation with `supersedes`, never an edit in place.
