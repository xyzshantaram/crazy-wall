/**
 * Web search tools for the Canvas LLM agent loop.
 *
 * wikipedia_search  — full-text search via Wikipedia's public REST API (no key).
 * wikipedia_fetch   — fetch a specific Wikipedia article summary + intro (no key).
 * brave_search      — web search via Brave Search API (requires user API key stored
 *                     in settingsStore as braveApiKey; skipped if not configured).
 *
 * All return plain text so the LLM can cite and embed the content directly.
 */

import type { ToolDefinition } from "./types";

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
