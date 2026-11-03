import { describe, expect, it } from "vitest";
import { search, templateAnswer, tokenize, type AskDoc } from "../src/lib/ask";
import { buildAskIndex } from "../src/lib/askIndex";
import { getSite } from "../src/lib/site";

const site = await getSite();
const index = buildAskIndex(site);
const top = (q: string) => search(index, q, 5).map((h) => h.doc.title);

describe("tokenize", () => {
  it("drops stop words and light-stems plurals", () => {
    expect(tokenize("What is the H100 rental prices?")).toEqual(["h100", "rental", "price"]);
  });
});

describe("Ask over the real index", () => {
  it("covers series, business problems and pages", () => {
    expect(index.filter((d) => d.kind === "series").length).toBeGreaterThan(100);
    expect(index.some((d) => d.kind === "usecase")).toBe(true);
    expect(index.some((d) => d.href === "/forecasts")).toBe(true);
  });

  it("finds company metrics, including through synonyms", () => {
    expect(top("Microsoft capex")[0]).toMatch(/^Microsoft — Capital expenditure/);
    expect(top("how much is Google spending")[0]).toMatch(/Alphabet/);
    expect(top("Anthropic revenue")[0]).toMatch(/^Anthropic — Revenue run-rate/);
  });

  it("keeps related facts on-topic", () => {
    const a = templateAnswer("q", search(index, "How much did Microsoft spend on capex last quarter?", 8));
    expect(a).toMatch(/^Microsoft — Capital expenditure is/);
    expect(a).not.toMatch(/Open-weight/);
    const s = templateAnswer("q", search(index, "Which model is best for customer support?", 8));
    expect(s).not.toMatch(/xAI|DeepSeek/);
  });

  it("routes 'which model' questions to the dashboard's recommendation", () => {
    const h = search(index, "which model is best for customer support", 3);
    expect(h[0]!.doc.kind).toBe("usecase");
    expect(templateAnswer("q", h)).toMatch(/dashboard recommends/);
  });

  it("answers from the top fact with its source and period", () => {
    const h = search(index, "rupee dollar exchange rate", 3);
    const a = templateAnswer("q", h);
    expect(a).toMatch(/₹\d+\.\d\d\/\$/);
    expect(a).toMatch(/per Frankfurter/);
  });

  it("says plainly when nothing matches", () => {
    expect(templateAnswer("zebra migration", search(index, "zebra migration"))).toMatch(/no data matching/);
  });
});

describe("search ranking", () => {
  it("prefers title matches", () => {
    const docs: AskDoc[] = [
      { id: "a", kind: "page", title: "Energy", text: "power grid", href: "/a" },
      { id: "b", kind: "page", title: "Other", text: "energy mentioned once among many other unrelated words here", href: "/b" },
    ];
    expect(search(docs, "energy")[0]!.doc.id).toBe("a");
  });
});


import { answerQuestion } from "../src/lib/ask";

describe("rule-based answers", () => {
  const cases: [string, string, RegExp][] = [
    ["Compare Microsoft and Amazon capex", "comparison", /Amazon \(AWS\) is [\d.]+× Microsoft/],
    ["Nvidia vs AMD revenue", "comparison", /NVIDIA is [\d.]+× AMD/],
    ["How fast is Alphabet capex growing?", "trend", /moved from \$[\d.]+B .* to \$[\d.]+B .*a change of [+−]\d+%/],
    ["What is the forecast for hyperscaler capex next quarter?", "forecast", /forecasts big-four hyperscaler capex.*90% interval/],
    ["What will the rupee be next month?", "forecast", /rupees per US dollar/],
    ["Which model is best for coding?", "recommendation", /software engineering & code review, the dashboard recommends/],
    ["Which model should we use for customer support?", "recommendation", /customer support assistant/],
    ["What is the most capable AI model?", "insight", /most capable model in the catalog/],
    ["What's the cheapest model?", "insight", /cheapest model in the catalog/],
    ["Best open source model", "insight", /most capable open-weight model/],
    ["Where does a dollar of AI spending go?", "insight", /Of \$1 spent on an AI app/],
    ["What does an H100 cost per hour?", "insight", /H100 costs from \$[\d.]+\/GPU-hr to \$[\d.]+\/GPU-hr/],
    ["How much did Microsoft spend on capex last quarter?", "figure", /^Microsoft — Capital expenditure is/],
    ["zebra migration", "none", /no data matching/],
  ];
  for (const [q, kind, re] of cases) {
    it(`${q} → ${kind}`, () => {
      const a = answerQuestion(index, q);
      expect(a.kind).toBe(kind);
      expect(a.text).toMatch(re);
    });
  }

  it("shows the facts each answer used, in order", () => {
    const c = answerQuestion(index, "Compare Microsoft and Amazon capex").hits.map((h) => h.doc.title);
    expect(c.slice(0, 2)).toEqual(["Microsoft — Capital expenditure", "Amazon (AWS) — Capital expenditure"]);
    expect(answerQuestion(index, "Which model is best for customer support?").hits).toHaveLength(1);
    const f = answerQuestion(index, "Microsoft capex").hits.map((h) => h.doc.href);
    expect(f.every((h) => h === "/entity/microsoft")).toBe(true);
  });

  it("is deterministic", () => {
    expect(answerQuestion(index, "Nvidia vs AMD revenue")).toEqual(answerQuestion(index, "Nvidia vs AMD revenue"));
  });
});
