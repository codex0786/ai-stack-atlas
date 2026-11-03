import { factLine, type Hit } from "./ask";
import type { Cited } from "./site";

// The prompt for Claude-written answers. Claude only sees the retrieved facts, numbered, and
// must cite them as [n]; the page links each [n] back to the fact and its source.

export const ASK_SYSTEM = `You answer questions about the economics of the AI industry for senior executives, using only the numbered facts provided by the AI Stack Atlas.

Rules:
- Use only the facts given. If they don't answer the question, say what the atlas does cover instead; never fill gaps from memory.
- Cite every figure with its fact number in square brackets, e.g. "Microsoft's capex was $39.4B [2]".
- Note a fact's caveats when they matter: unverified sources, projections versus actuals, rumoured figures, the period a number covers.
- Lead with the direct answer in one or two sentences, then up to three short supporting points. Plain prose, no headings, under 180 words.
- This is research, not investment advice; don't recommend buying or selling securities.`;

export interface AskRef { n: number; id: string; title: string; href: string; cited?: Cited; summary?: string }

export function buildAskPrompt(question: string, hits: Hit[]): { user: string; refs: AskRef[] } {
  const refs: AskRef[] = hits.map((h, i) => ({ n: i + 1, id: h.doc.id, title: h.doc.title, href: h.doc.href, cited: h.doc.cited, summary: h.doc.summary }));
  const lines = hits.map((h, i) => `[${i + 1}] ${h.doc.cited ? factLine(h.doc) : `${h.doc.title}: ${h.doc.summary ?? ""} (page ${h.doc.href})`}`);
  return { user: `Facts:\n${lines.join("\n")}\n\nQuestion: ${question}`, refs };
}

/** Fixed-window limiter: at most `limit` calls per key per window. Pure, so it can be tested. */
export function allow(store: Map<string, number[]>, key: string, now: number, limit: number, windowMs: number): boolean {
  const recent = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { store.set(key, recent); return false; }
  recent.push(now);
  store.set(key, recent);
  return true;
}
