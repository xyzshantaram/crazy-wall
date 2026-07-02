/**
 * Unified widget schema.
 *
 * This is a superset of the `TileOutput` schema used by
 * `@soapbox.pub/nostr-canvas` (stack/row/text/button/form/etc.), extended
 * with richer visualization primitives (table, timeline, kanban, chart,
 * checklist, matrix, tree, stat, slider, progress, badge_group).
 *
 * The SAME renderer (see components/Widgets/WidgetRenderer.tsx) consumes
 * this schema regardless of where it came from:
 *
 *   - The LLM can emit it directly as static JSON (fast path, no sandbox).
 *   - The LLM can emit a Lua program which is executed in the nostr-canvas
 *     Lua sandbox; the resulting `TileOutput` tree it produces is
 *     structurally identical to this schema and is rendered the same way.
 *
 * Nodes not native to nostr-canvas (table/timeline/kanban/chart/checklist/
 * matrix/tree/stat/slider/progress/badge_group) are simply ignored by
 * nostr-canvas's own TileView, but we never use TileView -- we render this
 * tree ourselves, so Lua scripts are free to emit them too.
 */

export type Gap = "sm" | "md" | "lg";
export type Align = "start" | "center" | "end";
export type Justify = "start" | "center" | "end" | "between";
export type Variant = "accent" | "muted" | "success" | "warning" | "danger";

export interface NodeBase {
  id?: string;
  grow?: boolean;
}

// ---------------------------------------------------------------------------
// Layout primitives (compatible with nostr-canvas TileOutput)
// ---------------------------------------------------------------------------

export interface StackWidget extends NodeBase {
  type: "stack";
  children: WidgetNode[];
  align?: Align;
  justify?: Justify;
  gap?: Gap;
  surface?: boolean;
  scroll?: boolean;
  axis?: "x" | "y";
}

export interface RowWidget extends NodeBase {
  type: "row";
  children: WidgetNode[];
  align?: Align;
  justify?: Justify;
  gap?: Gap;
  surface?: boolean;
  scroll?: boolean;
  wrap?: boolean;
}

export interface SpoilerWidget extends NodeBase {
  type: "spoiler";
  title: string;
  open?: boolean;
  children: WidgetNode[];
}

// ---------------------------------------------------------------------------
// Basic content primitives (compatible with nostr-canvas TileOutput)
// ---------------------------------------------------------------------------

export interface TextWidget extends NodeBase {
  type: "text";
  text: string;
  title?: string;
  style?: "bold" | "italic";
  text_size?: 1 | 2 | 3;
  variant?: Variant;
  badge?: boolean;
  truncate?: boolean;
  md?: boolean;
}

export interface MarkdownWidget extends NodeBase {
  type: "markdown";
  content: string;
}

export interface ImageWidget extends NodeBase {
  type: "image";
  url: string;
  max_width?: number;
  max_height?: number;
  avatar?: boolean;
}

export interface ButtonWidget extends NodeBase {
  type: "button";
  text: string;
  title?: string;
  onclick: string;
  payload?: unknown;
  variant?: "primary" | "danger" | "ghost";
  submit_form?: boolean;
}

export interface DividerWidget extends NodeBase {
  type: "divider";
}

export interface ColorWidget extends NodeBase {
  type: "color";
  hex: string;
}

// ---------------------------------------------------------------------------
// Form primitives (compatible with nostr-canvas TileOutput)
// ---------------------------------------------------------------------------

export interface FormWidget extends NodeBase {
  type: "form";
  children: WidgetNode[];
}

export interface InputWidget extends NodeBase {
  type: "input";
  name: string;
  label?: string;
  placeholder?: string;
  default_value?: string;
  hidden?: boolean;
}

export interface DropdownWidget extends NodeBase {
  type: "dropdown";
  name: string;
  label?: string;
  options: { label: string; value: string }[];
  default_value?: string;
}

export interface CheckboxFieldWidget extends NodeBase {
  type: "checkbox";
  name: string;
  label?: string;
  default_value?: boolean;
  radio?: string;
}

// ---------------------------------------------------------------------------
// Rich visualization primitives (custom, not in nostr-canvas)
// ---------------------------------------------------------------------------

export interface TableWidget extends NodeBase {
  type: "table";
  columns: string[];
  rows: (string | number)[][];
  highlight_row?: number;
  caption?: string;
}

export interface TimelineWidget extends NodeBase {
  type: "timeline";
  items: {
    date: string;
    label: string;
    description?: string;
    variant?: Variant;
  }[];
}

export interface KanbanWidget extends NodeBase {
  type: "kanban";
  columns: {
    title: string;
    items: { title: string; tag?: string; variant?: Variant }[];
  }[];
}

export interface ChartWidget extends NodeBase {
  type: "chart";
  chart_type: "bar" | "line" | "pie" | "donut";
  data: { label: string; value: number }[];
  unit?: string;
  caption?: string;
}

export interface ChecklistWidget extends NodeBase {
  type: "checklist";
  items: { id: string; label: string; done: boolean }[];
  /** Lua handler name (or a synthetic action id for static widgets) invoked on toggle. */
  onchange?: string;
}

export interface MatrixWidget extends NodeBase {
  type: "matrix";
  x_label: string;
  y_label: string;
  items: { label: string; x: number; y: number; variant?: Variant }[];
}

export interface TreeWidget extends NodeBase {
  type: "tree";
  root: TreeItem;
}

export interface TreeItem {
  label: string;
  icon?: string;
  variant?: Variant;
  children?: TreeItem[];
}

export interface StatWidget extends NodeBase {
  type: "stat";
  label: string;
  value: string;
  delta?: string;
  variant?: Variant;
}

export interface SliderWidget extends NodeBase {
  type: "slider";
  name: string;
  label?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  /** Action id invoked (debounced) on change, carries { name, value }. */
  onchange?: string;
}

export interface ProgressWidget extends NodeBase {
  type: "progress";
  label?: string;
  value: number;
  max?: number;
  variant?: Variant;
}

export interface BadgeGroupWidget extends NodeBase {
  type: "badge_group";
  items: { label: string; variant?: Variant }[];
}

export type WidgetNode =
  | StackWidget
  | RowWidget
  | SpoilerWidget
  | TextWidget
  | MarkdownWidget
  | ImageWidget
  | ButtonWidget
  | DividerWidget
  | ColorWidget
  | FormWidget
  | InputWidget
  | DropdownWidget
  | CheckboxFieldWidget
  | TableWidget
  | TimelineWidget
  | KanbanWidget
  | ChartWidget
  | ChecklistWidget
  | MatrixWidget
  | TreeWidget
  | StatWidget
  | SliderWidget
  | ProgressWidget
  | BadgeGroupWidget;

export type WidgetActionPayload = Record<string, unknown> | undefined;

/** Fired when an interactive widget (button/checklist/slider/form) is used. */
export interface WidgetAction {
  nodeId: string;
  handler: string;
  payload: WidgetActionPayload;
}
