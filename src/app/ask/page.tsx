import type { Metadata } from "next";
import Link from "next/link";
import { AskBox } from "@/components/AskBox";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = {
  title: "Ask the atlas",
  description: "Ask a question about AI economics and get an answer built only from the atlas's sourced facts, with every figure cited.",
};

export default function AskPage() {
  return (
    <section>
      <div className="wrap" style={{ maxWidth: 860 }}>
        <Reveal>
          <div className="eyebrow">Ask</div>
          <h1 className="sec-title" style={{ fontSize: "clamp(30px, 4.5vw, 46px)" }}>Ask the atlas</h1>
          <p className="sec-lede">
            Questions are answered only from the atlas&apos;s facts — every figure links to its source, period and how it was checked. If the atlas doesn&apos;t cover something,
            it says so rather than guessing. <Link href="/methodology">How the data works</Link>.
          </p>
        </Reveal>
        <div style={{ marginTop: 24 }}><AskBox /></div>
      </div>
    </section>
  );
}
