/**
 * Web search + fetch tools for the Canvas LLM agent loop.
 *
 * wikipedia_search  — full-text search via Wikipedia's public REST API (no key).
 * wikipedia_fetch   — fetch a specific Wikipedia article summary + intro (no key).
 * web_fetch         — fetch any URL, extract main content via Readability, convert to Markdown.
 * tavily_search     — web search via Tavily API (requires user API key).
 *
 * All return plain text so the LLM can cite and embed the content directly.
 *
 * Each generation turn gets a fresh `ToolCallBudget` (see toolRuntime.ts) —
 * wikipedia_search (free) and tavily_search (paid) get separate caps
 * (MAX_FREE_SEARCHES_PER_TURN / MAX_PAID_SEARCHES_PER_TURN) so using free
 * Wikipedia lookups never eats into the budget for a paid Tavily search;
 * fetch tools share MAX_FETCHES_PER_TURN. All independent of the model's own
 * tool-call count. Fetches go through `robustFetch` (retry/backoff, offline
 * + backgrounded-tab aware) and results are cached in IndexedDB for 14 days
 * via `withResultCache`. URLs that fail 3 times in a row within a session
 * are blacklisted so the agent doesn't keep re-trying a dead link and
 * burning its fetch budget.
 */

import type { ToolDefinition } from "./types";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { z } from "zod";
import {
  type ToolCallBudget,
  MAX_FREE_SEARCHES_PER_TURN,
  MAX_PAID_SEARCHES_PER_TURN,
  robustFetch,
  withResultCache,
  withValidatedArgs,
  isUrlBlacklisted,
  recordUrlFailure,
  recordUrlSuccess,
  truncateWithNotice,
  OfflineError,
} from "./toolRuntime";

// Shared Turndown instance — convert clean HTML → Markdown.
const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});
// Remove script/style/nav/header/footer elements before conversion.
turndown.remove(["script", "style", "nav", "header", "footer", "aside", "figure", "figcaption"]);

function describeFetchError(err: unknown, url: string): string {
  if (err instanceof OfflineError) return `Cannot fetch ${url}: you appear to be offline.`;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return `Fetch timed out for ${url}. The page took too long to respond.`;
  }
  return `Web fetch error: ${err instanceof Error ? err.message : String(err)}`;
}

// ── Wikipedia ──────────────────────────────────────────────────────────────

const wikipediaSearchArgs = z.object({
  query: z.string().trim().min(1, "query must not be empty"),
  limit: z.coerce.number().int().min(1).max(10).optional().default(5),
});

