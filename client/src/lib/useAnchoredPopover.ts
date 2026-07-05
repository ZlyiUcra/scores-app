import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { computePopoverPosition, type Point } from './popover';

/** At or below this viewport width a pop-up becomes a full-width bottom sheet
 * (bigger tap targets, no fiddly anchoring) instead of an anchored pop-up. */
export const POPOVER_SHEET_MAX = 480;

export type PopoverPlacement = { style: CSSProperties; sheet: boolean };

/**
 * Places an open pop-up: on a phone-width screen it hands back `sheet: true`
 * (the caller renders a bottom sheet, positioned by CSS); otherwise it computes
 * an edge-aware anchored position (flips/clamps near the edges) and keeps it
 * glued on scroll/resize. Also closes on Escape or an outside click. Shared by
 * every picker so they behave identically at the screen edges and on mobile.
 */
export function useAnchoredPopover(opts: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  popRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Changes when the pop-up's size might change, triggering a re-measure. */
  reflowKey?: unknown;
}): PopoverPlacement {
  const { open, anchorRef, popRef, onClose, reflowKey } = opts;
  const [pos, setPos] = useState<Point | null>(null);
  const [sheet, setSheet] = useState(() => typeof window !== 'undefined' && window.innerWidth <= POPOVER_SHEET_MAX);

  const reposition = useCallback(() => {
    const isSheet = window.innerWidth <= POPOVER_SHEET_MAX;
    setSheet(isSheet);
    if (isSheet) return; // a bottom sheet is positioned by CSS, not measured
    const a = anchorRef.current?.getBoundingClientRect();
    if (!a) return;
    const p = popRef.current?.getBoundingClientRect();
    setPos(computePopoverPosition(a, { width: p?.width || 240, height: p?.height || 300 }));
  }, [anchorRef, popRef]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const onMove = () => reposition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, reposition]);

  useLayoutEffect(() => {
    if (open) reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reflowKey]);

  useEffect(() => {
    if (!open) return;
    const inside = (n: Node | null) =>
      !!n && (!!anchorRef.current?.contains(n) || !!popRef.current?.contains(n));
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, anchorRef, popRef]);

  const style: CSSProperties = sheet
    ? {}
    : { top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? undefined : 'hidden' };
  return { style, sheet };
}
