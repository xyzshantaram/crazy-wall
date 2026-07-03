# Crazy Wall

A spatial AI interface: chat with an LLM and its responses become structured
visual nodes ("widgets" — stats, tables, timelines, checklists, kanban boards,
charts, etc.) laid out on an infinite dark canvas instead of a linear chat
log. Related ideas branch outward into a graph you can pan, zoom, drag, and
reorganize.

Everything runs client-side — there is no backend. You bring your own API key
(OpenRouter, DeepSeek, or Z.AI) and it never leaves your browser. Each canvas
("wall") and its nodes/edges are persisted locally in IndexedDB; app settings
(API keys, tool toggles, model choices) live in `localStorage`.

## Features

- **Structured output over prose** — the system prompt steers the model
  toward widgets/infographics instead of walls of text.
- **Graph canvas** — infinite pan/zoom/drag canvas (`@use-gesture/react`),
  multi-select, long-press peek, double-tap to fit, fit-all.
- **Tool use** — web search (Tavily, optional key) and web fetch (via
  Readability + Turndown, no key needed), Wikipedia lookup, and an
  `ask_user` tool the model can invoke to clarify before proceeding.
- **Full-text workspace search** — a global command palette (`Ctrl/Cmd+K`)
  searches node content across all walls, prioritizing the current one.
- **Nostr dashboards** — an opt-in sandboxed Lua mode for building live
  Nostr-backed dashboards as canvas nodes.
- **P2P wall sharing** — send/receive an entire wall to another browser via
  a short code (Trystero + Nostr signaling), no server storage involved.
- **Offline-friendly PWA** — installable, works without a network connection
  once loaded.

## Development

```bash
pnpm install
pnpm dev      # start the Vite dev server
pnpm build    # typecheck + production build
pnpm lint     # oxlint
```

## Stack

React 19 + TypeScript + Vite, Zustand (state + persistence), IndexedDB
(`idb`) for wall/node/edge storage, Tailwind for styling, `marked` +
DOMPurify for markdown rendering, Trystero for P2P transfer.
