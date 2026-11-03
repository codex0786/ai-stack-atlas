import { fmt, fmtPeriod } from "./format";
import type { Cited } from "./site";
import { USE_CASE_WORDS } from "./usecases";

// "Ask the atlas": rule-based answers over the fact base. A question is matched to documents
// (BM25 search), then a fixed set of rules decides the kind of answer — comparison, trend,
// forecast, recommendation, insight or plain figure — and fills a fixed template from the
// sourced facts. No language model: the same question always gets the same answer.

export interface AskDoc {
  id: string;
  kind: "series" | "page" | "usecase" | "forecast" | "insight";
  title: string;
  /** Searchable text (entity, metric, qualifiers, layer, definition, aliases). */
  text: string;
  href: string;
  /** The series' current value with full provenance (series docs only). */
  cited?: Cited;
  /** The previous period's value, for trend answers (series docs only). */
  prev?: Cited;
  /** Atlas entity behind a series, for comparisons. */
  entity?: string;
  metric?: string;
  /** Short context shown with the result (pages, use cases). */
  summary?: string;
}

const STOP = new Set("a an and are as at be by did do does for from has have how i in is it its of on or per than that the this to vs was what when where which who why will with whats much many most best latest current today now".split(" "));

/** Query words that should also match atlas vocabulary. */
const SYNONYMS: Record<string, string[]> = {
  spend: ["capex"], spending: ["capex"], investment: ["capex", "commitment"], invest: ["capex", "commitment"],
  sales: ["revenue"], arr: ["revenue", "run", "rate"], income: ["revenue"],
  cost: ["price"], costs: ["price"], cheap: ["price"], cheapest: ["price"], expensive: ["price"], pricing: ["price"],
  gpu: ["h100", "h200", "b200", "a100", "gpu"], gpus: ["gpu", "h100"], rent: ["rental"], rental: ["rental"],
  power: ["electricity", "demand", "energy"], electricity: ["electricity", "energy"], energy: ["electricity", "energy"], grid: ["demand", "grid"],
  token: ["tokens", "llm"], tokens: ["tokens", "llm"], llm: ["llm", "model"], model: ["model", "llm"],
  open: ["open", "weight"], opensource: ["open", "weight"], source: ["open"],
  chip: ["semiconductor", "packaging", "gpu"], chips: ["semiconductor", "packaging", "gpu"], packaging: ["cowos", "packaging"],
  datacenter: ["data", "centre"], datacentre: ["data", "centre"], center: ["centre"],
  rupee: ["inr", "india", "exchange"], inr: ["inr", "exchange"], dollar: ["usd", "exchange"],
  google: ["alphabet"], aws: ["amazon"], facebook: ["meta"], qwen: ["alibaba"], kimi: ["moonshot"], grok: ["xai"], claude: ["anthropic"], chatgpt: ["openai"], gpt: ["openai"],
  forecast: ["forecast", "projection"], predict: ["forecast"], future: ["forecast", "projection"],
  margin: ["margin", "value", "flow"], profit: ["margin", "value"],
  training: ["training", "compute"], compute: ["compute"],
  debt: ["debt"], borrow: ["debt"], backlog: ["backlog"],
};

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/\.$/, ""))
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

function expand(tokens: string[]): string[] {
  return [...new Set(tokens.flatMap((t) => [t, ...(SYNONYMS[t] ?? [])].flatMap((x) => tokenize(x))))];
}

export interface Hit { doc: AskDoc; score: number }

/** Words that ask for a money amount: prefer currency-valued series over ratios for them. */
const MONEY = new Set(["revenue", "capex", "price", "cost", "debt", "spend", "spending", "sale", "investment", "commitment", "valuation", "backlog", "funding"]);

/** BM25 over doc text, with title words counted twice. */
/** Drop weak matches: keep results scoring at least `share` of the best. */
export const strong = (hits: Hit[], share = 0.4) => hits.filter((h) => h.score >= (hits[0]?.score ?? 0) * share);

