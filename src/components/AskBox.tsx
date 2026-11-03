"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { search, strong, templateAnswer, type AskDoc, type Hit } from "@/lib/ask";
import type { AskRef } from "@/lib/askPrompt";
import { fmt, fmtPeriod } from "@/lib/format";
import { Cite } from "./Cite";

const EXAMPLES = [
  "How much did Microsoft spend on capex last quarter?",
  "Which model is best for customer support?",
  "What does an H100 cost per hour?",
  "How fast is frontier training compute growing?",
  "What is India's data-centre capacity?",
  "Where does a dollar of AI spending go?",
];

type Ai = { state: "idle" } | { state: "loading" } | { state: "done"; answer: string; refs: AskRef[] } | { state: "error"; message: string };

/** Render "[n]" markers as links to the numbered facts below. */
function withCitations(text: string, refs: AskRef[]): ReactNode[] {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    const ref = m && refs.find((r) => r.n === Number(m[1]));
    return ref ? <a key={i} href={`#ai-ref-${ref.n}`} className="cite-ref" title={ref.title}>[{ref.n}]</a> : <span key={i}>{part}</span>;
  });
}

export function AskBox() {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [ai, setAi] = useState<Ai>({ state: "idle" });
  const index = useRef<Promise<AskDoc[]> | null>(null);
  const loadIndex = () => (index.current ??= fetch("/ask-index.json").then((r) => r.json() as Promise<AskDoc[]>));

  const run = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text) return;
    setAsked(text);
    setAi({ state: "idle" });
    setHits(search(await loadIndex(), text, 8));
    history.replaceState(null, "", `?q=${encodeURIComponent(text)}`);
  }, []);

  useEffect(() => {
    fetch("/api/ask").then((r) => r.json()).then((j: { enabled?: boolean }) => setAiEnabled(Boolean(j.enabled))).catch(() => setAiEnabled(false));
    const initial = new URLSearchParams(location.search).get("q");
    if (initial) { setQ(initial); void run(initial); }
  }, [run]);

  const submit = (e: FormEvent) => { e.preventDefault(); void run(q); };

  const askClaude = async () => {
    setAi({ state: "loading" });
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: asked }) });
      const j = (await r.json()) as { answer?: string | null; refs?: AskRef[]; error?: string };
      if (!r.ok || !j.answer) setAi({ state: "error", message: j.error ?? "No answer came back." });
      else setAi({ state: "done", answer: j.answer, refs: j.refs ?? [] });
    } catch {
      setAi({ state: "error", message: "Couldn't reach the server." });
    }
  };

  // Claude's answer cites facts by its own numbering; show the facts it was given in that order.
  // The lead fact's company or chip first, then the rest by relevance.
  const leadHref = hits.find((h) => h.doc.cited)?.doc.href;
  const factList: Hit[] = strong(hits).sort((a, b) => Number(b.doc.href === leadHref) - Number(a.doc.href === leadHref));

  return (
    <>
      <form className="ask-form" onSubmit={submit} role="search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about capex, prices, models, power, India…" aria-label="Your question" maxLength={400} autoFocus />
        <button type="submit" className="btn primary">Ask</button>
      </form>
      {!asked && (
        <div className="presets" style={{ marginTop: 14 }}>
          {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => { setQ(e); void run(e); }}>{e}</button>)}
        </div>
      )}

      {asked && (
        <motion.div key={asked} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="card ask-answer">
            <span className="small muted">Answer from the atlas&apos;s facts (search, no AI)</span>
            <p>{templateAnswer(asked, hits)}</p>
            {hits[0] && (hits[0].doc.kind !== "series") && <Link className="btn" href={hits[0].doc.href} style={{ alignSelf: "flex-start" }}>Open {hits[0].doc.title} →</Link>}
          </div>

          {aiEnabled ? (
            <div className="card ask-answer">
              <span className="small muted">Written by Claude, using only the atlas&apos;s facts</span>
              {ai.state === "idle" && hits.length > 0 && <button type="button" className="btn" onClick={askClaude} style={{ alignSelf: "flex-start" }}>Write an answer with Claude</button>}
              {ai.state === "loading" && <p className="muted">Reading the facts…</p>}
              {ai.state === "done" && (
                <>
                  <p>{withCitations(ai.answer, ai.refs)}</p>
                  {/* The exact facts Claude was given, in its numbering, so every [n] lands on the right one. */}
                  <ol className="ask-facts">
                    {ai.refs.filter((r) => ai.answer.includes(`[${r.n}]`)).map((r) => (
                      <li key={r.id} id={`ai-ref-${r.n}`} className="card">
                        <span className="badge">{r.n}</span>
                        <div style={{ minWidth: 0 }}>
                          <Link href={r.href}><b>{r.title}</b></Link>
                          {r.cited ? (
                            <div className="ask-fact-val"><b>{fmt(r.cited)}</b> <span className="small muted">{fmtPeriod(r.cited.period)} · {r.cited.status}</span> <Cite c={r.cited} /></div>
                          ) : <div className="small muted">{r.summary}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {ai.state === "error" && <p className="muted">{ai.message}</p>}
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 10 }}>AI-written answers switch on when the site owner adds an Anthropic API key; search answers always work.</p>
          )}

          {factList.length > 0 && (
            <>
              <h3 style={{ margin: "24px 0 10px", fontSize: 16 }}>The facts behind this answer</h3>
              <ol className="ask-facts">
                {factList.map((h, i) => (
                  <li key={h.doc.id} id={`fact-${i + 1}`} className="card">
                    <span className="badge">{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <Link href={h.doc.href}><b>{h.doc.title}</b></Link>
                      {h.doc.cited ? (
                        <div className="ask-fact-val">
                          <b>{fmt(h.doc.cited)}</b> <span className="small muted">{fmtPeriod(h.doc.cited.period)} · {h.doc.cited.status}</span> <Cite c={h.doc.cited} />
                        </div>
                      ) : <div className="small muted">{h.doc.summary}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </motion.div>
      )}
    </>
  );
}
