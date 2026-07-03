/**
 * Zod schema mirroring `WidgetNode` (see widget.ts) — validates the shape of
 * widget trees before they're ever handed to `WidgetRenderer`.
 *
 * This exists because `WidgetRenderer` has no defensive checks of its own
 * (e.g. `TableWidget` renders via `node.columns.map(...)` unconditionally) —
 * a malformed widget tree throws during React's render pass, and since the
 * app has no error boundary, that crashes the entire canvas, not just one
 * node. Two independent sources produce `WidgetNode` trees:
 *
 *   1. The LLM emits one directly as JSON (`render: "static"`) — validated
 *      here, in `parseResponse.ts`, before a node is ever created.
 *   2. Lua tile scripts produce one at runtime (`render: "lua"` /
 *      `"nostr-dashboard"`) — NOT covered by this schema (Lua scripts run
 *      after parseResponse.ts, inside the sandbox), which is why a
 *      `WidgetErrorBoundary` around the renderer itself is the
 *      defense-in-depth for that path.
 *
 * On validation failure, callers should render a fallback "invalid widget"
 * node rather than discarding the whole LLM response — one malformed node
 * out of several shouldn't sink an otherwise-good response.
 */

import { z } from "zod";
import type { WidgetNode } from "./widget";

const gap = z.enum(["sm", "md", "lg"]);
const align = z.enum(["start", "center", "end"]);
const justify = z.enum(["start", "center", "end", "between"]);
const variant = z.enum(["accent", "muted", "success", "warning", "danger"]);

const base = { id: z.string().optional(), grow: z.boolean().optional() };

// `WidgetNode` is a recursive union (stack/row/spoiler/form nest children of
// the same union) — z.lazy() breaks the circular reference at schema-build
// time the same way it would in the TypeScript type itself.
const widgetNodeSchema: z.ZodType<WidgetNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    stackSchema,
    rowSchema,
    spoilerSchema,
    textSchema,
    markdownSchema,
    imageSchema,
    buttonSchema,
    dividerSchema,
    colorSchema,
    formSchema,
    inputSchema,
    dropdownSchema,
    checkboxSchema,
    tableSchema,
    timelineSchema,
    kanbanSchema,
    chartSchema,
    checklistSchema,
    matrixSchema,
    treeSchema,
    statSchema,
    sliderSchema,
    progressSchema,
    badgeGroupSchema,
  ]),
) as z.ZodType<WidgetNode>;

const stackSchema = z.object({
  ...base,
  type: z.literal("stack"),
  children: z.array(widgetNodeSchema),
  align: align.optional(),
  justify: justify.optional(),
  gap: gap.optional(),
  surface: z.boolean().optional(),
  scroll: z.boolean().optional(),
  axis: z.enum(["x", "y"]).optional(),
});

const rowSchema = z.object({
  ...base,
  type: z.literal("row"),
  children: z.array(widgetNodeSchema),
  align: align.optional(),
  justify: justify.optional(),
  gap: gap.optional(),
  surface: z.boolean().optional(),
  scroll: z.boolean().optional(),
  wrap: z.boolean().optional(),
});

const spoilerSchema = z.object({
  ...base,
  type: z.literal("spoiler"),
  title: z.string(),
  open: z.boolean().optional(),
  children: z.array(widgetNodeSchema),
});

const textSchema = z.object({
  ...base,
  type: z.literal("text"),
  text: z.string(),
  title: z.string().optional(),
  style: z.enum(["bold", "italic"]).optional(),
  text_size: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  variant: variant.optional(),
  badge: z.boolean().optional(),
  truncate: z.boolean().optional(),
  md: z.boolean().optional(),
});

const markdownSchema = z.object({
  ...base,
  type: z.literal("markdown"),
  content: z.string(),
});

const imageSchema = z.object({
  ...base,
  type: z.literal("image"),
  url: z.string(),
  max_width: z.number().optional(),
  max_height: z.number().optional(),
  avatar: z.boolean().optional(),
});

const buttonSchema = z.object({
  ...base,
  type: z.literal("button"),
  text: z.string(),
  title: z.string().optional(),
  onclick: z.string(),
  payload: z.unknown().optional(),
  variant: z.enum(["primary", "danger", "ghost"]).optional(),
  submit_form: z.boolean().optional(),
});