export function search(docs: AskDoc[], query: string, k = 8): Hit[] {
  const q = expand(tokenize(query));
  if (!q.length) return [];
  const toks = docs.map((d) => [...tokenize(d.title), ...tokenize(d.title), ...tokenize(d.text)]);
  const N = docs.length, avg = toks.reduce((a, t) => a + t.length, 0) / Math.max(1, N);
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const k1 = 1.2, b = 0.6;
  const hits = docs.map((doc, i) => {
    const t = toks[i]!;
    const tf = new Map<string, number>();
    for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    for (const w of q) {
      const f = tf.get(w);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(w)! + 0.5) / (df.get(w)! + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avg));
    }
    // Tie-breaks: titles made mostly of the query's words, then better-sourced actual values.
    if (score > 0) {
      const title = new Set(tokenize(doc.title));
      score += (0.6 * [...title].filter((w) => q.includes(w)).length) / Math.max(1, title.size);
      if (doc.cited?.currency && q.some((w) => MONEY.has(w))) score += 0.3;
    }
    if (doc.cited && score > 0) score += (doc.cited.source.tier === 1 ? 0.3 : 0) + (doc.cited.status === "actual" ? 0.2 : 0);
    return { doc, score };
  });
  return hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

/** One sentence per fact: "Microsoft — Capital expenditure: $39.4B (Sep 2026, actual; SEC EDGAR)". */
export function factLine(d: AskDoc): string {
  const c = d.cited!;
  const range = c.low !== undefined && c.high !== undefined ? ` (range ${fmt(c, c.low)}–${fmt(c, c.high)})` : "";
  return `${d.title}: ${fmt(c)}${range} — ${fmtPeriod(c.period)}, ${c.status}; source: ${c.source.publisher} (tier ${c.source.tier}${c.source.automated ? ", automated" : c.source.verified ? ", verified" : ", unverified"})`;
}

/** A plain-language answer assembled from the top hits — no model involved. */
export function templateAnswer(query: string, hits: Hit[]): string {
  if (!hits.length) return `The atlas has no data matching “${query}”. Try naming a company, chip, metric or country — for example “Microsoft capex” or “H100 price”.`;
  const best = hits[0]!;
  const parts: string[] = [];
  if (best.doc.kind === "usecase" || best.doc.kind === "page") parts.push(`${best.doc.summary ?? best.doc.title}`);
  // A number leads only if it matches about as well as the best result.
  const series = hits.filter((h) => h.doc.cited && h.score >= best.score * (best.doc.cited ? 0 : 0.85));
  const lead = series[0];
  if (lead) {
    const c = lead.doc.cited!;
    parts.push(`${lead.doc.title} is ${fmt(c)} (${fmtPeriod(c.period)}${c.status === "actual" ? "" : `, ${c.status}`}), per ${c.source.publisher}.`);
    // Related: close matches, preferring the same company or chip as the lead.
    const related = series.slice(1).filter((h) => h.score >= lead.score * 0.6 && (h.doc.href === lead.doc.href || h.score >= lead.score * 0.85)).slice(0, 3);
    if (related.length) parts.push(`Related: ${related.map((h) => `${h.doc.title} ${fmt(h.doc.cited!)} (${fmtPeriod(h.doc.cited!.period)})`).join("; ")}.`);
  }
  return parts.join(" ");
}

/* ── Rules ──────────────────────────────────────────────────────────────── */

export type AnswerKind = "comparison" | "trend" | "forecast" | "recommendation" | "insight" | "figure" | "page" | "none";
export interface Answer { kind: AnswerKind; text: string; hits: Hit[] }

const RULES = {
  compare: /\b(vs\.?|versus|compare|compared|comparison|than|difference between)\b/,
  trend: /\b(grow|grew|growth|growing|trend|change|changed|increase|increased|rise|rising|fall|falling|decline|how fast|over time|year on year|yoy)\b/,
  model: /\b(which|what|best|recommend\w*|should (we|i) use|choose|pick)\b.*\b(model|llm|ai)\b/,
  forecast: /\b(forecast|predict|prediction|projection|project(ed)?|will|expect(ed)?|next (quarter|year|month)|outlook|20(2[7-9]|3\d))\b/,
};

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;

