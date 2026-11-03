import type { Observation, Source } from "../lib/schema";
import { fetchJson, USER_AGENT } from "./http";
import type { Feed, FeedOutput } from "./types";

// SEC EDGAR XBRL "company facts": every number a US filer has tagged in its 10-Q/10-K.
// Cash-flow items (capex) are reported year-to-date, so quarters are derived by differencing
// consecutive YTD values that share a fiscal-year start. Each value cites its own filing.

export const COMPANIES = [
  { ticker: "MSFT", entity: "microsoft", cik: 789019 },
  { ticker: "GOOGL", entity: "alphabet", cik: 1652044 },
  { ticker: "AMZN", entity: "amazon", cik: 1018724 },
  { ticker: "META", entity: "meta", cik: 1326801 },
  { ticker: "ORCL", entity: "oracle", cik: 1341439 },
  { ticker: "NVDA", entity: "nvidia", cik: 1045810 },
  { ticker: "AMD", entity: "amd", cik: 2488 },
  { ticker: "AVGO", entity: "broadcom", cik: 1730168 },
  { ticker: "CRWV", entity: "coreweave" },
] as const;

/** Companies whose quarters end on calendar quarter-ends, so their capex can be summed. */
export const HYPERSCALER_SUM = ["microsoft", "alphabet", "amazon", "meta"] as const;

/** Metric → us-gaap concepts in preference order (companies tag the same item differently). */
const CONCEPTS: Record<string, { concepts: string[]; instant: boolean }> = {
  capex: { concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], instant: false },
  revenue: { concepts: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax"], instant: false },
  long_term_debt: { concepts: ["LongTermDebtNoncurrent", "LongTermDebt", "LongTermNotesPayable", "LongTermDebtAndCapitalLeaseObligations", "OtherLongTermDebtNoncurrent"], instant: true },
  contract_backlog: { concepts: ["RevenueRemainingPerformanceObligation"], instant: true },
};

const FORMS = new Set(["10-K", "10-Q", "10-K/A", "10-Q/A"]);
const SINCE = "2022-01-01";

export interface XbrlFact { start?: string; end: string; val: number; accn: string; fy?: number; fp?: string; form: string; filed: string; frame?: string }
export interface CompanyFacts { cik: number; entityName: string; facts: { "us-gaap"?: Record<string, { units: Record<string, XbrlFact[]> }> } }

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
/** Period label = the month the quarter (or balance-sheet date) ends in, e.g. "2025-09". */
const monthOf = (d: string) => d.slice(0, 7);
const isQuarter = (n: number) => n >= 80 && n <= 100;

/** First-filed value per (start, end), unless a later filing restated it. */
function dedupe(facts: XbrlFact[]): (XbrlFact & { restated: boolean })[] {
  const byKey = new Map<string, XbrlFact[]>();
  for (const f of facts) {
    const k = `${f.start ?? ""}|${f.end}`;
    byKey.set(k, [...(byKey.get(k) ?? []), f]);
  }
  return [...byKey.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.filed.localeCompare(b.filed));
    const first = sorted[0]!, last = sorted[sorted.length - 1]!;
    return last.val !== first.val ? { ...last, restated: true } : { ...first, restated: false };
  });
}

export interface QuarterValue { end: string; val: number; fact: XbrlFact; derived: boolean; restated: boolean }

/** Quarterly values from a mix of 3-month and year-to-date facts. */
export function quarterly(facts: XbrlFact[]): QuarterValue[] {
  const durations = dedupe(facts.filter((f) => f.start));
  const out = new Map<string, QuarterValue>();
  for (const f of durations) if (isQuarter(days(f.start!, f.end))) out.set(f.end, { end: f.end, val: f.val, fact: f, derived: false, restated: f.restated });
  const byStart = new Map<string, typeof durations>();
  for (const f of durations) byStart.set(f.start!, [...(byStart.get(f.start!) ?? []), f]);
  for (const group of byStart.values()) {
    const sorted = [...group].sort((a, b) => a.end.localeCompare(b.end));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!, cur = sorted[i]!;
      if (out.has(cur.end) || !isQuarter(days(addDays(prev.end, 1), cur.end))) continue;
      out.set(cur.end, { end: cur.end, val: cur.val - prev.val, fact: cur, derived: true, restated: cur.restated || prev.restated });
    }
  }
  return [...out.values()].sort((a, b) => a.end.localeCompare(b.end));
}

function pick(facts: CompanyFacts, concepts: string[]): XbrlFact[] {
  // Merge concepts in preference order: a later concept only fills periods the earlier lacks.
  const seen = new Set<string>();
  const out: XbrlFact[] = [];
  for (const c of concepts) {
    const list = (facts.facts["us-gaap"]?.[c]?.units.USD ?? []).filter((f) => FORMS.has(f.form) && f.end >= SINCE);
    const keys = new Set(list.map((f) => `${f.start ?? ""}|${f.end}`));
    for (const f of list) if (!seen.has(`${f.start ?? ""}|${f.end}`)) out.push(f);
    keys.forEach((k) => seen.add(k));
  }
  return out;
}

