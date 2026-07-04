import type { DateLabels } from '../lib/dateFormat';

export type CalendarView = { y: number; m: number };

type Props = {
  view: CalendarView;
  onView: (v: CalendarView) => void;
  labels: DateLabels;
  /** Extra class(es) for a day cell — selection / range state; '' for none. */
  dayClass: (d: number) => string;
  onPick: (d: number) => void;
};

/**
 * One month: year+month navigation, weekday header and the day grid. Selection
 * styling is delegated through `dayClass`, so the single-date picker and the
 * range picker share exactly the same calendar. Today is marked here.
 */
export function CalendarGrid({ view, onView, labels, dayClass, onPick }: Props) {
  const now = new Date();
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const firstDow = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isToday = (d: number) =>
    now.getFullYear() === view.y && now.getMonth() + 1 === view.m && now.getDate() === d;

  const prevMonth = () => onView({ y: view.m === 1 ? view.y - 1 : view.y, m: view.m === 1 ? 12 : view.m - 1 });
  const nextMonth = () => onView({ y: view.m === 12 ? view.y + 1 : view.y, m: view.m === 12 ? 1 : view.m + 1 });
  const prevYear = () => onView({ ...view, y: view.y - 1 });
  const nextYear = () => onView({ ...view, y: view.y + 1 });

  return (
    <>
      <div className="datefield__nav">
        <button type="button" className="datefield__navbtn" aria-label={labels.prevYear} onClick={prevYear}>
          &#xAB;
        </button>
        <button type="button" className="datefield__navbtn" aria-label={labels.prevMonth} onClick={prevMonth}>
          &#x2039;
        </button>
        <span className="datefield__month">
          {labels.months[view.m - 1]} {view.y}
        </span>
        <button type="button" className="datefield__navbtn" aria-label={labels.nextMonth} onClick={nextMonth}>
          &#x203A;
        </button>
        <button type="button" className="datefield__navbtn" aria-label={labels.nextYear} onClick={nextYear}>
          &#xBB;
        </button>
      </div>
      <div className="datefield__grid datefield__grid--head">
        {labels.weekdays.map((w, i) => (
          <span key={i} className="datefield__wd">
            {w}
          </span>
        ))}
      </div>
      <div className="datefield__grid">
        {cells.map((d, i) =>
          d === null ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className={`datefield__day${isToday(d) ? ' datefield__day--today' : ''}${dayClass(d) ? ' ' + dayClass(d) : ''}`}
              onClick={() => onPick(d)}
            >
              {d}
            </button>
          ),
        )}
      </div>
    </>
  );
}
