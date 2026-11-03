import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion";
import { THEME_SCRIPT, ThemeToggle } from "@/components/ThemeToggle";
import { REPO } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AI Stack Atlas", template: "%s · AI Stack Atlas" },
  description: "Who builds AI, what it costs, and who gets paid — energy, chips, data centres, compute, models and distribution, with every number traced to its source.",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f9f9f7" }, { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" }],
};

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="15" width="18" height="5" rx="1.5" fill="var(--l1)" />
      <rect x="4.5" y="9.5" width="15" height="4.5" rx="1.5" fill="var(--l4)" />
      <rect x="6" y="4" width="12" height="4.5" rx="1.5" fill="var(--l7)" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <MotionProvider>
          <header className="top">
            <div className="wrap">
              <Link href="/" className="brand"><Logo />AI Stack Atlas</Link>
              <nav className="nav" aria-label="Main">
                <Link href="/dashboard"><b>Dashboard</b></Link>
                <Link href="/calculators">Calculators</Link>
                <Link href="/value-flow">Value flow</Link>
                <Link href="/india">India</Link>
                <Link href="/#live" className="hide-sm">Live</Link>
                <Link href="/explore">Explore</Link>
                <Link href="/sources" className="hide-md">Sources</Link>
                <Link href="/downloads">Data</Link>
                <Link href="/methodology" className="hide-md">Method</Link>
                <Link href="/changelog" className="hide-md">Changelog</Link>
              </nav>
              <ThemeToggle />
            </div>
          </header>
          <main>{children}</main>
          <footer>
            <div className="wrap">
              <span>Every number links to its source. Tier 1 = primary, 2 = relay/analyst, 3 = secondary. Hollow dots = not yet verified; ⚙ = pulled automatically.</span>
              <span>
                <Link href="/methodology">Methodology</Link> · <Link href="/sources">Sources</Link> · <Link href="/downloads">Downloads</Link> · <Link href="/changelog">Changelog</Link> ·{" "}
                <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a> · Data CC BY 4.0 · Research, not investment advice.
              </span>
            </div>
          </footer>
        </MotionProvider>
      </body>
    </html>
  );
}