const filingUrl = (cik: number, accn: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}/`;

export function parseCompanyFacts(company: { ticker: string; entity: string }, facts: CompanyFacts, today: string): FeedOutput {
  const sources = new Map<string, Source>();
  const observations: Observation[] = [];
  const t = company.ticker.toLowerCase();
  const cite = (f: XbrlFact) => {
    const id = `edgar_${t}_${f.accn.replace(/-/g, "")}`;
    if (!sources.has(id)) {
      sources.set(id, {
        id, title: `${facts.entityName} ${f.form} (filed ${f.filed})`, publisher: "SEC EDGAR", url: filingUrl(facts.cik, f.accn),
        tier: 1, kind: "filing", published: f.filed, accessed: today, verified: true, automated: true,
      });
    }
    return id;
  };

  for (const [metric, spec] of Object.entries(CONCEPTS)) {
    const facts_ = pick(facts, spec.concepts);
    if (spec.instant) {
      // A zero balance is almost always a placeholder tag, not a real figure.
      for (const f of dedupe(facts_.filter((x) => !x.start && x.val > 0))) {
        observations.push({
          id: `edgar_${t}_${metric}_${monthOf(f.end).replace("-", "_")}`, entity_id: company.entity, metric_id: metric, value: f.val, currency: "USD", dims: {},
          period: monthOf(f.end), period_type: "point", status: "actual", method: "reported", source_id: cite(f), published: f.filed, confidence: 0.95,
          note: `Balance at ${f.end}${f.restated ? "; restated in a later filing" : ""}.`,
        });
      }
    } else {
      for (const q of quarterly(facts_)) {
        observations.push({
          id: `edgar_${t}_${metric}_${monthOf(q.end).replace("-", "_")}`, entity_id: company.entity, metric_id: metric, value: q.val, currency: "USD", dims: {},
          period: monthOf(q.end), period_type: "quarterly", status: "actual", method: q.derived ? "derived" : "reported", source_id: cite(q.fact),
          published: q.fact.filed, confidence: q.derived ? 0.9 : 0.95,
          note: `Quarter ending ${q.end}${q.derived ? " (year-to-date minus prior year-to-date)" : ""}${q.restated ? "; restated" : ""}.`,
        });
      }
    }
  }
  // Keep the latest dedupe winner per id (concept merges can map two facts to one month).
  const unique = new Map(observations.map((o) => [o.id, o]));
  const used = new Set([...unique.values()].map((o) => o.source_id));
  return { sources: [...sources.values()].filter((s) => used.has(s.id)), observations: [...unique.values()] };
}

/** Big-four capex summed per calendar quarter, only where all four have reported. */
export function hyperscalerSum(observations: Observation[], today: string): FeedOutput {
  const byQuarter = new Map<string, Observation[]>();
  for (const o of observations) {
    if (o.metric_id !== "capex" || !(HYPERSCALER_SUM as readonly string[]).includes(o.entity_id)) continue;
    const m = Number(o.period.slice(5));
    if (m % 3 !== 0) continue;
    const q = `${o.period.slice(0, 4)}-Q${m / 3}`;
    byQuarter.set(q, [...(byQuarter.get(q) ?? []), o]);
  }
  const source: Source = {
    id: "atlas_edgar_sum", title: "Sum of Microsoft, Alphabet, Amazon and Meta capex from their 10-Q/10-K filings", publisher: "AI Stack Atlas (derived from SEC EDGAR)",
    url: "https://www.sec.gov/edgar/search/", tier: 1, kind: "filing", accessed: today, verified: true, automated: true,
  };
  const observations_: Observation[] = [];
  for (const [q, list] of byQuarter) {
    if (new Set(list.map((o) => o.entity_id)).size !== HYPERSCALER_SUM.length) continue;
    observations_.push({
      id: `edgar_big4_capex_${q.replace("-", "_").toLowerCase()}`, entity_id: "hyperscalers", metric_id: "capex", value: list.reduce((a, o) => a + o.value, 0), currency: "USD",
      dims: {}, period: q, period_type: "quarterly", status: "actual", method: "derived", source_id: source.id,
      published: list.map((o) => o.published).sort().at(-1)!, confidence: 0.9, note: "Microsoft + Alphabet + Amazon + Meta, from each company's filing.",
    });
  }
  return { sources: observations_.length ? [source] : [], observations: observations_ };
}

export const edgarFeed: Feed = {
  id: "edgar",
  name: "SEC EDGAR filings",
  cadenceHours: 24,
  mode: "replace",
  homepage: "https://www.sec.gov/edgar/search/",
  async run({ today, env }) {
    const headers = { "User-Agent": env.SEC_USER_AGENT || `${USER_AGENT} atlas-bot@users.noreply.github.com` };
    let ciks = new Map<string, number>();
    try {
      const tickers = await fetchJson<Record<string, { cik_str: number; ticker: string }>>("https://www.sec.gov/files/company_tickers.json", { headers });
      ciks = new Map(Object.values(tickers).map((r) => [r.ticker, r.cik_str]));
    } catch { /* fall back to the CIKs listed above */ }
    const sources: Source[] = [];
    const observations: Observation[] = [];
    const failures: string[] = [];
    for (const c of COMPANIES) {
      const cik = ciks.get(c.ticker) ?? ("cik" in c ? c.cik : undefined);
      if (!cik) { failures.push(`${c.ticker}: CIK not found`); continue; }
      try {
        const facts = await fetchJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`, { headers });
        const out = parseCompanyFacts(c, facts, today);
        sources.push(...out.sources);
        observations.push(...out.observations);
      } catch (err) {
        failures.push(`${c.ticker}: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 150)); // SEC asks for ≤10 requests/second
    }
    if (!observations.length) throw new Error(`No EDGAR data: all ${failures.length} companies failed (first: ${failures[0]?.replace(/ from https?:\/\/\S+/, "")})`);
    const sum = hyperscalerSum(observations, today);
    if (failures.length) console.warn(`edgar: partial — ${failures.join("; ")}`);
    return { sources: [...sources, ...sum.sources], observations: [...observations, ...sum.observations] };
  },
};
