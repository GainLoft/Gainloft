'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import SearchDropdown from './SearchDropdown';
import { CATEGORIES } from '@/lib/categories';
import { useRainbowKitReady } from './Providers';

const ALL_TABS = [
  { key: 'trending', label: 'Trending', href: '/' },
  { key: 'breaking', label: 'Breaking', href: '/breaking' },
  { key: 'new', label: 'New', href: '/new' },
  { key: '_sep', label: '', href: '' },
  ...CATEGORIES.map((c) => ({
    key: c.toLowerCase(),
    label: c === 'Climate' ? 'Climate & Science' : c,
    href: `/${c.toLowerCase()}`,
  })),
];

const BROWSE_PATHS = new Set(
  ALL_TABS.filter((t) => t.key !== '_sep').map((t) => t.href)
);

const MENU_LINKS = [
  { icon: 'trophy', label: 'Leaderboard', href: '/leaderboard' },
  { icon: 'coins', label: 'Rewards', href: '/rewards' },
  { icon: 'chart', label: 'Activity', href: '/activity' },
  { icon: 'bookmark', label: 'Watchlist', href: '/watchlist' },
  { icon: 'code', label: 'APIs', href: '/apis' },
];

function MenuIcon({ name, size = 18 }: { name: string; size?: number }) {
  switch (name) {
    case 'trophy': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21h8M12 17v4"/><path d="M7 4h10v7a5 5 0 01-10 0V4z"/><path d="M7 4H4v2a3 3 0 003 3"/><path d="M17 4h3v2a3 3 0 01-3 3"/>
      </svg>
    );
    case 'coins': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>
    );
    case 'chart': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6"/>
      </svg>
    );
    case 'bookmark': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
      </svg>
    );
    case 'code': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>
      </svg>
    );
    case 'sun': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
    );
    case 'moon': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
      </svg>
    );
    default: return null;
  }
}

const FOOTER_LINKS = [
  { label: 'Accuracy', href: '/accuracy' },
  { label: 'Documentation', href: '/docs' },
  { label: 'Help Center', href: '/help' },
  { label: 'Terms of Use', href: '/terms' },
];

