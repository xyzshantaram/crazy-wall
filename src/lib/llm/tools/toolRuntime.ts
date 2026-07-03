/**
 * Shared runtime for search/fetch tools: per-turn call budgets, in-memory
 * broken-URL blacklisting, retry/backoff-wrapped fetch, and a persistent
 * (IndexedDB-backed) result cache so repeat queries within the cache window
 * resolve instantly without hitting the network.
 *
 * "Search" tools (wikipedia_search, tavily_search) return a list of
 * candidate URLs. "Fetch" tools (wikipedia_fetch, web_fetch) retrieve one
 * document's content. The system prompt's strategy is search-once,
 * fetch-many, so the two get separate (asymmetric) budgets.
 *
 * Free vs. paid searches are budgeted separately: wikipedia_search costs the
 * user nothing (Wikipedia's own public API, no key), while tavily_search
 * spends the user's Tavily API credits. Sharing one counter between them
 * would mean a couple of free Wikipedia lookups eat into the budget for the
 * paid search the user is actually paying for — so each gets its own cap.
 */

import { getToolCacheEntry, putToolCacheEntry } from "../../persistence";
import type { ZodType } from "zod";

// ── Per-turn call budget ─────────────────────────────────────────────────────

/** wikipedia_search — free, no API key, so a more generous cap is fine. */
export const MAX_FREE_SEARCHES_PER_TURN = 5;
/** tavily_search — spends the user's paid API credits. */
export const MAX_PAID_SEARCHES_PER_TURN = 4;
export const MAX_FETCHES_PER_TURN = 20;

export class ToolCallBudget {
  private freeSearchCount = 0;
  private paidSearchCount = 0;
  private fetchCount = 0;
  private readonly maxFreeSearches: number;
  private readonly maxPaidSearches: number;
  private readonly maxFetches: number;

  constructor(
    maxFreeSearches = MAX_FREE_SEARCHES_PER_TURN,
    maxPaidSearches = MAX_PAID_SEARCHES_PER_TURN,
    maxFetches = MAX_FETCHES_PER_TURN,
  ) {
    this.maxFreeSearches = maxFreeSearches;
    this.maxPaidSearches = maxPaidSearches;
    this.maxFetches = maxFetches;
  }

  /** wikipedia_search — free budget. */
  canSearchFree(): boolean { return this.freeSearchCount < this.maxFreeSearches; }
  useSearchFree(): void { this.freeSearchCount++; }
  searchFreeRemaining(): number { return Math.max(0, this.maxFreeSearches - this.freeSearchCount); }

  /** tavily_search — paid budget. */
  canSearchPaid(): boolean { return this.paidSearchCount < this.maxPaidSearches; }
  useSearchPaid(): void { this.paidSearchCount++; }
  searchPaidRemaining(): number { return Math.max(0, this.maxPaidSearches - this.paidSearchCount); }

  canFetch(): boolean { return this.fetchCount < this.maxFetches; }
  useFetch(): void { this.fetchCount++; }
  fetchRemaining(): number { return Math.max(0, this.maxFetches - this.fetchCount); }
}


// ── Broken-URL blacklist (in-memory, resets on reload) ───────────────────────

const BROKEN_URL_THRESHOLD = 3;
const urlFailureCounts = new Map<string, number>();

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function isUrlBlacklisted(url: string): boolean {
  return (urlFailureCounts.get(normalizeUrl(url)) ?? 0) >= BROKEN_URL_THRESHOLD;
}

export function recordUrlFailure(url: string): void {
  const key = normalizeUrl(url);
  urlFailureCounts.set(key, (urlFailureCounts.get(key) ?? 0) + 1);
}

export function recordUrlSuccess(url: string): void {
  urlFailureCounts.delete(normalizeUrl(url));
}

// ── Citation pool: ground-truth registry of URLs actually fetched this turn ──
//
// Tool outputs append a `CITATION_JSON: {...}` or `CITATION_JSON_LIST: [...]`
// marker so the model can "copy it verbatim" into the final response's
// citations[]. But nothing previously verified the model actually did that
// correctly — a model could hallucinate a different URL, typo one, or drop a
// citation's URL on a long context, and no downstream code would ever
// notice. For an app whose entire value proposition is trustworthy sourcing,
// "hope the model copied it right" is not good enough.
//
// extractCitationMarkers() parses those markers out of every tool result as
// it comes back (ground truth: this URL really was fetched, this is really
// its title). generateGraph.ts feeds every tool result through this and
// accumulates matches into a CitationPool for the turn. parseResponse.ts
// then cross-checks the model's self-reported citations[] against the pool:
// a citation whose URL doesn't match anything actually fetched this turn is
// dropped rather than silently trusted, and if the pool has a title for that
// URL, the model's title is corrected to match the fetched source exactly.

export interface ExtractedCitation {
  title: string;
  url: string;
}

const CITATION_JSON_RE = /CITATION_JSON:\s*(\{[^\n]*\})/g;
const CITATION_JSON_LIST_RE = /CITATION_JSON_LIST:\s*(\[[^\n]*\])/g;

