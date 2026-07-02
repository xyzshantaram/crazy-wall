/**
 * ToolsDropdown — compact popover for toggling search tools on/off.
 * Lives in the FloatingChatBar footer next to the model label.
 */

import { useEffect, useRef, useState } from "react";
import { useSettingsStore, TOOL_DEFINITIONS, type ToolId } from "../../stores/settingsStore";

export function ToolsDropdown() {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ bottom: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const enabledTools = useSettingsStore((s) => s.enabledTools);
  const setToolEnabled = useSettingsStore((s) => s.setToolEnabled);
  const tavilyApiKey = useSettingsStore((s) => s.tavilyApiKey);

  const enabledCount = TOOL_DEFINITIONS.filter((t) => enabledTools[t.id] !== false).length;

  // Compute fixed position from the trigger button's bounding rect so the
  // popover renders outside the canvas stacking context entirely.
  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverPos({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
      });
    }
    setOpen((o) => !o);
  };

  // Close on scroll or resize so the position doesn't drift.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div className="relative" data-no-drag>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={`flex items-center gap-1 text-[10.5px] transition-colors rounded px-1 py-0.5 ${
          open ? "text-accent bg-accent/10" : "text-ink-faint hover:text-ink-dim"
        }`}
        title="Search tools"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span>Tools {enabledCount > 0 ? `(${enabledCount})` : ""}</span>
        <svg width="8" height="8" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`} fill="none">
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* full-screen backdrop at high z so it sits above the canvas */}
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
          {/* popover — fixed so it escapes the canvas transform stacking context */}
          <div
            className="fixed z-[201] w-[240px] bg-surface border border-border rounded-xl shadow-panel py-1.5 animate-fade-in-up"
            style={{ bottom: popoverPos.bottom, left: popoverPos.left }}
          >
            <div className="px-3 pb-1.5 pt-0.5">
              <span className="text-[10px] uppercase tracking-wide text-ink-faint font-medium">Search tools</span>
            </div>
            {TOOL_DEFINITIONS.map((tool) => {
              const enabled = enabledTools[tool.id] !== false;
              const needsKey = tool.id === "tavily" && !tavilyApiKey?.trim();
              return (
                <label
                  key={tool.id}
                  className="flex items-start gap-2.5 px-3 py-2 hover:bg-white/4 cursor-pointer transition-colors"
                >
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setToolEnabled(tool.id as ToolId, e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                      enabled ? "bg-accent border-accent" : "bg-transparent border-border"
                    }`}>
                      {enabled && (
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[12.5px] font-medium ${enabled ? "text-ink" : "text-ink-faint"}`}>
                        {tool.label}
                      </span>
                      {needsKey && (
                        <span className="text-[9.5px] text-warn bg-warn/10 px-1 py-0.5 rounded">no key</span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-faint leading-tight mt-0.5">{tool.description}</p>
                  </div>
                </label>
              );
            })}
            <div className="px-3 pt-1.5 pb-0.5 border-t border-border-soft mt-1">
              <p className="text-[10.5px] text-ink-faint">
                Add Tavily key in{" "}
                <button
                  onClick={() => setOpen(false)}
                  className="text-accent hover:underline"
                >
                  Settings → Search
                </button>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
