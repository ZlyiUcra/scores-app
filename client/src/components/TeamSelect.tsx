import React from 'react';
import { createPortal } from 'react-dom';
import type { Group, Team } from '../../../shared/types';
import { useAnchoredPopover } from '../lib/useAnchoredPopover';

type Section = { key: string; label: string; teams: Team[] };

type Props = {
  teams: Team[];
  groups: Group[];
  /** Selected team id; '' means nothing picked yet. */
  value: string;
  onChange: (teamId: string) => void;
  /** Trigger text while nothing is picked. */
  placeholder: string;
  /** Section header for teams that belong to no group. */
  ungroupedLabel: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * A team picker shaped as collapsible group sections instead of a flat native
 * <select>: each of the tournament's groups is a header you can fold open/shut,
 * with its teams listed under it; teams without a group fall into one trailing
 * section. The pop-up is portalled + edge-aware (see useAnchoredPopover), so it
 * behaves like the other pickers at the screen edges and on mobile. Data-only -
 * it takes teams/groups and label strings, so it stays i18n-agnostic and reusable.
 */
export function TeamSelect({
  teams,
  groups,
  value,
  onChange,
  placeholder,
  ungroupedLabel,
  ariaLabel,
  disabled,
  id,
}: Props) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  // Section keys the user has folded shut; everything is expanded by default.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());

  const selected = teams.find((t) => t.id === value);

  // Split the teams into group sections (in group order) plus a trailing
  // "ungrouped" bucket. Empty sections are dropped so the list stays tight.
  const sections = React.useMemo<Section[]>(() => {
    const byGroup = new Map<string, Team[]>();
    const ungrouped: Team[] = [];
    const known = new Set(groups.map((g) => g.id));
    for (const t of teams) {
      if (t.groupId && known.has(t.groupId)) {
        const list = byGroup.get(t.groupId) ?? [];
        list.push(t);
        byGroup.set(t.groupId, list);
      } else {
        ungrouped.push(t);
      }
    }
    const out: Section[] = [];
    for (const g of groups) {
      const list = byGroup.get(g.id);
      if (list && list.length) out.push({ key: g.id, label: g.name, teams: list });
    }
    if (ungrouped.length) out.push({ key: '', label: ungroupedLabel, teams: ungrouped });
    return out;
  }, [teams, groups, ungroupedLabel]);

  const close = React.useCallback(() => setOpen(false), []);
  const { style: popStyle, sheet } = useAnchoredPopover({
    open,
    anchorRef: rootRef,
    popRef,
    onClose: close,
    // Re-measure when the folded set changes (the pop-up grows/shrinks).
    reflowKey: `${value}:${sections.length}:${[...collapsed].sort().join(',')}`,
  });

  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pick(teamId: string) {
    onChange(teamId);
    setOpen(false);
  }

  return (
    <div className="teamselect" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="input teamselect__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={selected ? undefined : 'teamselect__placeholder'}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="teamselect__caret" aria-hidden="true">
          &#x25BE;
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className={`teamselect__pop${sheet ? ' teamselect__pop--sheet' : ''}`}
            ref={popRef}
            style={popStyle}
            role="listbox"
          >
            {sections.length === 0 ? (
              <p className="teamselect__empty">{placeholder}</p>
            ) : (
              sections.map((s) => {
                const folded = collapsed.has(s.key);
                return (
                  <div className="teamselect__section" key={s.key || '__ungrouped'}>
                    <button
                      type="button"
                      className="teamselect__head"
                      aria-expanded={!folded}
                      onClick={() => toggleSection(s.key)}
                    >
                      <span className="teamselect__twisty" aria-hidden="true">
                        {String.fromCharCode(folded ? 0x25b8 : 0x25be)}
                      </span>
                      <span>{s.label}</span>
                      <span className="teamselect__count">{s.teams.length}</span>
                    </button>
                    {!folded && (
                      <ul className="teamselect__list">
                        {s.teams.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={t.id === value}
                              className={`teamselect__opt${t.id === value ? ' teamselect__opt--sel' : ''}`}
                              onClick={() => pick(t.id)}
                            >
                              <span className="teamselect__short">{t.shortName}</span>
                              <span>{t.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
