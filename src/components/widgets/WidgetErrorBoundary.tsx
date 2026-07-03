/**
 * Catches render crashes from a single node's content.
 *
 * `parseResponse.ts` validates LLM-emitted static widget JSON against a zod
 * schema before a node is ever created, but that only covers the
 * `render: "static"` path. Lua tile scripts (`render: "lua"` /
 * `"nostr-dashboard"`) produce the same `WidgetNode` tree shape at runtime,
 * entirely outside that validation — a bug in a Lua script (or a widget
 * variant the schema doesn't yet cover) can still throw inside
 * `WidgetRenderer`. Since the app has no top-level error boundary, an
 * uncaught render error there would otherwise crash the entire canvas
 * instead of just failing to render one card.
 *
 * Scoped per-node (wraps `NodeContentRenderer` in `NodeCard.tsx`) so a crash
 * in one node's content never takes down the rest of the wall.
 */

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown in the fallback so the crash is at least attributable at a glance. */
  nodeTitle?: string;
}

interface State {
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error(`[WidgetErrorBoundary] render crash in node "${this.props.nodeTitle ?? "?"}"`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="text-[12px] text-bad bg-bad/10 border border-bad/20 rounded-lg p-2.5">
          This node's content crashed while rendering ({this.state.error.message || "unknown error"}). The rest of
          the wall is unaffected.
        </div>
      );
    }
    return this.props.children;
  }
}
