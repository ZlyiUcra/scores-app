import React from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '../lib/useAnchoredPopover';
import {
  DEFAULT_DATE_LABELS,
  type DateLabels,
  type TimeParts,
  decodeTime,
  encodeTime,
  formatIsTwelveHour,
  p2,
  parseTime,
  renderTime,
  to12,
} from '../lib/dateFormat';

type Props = {
  /** Canonical 24-hour "HH:mm", or null when empty. */
  value: string | null;
  /** Emits the canonical value (or null) whenever a valid time is entered/picked. */
  onChange: (value: string | null) => void;
  /** Fired when editing settles (blur out, or the popup closes). */
  onCommit?: (value: string | null) => void;
  /** Display/parse template (default "HH:mm"; "hh:mm A" for 12-hour + AM/PM). */
  format?: string;
  labels?: Partial<DateLabels>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
};

/**
 * A single time-of-day field: a typed "HH:mm"-shaped input plus a pop-up with
 * one hour/minute stepper (and an AM/PM toggle for a 12-hour template). No
 * date, no calendar - just a time of day. The one-sided sibling of
 * TimeRangeField (which pairs two of these into a "from - to" range) and
 * DateField (which pairs the same time stepper with a calendar) - all three
 * share the edge-aware pop-up and dateFormat.ts's time helpers.
 */
export function TimeField({
  value,
  onChange,
  onCommit,
  format = 'HH:mm',
  labels: labelsProp,
  placeholder,
  disabled,
  ariaLabel,
  id,
}: Props) {
  const labels = React.useMemo(() => ({ ...DEFAULT_DATE_LABELS, ...labelsProp }), [labelsProp]);
  const twelveHour = formatIsTwelveHour(format);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);

  const display = (v: string | null) => (v ? renderTime(decodeTime(v)!, format, labels) : '');
  const [text, setText] = React.useState(() => display(value));

  const close = React.useCallback(() => {
    setOpen(false);
    onCommit?.(value);
  }, [value, onCommit]);
  const { style: popStyle, sheet } = useAnchoredPopover({
    open,
    anchorRef: rootRef,
    popRef,
    onClose: close,
    reflowKey: value ?? '',
  });

  // Sync the input text with the value, unless the user is typing into it now
  // (stepper clicks blur the input, so they still sync).
  React.useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, format, labels]);

  function onType(raw: string) {
    setText(raw);
    if (raw.trim() === '') onChange(null);
    else {
      const parsed = parseTime(raw, format, labels);
      if (parsed !== null) onChange(parsed);
    }
  }

  function onInputBlur(e: React.FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && (rootRef.current?.contains(next) || popRef.current?.contains(next))) return;
    setText(display(value)); // normalize / revert a half-typed value
    onCommit?.(value);
  }

  // Steppers start from the EXISTING time (not a fixed default) whenever one
  // is set - only a genuinely empty value falls back to noon.
  const t: TimeParts = decodeTime(value) ?? { h24: 12, mi: 0 };

  function commit(next: TimeParts, closeAfter: boolean) {
    const canonical = encodeTime(next);
    onChange(canonical);
    if (closeAfter) {
      setOpen(false);
      onCommit?.(canonical);
    }
  }
  const step = (part: 'h24' | 'mi', delta: number) => {
    const mod = part === 'h24' ? 24 : 60;
    const cur = part === 'h24' ? t.h24 : t.mi;
    commit({ ...t, [part]: ((cur + delta) % mod + mod) % mod }, false);
  };
  const toggleMeridiem = () => commit({ ...t, h24: (t.h24 + 12) % 24 }, false);
  function clear() {
    onChange(null);
    setOpen(false);
    onCommit?.(null);
  }

  return (
    <div className="datefield" ref={rootRef}>
      <input
        ref={inputRef}
        className="input datefield__input"
        id={id}
        value={text}
        placeholder={placeholder ?? format}
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
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="8" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="8" x2="10.6" y2="9.2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className={`datefield__pop${sheet ? ' datefield__pop--sheet' : ''}`} ref={popRef} style={popStyle}>
            <div className="datefield__time">
              <div className="datefield__stepper" aria-label={labels.hour}>
                <button type="button" className="datefield__navbtn" onClick={() => step('h24', 1)} aria-label={labels.hour}>
                  &#x25B4;
                </button>
                <span className="datefield__timeval">{twelveHour ? p2(to12(t.h24)) : p2(t.h24)}</span>
                <button type="button" className="datefield__navbtn" onClick={() => step('h24', -1)} aria-label={labels.hour}>
                  &#x25BE;
                </button>
              </div>
              <span className="datefield__colon">:</span>
              <div className="datefield__stepper" aria-label={labels.minute}>
                <button type="button" className="datefield__navbtn" onClick={() => step('mi', 1)} aria-label={labels.minute}>
                  &#x25B4;
                </button>
                <span className="datefield__timeval">{p2(t.mi)}</span>
                <button type="button" className="datefield__navbtn" onClick={() => step('mi', -1)} aria-label={labels.minute}>
                  &#x25BE;
                </button>
              </div>
              {twelveHour && (
                <button type="button" className="btn btn--sm btn--ghost datefield__ampm" onClick={toggleMeridiem}>
                  {t.h24 < 12 ? labels.am : labels.pm}
                </button>
              )}
            </div>

            <div className="datefield__foot">
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
