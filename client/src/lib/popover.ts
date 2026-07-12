// Viewport-aware placement for anchored pop-ups (calendar, menu, tooltip...).
// Shared so every overlay handles the screen edges the same way - a pop-up must
// stay fully visible and off the very edge no matter which corner its field is
// in. See DateField.tsx for the reference use.

export type Point = { top: number; left: number };
export type Size = { width: number; height: number };

/**
 * Place a `pop` of the given size against an `anchor` rectangle. Prefers below
 * and left-aligned; flips above when there is no room below; aligns right edges
 * (then clamps) when it would spill off the right; and keeps a `margin` gutter
 * from every viewport edge so it never sits flush against the screen.
 */
export function computePopoverPosition(
  anchor: DOMRect,
  pop: Size,
  opts: { gap?: number; margin?: number } = {},
): Point {
  const gap = opts.gap ?? 4;
  const margin = opts.margin ?? 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: align the pop's left edge to the anchor; if that spills off the
  // right, align the right edges instead; finally clamp within the margins.
  let left = anchor.left;
  if (left + pop.width > vw - margin) left = anchor.right - pop.width;
  left = Math.min(left, vw - margin - pop.width);
  left = Math.max(margin, left);

  // Vertical: below if it fits, else above if it fits, else whichever side has
  // more room - clamped so the pop never leaves the viewport.
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - pop.height;
  let top: number;
  if (below + pop.height <= vh - margin) top = below;
  else if (above >= margin) top = above;
  else top = vh - anchor.bottom >= anchor.top ? below : above;
  top = Math.max(margin, Math.min(top, vh - margin - pop.height));

  return { top, left };
}
