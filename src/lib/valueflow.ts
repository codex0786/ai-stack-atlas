// "Where does $1 of AI spend go?" (PLAN.md §5, E7). Follows one dollar down the stack: each
// layer keeps its margin and passes the rest to its suppliers, until every cent has landed.
// Splits are sourced where filings or data allow; the rest are labelled assumptions.

export interface FlowInputs {
  /** Share of an AI app's revenue paid out to model APIs (its main cost of revenue). */
  appApiShare: number;
  /** Share of a model lab's revenue spent on compute (training + inference). */
  labComputeShare: number;
  /** Cloud operator's margin on GPU rental. */
  cloudMargin: number;
  /** How the operator's cost splits: capital (hardware depreciation), power, facility & operations. */
  cloudCost: { capital: number; power: number; opex: number };
  /** Share of AI server capex paid to the accelerator vendor (GPU boards, NVLink). */
  gpuVendorShare: number;
  /** Accelerator vendor's gross margin. */
  gpuVendorMargin: number;
  /** How the vendor's cost of goods splits between suppliers. */
  vendorCogs: { memory: number; foundry: number; other: number };
}

export type Entry = "app" | "api" | "compute";

export interface FlowNode { id: string; label: string; col: number; value: number; layer: string; leaf: boolean; note?: string }
export interface FlowLink { from: string; to: string; value: number }

const norm = <T extends Record<string, number>>(o: T): T => {
  const t = Object.values(o).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / t])) as T;
};

/** Build the flow of $1 entering at an app, a model API, or a GPU rental. */
export function valueFlow(i: FlowInputs, entry: Entry = "app"): { nodes: FlowNode[]; links: FlowLink[] } {
  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  const node = (id: string, label: string, col: number, value: number, layer: string, leaf: boolean, note?: string) => nodes.push({ id, label, col, value, layer, leaf, note });
  const link = (from: string, to: string, value: number) => value > 0 && links.push({ from, to, value });
  const cost = norm(i.cloudCost), cogs = norm(i.vendorCogs);

  let col = 0;
  node("spend", entry === "app" ? "$1 spent on AI apps" : entry === "api" ? "$1 spent on model APIs" : "$1 spent on GPU rental", col, 1, "L7", false);

  let toLab = 1, labFrom = "spend";
  if (entry === "app") {
    col++;
    node("app", "AI applications keep", col, 1 - i.appApiShare, "L6", true, "Gross profit of the app company");
    node("api", "Paid to model APIs", col, i.appApiShare, "L5", false);
    link("spend", "app", 1 - i.appApiShare);
    link("spend", "api", i.appApiShare);
    toLab = i.appApiShare; labFrom = "api";
  }

  let toCompute = 1, computeFrom = "spend";
  if (entry !== "compute") {
    col++;
    node("lab", "Model labs keep", col, toLab * (1 - i.labComputeShare), "L4", true, "Staff, research and profit");
    node("compute", "Paid for compute", col, toLab * i.labComputeShare, "L3", false);
    link(labFrom, "lab", toLab * (1 - i.labComputeShare));
    link(labFrom, "compute", toLab * i.labComputeShare);
    toCompute = toLab * i.labComputeShare; computeFrom = "compute";
  }

  col++;
  const opCost = toCompute * (1 - i.cloudMargin);
  node("cloud", "Cloud operators keep", col, toCompute * i.cloudMargin, "L3", true, "Margin on GPU rental");
  node("hardware", "Hardware", col, opCost * cost.capital, "L1", false);
  node("facility", "Data-centre operations", col, opCost * cost.opex, "L2", true, "Buildings, cooling, staff, maintenance");
  node("energy", "Energy", col, opCost * cost.power, "L0", true, "Electricity, incl. cooling overhead (PUE)");
  link(computeFrom, "cloud", toCompute * i.cloudMargin);
  link(computeFrom, "hardware", opCost * cost.capital);
  link(computeFrom, "facility", opCost * cost.opex);
  link(computeFrom, "energy", opCost * cost.power);

  col++;
  const hw = opCost * cost.capital;
  node("vendor", "GPU vendor", col, hw * i.gpuVendorShare, "L1", false);
  node("otherhw", "Other hardware", col, hw * (1 - i.gpuVendorShare), "L1", true, "Networking, CPUs, servers, storage");
  link("hardware", "vendor", hw * i.gpuVendorShare);
  link("hardware", "otherhw", hw * (1 - i.gpuVendorShare));

  col++;
  const v = hw * i.gpuVendorShare, vc = v * (1 - i.gpuVendorMargin);
  node("vendorgp", "GPU vendor keeps", col, v * i.gpuVendorMargin, "L1", true, "Gross profit (NVIDIA's reported margin)");
  node("memory", "Memory (HBM)", col, vc * cogs.memory, "L1", true);
  node("foundry", "Foundry (TSMC)", col, vc * cogs.foundry, "L1", true, "Wafers and advanced packaging");
  node("suppliers", "Other suppliers", col, vc * cogs.other, "L1", true, "Substrates, boards, power delivery");
  link("vendor", "vendorgp", v * i.gpuVendorMargin);
  link("vendor", "memory", vc * cogs.memory);
  link("vendor", "foundry", vc * cogs.foundry);
  link("vendor", "suppliers", vc * cogs.other);

  return { nodes, links };
}

/** Leaves = where money ends up; they always sum to $1. */
export const captured = (nodes: FlowNode[]) => nodes.filter((n) => n.leaf).sort((a, b) => b.value - a.value);