export function makeWikipediaSearchTool(budget: ToolCallBudget): ToolDefinition {
  return {
    name: "wikipedia_search",
    description:
      `Search Wikipedia for articles matching a query. Returns a list of matching article titles, short descriptions, and URLs. Use this to find the right article before calling wikipedia_fetch. Best for factual questions, historical events, scientific concepts, people, places, companies. Free — no API key or budget shared with tavily_search. Limited to ${budget.searchFreeRemaining()} call(s) this turn.`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query, e.g. 'Large Hadron Collider', 'French Revolution causes', 'Nvidia H100'.",
        },
        limit: {
          type: "number",
          description: "Max number of results to return (default 5, max 10).",
        },
      },
      required: ["query"],
    },
    execute: withResultCache(
      "wikipedia_search",
      withValidatedArgs(wikipediaSearchArgs, async ({ query, limit }) => {
        if (!budget.canSearchFree()) return `Wikipedia search budget exhausted for this turn (max ${MAX_FREE_SEARCHES_PER_TURN} searches). Work with what you already have, or fetch specific URLs directly with web_fetch.`;
        budget.useSearchFree();
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
        try {
          const res = await robustFetch(url);
          if (!res.ok) return `Wikipedia search failed: HTTP ${res.status}`;
          const data = await res.json() as {
            query?: { search?: { title: string; snippet: string; wordcount: number }[] };
          };
          const results = data.query?.search ?? [];
          if (results.length === 0) return `No Wikipedia articles found for "${query}".`;
          return results
            .map((r, i) => {
              const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`;
              // Parse the snippet fragment with a DOMParser rather than a regex —
              // Wikipedia's search snippets contain <span class="searchmatch"> and
              // HTML entities (e.g. &amp;); a regex strip leaves entities un-decoded
              // and can run away on any malformed/unclosed tag.
              const snippetText = new DOMParser().parseFromString(r.snippet, "text/html").body.textContent ?? r.snippet;
              return `${i + 1}. **${r.title}** (${r.wordcount} words)\n   URL: ${articleUrl}\n   ${snippetText}`;
            })
            .join("\n\n");
        } catch (err) {
          return `Wikipedia search error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }),
    ),
  };
}

const wikipediaFetchArgs = z.object({
  title: z.string().trim().min(1, "title must not be empty"),
});

export function makeWikipediaFetchTool(budget: ToolCallBudget): ToolDefinition {
  return {
    name: "wikipedia_fetch",
    description:
      `Fetch the summary and introduction of a specific Wikipedia article by exact title. Returns the article summary, key facts, and the first several paragraphs of the intro. Use after wikipedia_search to get the actual content of an article. Shares a fetch budget with web_fetch — ${budget.fetchRemaining()} fetch call(s) remaining this turn.`,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Exact Wikipedia article title as returned by wikipedia_search, e.g. 'Large Hadron Collider'.",
        },
      },
      required: ["title"],
    },
    execute: withResultCache(
      "wikipedia_fetch",
      withValidatedArgs(wikipediaFetchArgs, async ({ title }) => {
        if (!budget.canFetch()) return "Fetch budget exhausted for this turn (max 20 fetches). Proceed with the content you've already gathered.";
        budget.useFetch();

        // Fetch page summary (REST v1 — structured, clean).
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        try {
          const res = await robustFetch(summaryUrl, { headers: { Accept: "application/json" } });
          if (res.status === 404) return `Wikipedia article "${title}" not found. Try wikipedia_search to find the correct title.`;
          if (!res.ok) return `Wikipedia fetch failed: HTTP ${res.status}`;
          const data = await res.json() as {
            title: string;
            description?: string;
            extract?: string;
            content_urls?: { desktop?: { page?: string } };
          };

          const lines: string[] = [
            `# ${data.title}`,
            data.description ? `*${data.description}*` : "",
            "",
            data.extract ?? "(No extract available.)",
          ].filter((l) => l !== undefined);

          let text = lines.join("\n").trim();
          text = truncateWithNotice(text, 6000);

          // Append a structured citation block the agent can copy verbatim into the citations[] field.
          const pageUrl = data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
          const citation = { title: `Wikipedia: ${data.title}`, url: pageUrl };
          text += `\n\nCITATION_JSON: ${JSON.stringify(citation)}`;

          return text;
        } catch (err) {
          return `Wikipedia fetch error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }),
    ),
  };
}

// ── Web Fetch ──────────────────────────────────────────────────────────────

// CORS proxy for the Readability fallback fetch path. Points at a small
// Cloudflare Worker (github.com/xyzshantaram — cors-header-proxy) that
// rewrites the target's Origin header and re-adds Access-Control-Allow-Origin
// on the response, rather than a third-party public proxy (allorigins.win
// has intermittently failed with CORS errors of its own — the browser sees
// the proxy's OWN response missing an ACAO header, i.e. the proxy service
// itself was misconfigured/down, not the target site).
const CORS_PROXY = "https://cors-header-proxy.me-5db.workers.dev/corsproxy/?apiurl=";
const FETCH_CHAR_LIMIT = 8000;
// The CORS proxy round-trips through a third-party server that itself has
// to fetch the target page, so it's meaningfully slower than a direct
// request — 15s was cutting off perfectly good responses on slower sites.
// Tavily Extract's own docs default to 10s (basic) / 30s (advanced), so 30s
// here gives real pages room to load without hammering the budget on
// genuinely dead links (robustFetch still retries + backs off within this).
const FALLBACK_FETCH_TIMEOUT_MS = 30000;

function isValidHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Readability + Turndown extraction via the CORS proxy. Used when no
 *  Tavily key is configured, or as a fallback if Tavily Extract itself fails. */
async function fetchViaReadability(url: string): Promise<string> {
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
  const res = await robustFetch(proxyUrl, {}, { timeoutMs: FALLBACK_FETCH_TIMEOUT_MS });
  if (!res.ok) {
    recordUrlFailure(url);
    throw new Error(`Fetch failed: HTTP ${res.status} for ${url}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const html = await res.text();

  // If the response is already plain text or JSON, return it directly.
  if (!contentType.includes("html")) {
    recordUrlSuccess(url);
    return `${truncateWithNotice(html, FETCH_CHAR_LIMIT)}\n\nCITATION_JSON: ${JSON.stringify({ title: url, url })}`;
  }

  // Parse with DOMParser (browser native) and run Readability on it.
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Set base URL so relative links resolve correctly.
  const base = doc.createElement("base");
  base.href = url;
  doc.head.appendChild(base);

  const reader = new Readability(doc, { charThreshold: 100 });
  const article = reader.parse();

  let output: string;
  if (article?.content) {
    const md = turndown.turndown(article.content);
    const title = article.title ?? url;
    const byline = article.byline ? `*${article.byline}*\n\n` : "";
    output = `# ${title}\n\n${byline}${md}`;
  } else {
    // Readability couldn't extract — fall back to stripping all tags via the
    // DOM (not a regex — correctly decodes entities and can't run away on
    // malformed markup the way a `.replace(/<[^>]+>/g, ...)` regex can).
    const text = doc.body?.textContent ?? "";
    output = text.replace(/\s{3,}/g, "\n\n").trim();
  }

  output = truncateWithNotice(output, FETCH_CHAR_LIMIT);

  recordUrlSuccess(url);
  const citation = { title: article?.title ?? url, url };
  output += `\n\nCITATION_JSON: ${JSON.stringify(citation)}`;
  return output;
}

/** Tavily Extract — a purpose-built content-extraction API (handles JS-rendered
 *  pages, tables, PDFs far more reliably than Readability-on-raw-HTML through a
 *  generic CORS proxy). Used as the primary path whenever a Tavily key is
 *  configured; falls back to fetchViaReadability on any failure. */
async function fetchViaTavilyExtract(url: string, apiKey: string): Promise<string> {
  const res = await robustFetch(
    "https://api.tavily.com/extract",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ urls: url, extract_depth: "advanced", format: "markdown" }),
    },
    { timeoutMs: 30000 },
  );
  if (res.status === 401) throw new Error("Tavily API key invalid or expired.");
  if (res.status === 429 || res.status === 432 || res.status === 433) throw new Error("Tavily rate/plan limit reached.");
  if (!res.ok) throw new Error(`Tavily Extract failed: HTTP ${res.status}`);

  const data = (await res.json()) as {
    results?: { url: string; raw_content: string; title?: string | null }[];
    failed_results?: { url: string; error: string }[];
  };
  const failure = data.failed_results?.find((f) => f.url === url);
  if (failure) throw new Error(`Tavily Extract could not process this URL: ${failure.error}`);

  const result = data.results?.[0];
  if (!result?.raw_content) throw new Error("Tavily Extract returned no content.");

  const content = truncateWithNotice(result.raw_content, FETCH_CHAR_LIMIT);

  const title = result.title ?? url;
  const citation = { title, url };
  recordUrlSuccess(url);
  return `# ${title}\n\n${content}\n\nCITATION_JSON: ${JSON.stringify(citation)}`;
}

