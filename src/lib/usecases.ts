// Business problems the executive dashboard recommends models for. Each one fixes the
// workload (tokens per task, monthly volume), hard requirements, the benchmarks that measure
// the skill, and how much the decision weighs quality against cost. All editable in one place.

export interface UseCase {
  id: string;
  name: string;
  /** The business question, as an executive would ask it. */
  problem: string;
  example: string;
  /** Typical tokens for one task. */
  inputTokens: number;
  outputTokens: number;
  /** Share of input tokens that repeat (system prompt, shared documents) and can be cached. */
  cachedShare: number;
  /** Can run as an overnight batch (≈50% cheaper where offered). */
  batchable: boolean;
  monthlyTasks: number;
  requires: { minContext?: number; vision?: boolean; tools?: boolean; structured?: boolean; openWeights?: boolean };
  /** Epoch benchmarks that measure this skill (scores blended with the overall capability index). */
  benchmarks: string[];
  /** 0–1: how much the pick weighs quality over cost (the rest is cost). */
  qualityWeight: number;
  /** The pick must reach this share of the best eligible model's quality (default 0.85). */
  qualityFloor?: number;
  /** Shown with the pick: what to check in a pilot. */
  caveat: string;
}

export const USE_CASES: UseCase[] = [
  {
    id: "support", name: "Customer support assistant",
    problem: "Which model can answer customer questions accurately at the lowest cost per conversation?",
    example: "Answering order, billing and product questions from a help-centre knowledge base, with tool calls to look up accounts.",
    inputTokens: 4_000, outputTokens: 400, cachedShare: 0.6, batchable: false, monthlyTasks: 100_000,
    requires: { tools: true }, benchmarks: ["SimpleQA Verified", "SimpleBench"], qualityWeight: 0.4,
    caveat: "Test on your own transcripts: tone, escalation rules and refusal behaviour matter more than benchmarks here.",
  },
  {
    id: "coding", name: "Software engineering & code review",
    problem: "Which model writes and fixes production code most reliably for our engineers?",
    example: "Implementing tickets, reviewing pull requests and fixing failing tests across a large repository.",
    inputTokens: 40_000, outputTokens: 4_000, cachedShare: 0.5, batchable: false, monthlyTasks: 5_000,
    requires: { tools: true, minContext: 128_000 }, benchmarks: ["Terminal Bench", "FrontierCode", "FrontierSWE", "WeirdML", "GSO-Bench", "Aider polyglot", "MirrorCode"], qualityWeight: 0.8,
    caveat: "Pilot on a week of real tickets; measure merged-PR rate, not just benchmark scores.",
  },
  {
    id: "research", name: "Market & competitive research",
    problem: "Which model produces the most trustworthy research reports and briefings?",
    example: "Synthesising analyst reports, filings and news into a competitor brief with cited claims.",
    inputTokens: 60_000, outputTokens: 5_000, cachedShare: 0.2, batchable: true, monthlyTasks: 1_000,
    requires: { minContext: 128_000 }, benchmarks: ["DeepResearch Bench", "GPQA diamond", "SimpleQA Verified", "SimpleBench"], qualityWeight: 0.8,
    caveat: "Check citations by hand on a sample: factual accuracy varies more than reasoning scores suggest.",
  },
  {
    id: "documents", name: "Contract & long-document review",
    problem: "Which model can read long contracts and filings end to end without missing clauses?",
    example: "Reviewing 200-page supplier contracts for liability, termination and pricing clauses.",
    inputTokens: 150_000, outputTokens: 3_000, cachedShare: 0, batchable: true, monthlyTasks: 2_000,
    requires: { minContext: 200_000 }, benchmarks: ["Fiction.LiveBench", "CL-bench", "SimpleQA Verified"], qualityWeight: 0.7,
    caveat: "Long-context recall drops near the window limit; test with your longest documents, not average ones.",
  },
  {
    id: "extraction", name: "Invoice & form data extraction",
    problem: "What is the cheapest model that reliably turns documents into structured data at scale?",
    example: "Extracting supplier, line items and totals from scanned invoices into JSON for the ERP.",
    inputTokens: 3_000, outputTokens: 600, cachedShare: 0.3, batchable: true, monthlyTasks: 500_000,
    requires: { vision: true, structured: true }, benchmarks: [], qualityWeight: 0.3, qualityFloor: 0.8,
    caveat: "No public benchmark tracks extraction accuracy well; score a few hundred of your own documents before switching.",
  },
  {
    id: "agents", name: "Agentic process automation",
    problem: "Which model can run multi-step back-office workflows with the least supervision?",
    example: "Reconciling accounts across systems, filing tickets and updating CRM records end to end.",
    inputTokens: 80_000, outputTokens: 8_000, cachedShare: 0.5, batchable: false, monthlyTasks: 3_000,
    requires: { tools: true, minContext: 128_000 }, benchmarks: ["APEX-Agents", "Remote Labor Index", "OSWorld 2.0", "Terminal Bench", "METR Time Horizons"], qualityWeight: 0.8,
    caveat: "Agent failures compound over steps; measure task completion rate on your workflow with a human checkpoint.",
  },
  {
    id: "finance", name: "Financial & quantitative analysis",
    problem: "Which model handles financial modelling and quantitative reasoning most accurately?",
    example: "Building DCF sensitivities, checking model logic and explaining variance in management accounts.",
    inputTokens: 25_000, outputTokens: 3_000, cachedShare: 0.2, batchable: false, monthlyTasks: 2_000,
    requires: {}, benchmarks: ["OTIS Mock AIME 2024-2025", "FrontierMath-Tiers-1-3-v2-Private", "GPQA diamond", "ProofBench"], qualityWeight: 0.8,
    caveat: "Have the model show its working and recompute key numbers in a spreadsheet; never accept unchecked figures.",
  },
  {
    id: "knowledge", name: "Professional knowledge work",
    problem: "Which model does the best job on real white-collar deliverables — memos, analyses, plans?",
    example: "Drafting board memos, policy analyses and project plans that a manager would sign off on.",
    inputTokens: 15_000, outputTokens: 3_000, cachedShare: 0.2, batchable: false, monthlyTasks: 5_000,
    requires: {}, benchmarks: ["GDPval", "Remote Labor Index", "SimpleBench", "GPQA diamond"], qualityWeight: 0.7,
    caveat: "Quality here is subjective; run a blind comparison with the people who will use the output.",
  },
  {
    id: "private", name: "Private deployment (sensitive data)",
    problem: "Which open-weight model can we run on our own infrastructure for regulated data?",
    example: "HR, legal or patient data that cannot leave our environment; served on our own GPUs.",
    inputTokens: 6_000, outputTokens: 800, cachedShare: 0.4, batchable: false, monthlyTasks: 50_000,
    requires: { openWeights: true }, benchmarks: ["SimpleQA Verified", "GPQA diamond"], qualityWeight: 0.6,
    caveat: "Self-hosting cost is GPUs, not tokens: the price shown is what third-party hosts charge, a proxy for running it yourself.",
  },
];
