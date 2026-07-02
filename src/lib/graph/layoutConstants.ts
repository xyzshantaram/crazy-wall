/**
 * Shared canvas layout constants, used by applyGraphResponse (tree layout),
 * NodeCard (default width/height cap), and EdgesLayer (anchor point estimation).
 *
 * CARD_HEIGHT_ESTIMATE is used purely for layout spacing math. We cap rendered
 * content at CONTENT_MAX_HEIGHT (in NodeCard) so this estimate is reliable —
 * cards never grow taller than header + summary + CONTENT_MAX_HEIGHT + padding.
 *
 * Approximate breakdown:
 *   header row:   ~42px
 *   summary text: ~32px  (2 lines × 16px)
 *   content:       up to CONTENT_MAX_HEIGHT (400px)
 *   py-3 padding:  24px
 *   ──────────────────
 *   total max:    ~498px → round to 500
 *
 * For layout purposes we use 280px as the TYPICAL height (most nodes are
 * shorter than the cap). This avoids huge gaps between short nodes.
 */

export const CARD_WIDTH = 300;
export const CARD_HEIGHT_ESTIMATE = 280;
export const H_GAP = 48;
export const V_GAP = 72;
export const MAX_COLS = 3;
