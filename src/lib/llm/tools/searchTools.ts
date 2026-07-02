/**
 * Web search + fetch tools for the Canvas LLM agent loop.
 *
 * wikipedia_search  — full-text search via Wikipedia's public REST API (no key).
 * wikipedia_fetch   — fetch a specific Wikipedia article summary + intro (no key).
 * web_fetch         — fetch any URL, extract main content via Readability, convert to Markdown.
 * tavily_search     — web search via Tavily API (requires user API key).
 *
 * All return plain text so the LLM can cite and embed the content directly.
 */

import type { ToolDefinition } from "./types";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

// Shared Turndown instance — convert clean HTML → Markdown.
const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});
// Remove script/style/nav/header/footer elements before conversion.
turndown.remove(["script", "style", "nav", "header", "footer", "aside", "figure", "figcaption"]);

// ── Wikipedia ──────────────────────────────────────────────────────────────

export const wikipediaSearchTool: ToolDefinition = {
  name: "wikipedia_search",
  description:
    "Search Wikipedia for articles matching a query. Returns a list of matching article titles, short descriptions, and URLs. Use this to find the right article before calling wikipedia_fetch. Best for factual questions, historical events, scientific concepts, people, places, companies.",
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
  execute: async (args) => {
    const query = String(args.query ?? "").trim();
    if (!query) return "No query provided.";
    const limit = Math.min(10, Math.max(1, Number(args.limit ?? 5)));
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
    try {
      const res = await fetch(url);
      if (!res.ok) return `Wikipedia search failed: HTTP ${res.status}`;
      const data = await res.json() as {
        query?: { search?: { title: string; snippet: string; wordcount: number }[] };
      };
      const results = data.query?.search ?? [];
      if (results.length === 0) return `No Wikipedia articles found for "${query}".`;
      return results
        .map((r, i) => {
          const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`;
          return `${i + 1}. **${r.title}** (${r.wordcount} words)\n   URL: ${articleUrl}\n   ${r.snippet.replace(/<[^>]+>/g, "")}`;
        })
        .join("\n\n");
    } catch (err) {
      return `Wikipedia search error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const wikipediaFetchTool: ToolDefinition = {
  name: "wikipedia_fetch",
  description:
    "Fetch the summary and introduction of a specific Wikipedia article by exact title. Returns the article summary, key facts, and the first several paragraphs of the intro. Use after wikipedia_search to get the actual content of an article.",
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
  execute: async (args) => {
    const title = String(args.title ?? "").trim();
    if (!title) return "No title provided.";

    // Fetch page summary (REST v1 — structured, clean).
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const res = await fetch(summaryUrl, { headers: { Accept: "application/json" } });
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
      if (text.length > 6000) text = `${text.slice(0, 6000)}\n\n... (truncated)`;

      // Append a structured citation block the agent can copy verbatim into the citations[] field.
      const pageUrl = data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
      const citation = { title: `Wikipedia: ${data.title}`, url: pageUrl };
      text += `\n\nCITATION_JSON: ${JSON.stringify(citation)}`;

      return text;
    } catch (err) {
      return `Wikipedia fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── Web Fetch ──────────────────────────────────────────────────────────────

const CORS_PROXY = "https://api.allorigins.win/raw?url=";
const FETCH_CHAR_LIMIT = 8000;

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description:
    "Fetch a web page by URL and return its main content as clean Markdown. Uses Mozilla Readability to extract the article body (strips nav, ads, boilerplate) and converts it to Markdown. Use this to read a specific article, documentation page, paper, or any URL you have. Returns the title, byline, and content. Always cite the URL you fetched.",
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
  execute: async (args) => {
    const url = String(args.url ?? "").trim();
    if (!url) return "No URL provided.";
    if (!/^https?:\/\//i.test(url)) return `Invalid URL: "${url}". Must start with http:// or https://.`;

    try {
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return `Fetch failed: HTTP ${res.status} for ${url}`;

      const contentType = res.headers.get("content-type") ?? "";
      const html = await res.text();

      // If the response is already plain text or JSON, return it directly.
      if (!contentType.includes("html")) {
        const trimmed = html.slice(0, FETCH_CHAR_LIMIT);
        return `${trimmed}${html.length > FETCH_CHAR_LIMIT ? "\n\n... (truncated)" : ""}\n\nCITATION_JSON: ${JSON.stringify({ title: url, url })}`;
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
        // Readability couldn't extract — fall back to stripping all tags.
        const text = doc.body?.innerText ?? html.replace(/<[^>]+>/g, " ");
        output = text.replace(/\s{3,}/g, "\n\n").trim();
      }

      if (output.length > FETCH_CHAR_LIMIT) {
        output = output.slice(0, FETCH_CHAR_LIMIT) + "\n\n... (truncated)";
      }

      const citation = { title: article?.title ?? url, url };
      output += `\n\nCITATION_JSON: ${JSON.stringify(citation)}`;
      return output;
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        return `Fetch timed out for ${url}. The page took too long to respond.`;
      }
      return `Web fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── Tavily Search ──────────────────────────────────────────────────────────

/** Factory so the tool reads the user's key at call-time rather than module init. */
export function makeTavilySearchTool(getApiKey: () => string | undefined): ToolDefinition {
  return {
    name: "tavily_search",
    description:
      "Search the web using Tavily and return the top results with titles, URLs, and AI-extracted content snippets. Use for current events, recent data, pricing, news, or topics Wikipedia doesn't cover well. Results are real web pages — always cite the URLs you rely on.",
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
    execute: async (args) => {
      const apiKey = getApiKey();
      if (!apiKey?.trim()) return "Tavily API key not configured. Add it in Settings → Search.";
      const query = String(args.query ?? "").trim();
      if (!query) return "No query provided.";
      const max_results = Math.min(10, Math.max(1, Number(args.max_results ?? 5)));
      const topic = args.topic === "news" || args.topic === "finance" ? args.topic : "general";
      try {
        const res = await fetch("https://api.tavily.com/search", {
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
    },
  };
}