const webFetchArgs = z.object({
  url: z
    .string()
    .trim()
    .min(1, "url must not be empty")
    .transform((raw, ctx) => {
      const parsed = isValidHttpUrl(raw);
      if (!parsed) {
        ctx.addIssue({ code: "custom", message: `"${raw}" is not a well-formed http:// or https:// URL` });
        return z.NEVER;
      }
      return parsed.toString();
    }),
});

export function makeWebFetchTool(getTavilyApiKey: () => string | undefined, budget: ToolCallBudget): ToolDefinition {
  return {
    name: "web_fetch",
    description:
      `Fetch a web page by URL and return its main content as clean Markdown. Uses Tavily Extract when a Tavily key is configured (handles JS-rendered pages, tables, PDFs reliably), otherwise falls back to Readability-based extraction. Use this to read a specific article, documentation page, paper, or any URL you have. Returns the title and content. Always cite the URL you fetched. Limited to ${budget.fetchRemaining()} fetch call(s) this turn (shared with wikipedia_fetch) — prioritize the most relevant URLs.`,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to fetch, e.g. 'https://example.com/article'.",
        },
      },
      required: ["url"],
    },
    execute: withResultCache(
      "web_fetch",
      withValidatedArgs(webFetchArgs, async ({ url }) => {
        if (isUrlBlacklisted(url)) {
          return `Skipping ${url} — it has failed repeatedly this session and is likely broken or unreachable. Try a different source.`;
        }
        if (!budget.canFetch()) return "Fetch budget exhausted for this turn (max 20 fetches). Proceed with the content you've already gathered.";
        budget.useFetch();

        const tavilyKey = getTavilyApiKey()?.trim();
        if (tavilyKey) {
          try {
            return await fetchViaTavilyExtract(url, tavilyKey);
          } catch (err) {
            // Fall through to the Readability path rather than failing outright —
            // Tavily Extract can reject URLs (e.g. paywalled/blocked) that a direct
            // fetch through the CORS proxy can still read.
            void err;
          }
        }

        try {
          return await fetchViaReadability(url);
        } catch (err) {
          recordUrlFailure(url);
          return describeFetchError(err, url);
        }
      }),
    ),
  };
}

