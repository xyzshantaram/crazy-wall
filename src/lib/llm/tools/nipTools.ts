/**
 * NIP lookup tools -- give the Canvas LLM the ability to look up Nostr
 * protocol specs while generating graph content, exactly like tile-studio's
 * FetchNIPTool / SearchNIPsTool. Useful whenever a user's prompt touches
 * Nostr protocol details (NIPs, event kinds, etc.) since these come up often
 * in Nostr-adjacent work (this app itself is built on nostr-canvas).
 */

import type { ToolDefinition } from "./types";
import { SimplePool } from "nostr-tools";

export const fetchNipTool: ToolDefinition = {
  name: "fetch_nip",
  description:
    "Fetch an official Nostr NIP specification from the nostr-protocol/nips GitHub repository (e.g. NIP-01 basic protocol, NIP-19 bech32 ids, NIP-89 handler recommendations, NIP-34 git repos). Use when the user's request involves Nostr protocol details.",
  parameters: {
    type: "object",
    properties: {
      nip: {
        type: "string",
        description: 'NIP number, e.g. "01", "19", "89". Will be zero-padded to 2 digits.',
      },
    },
    required: ["nip"],
  },
  execute: async (args) => {
    const raw = String(args.nip ?? "").trim();
    const id = raw.padStart(2, "0");
    const url = `https://raw.githubusercontent.com/nostr-protocol/nips/master/${id}.md`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return res.status === 404
          ? `NIP-${id} not found. Check the NIP number and try again.`
          : `Failed to fetch NIP-${id}: HTTP ${res.status}`;
      }
      const text = await res.text();
      const maxLen = 8000;
      return text.length > maxLen ? `${text.slice(0, maxLen)}\n\n... (truncated, ${text.length} chars total)` : text;
    } catch (err) {
      return `Error fetching NIP-${id}: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

const NIP_RELAYS = ["wss://relay.ditto.pub", "wss://relay.primal.net"];

export const searchNipsTool: ToolDefinition = {
  name: "search_nips",
  description:
    "Search community-authored NIPs (kind 30817 events on Nostr relays, as surfaced on NostrHub) by event kind number or keyword. Use for draft/community protocol proposals not yet in the official NIPs repo. For official numbered NIPs use fetch_nip instead.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "number", description: "Filter by a specific event kind number the NIP defines (via its k tag)." },
      keyword: { type: "string", description: "Keyword to match against title/content/identifier." },
    },
  },
  execute: async (args) => {
    const pool = new SimplePool();
    try {
      const filter: Record<string, unknown> = { kinds: [30817], limit: 20 };
      if (typeof args.kind === "number") filter["#k"] = [String(args.kind)];
      const events = await pool.querySync(NIP_RELAYS, filter as Parameters<typeof pool.querySync>[1]);

      let results = events.map((event) => {
        const title = event.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)";
        const dTag = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
        const kinds = event.tags.filter((t) => t[0] === "k").map((t) => t[1]);
        return { title, dTag, kinds, snippet: event.content.slice(0, 200) };
      });

      const keyword = typeof args.keyword === "string" ? args.keyword.toLowerCase() : "";
      if (keyword) {
        results = results.filter(
          (r) => r.title.toLowerCase().includes(keyword) || r.snippet.toLowerCase().includes(keyword) || r.dTag.toLowerCase().includes(keyword),
        );
      }

      if (results.length === 0) return "No community NIPs found matching the query.";

      return results
        .map((r) => `## ${r.title}\nIdentifier: ${r.dTag}\nKinds: ${r.kinds.length ? r.kinds.join(", ") : "none"}\n${r.snippet}...`)
        .join("\n\n---\n\n");
    } catch (err) {
      return `Error searching NIPs: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      pool.destroy();
    }
  },
};
