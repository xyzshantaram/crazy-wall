/**
 * Search source contract — see searchIndex.ts for the registry that
 * consumes these.
 */

export interface SearchDocument {
  /** Globally unique id across ALL sources — e.g. `node:<nodeId>`. */
  id: string;
  /** Which registered source produced this document, e.g. "graph-nodes". */
  sourceId: string;
  title: string;
  body: string;
  /** Wall/chat this document belongs to, if any — used to prioritize same-workspace results. */
  chatId?: string;
  /** Opaque payload the palette UI uses to know what to do when this result is picked. */
  ref: unknown;
}

export interface SearchSource {
  /** Unique source id, e.g. "graph-nodes". */
  id: string;
  /** Human label for a results-section header, e.g. "Nodes". */
  label: string;
  /** Snapshot of everything currently searchable from this source. Called on every search. */
  getDocuments: () => SearchDocument[];
}