const dividerSchema = z.object({ ...base, type: z.literal("divider") });

const colorSchema = z.object({ ...base, type: z.literal("color"), hex: z.string() });

const formSchema = z.object({
  ...base,
  type: z.literal("form"),
  children: z.array(widgetNodeSchema),
});

const inputSchema = z.object({
  ...base,
  type: z.literal("input"),
  name: z.string(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  default_value: z.string().optional(),
  hidden: z.boolean().optional(),
});

const dropdownSchema = z.object({
  ...base,
  type: z.literal("dropdown"),
  name: z.string(),
  label: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })),
  default_value: z.string().optional(),
});

const checkboxSchema = z.object({
  ...base,
  type: z.literal("checkbox"),
  name: z.string(),
  label: z.string().optional(),
  default_value: z.boolean().optional(),
  radio: z.string().optional(),
});

const tableSchema = z.object({
  ...base,
  type: z.literal("table"),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
  highlight_row: z.number().optional(),
  caption: z.string().optional(),
});

const timelineSchema = z.object({
  ...base,
  type: z.literal("timeline"),
  items: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      description: z.string().optional(),
      variant: variant.optional(),
    }),
  ),
});

const kanbanSchema = z.object({
  ...base,
  type: z.literal("kanban"),
  columns: z.array(
    z.object({
      title: z.string(),
      items: z.array(z.object({ title: z.string(), tag: z.string().optional(), variant: variant.optional() })),
    }),
  ),
});

const chartSchema = z.object({
  ...base,
  type: z.literal("chart"),
  chart_type: z.enum(["bar", "line", "pie", "donut"]),
  data: z.array(z.object({ label: z.string(), value: z.number() })),
  unit: z.string().optional(),
  caption: z.string().optional(),
});

const checklistSchema = z.object({
  ...base,
  type: z.literal("checklist"),
  items: z.array(z.object({ id: z.string(), label: z.string(), done: z.boolean() })),
  onchange: z.string().optional(),
});

const matrixSchema = z.object({
  ...base,
  type: z.literal("matrix"),
  x_label: z.string(),
  y_label: z.string(),
  items: z.array(z.object({ label: z.string(), x: z.number(), y: z.number(), variant: variant.optional() })),
});

// TreeItem nests recursively too (children: TreeItem[]) — same z.lazy() pattern.
const treeItemSchema: z.ZodType<import("./widget").TreeItem> = z.lazy(() =>
  z.object({
    label: z.string(),
    icon: z.string().optional(),
    variant: variant.optional(),
    children: z.array(treeItemSchema).optional(),
  }),
) as z.ZodType<import("./widget").TreeItem>;

const treeSchema = z.object({
  ...base,
  type: z.literal("tree"),
  root: treeItemSchema,
});

const statSchema = z.object({
  ...base,
  type: z.literal("stat"),
  label: z.string(),
  value: z.string(),
  delta: z.string().optional(),
  variant: variant.optional(),
});

const sliderSchema = z.object({
  ...base,
  type: z.literal("slider"),
  name: z.string(),
  label: z.string().optional(),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  value: z.number(),
  unit: z.string().optional(),
  onchange: z.string().optional(),
});

const progressSchema = z.object({
  ...base,
  type: z.literal("progress"),
  label: z.string().optional(),
  value: z.number(),
  max: z.number().optional(),
  variant: variant.optional(),
});

const badgeGroupSchema = z.object({
  ...base,
  type: z.literal("badge_group"),
  items: z.array(z.object({ label: z.string(), variant: variant.optional() })),
});

export { widgetNodeSchema };

export interface WidgetValidationResult {
  valid: boolean;
  error?: string;
}

/** Validate a widget tree, returning a short human-readable error on failure
 *  (path + message) instead of throwing — callers decide how to handle it
 *  (e.g. substitute a fallback widget for just that node). */
export function validateWidgetNode(candidate: unknown): WidgetValidationResult {
  const result = widgetNodeSchema.safeParse(candidate);
  if (result.success) return { valid: true };
  const first = result.error.issues[0];
  const path = first?.path.join(".") || "(root)";
  return { valid: false, error: `${path}: ${first?.message ?? "invalid widget"}` };
}
