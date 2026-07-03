/**
 * Full-text search engine — modular source registry.
 *
 * A "source" is anything that can produce a flat list of searchable
 * documents (currently: nodes across all walls). MiniSearch indexes
 * whatever documents the registered sources currently report; the index is
 * rebuilt on demand (cheap at this data scale — hundreds to low thousands
 * of nodes) rather than incrementally maintained, so there's no risk of a
 * stale index after edits.
 *
 * To add a new kind of searchable thing later (e.g. nodes from a remote/
 * peer workspace, or NIP specs, or prompt history), implement a
 * `SearchSource` and call `registerSearchSource`. Nothing else needs to
 * change — the palette UI and ranking logic are source-agnostic.
 */

import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import type { SearchDocument, SearchSource } from "./types";

const sources: SearchSource[] = [];

export function registerSearchSource(source: SearchSource): void {
  if (sources.some((s) => s.id === source.id)) return;
  sources.push(source);
}

let mini: MiniSearch<SearchDocument> | null = null;
let docsById = new Map<string, SearchDocument>();

function buildIndex(): void {
  const docs: SearchDocument[] = [];
  for (const source of sources) {
    try {
      docs.push(...source.getDocuments());
    } catch {
      // A misbehaving source should never break search for the others.
    }
  }
  docsById = new Map(docs.map((d) => [d.id, d]));
  mini = new MiniSearch<SearchDocument>({
    idField: "id",
    fields: ["title", "body"],
    storeFields: [],
    searchOptions: {
      boost: { title: 3 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: "AND",
    },
  });
  mini.addAll(docs);
}

export interface SearchResultItem extends MiniSearchResult {
  doc: SearchDocument;
}

export interface SearchOptions {
  /** chatId to boost — results from this wall rank above equally-relevant results elsewhere. */
  prioritizeChatId?: string;
  limit?: number;
}

/** Rebuilds the index from all registered sources, then runs the query. */
export function search(query: string, opts: SearchOptions = {}): SearchResultItem[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  buildIndex();
  if (!mini) return [];

  const raw = mini.search(trimmed);
  const limit = opts.limit ?? 30;

  const scored = raw.map((r) => {
    const doc = docsById.get(String(r.id));
    if (!doc) return null;
    const boosted = opts.prioritizeChatId && doc.chatId === opts.prioritizeChatId ? r.score * 1.5 : r.score;
    return { ...r, score: boosted, doc } as SearchResultItem;
  }).filter((r): r is SearchResultItem => r !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