// ── Tavily Search ──────────────────────────────────────────────────────────

const tavilySearchArgs = z.object({
  query: z.string().trim().min(1, "query must not be empty"),
  max_results: z.coerce.number().int().min(1).max(10).optional().default(5),
  topic: z.enum(["general", "news", "finance"]).optional().default("general"),
});

/** Factory so the tool reads the user's key at call-time rather than module init. */
export function makeTavilySearchTool(getApiKey: () => string | undefined, budget: ToolCallBudget): ToolDefinition {
  return {
    name: "tavily_search",
    description:
      `Search the web using Tavily and return the top results with titles, URLs, and AI-extracted content snippets. Use for current events, recent data, pricing, news, or topics Wikipedia doesn't cover well. Results are real web pages — always cite the URLs you rely on. Spends the user's Tavily API credits — separate budget from wikipedia_search. Limited to ${budget.searchPaidRemaining()} call(s) this turn.`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The web search query.",
        },
        max_results: {
          type: "number",
          description: "Max results to return (default 5, max 10).",
        },
        topic: {
          type: "string",
          enum: ["general", "news", "finance"],
          description: "Search category. Use 'news' for current events, 'finance' for markets/stocks.",
        },
      },
      required: ["query"],
    },
    execute: withResultCache(
      "tavily_search",
      withValidatedArgs(tavilySearchArgs, async ({ query, max_results, topic }) => {
        const apiKey = getApiKey();
        if (!apiKey?.trim()) return "Tavily API key not configured. Add it in Settings → Search.";
        if (!budget.canSearchPaid()) return `Tavily search budget exhausted for this turn (max ${MAX_PAID_SEARCHES_PER_TURN} searches). Work with what you already have, or fetch specific URLs directly with web_fetch.`;
        budget.useSearchPaid();
        try {
          const res = await robustFetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ query, max_results, topic, search_depth: "basic" }),
          });
          if (res.status === 401) return "Tavily API key is invalid or expired. Check Settings → Search.";
          if (res.status === 429 || res.status === 432 || res.status === 433)
            return "Tavily rate/plan limit reached. Try again later or upgrade your plan.";
          if (!res.ok) return `Tavily search failed: HTTP ${res.status}`;
          const data = await res.json() as {
            results?: { title: string; url: string; content?: string; score?: number }[];
            answer?: string;
          };
          const results = data.results ?? [];
          if (results.length === 0) return `No results found for "${query}".`;
          const lines: string[] = [];
          if (data.answer) lines.push(`**Summary:** ${data.answer}\n`);
          lines.push(
            ...results.map((r, i) =>
              [
                `${i + 1}. **${r.title}**`,
                `   URL: ${r.url}`,
                r.content ? `   ${r.content.slice(0, 300)}${r.content.length > 300 ? "…" : ""}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            ),
          );

          // Append structured citation blocks the agent can copy verbatim into citations[].
          const citations = results.map((r) => ({ title: r.title, url: r.url }));
          lines.push(`\nCITATION_JSON_LIST: ${JSON.stringify(citations)}`);

          return lines.join("\n\n");
        } catch (err) {
          return `Tavily search error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }),
    ),
  };
}
