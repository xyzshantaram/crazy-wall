/**
 * Shared canvas layout constants, used by applyGraphResponse (tree layout),
 * NodeCard (default width), and EdgesLayer (anchor point estimation) so the
 * three stay geometrically consistent.
 */

export const CARD_WIDTH = 300;
/** Cards are variable-height in reality; this is a layout estimate used only
 *  for spacing/bounding-box math, not the actual rendered height. */
export const CARD_HEIGHT_ESTIMATE = 200;
export const H_GAP = 36;
export const V_GAP = 56;
/** Maximum sibling columns before wrapping to a new row within the same depth
 *  level. Keeps trees from sprawling to 3000px+ width with many siblings. */
export const MAX_COLS = 3;
