import React from 'react';
import { createPortal } from 'react-dom';
import { CalendarGrid } from './CalendarGrid';
import { useAnchoredPopover } from '../lib/useAnchoredPopover';
import {
  DEFAULT_DATE_LABELS,
  type DateLabels,
  type DateParts,
  decodeValue,
  encodeValue,
  formatHasTime,
  formatIsTwelveHour,
  p2,
  parseDate,
  renderDate,
  to12,
} from '../lib/dateFormat';

type Props = {
  /** Canonical value: an ISO instant when `format` has a time, else a date-only
   * "YYYY-MM-DD"; null when empty. Display shape is `format`, not this. */
  value: string | null;
  /** Emits the canonical value (or null) whenever a valid date is entered/picked. */
  onChange: (value: string | null) => void;
  /** Fired when editing settles (blur out, or the popup closes) — for fields
   * that save on blur rather than via a submit button. */
  onCommit?: (value: string | null) => void;
  /** Display/parse template. Tokens: DD MM YYYY HH hh mm A (see dateFormat.ts). */
  format?: string;
  /** Calendar chrome text; English defaults fill any gaps. */
  labels?: Partial<DateLabels>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
};

/**
 * A date (and optionally time) field: a typed input in a templated format PLUS
 * a calendar pop-up (portalled + edge-aware). Self-contained — it takes a
 * `format` template and `labels` instead of the app's date helpers/i18n, so it
 * can be lifted out and reused. Typing stays the fast path; the calendar assists.
 */
export function DateField({
  value,
  onChange,
  onCommit,
  format = 'DD.MM.YYYY',
  labels: labelsProp,
  placeholder,
  required,
  disabled,
  ariaLabel,
  id,
}: Props) {
  const labels = React.useMemo(() => ({ ...DEFAULT_DATE_LABELS, ...labelsProp }), [labelsProp]);
  const hasTime = formatHasTime(format);
  const twelveHour = formatIsTwelveHour(format);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const display = (v: string | null) => (v ? renderDate(decodeValue(v, format)!, format, labels) : '');
  const [text, setText] = React.useState(() => display(value));

  const sel = decodeValue(value, format);
  const now = new Date();
  const [view, setView] = React.useState(() => ({ y: sel?.y ?? now.getFullYear(), m: sel?.mo ?? now.getMonth() + 1 }));

  const close = React.useCallback(() => {
    setOpen(false);
    onCommit?.(value);
  }, [value, onCommit]);
  const { style: popStyle, sheet } = useAnchoredPopover({
    open,
    anchorRef: rootRef,
    popRef,
    onClose: close,
    reflowKey: `${view.y}.${view.m}.${value ?? ''}`,
  });

  // Recentre the visible month on the selection (or today) each time we open.
  React.useEffect(() => {
    if (!open) return;
    const s = decodeValue(value, format);
    setView({ y: s?.y ?? new Date().getFullYear(), m: s?.mo ?? new Date().getMonth() + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sync the input text with the value, unless the user is typing into it now
  // (calendar clicks blur the input, so they still sync).
  React.useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, format, labels]);

  function onType(raw: string) {
    setText(raw);
    if (raw.trim() === '') onChange(null);
    else {
      const parsed = parseDate(raw, format, labels);
      if (parsed !== null) onChange(parsed);
    }
  }

  function onInputBlur(e: React.FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && (rootRef.current?.contains(next) || popRef.current?.contains(next))) return;
    setText(display(value)); // normalize / revert a half-typed value
    onCommit?.(value);
  }

  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const base: DateParts = sel ?? { y: view.y, mo: view.m, d: Math.min(now.getDate(), daysInMonth), h24: 12, mi: 0 };
  const time = { h24: sel?.h24 ?? 12, mi: sel?.mi ?? 0 };

  function pick(parts: DateParts, closeAfter: boolean) {
    const canonical = encodeValue(parts, format);
    onChange(canonical);
    if (closeAfter) {
      setOpen(false);
      onCommit?.(canonical);
    }
  }
  const pickDay = (d: number) => pick({ y: view.y, mo: view.m, d, h24: time.h24, mi: time.mi }, !hasTime);
  const stepTime = (part: 'h24' | 'mi', delta: number) => {
    const mod = part === 'h24' ? 24 : 60;
    const cur = part === 'h24' ? base.h24 : base.mi;
    pick({ ...base, [part]: ((cur + delta) % mod + mod) % mod }, false);
  };
  const toggleMeridiem = () => pick({ ...base, h24: (base.h24 + 12) % 24 }, false);
  function goToday() {
    const n = new Date();
    setView({ y: n.getFullYear(), m: n.getMonth() + 1 });
    pick({ y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate(), h24: time.h24, mi: time.mi }, !hasTime);
  }
  function clear() {
    onChange(null);
    setOpen(false);
    onCommit?.(null);
  }

  const isSel = (d: number) => (!!sel && sel.y === view.y && sel.mo === view.m && sel.d === d ? 'datefield__day--sel' : '');

  return (
    <div className="datefield" ref={rootRef}>
      <input
        ref={inputRef}
        className="input datefield__input"
        id={id}
        value={text}
        placeholder={placeholder ?? format}
        maxLength={format.length + 6}
        required={required}
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
            <CalendarGrid view={view} onView={setView} labels={labels} dayClass={isSel} onPick={pickDay} />

            {hasTime && (
              <div className="datefield__time">
                <div className="datefield__stepper" aria-label={labels.hour}>
                  <button type="button" className="datefield__navbtn" onClick={() => stepTime('h24', 1)} aria-label={labels.hour}>
                    &#x25B4;
                  </button>
                  <span className="datefield__timeval">{twelveHour ? p2(to12(time.h24)) : p2(time.h24)}</span>
                  <button type="button" className="datefield__navbtn" onClick={() => stepTime('h24', -1)} aria-label={labels.hour}>
                    &#x25BE;
                  </button>
                </div>
                <span className="datefield__colon">:</span>
                <div className="datefield__stepper" aria-label={labels.minute}>
                  <button type="button" className="datefield__navbtn" onClick={() => stepTime('mi', 1)} aria-label={labels.minute}>
                    &#x25B4;
                  </button>
                  <span className="datefield__timeval">{p2(time.mi)}</span>
                  <button type="button" className="datefield__navbtn" onClick={() => stepTime('mi', -1)} aria-label={labels.minute}>
                    &#x25BE;
                  </button>
                </div>
                {twelveHour && (
                  <button type="button" className="btn btn--sm btn--ghost datefield__ampm" onClick={toggleMeridiem}>
                    {time.h24 < 12 ? labels.am : labels.pm}
                  </button>
                )}
              </div>
            )}

            <div className="datefield__foot">
              <button type="button" className="btn btn--sm btn--ghost" onClick={goToday}>
                {labels.today}
              </button>
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
