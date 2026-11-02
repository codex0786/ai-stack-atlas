"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmt, fmtPeriod, STATUS_LABEL } from "@/lib/format";
import type { Cited } from "@/lib/site";
import { Cite } from "./Cite";

export interface Row { entityId: string; entity: string; layers: string[]; metric: string; metricLayer: string; dims: string; c: Cited }

export function ExploreTable({ rows, layers }: { rows: Row[]; layers: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [layer, setLayer] = useState("");
  const [status, setStatus] = useState("");
  const [checked, setChecked] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !layer || r.layers.includes(layer) || r.metricLayer === layer)
      .filter((r) => !status || r.c.status === status)
      .filter((r) => !checked || (checked === "yes") === r.c.source.verified)
      .filter((r) => !needle || `${r.entity} ${r.metric} ${r.dims} ${r.c.source.publisher}`.toLowerCase().includes(needle))
      .sort((a, b) => a.entity.localeCompare(b.entity) || a.metric.localeCompare(b.metric) || b.c.period.localeCompare(a.c.period));
  }, [rows, q, layer, status, checked]);

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search company, metric, source…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={layer} onChange={(e) => setLayer(e.target.value)} aria-label="Layer">
          <option value="">All layers</option>
          {layers.map((l) => <option key={l.id} value={l.id}>{l.id} · {l.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={checked} onChange={(e) => setChecked(e.target.value)} aria-label="Verification">
          <option value="">Verified or not</option>
          <option value="yes">Verified only</option>
          <option value="no">Unverified only</option>
        </select>
      </div>
      <p className="small muted" style={{ marginBottom: 10 }} aria-live="polite">{shown.length} of {rows.length} numbers</p>
      <div className="card table-scroll">
        <table>
          <thead><tr><th>Entity</th><th>Metric</th><th>Value</th><th>Period</th><th>Status</th><th>Source</th></tr></thead>
          <tbody>
            <AnimatePresence initial={false}>
              {shown.map((r) => (
                <motion.tr key={r.c.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <td><Link href={`/entity/${r.entityId}`}>{r.entity}</Link></td>
                  <td>{r.metric}{r.dims && <div className="small muted">{r.dims}</div>}</td>
                  <td className="num"><b>{fmt(r.c)}</b></td>
                  <td className="num">{fmtPeriod(r.c.period)}</td>
                  <td>{STATUS_LABEL[r.c.status]}</td>
                  <td><Cite c={r.c} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </>
  );
}
