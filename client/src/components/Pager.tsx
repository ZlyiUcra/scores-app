import { useState } from 'react';
import { pagerIcons } from '../constants';
import { useI18n } from '../i18n';

const pageSizeOptions = [10, 20, 50, 100];
const minPageSize = pageSizeOptions[0];
const maxPageSize = pageSizeOptions[pageSizeOptions.length - 1];

type PagerProps = {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

/** Shared pager: prev/next navigation plus a page-size picker (presets or a
 * custom value, rounded to the nearest 10). Reused by AdminUsers and
 * AdminAudit - `total`/`page`/`pageSize` are owned by the caller's hook. */
export function Pager({ page, total, pageSize, onPageChange, onPageSizeChange }: PagerProps) {
  const { t } = useI18n();
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState(String(pageSize));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function selectPageSize(value: string) {
    if (value === 'custom') {
      setCustomValue(String(pageSize));
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onPageSizeChange(Number(value));
  }

  // Commits on blur/Enter only - not on every keystroke, so a partial value
  // like "3" while typing "30" never fires a fetch.
  function commitCustomValue() {
    const parsed = Math.round(Number(customValue) / 10) * 10;
    const clamped = Number.isFinite(parsed) && parsed > 0
      ? Math.min(maxPageSize, Math.max(minPageSize, parsed))
      : pageSize;
    setCustomValue(String(clamped));
    onPageSizeChange(clamped);
  }

  return (
    <div className="pager">
      <button className="btn btn--sm pager__nav" disabled={page <= 1} title={t('pager.first')} aria-label={t('pager.first')}
        onClick={() => onPageChange(1)}>
        {pagerIcons.first}
      </button>
      <button className="btn btn--sm pager__nav" disabled={page <= 1} title={t('pager.prev')} aria-label={t('pager.prev')}
        onClick={() => onPageChange(page - 1)}>
        {pagerIcons.prev}
      </button>
      <span className="muted">{t('pager.page', { page, total: totalPages })}</span>
      <button className="btn btn--sm pager__nav" disabled={page >= totalPages} title={t('pager.next')} aria-label={t('pager.next')}
        onClick={() => onPageChange(page + 1)}>
        {pagerIcons.next}
      </button>
      <button className="btn btn--sm pager__nav" disabled={page >= totalPages} title={t('pager.last')} aria-label={t('pager.last')}
        onClick={() => onPageChange(totalPages)}>
        {pagerIcons.last}
      </button>
      <label className="pager__size">
        <select
          className="input pager__select"
          value={customMode ? 'custom' : String(pageSize)}
          onChange={(e) => selectPageSize(e.target.value)}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value="custom">{t('pager.custom')}</option>
        </select>
        {customMode && (
          <input
            className="input input--num pager__num"
            type="number"
            step={10}
            min={minPageSize}
            max={maxPageSize}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onBlur={commitCustomValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCustomValue();
              }
            }}
          />
        )}
        <span className="muted">{t('pager.perPage')}</span>
      </label>
    </div>
  );
}
