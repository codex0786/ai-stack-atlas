// Number formatting for the site. `parts` splits a value into prefix / number / suffix so
// client components can animate just the number (count-up) and keep the units fixed.

export interface Parts {
  prefix: string;
  num: number;
  decimals: number;
  suffix: string;
}

interface Formattable {
  value: number;
  unit: string;
  kind: string;
  currency?: string;
}

const SYMBOL: Record<string, string> = { USD: "$", INR: "₹" };

function scaled(v: number): { num: number; mag: string } {
  const a = Math.abs(v);
  if (a >= 1e12) return { num: v / 1e12, mag: "T" };
  if (a >= 1e9) return { num: v / 1e9, mag: "B" };
  if (a >= 1e6) return { num: v / 1e6, mag: "M" };
  return { num: v, mag: "" };
}

/** Fewest decimals that still show the value faithfully (max 2). */
function decimalsFor(n: number): number {
  for (const d of [0, 1, 2]) if (Math.abs(Number(n.toFixed(d)) - n) < 1e-9 * Math.max(1, Math.abs(n))) return d;
  return 2;
}

export function parts(x: Formattable, value = x.value): Parts {
  const cur = x.currency ? SYMBOL[x.currency] ?? `${x.currency} ` : "";
  const unitSuffix: Record<string, string> = {
    "per GPU-hour": "/GPU-hr",
    "per million tokens": "/M tokens",
    "per year": "/yr",
    "per run": "/run",
  };
  if (x.currency) {
    const { num, mag } = scaled(value);
    const decimals = mag ? decimalsFor(num) : value < 100 ? 2 : decimalsFor(num);
    return { prefix: cur, num, decimals, suffix: `${mag}${unitSuffix[x.unit] ?? ""}` };
  }
  switch (x.unit) {
    case "share":
      return { prefix: "", num: value * 100, decimals: decimalsFor(value * 100) > 1 ? 1 : decimalsFor(value * 100), suffix: "%" };
    case "ratio":
      if (x.kind === "growth") {
        const pct = value * 100;
        return { prefix: pct > 0 ? "+" : pct < 0 ? "−" : "", num: Math.abs(pct), decimals: 0, suffix: "%" };
      }
      return { prefix: "", num: value, decimals: decimalsFor(value), suffix: "×" };
    case "x per year":
      return { prefix: "", num: value, decimals: decimalsFor(value), suffix: "×/yr" };
    case "FLOP/s":
      return { prefix: "", num: value / 1e12, decimals: decimalsFor(value / 1e12), suffix: " TFLOPS" };
    case "FLOP": {
      const e = Math.floor(Math.log10(Math.abs(value) || 1));
      const sup = String(e).replace(/[0-9-]/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"["0123456789".indexOf(d)] ?? "⁻");
      return { prefix: "", num: value / 10 ** e, decimals: 1, suffix: `×10${sup} FLOP` };
    }
    case "INR per USD":
      return { prefix: "₹", num: value, decimals: 2, suffix: "/$" };
    case "TWh per year":
      return { prefix: "", num: value, decimals: 0, suffix: " TWh" };
    case "wafers per month":
      return { prefix: "", num: value / 1000, decimals: decimalsFor(value / 1000), suffix: "k wafers/mo" };
    case "GPUs":
      return { prefix: "", num: value, decimals: 0, suffix: " GPUs" };
    default:
      return { prefix: "", num: value, decimals: decimalsFor(value), suffix: x.unit ? ` ${x.unit}` : "" };
  }
}

export function joinParts(p: Parts, num = p.num): string {
  const body = num.toLocaleString("en-US", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals });
  return `${p.prefix}${body}${p.suffix}`;
}

export function fmt(x: Formattable, value = x.value): string {
  return joinParts(parts(x, value));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtPeriod(p: string): string {
  const y = p.slice(0, 4);
  const rest = p.slice(5);
  if (!rest) return y;
  if (rest.startsWith("Q") || rest.startsWith("H")) return `${rest} ${y}`;
  const m = MONTHS[Number(rest.slice(0, 2)) - 1];
  return rest.length === 2 ? `${m} ${y}` : `${Number(rest.slice(3))} ${m} ${y}`;
}

export const STATUS_LABEL: Record<string, string> = { actual: "Actual", guidance: "Guidance", projection: "Projection", rumoured: "Rumoured" };
export const TIER_LABEL: Record<number, string> = { 1: "Primary", 2: "Relay / analyst", 3: "Secondary" };
