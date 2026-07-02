/**
 * CitationsPanel — modal overlay showing the sources a node's content was
 * drawn from (populated when the AI used wikipedia_search/fetch or brave_search).
 */

import type { GraphNode } from "../../types/graph";

interface Props {
  node: GraphNode;
  onClose: () => void;
}

export function CitationsPanel({ node, onClose }: Props) {
  const citations = node.citations ?? [];

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] max-w-[90vw] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
      >
        <div className="px-5 pt-4 pb-3 border-b border-border-soft flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium">Sources</div>
            <h3 className="text-[14px] font-semibold text-ink mt-0.5">{node.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 max-h-[60vh] overflow-auto scroll-thin">
          {citations.length === 0 ? (
            <p className="text-[12.5px] text-ink-faint italic">
              No sources were cited for this node. Citations appear here when the AI uses web search or Wikipedia tools.
            </p>
          ) : (
            citations.map((c, i) => (
              <div key={i} className="flex flex-col gap-0.5 group">
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-ink-faint font-mono mt-0.5 flex-shrink-0 w-4">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-accent hover:text-accent/80 hover:underline truncate block transition-colors"
                    >
                      {c.title}
                    </a>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-ink-faint truncate flex-1">{c.url}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(c.url)}
                        className="flex-shrink-0 text-ink-faint hover:text-ink opacity-0 group-hover:opacity-100 transition-all"
                        title="Copy URL"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                          <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M3 11V3a2 2 0 012-2h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    {c.note && (
                      <p className="text-[11.5px] text-ink-faint italic mt-0.5">{c.note}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {citations.length > 0 && (
          <div className="px-5 pb-4 pt-1 border-t border-border-soft">
            <p className="text-[11px] text-ink-faint">
              {citations.length} source{citations.length > 1 ? "s" : ""} · Always verify information from external sources.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
