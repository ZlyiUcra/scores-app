import React from 'react';
import { createPortal } from 'react-dom';
import { CalendarGrid } from './CalendarGrid';
import { useAnchoredPopover } from '../lib/useAnchoredPopover';
import { DEFAULT_DATE_LABELS, type DateLabels, decodeValue, parseDate, renderDate } from '../lib/dateFormat';

const p2 = (n: number) => String(n).padStart(2, '0');

export type DateRange = { start: string | null; end: string | null };

type Props = {
  /** Both ends canonical date-only "YYYY-MM-DD" (or null). */
  value: DateRange;
  onChange: (value: DateRange) => void;
  onCommit?: (value: DateRange) => void;
  /** Date-only display/parse template (default "DD.MM.YYYY"). */
  format?: string;
  labels?: Partial<DateLabels>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
};

/**
 * A date-range field: one input showing "start - end" plus a calendar where the
 * first click sets the start, the second the end (auto-ordered), and the days
 * between are highlighted. The text is editable too, so a picked range can be
 * corrected by hand. Date-only — pair with a time-range control for intervals.
 * Shares the calendar and edge-aware pop-up with DateField.
 */
export function DateRangeField({
  value,
  onChange,
  onCommit,
  format = 'DD.MM.YYYY',
  labels: labelsProp,
  placeholder,
  disabled,
  ariaLabel,
  id,
}: Props) {
  const labels = React.useMemo(() => ({ ...DEFAULT_DATE_LABELS, ...labelsProp }), [labelsProp]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);

  const one = (v: string | null) => (v ? renderDate(decodeValue(v, format)!, format, labels) : '');
  const display = (r: DateRange) => (r.start || r.end ? `${one(r.start)} - ${one(r.end)}` : '');
  const [text, setText] = React.useState(() => display(value));

  const startParts = decodeValue(value.start, format);
  const now = new Date();
  const [view, setView] = React.useState(() => ({
    y: startParts?.y ?? now.getFullYear(),
    m: startParts?.mo ?? now.getMonth() + 1,
  }));

  const close = React.useCallback(() => {
    setOpen(false);
    onCommit?.(value);
  }, [value, onCommit]);
  const { style: popStyle, sheet } = useAnchoredPopover({
    open,
    anchorRef: rootRef,
    popRef,
    onClose: close,
    reflowKey: `${view.y}.${view.m}.${value.start ?? ''}.${value.end ?? ''}`,
  });

  React.useEffect(() => {
    if (!open) return;
    const s = decodeValue(value.start, format);
    setView({ y: s?.y ?? new Date().getFullYear(), m: s?.mo ?? new Date().getMonth() + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, format, labels]);

  // Emit ordered (start <= end); ISO date-only strings compare lexicographically.
  function emit(start: string | null, end: string | null) {
    if (start && end && start > end) [start, end] = [end, start];
    onChange({ start, end });
  }

  function onType(raw: string) {
    setText(raw);
    const parts = raw.split(/\s+-\s+/);
    const s = parts[0]?.trim() ? parseDate(parts[0], format, labels) : null;
    const e = parts[1]?.trim() ? parseDate(parts[1], format, labels) : null;
    emit(s, e);
  }

  function onInputBlur(e: React.FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && (rootRef.current?.contains(next) || popRef.current?.contains(next))) return;
    setText(display(value));
    onCommit?.(value);
  }

  function pickDay(d: number) {
    const day = `${view.y}-${p2(view.m)}-${p2(d)}`;
    if (!value.start || value.end) {
      // Begin a fresh range on the first click (or after a complete one).
      onChange({ start: day, end: null });
      return;
    }
    let [s, e] = [value.start, day];
    if (e < s) [s, e] = [e, s];
    const nextRange = { start: s, end: e };
    onChange(nextRange);
    setOpen(false);
    onCommit?.(nextRange);
  }

  function clear() {
    onChange({ start: null, end: null });
    setOpen(false);
    onCommit?.({ start: null, end: null });
  }

  const dayClass = (d: number) => {
    const day = `${view.y}-${p2(view.m)}-${p2(d)}`;
    if (day === value.start || day === value.end) return 'datefield__day--sel';
    if (value.start && value.end && day > value.start && day < value.end) return 'datefield__day--range';
    return '';
  };

  return (
    <div className="datefield" ref={rootRef}>
      <input
        ref={inputRef}
        className="input datefield__input"
        id={id}
        value={text}
        placeholder={placeholder ?? `${format} - ${format}`}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => !disabled && setOpen(true)}
        onBlur={onInputBlur}
      />
      <button
        type="button"
        className="datefield__toggle"
        disabled={disabled}
        aria-label={labels.calendar}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" strokeWidth="1.3" />
          <line x1="5" y1="1" x2="5" y2="3.5" stroke="currentColor" strokeWidth="1.3" />
          <line x1="11" y1="1" x2="11" y2="3.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className={`datefield__pop${sheet ? ' datefield__pop--sheet' : ''}`} ref={popRef} style={popStyle}>
            <CalendarGrid view={view} onView={setView} labels={labels} dayClass={dayClass} onPick={pickDay} />
            <div className="datefield__foot">
              <span className="muted datefield__hint">{display(value) || `${format} - ${format}`}</span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={clear}>
                {labels.clear}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
