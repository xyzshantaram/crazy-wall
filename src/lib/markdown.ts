/**
 * Shared Markdown-to-sanitized-HTML rendering, used by both WidgetRenderer
 * (inline md=true text widgets, "markdown" widget type) and ThinkingPanel /
 * NodeContentRenderer (which render raw Markdown outside the widget tree).
 *
 * Split into its own module (rather than living in WidgetRenderer.tsx, where
 * it originated) purely to satisfy react/only-export-components — a
 * component file exporting plain utility functions breaks Vite Fast Refresh
 * for that file. No behavior change.
 */

import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked once: no mangling of links, GFM + breaks enabled.
marked.use({
  gfm: true,
  breaks: false,
  async: false,
});

/** Render a full block of Markdown to sanitized HTML. */
export function renderBlockMd(text: string): string {
  const raw = marked.parse(text) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "code", "pre", "blockquote",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "a", "hr", "table", "thead", "tbody", "tr", "th", "td",
      "del", "s", "sup", "sub",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    FORCE_BODY: true,
  });
}

/** Render an inline Markdown snippet (no block elements) to sanitized HTML. */
export function renderInlineMd(text: string): string {
  const raw = marked.parseInline(text) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["strong", "em", "code", "a", "del", "s"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}
