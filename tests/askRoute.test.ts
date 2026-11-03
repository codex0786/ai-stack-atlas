import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Anthropic SDK: capture each request and return a scripted response.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic { beta = { messages: { create } }; static APIError = APIError; static RateLimitError = RateLimitError; static AuthenticationError = AuthenticationError; }
  return { default: Anthropic };
});

const { GET, POST } = await import("../src/app/api/ask/route");
const post = (question: string, headers: Record<string, string> = {}) =>
  POST(new Request("http://atlas.test/api/ask", { method: "POST", headers: { host: "atlas.test", origin: "http://atlas.test", "content-type": "application/json", ...headers }, body: JSON.stringify({ question }) }));

describe("/api/ask", () => {
  beforeEach(() => { create.mockReset(); process.env.ANTHROPIC_API_KEY = "test-key"; });

  it("reports whether AI answers are enabled", async () => {
    expect(await (await GET()).json()).toEqual({ enabled: true });
    delete process.env.ANTHROPIC_API_KEY;
    expect(await (await GET()).json()).toEqual({ enabled: false });
    expect((await post("Microsoft capex")).status).toBe(503);
  });

  it("sends numbered facts to Claude Opus 5.5 with server-side fallback, and returns the answer with refs", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: "Microsoft spent $39.37B [1]." }] });
    const r = await post("How much does Microsoft spend on capex?", { "x-forwarded-for": "1.1.1.1" });
    const body = await r.json();
    expect(body.answer).toBe("Microsoft spent $39.37B [1].");
    expect(body.refs[0]).toMatchObject({ n: 1, href: "/entity/microsoft" });
    expect(body.refs[0].cited.source.publisher).toBe("SEC EDGAR");
    const req = create.mock.calls[0]![0];
    expect(req).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"], output_config: { effort: "low" } });
    expect(req.messages[0].content).toMatch(/^Facts:\n\[1\] Microsoft — Capital expenditure/);
  });

  it("handles a refusal without reading content", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    const body = await (await post("Microsoft revenue", { "x-forwarded-for": "2.2.2.2" })).json();
    expect(body).toMatchObject({ answer: null, refused: true });
  });

  it("rejects cross-origin calls and over-long questions", async () => {
    expect((await post("Microsoft capex", { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("x".repeat(401))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rate-limits each visitor", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", model: "m", content: [{ type: "text", text: "ok" }] });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await post(`Nvidia revenue question ${i}`, { "x-forwarded-for": "9.9.9.9" })).status);
    expect(codes.slice(0, 6).every((c) => c === 200)).toBe(true);
    expect(codes[6]).toBe(429);
  });
});
