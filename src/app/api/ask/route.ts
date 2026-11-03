import Anthropic from "@anthropic-ai/sdk";
import { search, strong, type AskDoc } from "@/lib/ask";
import { buildAskIndex } from "@/lib/askIndex";
import { allow, ASK_SYSTEM, buildAskPrompt } from "@/lib/askPrompt";
import { getSite } from "@/lib/site";

// Claude-written answers over the atlas's facts. Off until ANTHROPIC_API_KEY is set on Vercel.
// Guard rails for a public endpoint: same-origin only, short questions, per-visitor and
// per-instance limits, and a small answer cache. Set a spend limit in the Anthropic Console too.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION = 400;
const PER_VISITOR = { limit: 6, windowMs: 60 * 60_000 }; // 6 an hour per IP
const PER_INSTANCE = { limit: 300, windowMs: 24 * 60 * 60_000 }; // 300 a day per server instance
const visitors = new Map<string, number[]>();
const instance = new Map<string, number[]>();
const cache = new Map<string, { at: number; body: unknown }>();

let index: AskDoc[] | undefined;
const getIndex = async () => (index ??= buildAskIndex(await getSite()));

export async function GET() {
  return Response.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "AI answers are not enabled on this deployment." }, { status: 503 });

  // Same-origin requests only: the page calls this; other sites shouldn't spend the budget.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Ask a question." }, { status: 400 });
  if (question.length > MAX_QUESTION) return Response.json({ error: `Keep questions under ${MAX_QUESTION} characters.` }, { status: 400 });

  const key = question.toLowerCase().replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 60 * 60_000) return Response.json(hit.body);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (!allow(visitors, ip, now, PER_VISITOR.limit, PER_VISITOR.windowMs)) return Response.json({ error: "You've reached the hourly limit for AI answers. The search answer above still works." }, { status: 429 });
  if (!allow(instance, "all", now, PER_INSTANCE.limit, PER_INSTANCE.windowMs)) return Response.json({ error: "AI answers are paused for today. The search answer above still works." }, { status: 429 });

  const hits = strong(search(await getIndex(), question, 14), 0.3);
  if (!hits.length) return Response.json({ answer: "The atlas has no facts matching that question, so there's nothing to answer from.", refs: [] });
  const { user, refs } = buildAskPrompt(question, hits);

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: ASK_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") {
      return Response.json({ answer: null, refused: true, error: "The model declined to answer this question." });
    }
    const answer = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    const result = { answer, refs, model: response.model };
    cache.set(key, { at: Date.now(), body: result });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: "The AI service is busy; try again in a minute." }, { status: 503 });
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: "AI answers are misconfigured (invalid API key)." }, { status: 503 });
    if (error instanceof Anthropic.APIError) return Response.json({ error: `The AI service returned an error (${error.status}).` }, { status: 502 });
    return Response.json({ error: "Couldn't reach the AI service." }, { status: 502 });
  }
}
