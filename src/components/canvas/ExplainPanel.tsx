/**
 * ExplainPanel — surfaces a node's reasoning metadata (why/assumptions/
 * evidence/confidence/provenance) without cluttering the default card UI.
 */

import type { GraphNode } from "../../types/graph";

interface Props {
  node: GraphNode;
  onClose: () => void;
}

export function ExplainPanel({ node, onClose }: Props) {
  const { reasoning, confidence, provenance, summary } = node;
  const hasReasoning = reasoning && (reasoning.why || reasoning.assumptions?.length || reasoning.evidence?.length);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[90vw] bg-surface border border-border rounded-2xl shadow-panel overflow-hidden animate-fade-in-up"
      >
        <div className="px-5 pt-4 pb-3 border-b border-border-soft flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium">Explain</div>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-[14px] font-semibold text-ink">{node.title}</h3>
              {node.narrativeRole && (
                <span className="text-[10px] uppercase tracking-wide text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {node.narrativeRole}
                </span>
              )}
            </div>
          </div>          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-white/8 transition-colors">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[50vh] overflow-auto scroll-thin">
          {summary ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-1.5">Description</div>
              <p className="text-[13.5px] text-ink leading-relaxed">{summary}</p>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-faint italic">No description was provided for this node.</p>
          )}

          {typeof confidence === "number" && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-1.5">Confidence</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${confidence * 100}%` }}
                  />
                </div>
                <span className="text-[12px] text-ink-dim font-mono">{Math.round(confidence * 100)}%</span>
              </div>
            </div>
          )}

          {hasReasoning ? (
            <>
              {reasoning?.why && (
                <Section title="Why this exists">
                  <p className="text-[13px] text-ink-dim leading-relaxed">{reasoning.why}</p>
                </Section>
              )}
              {reasoning?.assumptions && reasoning.assumptions.length > 0 && (
                <Section title="Assumptions">
                  <ul className="flex flex-col gap-1">
                    {reasoning.assumptions.map((a, i) => (
                      <li key={i} className="text-[13px] text-ink-dim flex gap-1.5">
                        <span className="text-ink-faint">·</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {reasoning?.evidence && reasoning.evidence.length > 0 && (
                <Section title="Evidence">
                  <ul className="flex flex-col gap-1">
                    {reasoning.evidence.map((e, i) => (
                      <li key={i} className="text-[13px] text-ink-dim flex gap-1.5">
                        <span className="text-ink-faint">·</span>
                        {e}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-ink-faint italic">No reasoning metadata was provided for this node.</p>
          )}

          <Section title="Provenance">
            <div className="flex flex-col gap-1 text-[12.5px] text-ink-dim">
              {provenance.model && (
                <div>
                  Model: <span className="text-ink">{provenance.model}</span> via{" "}
                  <span className="text-ink">{provenance.provider}</span>
                </div>
              )}
              <div>Created: {new Date(provenance.createdAt).toLocaleString()}</div>
              {provenance.forkedFrom && <div>Forked from another node</div>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-medium mb-1.5">{title}</div>
      {children}
    </div>
  );
}