export default function Header() {
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchIdx, setSearchIdx] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const rkReady = useRainbowKitReady();
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const showDropdown = searchFocused && search.trim().length > 0;

  const isBrowsePage = BROWSE_PATHS.has(pathname);
  const activeKey = pathname === '/' ? 'trending' : pathname.replace('/', '');

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      setDarkMode(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (saved === 'light') {
      setDarkMode(false);
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      // No saved preference — follow OS
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
      // Don't set data-theme — let CSS media query handle it
    }
  }, []);

  const checkFade = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    checkFade();
    el.addEventListener('scroll', checkFade, { passive: true });
    window.addEventListener('resize', checkFade);
    return () => {
      el.removeEventListener('scroll', checkFade);
      window.removeEventListener('resize', checkFade);
    };
  }, [checkFade]);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close search dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  // Close dropdown on route change
  useEffect(() => {
    setSearchFocused(false);
    setSearch('');
  }, [pathname]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      setSearchFocused(false);
      router.push(`/markets?q=${encodeURIComponent(search.trim())}`);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchIdx((prev) => prev + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchIdx((prev) => Math.max(-1, prev - 1));
    } else if (e.key === 'Escape') {
      setSearchFocused(false);
    } else if (e.key === 'Enter' && searchIdx >= 0) {
      e.preventDefault();
      const el = document.getElementById(`search-result-${searchIdx}`) as HTMLAnchorElement;
      if (el) el.click();
    }
  }

  // Keyboard shortcut: "/" to focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        const input = document.getElementById('header-search') as HTMLInputElement;
        input?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50" style={{ background: 'var(--bg)' }}>
      {/* ── Row 1: Logo · Search · Auth ── */}
      <div className="mx-auto flex max-w-[1400px] items-center px-4" style={{ height: 60 }}>
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
            <path d="M14 0L26 7V21L14 28L2 21V7L14 0Z" fill="var(--brand-blue)"/>
            <path d="M14 6L20 9.5V16.5L14 20L8 16.5V9.5L14 6Z" fill="var(--bg)"/>
          </svg>
          <span className="hidden sm:inline text-[24px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-logo)', WebkitFontSmoothing: 'antialiased' }}>
            GainLoft
          </span>
        </Link>

        {/* Search — centered, pill-shaped */}
        <div className="flex-1 flex justify-center" style={{ padding: '0 24px' }}>
          <div ref={searchWrapRef} className="w-full hidden sm:block relative" style={{ maxWidth: 520 }}>
            <form onSubmit={handleSearch}>
              <div className="relative">
                <svg
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: 14, color: 'var(--text-muted)' }}
                  width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}
                >
                  <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  id="header-search"
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSearchIdx(-1); }}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search markets"
                  autoComplete="off"
                  className="w-full focus:outline-none transition-colors"
                  style={{
                    height: 40,
                    borderRadius: 9999,
                    paddingLeft: 38,
                    paddingRight: 36,
                    fontSize: 14,
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: 'none',
                  }}
                />
                {!showDropdown && (
                  <kbd
                    className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
                    style={{
                      right: 12,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                  >
                    /
                  </kbd>
                )}
                {showDropdown && search.trim() && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setSearchFocused(false); }}
                    className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center hover:opacity-70"
                    style={{ right: 12, color: 'var(--text-muted)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </form>
            {showDropdown && (
              <SearchDropdown
                query={search.trim()}
                onSelect={() => { setSearchFocused(false); setSearch(''); }}
                activeIndex={searchIdx}
              />
            )}
          </div>

          {/* Mobile search icon */}
          <button className="sm:hidden p-2" style={{ color: 'var(--text-secondary)' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>

        {/* Auth + Menu */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
          {rkReady ? (
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal }) => {
                const connected = account && chain;
                return connected ? (
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <Link
                      href="/portfolio"
                      className="hidden sm:block font-semibold transition-colors hover:opacity-80"
                      style={{ color: 'var(--text-primary)', fontSize: 15 }}
                    >
                      Portfolio
                    </Link>
                    <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
                  </div>
                ) : (
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <button
                      onClick={openConnectModal}
                      className="font-semibold hover:opacity-80 transition-colors"
                      style={{
                        color: 'var(--text-primary)',
                        fontSize: 15,
                        padding: '8px 12px',
                      }}
                    >
                      Log In
                    </button>
                    <button
                      onClick={openConnectModal}
                      className="font-semibold text-white hover:opacity-90 transition-colors"
                      style={{
                        fontSize: 15,
                        padding: '8px 20px',
                        borderRadius: 9999,
                        background: 'var(--brand-blue)',
                      }}
                    >
                      Sign Up
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          ) : (
            <div className="flex items-center" style={{ gap: 6 }}>
              <span className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 15, padding: '8px 12px' }}>
                Log In
              </span>
              <span className="font-semibold text-white" style={{ fontSize: 15, padding: '8px 20px', borderRadius: 9999, background: 'var(--brand-blue)' }}>
                Sign Up
              </span>
            </div>
          )}

          {/* Hamburger */}
          <div className="relative">
            <button
              ref={btnRef}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center justify-center rounded-full transition-colors hover:opacity-70"
              style={{
                width: 36,
                height: 36,
                color: 'var(--text-secondary)',
                background: 'var(--bg-surface)',
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div
                ref={menuRef}
                className="absolute right-0 mt-2 shadow-lg"
                style={{
                  width: 260,
                  borderRadius: 16,
                  padding: '8px 0',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  zIndex: 100,
                }}
              >
                <div style={{ borderBottom: '1px solid var(--border)' }}>
                  {MENU_LINKS.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center transition-colors hover:opacity-80"
                      style={{
                        gap: 12,
                        padding: '12px 20px',
                        fontSize: 15,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MenuIcon name={item.icon} /></span>
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={toggleDarkMode}
                    className="flex w-full items-center"
                    style={{
                      gap: 12,
                      padding: '12px 20px',
                      fontSize: 15,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MenuIcon name={darkMode ? 'sun' : 'moon'} /></span>
                    {darkMode ? 'Light mode' : 'Dark mode'}
                    <div style={{ marginLeft: 'auto' }}>
                      <div
                        className="relative rounded-full transition-colors"
                        style={{
                          width: 42,
                          height: 24,
                          background: darkMode ? 'var(--brand-blue)' : 'var(--bg-surface)',
                          border: darkMode ? 'none' : '1px solid var(--border)',
                        }}
                      >
                        <div
                          className="absolute rounded-full transition-all"
                          style={{
                            top: 3,
                            width: 18,
                            height: 18,
                            background: darkMode ? '#fff' : 'var(--text-muted)',
                            left: darkMode ? 21 : 3,
                          }}
                        />
                      </div>
                    </div>
                  </button>
                </div>
                <div style={{ paddingTop: 4 }}>
                  {FOOTER_LINKS.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="block transition-colors hover:opacity-80"
                      style={{
                        padding: '10px 20px',
                        fontSize: 14,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Category tabs ── */}
      <div className="relative mx-auto max-w-[1400px] px-4" style={{ borderTop: '1px solid var(--border)' }}>
        {showRightFade && (
          <div
            className="pointer-events-none absolute right-4 top-0 bottom-0 z-10"
            style={{ width: 48, background: 'linear-gradient(to left, var(--bg), transparent)' }}
          />
        )}
        <div
          ref={tabsRef}
          className="flex items-center overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {ALL_TABS.map((t) => {
            if (t.key === '_sep') {
              return (
                <div
                  key="_sep"
                  className="flex-shrink-0"
                  style={{
                    width: 1,
                    height: 16,
                    background: 'var(--border)',
                    margin: '0 4px',
                  }}
                />
              );
            }
            const isActive = activeKey === t.key && isBrowsePage;
            return (
              <Link
                key={t.key}
                href={t.href}
                className="relative flex items-center whitespace-nowrap transition-colors hover:opacity-80"
                style={{
                  padding: '12px 12px',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {t.label}
                {isActive && (
                  <div
                    className="absolute left-3 right-3"
                    style={{
                      bottom: 0,
                      height: 2,
                      borderRadius: 1,
                      background: 'var(--brand-blue)',
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
