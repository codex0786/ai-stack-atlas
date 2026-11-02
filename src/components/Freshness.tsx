"use client";

import { useEffect, useState } from "react";

/**
 * "Updated 3 h ago" from an ISO time, computed in the browser so it stays true between
 * builds. Stale (amber) once older than twice the feed's cadence plus a 6-hour grace.
 */
export function Freshness({ at, tried, cadenceHours, ok = true, label = "Updated" }: { at?: string; tried?: string; cadenceHours: number; ok?: boolean; label?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const ago = (iso: string) => {
    const h = now === null ? 0 : (now - Date.parse(iso)) / 3_600_000;
    return now === null ? `${iso.slice(0, 16).replace("T", " ")} UTC` : h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
  };
  if (!at) return <span className="fresh bad"><i aria-hidden />{tried ? `No successful run yet · tried ${ago(tried)}` : "Not yet run"}</span>;
  const ageH = now === null ? 0 : (now - Date.parse(at)) / 3_600_000;
  const stale = ageH > cadenceHours * 2 + 6;
  const state = !ok ? "bad" : stale ? "stale" : "ok";
  return (
    <span className={`fresh ${state}`} title={new Date(at).toUTCString()}>
      <i aria-hidden />
      {label} {ago(at)}{state === "stale" ? " · stale" : state === "bad" ? " · last run failed" : ""}
    </span>
  );
}