/** Parse CITATION_JSON / CITATION_JSON_LIST markers out of a tool result string. */
export function extractCitationMarkers(toolOutput: string): ExtractedCitation[] {
  const found: ExtractedCitation[] = [];

  for (const match of toolOutput.matchAll(CITATION_JSON_RE)) {
    try {
      const parsed = JSON.parse(match[1]) as { title?: unknown; url?: unknown };
      if (typeof parsed.url === "string" && parsed.url) {
        found.push({ title: typeof parsed.title === "string" ? parsed.title : parsed.url, url: parsed.url });
      }
    } catch {
      // Malformed marker — ignore rather than let a bad regex match poison the pool.
    }
  }

  for (const match of toolOutput.matchAll(CITATION_JSON_LIST_RE)) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
            const c = item as { title?: unknown; url: string };
            found.push({ title: typeof c.title === "string" ? c.title : c.url, url: c.url });
          }
        }
      }
    } catch {
      // Malformed marker — ignore.
    }
  }

  return found;
}

/** Per-turn registry of citations backed by tool results actually fetched. */
export class CitationPool {
  private byUrl = new Map<string, ExtractedCitation>();

  /** Scan a tool's raw output for CITATION_JSON(_LIST) markers and register them. */
  ingest(toolOutput: string): void {
    for (const c of extractCitationMarkers(toolOutput)) {
      this.byUrl.set(normalizeUrl(c.url), c);
    }
  }

  /** True if this URL matches something actually fetched this turn. */
  has(url: string): boolean {
    return this.byUrl.has(normalizeUrl(url));
  }

  /** The ground-truth title for this URL, if known. */
  titleFor(url: string): string | undefined {
    return this.byUrl.get(normalizeUrl(url))?.title;
  }

  get size(): number {
    return this.byUrl.size;
  }
}

// ── Robust fetch: retry + backoff, offline short-circuit, background-tab-aware timeout ──

export class OfflineError extends Error {
  constructor() {
    super("Network is offline.");
    this.name = "OfflineError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RobustFetchOptions {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

/**
 * fetch() wrapped with:
 *  - immediate failure (no retry) when navigator.onLine is false
 *  - exponential backoff retry on network errors, timeouts, and 5xx responses
 *  - a longer effective timeout when the tab is backgrounded, since browsers
 *    throttle timers/network there and a 15s timer can fire much later or
 *    the request itself gets deprioritized — a short timeout in that state
 *    just produces spurious failures rather than genuinely slow responses.
 */
export async function robustFetch(url: string, init: RequestInit = {}, opts: RobustFetchOptions = {}): Promise<Response> {
  const { retries = 2, baseDelayMs = 700, timeoutMs = 15000 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new OfflineError();
    }

    const hidden = typeof document !== "undefined" && document.hidden;
    const effectiveTimeout = hidden ? timeoutMs * 2 : timeoutMs;

    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(effectiveTimeout) });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const isTimeoutOrAbort = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      // Plain fetch() network failures (DNS, connection refused, CORS) surface as TypeError.
      const isNetworkError = err instanceof TypeError;
      if ((isTimeoutOrAbort || isNetworkError) && attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ── Tool argument validation (zod) ──────────────────────────────────────────
//
// Tool `execute()` receives raw `Record<string, unknown>` args parsed
// straight from the model's tool-call JSON, with no schema enforcement
// against the `parameters` JSON Schema shown to the model — each tool used
// to do its own ad-hoc `String(args.x ?? "")` / `Number(args.y ?? 5)`
// coercion, which silently produces `"undefined"` strings or `NaN` numbers
// on malformed model output instead of surfacing a clear error. This wraps a
// tool's execute() with a zod schema: on validation failure the model gets a
// legible "invalid arguments" message it can react to and retry, instead of
// the tool silently operating on garbage.

/** Wrap a tool's execute() with zod validation — malformed args short-circuit
 *  with a clear error message the model can read and correct on retry. */
export function withValidatedArgs<T>(
  schema: ZodType<T>,
  execute: (args: T) => Promise<string>,
): (args: Record<string, unknown>) => Promise<string> {
  return async (rawArgs) => {
    const result = schema.safeParse(rawArgs);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      return `Invalid arguments: ${issues}. Check the parameter types and try again.`;
    }
    return execute(result.data);
  };
}

// ── Text truncation ──────────────────────────────────────────────────────────

/** Truncate text to `maxLen` chars, appending a consistent notice when
 *  truncated, so every tool that clips long content (Wikipedia extracts,
 *  fetched pages, NIP specs, ...) reports it the same way instead of each
 *  hand-rolling a slightly different "... (truncated)" string. */
export function truncateWithNotice(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n\n... (truncated, ${text.length} chars total)`;
}

// ── Persistent result cache (IndexedDB, TTL-based) ──────────────────────────

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function cacheKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${JSON.stringify(args, Object.keys(args).sort())}`;
}

/** Wrap a tool's execute() with a persistent cache — identical (toolName, args) skip the network. */
export function withResultCache(
  toolName: string,
  execute: (args: Record<string, unknown>) => Promise<string>,
): (args: Record<string, unknown>) => Promise<string> {
  return async (args) => {
    const key = cacheKey(toolName, args);
    try {
      const cached = await getToolCacheEntry(key);
      if (cached !== null) return cached;
    } catch {
      // Cache read failures should never block the tool call itself.
    }
    const result = await execute(args);
    try {
      void putToolCacheEntry(key, result, CACHE_TTL_MS);
    } catch {
      // Best-effort — ignore cache write failures.
    }
    return result;
  };
}