function comparison(hits: Hit[]): { text: string; pair: Hit[] } | undefined {
  const lead = hits.find((h) => h.doc.cited);
  if (!lead) return undefined;
  // The best-matching other entity measured on the same metric (and in the same currency).
  const other = hits.find((h) => h.doc.cited && h.doc.metric === lead.doc.metric && h.doc.entity !== lead.doc.entity && h.doc.cited.currency === lead.doc.cited!.currency);
  if (!other) return undefined;
  const a = lead.doc.cited!, b = other.doc.cited!;
  const name = (d: AskDoc) => d.title.split(" — ")[0]!;
  // Lead with the larger value: "Amazon is 2.0× Microsoft".
  const [big, small] = a.value >= b.value ? [lead.doc, other.doc] : [other.doc, lead.doc];
  const ratio = big.cited!.value / small.cited!.value;
  const samePeriod = a.period === b.period ? "" : ` Note the periods differ (${fmtPeriod(a.period)} vs ${fmtPeriod(b.period)}).`;
  return { pair: [lead, other], text: `${lead.doc.title}: ${fmt(a)} (${fmtPeriod(a.period)}) vs ${other.doc.title}: ${fmt(b)} (${fmtPeriod(b.period)}). ${name(big)} is ${ratio.toFixed(ratio >= 10 ? 0 : 1)}× ${name(small)}.${samePeriod} Sources: ${a.source.publisher}${b.source.publisher !== a.source.publisher ? `, ${b.source.publisher}` : ""}.` };
}

function trend(hits: Hit[]): { text: string; hit: Hit } | undefined {
  const h = hits.find((x) => x.doc.cited && x.doc.prev);
  if (!h) return undefined;
  const now = h.doc.cited!, before = h.doc.prev!;
  const change = now.kind === "growth" || now.unit === "share" ? undefined : now.value / before.value - 1;
  return { hit: h, text: `${h.doc.title} moved from ${fmt(before)} (${fmtPeriod(before.period)}) to ${fmt(now)} (${fmtPeriod(now.period)})${change !== undefined ? `, a change of ${pct(change)}` : ""}, per ${now.source.publisher}. The full history is on the ${h.doc.title.split(" — ")[0]} page.` };
}

/** The facts to show with an answer: its own documents first, then same-entity figures. */
function related(primary: Hit[], hits: Hit[], max = 6): Hit[] {
  const hrefs = new Set(primary.map((h) => h.doc.href));
  const rest = strong(hits).filter((h) => !primary.includes(h) && h.doc.cited && hrefs.has(h.doc.href));
  return [...primary, ...rest].slice(0, max);
}

/** Answer a question with fixed rules. Deterministic: same index and question, same answer. */
export function answerQuestion(docs: AskDoc[], query: string): Answer {
  const q = query.toLowerCase();
  const hits = search(docs, query, 12);
  if (!hits.length) return { kind: "none", text: templateAnswer(query, hits), hits };
  const best = hits[0]!;

  if (RULES.forecast.test(q)) {
    const f = hits.find((h) => h.doc.kind === "forecast") ?? search(docs.filter((d) => d.kind === "forecast"), query, 1)[0];
    if (f) return { kind: "forecast", text: f.doc.summary ?? f.doc.title, hits: [f] };
  }
  if (RULES.model.test(q)) {
    // "Which model for X": a business-problem match first, else the general insights.
    // Only when the question names a problem (its own words), so "cheapest model" stays general.
    const words = new Set(tokenize(query));
    const named = docs.filter((d) => d.kind === "usecase" && tokenize(USE_CASE_WORDS[d.id.slice(2)] ?? "").some((w) => words.has(w)));
    const uc = search(named, query, 1)[0];
    if (uc) return { kind: "recommendation", text: uc.doc.summary!, hits: [uc] };
    const ins = search(docs.filter((d) => d.kind === "insight"), query, 1)[0];
    if (ins) return { kind: "insight", text: ins.doc.summary!, hits: [ins] };
  }
  if (RULES.compare.test(q)) {
    const c = comparison(hits);
    if (c) return { kind: "comparison", text: c.text, hits: related(c.pair, hits, 4) };
  }
  if (RULES.trend.test(q)) {
    const t = trend(hits);
    if (t) return { kind: "trend", text: t.text, hits: related([t.hit], hits, 4) };
  }
  if (best.doc.kind === "usecase") return { kind: "recommendation", text: best.doc.summary!, hits: [best] };
  if (best.doc.kind === "insight") return { kind: "insight", text: best.doc.summary!, hits: [best] };
  if (best.doc.kind === "forecast") return { kind: "forecast", text: best.doc.summary!, hits: [best] };
  if (best.doc.kind === "page" && !hits.some((h) => h.doc.cited && h.score >= best.score * 0.85)) return { kind: "page", text: best.doc.summary!, hits: [best] };
  const lead = hits.find((h) => h.doc.cited);
  return { kind: "figure", text: templateAnswer(query, hits), hits: lead ? related([lead], hits) : hits.slice(0, 1) };
}
