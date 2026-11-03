// Polite JSON fetch for feeds: identifying User-Agent (SEC requires one), timeout, and
// retries with backoff on 429/5xx and network errors.

export const USER_AGENT = "AI Stack Atlas research bot (https://github.com/codex0786/ai-stack-atlas)";

export async function fetchJson<T>(url: string, opts: { headers?: Record<string, string>; retries?: number; timeoutMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new Error(`HTTP ${res.status} from ${redact(url)}`);
      if (!retryable) break;
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Plain-text fetch (CSV) with the same timeout and User-Agent. */
export async function fetchText(url: string, timeoutMs = 120_000): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${redact(url)}`);
  return res.text();
}

/** Strip API keys from URLs before they reach logs, errors or committed status files. */
export function redact(url: string): string {
  return url.replace(/(api_key=)[^&]+/gi, "$1***");
}
