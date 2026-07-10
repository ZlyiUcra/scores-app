import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, matchPath, useLocation } from 'react-router-dom';
import { useAnchoredPopover } from '../lib/useAnchoredPopover';
import { useAuth } from '../auth/AuthContext';
import { useTournamentStore, selectDefaultId } from '../stores/tournamentStore';
import { useI18n, LANGS } from '../i18n';

function LangSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l}
          className={`lang__btn ${l === lang ? 'lang__btn--active' : ''}`}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Tracks a media query reactively. The header swaps between its desktop
 * dropdowns and the flat burger panel at the same 720px breakpoint the CSS
 * uses, so the two never disagree about which layout is showing. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** A header nav item that opens a portalled, edge-aware panel via the shared
 * popover hook. Used to fold the tournament pages and the account block off the
 * header row so it stays short. Desktop only - the burger panel lists items
 * flat, so this never needs the hook's phone bottom-sheet mode. */
function HeaderDropdown({
  trigger,
  active,
  ariaLabel,
  panelClassName,
  children,
}: {
  trigger: ReactNode;
  active?: boolean;
  ariaLabel: string;
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { style, sheet } = useAnchoredPopover({ open, anchorRef: rootRef, popRef, onClose: close });
  return (
    <div className="hdrop" ref={rootRef}>
      <button
        type="button"
        className={`header__nav-link hdrop__trigger${active ? ' header__nav-link--active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
        <span className="hdrop__caret" aria-hidden="true">&#x25BE;</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            style={style}
            role="menu"
            className={`hdrop__pop${sheet ? ' hdrop__pop--sheet' : ''}${panelClassName ? ` ${panelClassName}` : ''}`}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** The four in-tournament views folded into one dropdown. The trigger shows the
 * active view (or a neutral label when none of them is), so it doubles as a
 * "where am I" section marker. */
function TournamentMenu({ base }: { base: string }) {
  const { t } = useI18n();
  const location = useLocation();
  const items = [
    { to: base, end: true, label: t('nav.overview') },
    { to: `${base}/results`, end: false, label: t('nav.results') },
    { to: `${base}/ko`, end: false, label: t('nav.knockout') },
    { to: `${base}/teams`, end: false, label: t('nav.teams') },
  ];
  const activeItem = items.find((it) =>
    it.end ? location.pathname === it.to : location.pathname.startsWith(it.to),
  );
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `hdrop__item${isActive ? ' hdrop__item--active' : ''}`;
  return (
    <HeaderDropdown
      ariaLabel={t('nav.tournamentMenu')}
      active={!!activeItem}
      trigger={<span>{activeItem ? activeItem.label : t('nav.tournamentMenu')}</span>}
    >
      {(close) =>
        items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={itemClass} role="menuitem" onClick={close}>
            {it.label}
          </NavLink>
        ))
      }
    </HeaderDropdown>
  );
}

/** Username, language and logout folded into one dropdown so they stop eating
 * header width. Desktop only; the burger panel shows them flat. */
function AccountMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  return (
    <HeaderDropdown
      ariaLabel={t('header.account')}
      panelClassName="hdrop__pop--account"
      trigger={
        <span className="header__user">
          {user?.username}
          <span className={`chip chip--${user?.role}`}>
            {user?.role === 'admin' ? t('role.admin') : t('role.viewer')}
          </span>
        </span>
      }
    >
      {(close) => (
        <>
          <div className="hdrop__section">
            <span className="hdrop__label">{t('header.language')}</span>
            <LangSwitcher />
          </div>
          <button
            className="btn btn--sm btn--ghost hdrop__logout"
            onClick={() => {
              close();
              void logout();
            }}
          >
            {t('header.logout')}
          </button>
        </>
      )}
    </HeaderDropdown>
  );
}

export function Header() {
  const { user, isAdmin, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const defaultId = useTournamentStore(selectDefaultId);
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  // Below this the header collapses into the burger panel; above it the
  // tournament pages and account block become dropdowns instead.
  const compact = useMediaQuery('(max-width: 720px)');
  const closeMenu = () => setMenuOpen(false);

  // Escape closes the panel and returns focus to the burger so keyboard users
  // are not left inside a hidden subtree. The listener exists only while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      setMenuOpen(false);
      burgerRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // Tournament pages link within the tournament currently on screen; outside
  // one (tournaments list, help, admin) they lead into the default tournament.
  const scoped = matchPath('/t/:tournamentId/*', location.pathname) ?? matchPath('/t/:tournamentId', location.pathname);
  const tournamentId = scoped?.params.tournamentId ?? defaultId;
  const base = tournamentId ? `/t/${tournamentId}` : null;

  const link = ({ isActive }: { isActive: boolean }) =>
    `header__nav-link ${isActive ? 'header__nav-link--active' : ''}`;
  return (
    <header className="header">
      <Link to="/" className="header__brand">{t('tournament.short')}</Link>
      <button
        ref={burgerRef}
        type="button"
        className="header__burger"
        aria-expanded={menuOpen}
        aria-controls="header-menu"
        aria-label={t('header.menu')}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span className="header__burger-bar" />
      </button>
      {/* Rendered ONCE for both layouts: desktop dissolves this wrapper via
          display:contents; mobile shows it as the dropdown panel while open.
          Links close the menu via onClick because a same-route click fires no
          location change. */}
      <div id="header-menu" className={`header__menu ${menuOpen ? 'header__menu--open' : ''}`}>
        <nav className="header__nav">
          <NavLink to="/tournaments" className={link} onClick={closeMenu}>{t('nav.tournaments')}</NavLink>
          {base &&
            (compact ? (
              <>
                <NavLink to={base} end className={link} onClick={closeMenu}>{t('nav.overview')}</NavLink>
                <NavLink to={`${base}/results`} className={link} onClick={closeMenu}>{t('nav.results')}</NavLink>
                <NavLink to={`${base}/ko`} className={link} onClick={closeMenu}>{t('nav.knockout')}</NavLink>
                <NavLink to={`${base}/teams`} className={link} onClick={closeMenu}>{t('nav.teams')}</NavLink>
              </>
            ) : (
              <TournamentMenu base={base} />
            ))}
          <NavLink to="/help" className={link} onClick={closeMenu}>{t('nav.help')}</NavLink>
          {isAdmin && (
            <NavLink
              // Carry the tournament on screen into the admin selection (?t=)
              // so Admin opens on what the admin is looking at, not the default.
              to={scoped ? `/admin?t=${encodeURIComponent(scoped.params.tournamentId ?? '')}` : '/admin'}
              className={link}
              onClick={closeMenu}
            >
              {t('nav.admin')}
            </NavLink>
          )}
        </nav>
        <div className="header__right">
          {compact ? (
            <>
              <LangSwitcher />
              <span className="header__user">
                {user?.username}
                <span className={`chip chip--${user?.role}`}>{user?.role === 'admin' ? t('role.admin') : t('role.viewer')}</span>
              </span>
              <button className="btn btn--sm btn--ghost" onClick={() => void logout()}>{t('header.logout')}</button>
            </>
          ) : (
            <AccountMenu />
          )}
        </div>
      </div>
    </header>
  );
}
