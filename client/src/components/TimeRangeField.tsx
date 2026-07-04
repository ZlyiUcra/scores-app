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
  parseTime,
  renderTime,
} from '../lib/dateFormat';

const p2 = (n: number) => String(n).padStart(2, '0');
const to12 = (h24: number) => ((h24 + 11) % 12) + 1;

export type TimeRange = { start: string | null; end: string | null };
type Side = 'start' | 'end';

type Props = {
  /** Both ends canonical 24-hour "HH:mm" (or null). */
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  onCommit?: (value: TimeRange) => void;
  /** Time template (default "HH:mm"; e.g. "hh:mm A" for 12-hour + AM/PM). */
  format?: string;
  labels?: Partial<DateLabels>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
};

/**
 * A time-range field: one input showing "from - to" plus a pop-up with two
 * hour/minute steppers (and an AM/PM toggle when the template is 12-hour). No
 * date and no calendar — just a time interval. Text is editable for quick
 * correction. Shares the edge-aware / bottom-sheet pop-up with the date fields.
 */
export function TimeRangeField({
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

  const one = (v: string | null) => (v ? renderTime(decodeTime(v)!, format, labels) : '');
  const display = (r: TimeRange) => (r.start || r.end ? `${one(r.start)} - ${one(r.end)}` : '');
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
    reflowKey: `${value.start ?? ''}.${value.end ?? ''}`,
  });

  React.useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, format, labels]);

  function onType(raw: string) {
    setText(raw);
    const parts = raw.split(/\s+-\s+/);
    const s = parts[0]?.trim() ? parseTime(parts[0], format, labels) : null;
    const e = parts[1]?.trim() ? parseTime(parts[1], format, labels) : null;
    onChange({ start: s, end: e });
  }

  function onInputBlur(e: React.FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && (rootRef.current?.contains(next) || popRef.current?.contains(next))) return;
    setText(display(value));
    onCommit?.(value);
  }

  const partsOf = (side: Side): TimeParts => decodeTime(value[side]) ?? { h24: 12, mi: 0 };
  const setSide = (side: Side, t: TimeParts) => onChange({ ...value, [side]: encodeTime(t) });
  const step = (side: Side, part: 'h24' | 'mi', delta: number) => {
    const t = partsOf(side);
    const mod = part === 'h24' ? 24 : 60;
    const cur = part === 'h24' ? t.h24 : t.mi;
    setSide(side, { ...t, [part]: ((cur + delta) % mod + mod) % mod });
  };
  const toggle = (side: Side) => {
    const t = partsOf(side);
    setSide(side, { ...t, h24: (t.h24 + 12) % 24 });
  };
  const clear = () => {
    onChange({ start: null, end: null });
    setOpen(false);
    onCommit?.({ start: null, end: null });
  };

  const block = (side: Side, label: string) => {
    const t = partsOf(side);
    return (
      <div className="datefield__timerow">
        <span className="muted datefield__timelabel">{label}</span>
        <div className="datefield__stepper" aria-label={labels.hour}>
          <button type="button" className="datefield__navbtn" onClick={() => step(side, 'h24', 1)} aria-label={labels.hour}>
            &#x25B4;
          </button>
          <span className="datefield__timeval">{twelveHour ? p2(to12(t.h24)) : p2(t.h24)}</span>
          <button type="button" className="datefield__navbtn" onClick={() => step(side, 'h24', -1)} aria-label={labels.hour}>
            &#x25BE;
          </button>
        </div>
        <span className="datefield__colon">:</span>
        <div className="datefield__stepper" aria-label={labels.minute}>
          <button type="button" className="datefield__navbtn" onClick={() => step(side, 'mi', 1)} aria-label={labels.minute}>
            &#x25B4;
          </button>
          <span className="datefield__timeval">{p2(t.mi)}</span>
          <button type="button" className="datefield__navbtn" onClick={() => step(side, 'mi', -1)} aria-label={labels.minute}>
            &#x25BE;
          </button>
        </div>
        {twelveHour && (
          <button type="button" className="btn btn--sm btn--ghost datefield__ampm" onClick={() => toggle(side)}>
            {t.h24 < 12 ? labels.am : labels.pm}
          </button>
        )}
      </div>
    );
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
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="8" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="8" x2="10.6" y2="9.2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className={`datefield__pop${sheet ? ' datefield__pop--sheet' : ''}`} ref={popRef} style={popStyle}>
            {block('start', labels.from)}
            {block('end', labels.to)}
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
