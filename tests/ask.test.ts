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

import { allow, buildAskPrompt } from "../src/lib/askPrompt";

describe("Claude prompt", () => {
  it("numbers each retrieved fact with its source so answers can cite [n]", () => {
    const hits = search(index, "Microsoft capex", 3);
    const { user, refs } = buildAskPrompt("How much does Microsoft spend?", hits);
    expect(user).toMatch(/^Facts:\n\[1\] Microsoft — Capital expenditure: \$[\d.]+B — .+source: SEC EDGAR \(tier 1, automated\)/);
    expect(user.endsWith("Question: How much does Microsoft spend?")).toBe(true);
    expect(refs[0]).toMatchObject({ n: 1, href: "/entity/microsoft" });
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then blocks until it slides", () => {
    const store = new Map<string, number[]>();
    expect([0, 1, 2].map((t) => allow(store, "ip", t, 2, 100))).toEqual([true, true, false]);
    expect(allow(store, "ip", 150, 2, 100)).toBe(true);
    expect(allow(store, "other", 2, 2, 100)).toBe(true);
  });
});
