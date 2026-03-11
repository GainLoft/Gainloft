'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Market } from '@/lib/types';

// ── Types ──

interface FinOutcome {
  name: string;
  pct: number;
}

interface FinCard {
  id: string;
  title: string;
  slug: string;
  variant: 'list' | 'gauge';
  iconLabel: string;
  iconBg: string;
  outcomes: FinOutcome[];
  volume: number;
  timeframe?: string;
  isNew?: boolean;
  upDown?: boolean;
  tags: string[];
  cats: string[];
}

// ── Helpers ──

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

// ── Sidebar config ──

const SIDEBAR_ITEMS: { id: string; label: string; count: number; icon: string; isDivider?: boolean }[] = [
  { id: 'all', label: 'All', count: 203, icon: 'menu' },
  { id: 'daily', label: 'Daily', count: 32, icon: 'calendar' },
  { id: 'weekly', label: 'Weekly', count: 24, icon: 'calendar' },
  { id: 'monthly', label: 'Monthly', count: 64, icon: 'trending' },
  { id: '_d1', label: '', count: 0, icon: '', isDivider: true },
  { id: 'stocks', label: 'Stocks', count: 89, icon: 'bar-chart' },
  { id: 'earnings', label: 'Earnings', count: 32, icon: 'bar-chart' },
  { id: 'indices', label: 'Indices', count: 27, icon: 'trending' },
  { id: 'commodities', label: 'Commodities', count: 24, icon: 'diamond' },
  { id: 'forex', label: 'Forex', count: 4, icon: 'currency' },
  { id: '_d2', label: '', count: 0, icon: '', isDivider: true },
  { id: 'collectibles', label: 'Collectibles', count: 0, icon: 'frame' },
  { id: 'acquisitions', label: 'Acquisitions', count: 10, icon: 'building' },
  { id: 'earnings-calendar', label: 'Earnings Calendar', count: 0, icon: 'calendar' },
  { id: 'earnings-calls', label: 'Earnings Calls', count: 0, icon: 'phone' },
  { id: 'ipos', label: 'IPOs', count: 33, icon: 'rocket' },
  { id: 'fed-rates', label: 'Fed Rates', count: 38, icon: 'bank' },
  { id: 'prediction-markets', label: 'Prediction Markets', count: 0, icon: 'eye' },
  { id: 'treasuries', label: 'Treasuries', count: 2, icon: 'vault' },
];

function FinSidebarIcon({ name }: { name: string }) {
  const s = 16;
  switch (name) {
    case 'menu': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>;
    case 'calendar': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case 'trending': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case 'bar-chart': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>;
    case 'diamond': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2.7 10.3a2.41 2.41 0 000 3.41l7.59 7.59a2.41 2.41 0 003.41 0l7.59-7.59a2.41 2.41 0 000-3.41L13.7 2.71a2.41 2.41 0 00-3.41 0z"/></svg>;
    case 'currency': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
    case 'frame': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
    case 'building': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18z"/><path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>;
    case 'phone': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
    case 'rocket': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>;
    case 'bank': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>;
    case 'eye': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'vault': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v8M8 12h8"/></svg>;
    default: return null;
  }
}

const FILTER_PILLS = ['All', 'Up / Down', 'Daily Close', 'S&P 500', 'Stocks', 'Indices', 'Gold', 'Silver', 'Tesla', 'NVIDIA'];

const FILTER_TO_TAG: Record<string, string> = {
  'Up / Down': 'updown',
  'Daily Close': 'daily-close',
  'S&P 500': 'sp500',
  'Stocks': 'stocks',
  'Indices': 'indices',
  'Gold': 'gold',
  'Silver': 'silver',
  'Tesla': 'tesla',
  'NVIDIA': 'nvidia',
};

// ── Finance Cards Data (24 cards matching Polymarket Finance page) ──

const FINANCE_CARDS: FinCard[] = [
  {
    id: 'fin-1', title: 'Largest Company end of March?', slug: 'largest-company-march-2026',
    variant: 'list', iconLabel: 'chart', iconBg: '#1452f0',
    outcomes: [{ name: 'NVIDIA', pct: 94 }, { name: 'Apple', pct: 4 }],
    volume: 7_000_000, timeframe: 'Monthly',
    tags: ['stocks', 'nvidia'], cats: ['stocks', 'monthly'],
  },
  {
    id: 'fin-2', title: 'Largest Company end of December 2026?', slug: 'largest-company-dec-2026',
    variant: 'list', iconLabel: 'chart', iconBg: '#1452f0',
    outcomes: [{ name: 'NVIDIA', pct: 60 }, { name: 'Apple', pct: 16 }],
    volume: 23_000, timeframe: 'Monthly',
    tags: ['stocks', 'nvidia'], cats: ['stocks', 'monthly'],
  },
  {
    id: 'fin-3', title: 'Largest IPO by market cap in 2026?', slug: 'largest-ipo-2026',
    variant: 'list', iconLabel: 'IPO', iconBg: '#f59e0b',
    outcomes: [{ name: 'SpaceX', pct: 84 }, { name: 'Anthropic', pct: 8 }],
    volume: 528_000,
    tags: ['ipos'], cats: ['ipos'],
  },
  {
    id: 'fin-4', title: 'Nothing Ever Happens: MicroStrategy', slug: 'microstrategy-nothing-happens',
    variant: 'gauge', iconLabel: 'M', iconBg: '#ef4444', upDown: false,
    outcomes: [{ name: 'Yes', pct: 55 }, { name: 'No', pct: 45 }],
    volume: 8_000_000,
    tags: ['stocks'], cats: ['stocks'],
  },
  {
    id: 'fin-5', title: 'Fed decisions (Dec-Mar)', slug: 'fed-decisions-dec-mar',
    variant: 'list', iconLabel: 'bank', iconBg: '#4b5563',
    outcomes: [{ name: 'Cut–Pause–Pause', pct: 98 }, { name: 'Cut–Pause–Cut', pct: 2 }],
    volume: 9_000_000, timeframe: 'Daily',
    tags: ['fed-rates', 'daily-close'], cats: ['fed-rates', 'daily'],
  },
  {
    id: 'fin-6', title: 'How many Fed rate cuts in 2026?', slug: 'fed-rate-cuts-2026',
    variant: 'list', iconLabel: 'bank', iconBg: '#4b5563',
    outcomes: [{ name: '0 (0 bps)', pct: 13 }, { name: '1 (25 bps)', pct: 29 }],
    volume: 9_000_000,
    tags: ['fed-rates'], cats: ['fed-rates'],
  },
  {
    id: 'fin-7', title: 'Will Gold (GC) hit __ by end of March?', slug: 'gold-hit-march-2026',
    variant: 'list', iconLabel: 'gold', iconBg: '#d97706',
    outcomes: [{ name: '↑ $10,000', pct: 1 }, { name: '↑ $7,000', pct: 1 }],
    volume: 380_000, timeframe: 'Monthly',
    tags: ['gold', 'commodities'], cats: ['commodities', 'monthly'],
  },
  {
    id: 'fin-8', title: 'Fed rate cut by...?', slug: 'fed-rate-cut-by',
    variant: 'list', iconLabel: 'bank', iconBg: '#4b5563',
    outcomes: [{ name: 'March Meeting', pct: 2 }, { name: 'April Meeting', pct: 15 }],
    volume: 9_000_000,
    tags: ['fed-rates'], cats: ['fed-rates'],
  },
  {
    id: 'fin-9', title: 'Which companies added to S&P 500 in Q1 2026?', slug: 'sp500-additions-q1-2026',
    variant: 'list', iconLabel: 'S&P', iconBg: '#ef4444',
    outcomes: [{ name: 'Vertiv Holdings (VRT)', pct: 100 }, { name: 'Affirm Holdings (AFRM)', pct: 3 }],
    volume: 14_000, timeframe: 'Daily',
    tags: ['sp500', 'indices', 'stocks', 'daily-close'], cats: ['indices', 'daily'],
  },
  {
    id: 'fin-10', title: 'What will Gold (GC) hit__ by end of June?', slug: 'gold-hit-june-2026',
    variant: 'list', iconLabel: 'gold', iconBg: '#d97706',
    outcomes: [{ name: '↑ $10,000', pct: 3 }, { name: '↑ $8,500', pct: 3 }],
    volume: 183_000, timeframe: 'Monthly',
    tags: ['gold', 'commodities'], cats: ['commodities', 'monthly'],
  },
  {
    id: 'fin-11', title: 'Will Silver (SI) hit __ by end of March?', slug: 'silver-hit-march-2026',
    variant: 'list', iconLabel: 'Ag', iconBg: '#9ca3af',
    outcomes: [{ name: '↑ $100', pct: 29 }, { name: '↑ $95', pct: 52 }],
    volume: 183_000, timeframe: 'Monthly',
    tags: ['silver', 'commodities'], cats: ['commodities', 'monthly'],
  },
  {
    id: 'fin-12', title: 'Largest Company end of June?', slug: 'largest-company-june-2026',
    variant: 'list', iconLabel: 'chart', iconBg: '#1452f0',
    outcomes: [{ name: 'NVIDIA', pct: 78 }, { name: 'Apple', pct: 13 }],
    volume: 2_000_000, timeframe: 'Monthly',
    tags: ['stocks', 'nvidia'], cats: ['stocks', 'monthly'],
  },
  {
    id: 'fin-13', title: 'What will Crude Oil (CL) settle at in March?', slug: 'crude-oil-settle-march-2026',
    variant: 'list', iconLabel: 'oil', iconBg: '#374151',
    outcomes: [{ name: '<$60', pct: 1 }, { name: '$60-$65', pct: 1 }],
    volume: 50_000, timeframe: 'Monthly',
    tags: ['commodities'], cats: ['commodities', 'monthly'],
  },
  {
    id: 'fin-14', title: 'IPOs before 2027?', slug: 'ipos-before-2027',
    variant: 'list', iconLabel: 'IPO', iconBg: '#f59e0b',
    outcomes: [{ name: 'SpaceX', pct: 90 }, { name: 'Cerebras', pct: 84 }],
    volume: 4_000_000,
    tags: ['ipos'], cats: ['ipos'],
  },
  {
    id: 'fin-15', title: 'S&P 500 (SPX) Opens Up or Down on March 9?', slug: 'sp500-updown-mar9',
    variant: 'gauge', iconLabel: '500', iconBg: '#1452f0', upDown: true,
    outcomes: [{ name: 'Up', pct: 34 }, { name: 'Down', pct: 66 }],
    volume: 10_000, timeframe: 'Daily', isNew: true,
    tags: ['sp500', 'indices', 'updown', 'daily-close'], cats: ['indices', 'daily'],
  },
  {
    id: 'fin-16', title: '2nd largest company end of March?', slug: '2nd-largest-company-march-2026',
    variant: 'list', iconLabel: 'chart', iconBg: '#1452f0',
    outcomes: [{ name: 'Apple', pct: 81 }, { name: 'Alphabet', pct: 16 }],
    volume: 1_000_000, timeframe: 'Monthly',
    tags: ['stocks'], cats: ['stocks', 'monthly'],
  },
  {
    id: 'fin-17', title: 'Will Silver (SI) hit__ by end of June?', slug: 'silver-hit-june-2026',
    variant: 'list', iconLabel: 'Ag', iconBg: '#9ca3af',
    outcomes: [{ name: '↑ $250', pct: 3 }, { name: '↑ $230', pct: 4 }],
    volume: 3_000_000, timeframe: 'Monthly',
    tags: ['silver', 'commodities'], cats: ['commodities', 'monthly'],
  },
  {
    id: 'fin-18', title: 'What will Amazon (AMZN) hit in March 2026?', slug: 'amazon-hit-march-2026',
    variant: 'list', iconLabel: 'A', iconBg: '#f59e0b',
    outcomes: [{ name: '↑ $296', pct: 1 }, { name: '↑ $276', pct: 1 }],
    volume: 47_000, timeframe: 'Monthly',
    tags: ['stocks'], cats: ['stocks', 'monthly'],
  },
  {
    id: 'fin-19', title: 'What will Tesla (TSLA) hit in March 2026?', slug: 'tesla-hit-march-2026',
    variant: 'list', iconLabel: 'T', iconBg: '#ef4444',
    outcomes: [{ name: '↑ $570', pct: 1 }, { name: '↑ $533', pct: 1 }],
    volume: 83_000, timeframe: 'Monthly',
    tags: ['stocks', 'tesla'], cats: ['stocks', 'monthly'],
  },
  {
    id: 'fin-20', title: 'Dow Jones (DJIA) Up or Down on March 9?', slug: 'djia-updown-mar9',
    variant: 'gauge', iconLabel: 'DJI', iconBg: '#22c55e', upDown: true,
    outcomes: [{ name: 'Up', pct: 50 }, { name: 'Down', pct: 50 }],
    volume: 0, timeframe: 'Daily', isNew: true,
    tags: ['indices', 'updown', 'daily-close'], cats: ['indices', 'daily'],
  },
  {
    id: 'fin-21', title: 'Crude Oil (CL) Up or Down on March 9?', slug: 'crude-oil-updown-mar9',
    variant: 'gauge', iconLabel: 'oil', iconBg: '#374151', upDown: true,
    outcomes: [{ name: 'Up', pct: 74 }, { name: 'Down', pct: 26 }],
    volume: 0, timeframe: 'Daily', isNew: true,
    tags: ['commodities', 'updown', 'daily-close'], cats: ['commodities', 'daily'],
  },
  {
    id: 'fin-22', title: 'Google (GOOGL) closes above ___ on March 9?', slug: 'googl-closes-above-mar9',
    variant: 'list', iconLabel: 'G', iconBg: '#4285f4',
    outcomes: [{ name: '$290', pct: 88 }, { name: '$295', pct: 75 }],
    volume: 10_000, timeframe: 'Daily', isNew: true,
    tags: ['stocks', 'daily-close'], cats: ['stocks', 'daily'],
  },
  {
    id: 'fin-23', title: 'S&P 500 (SPX) Up or Down on March 9?', slug: 'sp500-updown-mar9-close',
    variant: 'gauge', iconLabel: '500', iconBg: '#1452f0', upDown: true,
    outcomes: [{ name: 'Up', pct: 39 }, { name: 'Down', pct: 61 }],
    volume: 0, timeframe: 'Daily', isNew: true,
    tags: ['sp500', 'indices', 'updown', 'daily-close'], cats: ['indices', 'daily'],
  },
  {
    id: 'fin-24', title: 'AI bubble burst by...?', slug: 'ai-bubble-burst',
    variant: 'list', iconLabel: 'ai', iconBg: '#7c3aed',
    outcomes: [{ name: 'March 31, 2026', pct: 2 }, { name: 'December 31, 2026', pct: 20 }],
    volume: 2_000_000,
    tags: ['prediction-markets'], cats: ['prediction-markets'],
  },
];

// ── Sub-components ──

function CardSvgIcon({ name }: { name: string }) {
  const s = 16;
  switch (name) {
    case 'chart': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>;
    case 'bank': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>;
    case 'gold': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>;
    case 'oil': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 20a2 2 0 002 2h8a2 2 0 002-2V8H6v12z"/><path d="M6 8l3-6h6l3 6"/><path d="M6 13h12"/></svg>;
    case 'ai': return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01M15 9h.01M9 15c.83.67 1.83 1 3 1s2.17-.33 3-1"/></svg>;
    default: return null;
  }
}

function CardIcon({ label, bg }: { label: string; bg: string }) {
  const svgIcon = CardSvgIcon({ name: label });
  if (svgIcon) {
    return (
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {svgIcon}
      </div>
    );
  }
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: label.length > 3 ? 7 : (label.length > 2 ? 8 : 12),
      fontWeight: 700, color: '#fff', lineHeight: 1,
    }}>
      {label}
    </div>
  );
}

function GaugeCircle({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 50 ? 'var(--yes-green)' : 'var(--no-red)';
  return (
    <div style={{
      width: 60, height: 60, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', display: 'block', lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', display: 'block', lineHeight: 1, marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );
}

function VolumeFooter({ volume, timeframe, isNew }: { volume: number; timeframe?: string; isNew?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
      {isNew && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--yes-green)',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          + NEW
        </span>
      )}
      {volume > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
          {isNew && '·'} {fmtVol(volume)} Vol.
        </span>
      )}
      {timeframe && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="var(--text-muted)" strokeWidth="1" fill="none" />
            <path d="M1 5h10" stroke="var(--text-muted)" strokeWidth="1" />
            <path d="M4 1v2M8 1v2" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" />
          </svg>
          {timeframe}
        </span>
      )}
    </div>
  );
}

function YesNoBtn({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <button
      onClick={(e) => e.preventDefault()}
      className={label === 'Yes' ? 'btn-yes-hover' : 'btn-no-hover'}
      style={{
        padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: 600, color, background: bg,
        lineHeight: '18px',
      }}
    >
      {label}
    </button>
  );
}

function FinanceListCard({ card, onClick }: { card: FinCard; onClick: () => void }) {
  return (
    <div className="finance-card card-hover" onClick={onClick} style={{
      borderRadius: 10, padding: 16, cursor: 'pointer',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header: icon + title */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <CardIcon label={card.iconLabel} bg={card.iconBg} />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, margin: 0 }}>
          {card.title}
        </h3>
      </div>

      {/* Outcome rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
        {card.outcomes.map((o, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
            borderBottom: i < card.outcomes.length - 1 ? '1px solid var(--border-light)' : 'none',
          }}>
            <span style={{
              flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {o.name}
            </span>
            <span style={{
              fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginRight: 6,
            }}>
              {o.pct < 1 ? '<1' : o.pct}%
            </span>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <YesNoBtn label="Yes" color="var(--yes-green)" bg="var(--green-bg)" />
              <YesNoBtn label="No" color="var(--no-red)" bg="var(--red-bg)" />
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <VolumeFooter volume={card.volume} timeframe={card.timeframe} isNew={card.isNew} />
    </div>
  );
}

function FinanceGaugeCard({ card, onClick }: { card: FinCard; onClick: () => void }) {
  const upPct = card.outcomes[0]?.pct ?? 50;
  const gaugeLabel = card.upDown ? 'Up' : 'chance';

  return (
    <div className="finance-card card-hover" onClick={onClick} style={{
      borderRadius: 10, padding: 16, cursor: 'pointer',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header: icon + title + gauge circle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <CardIcon label={card.iconLabel} bg={card.iconBg} />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, margin: 0, flex: 1 }}>
          {card.title}
        </h3>
        <GaugeCircle pct={upPct} label={gaugeLabel} />
      </div>

      {/* Buttons */}
      {card.upDown ? (
        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <button className="btn-yes-hover" style={{
            flex: 1, height: 34, borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: 'var(--yes-green)', background: 'var(--green-bg)',
          }}>
            Up
          </button>
          <button className="btn-no-hover" style={{
            flex: 1, height: 34, borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: 'var(--no-red)', background: 'var(--red-bg)',
          }}>
            Down
          </button>
        </div>
      ) : (
        /* Yes/No split bar for non-updown gauge (MicroStrategy style) */
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 34 }} onClick={(e) => e.stopPropagation()}>
          <button style={{
            flex: upPct, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--yes-green)',
          }}>
            Yes
          </button>
          <button style={{
            flex: 100 - upPct, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--no-red)',
          }}>
            No
          </button>
        </div>
      )}

      {/* Footer */}
      <VolumeFooter volume={card.volume} timeframe={card.timeframe} isNew={card.isNew} />
    </div>
  );
}

// ── Main Component ──

const SORT_OPTS = [
  { key: 'volume_24hr', label: '24hr Volume' },
  { key: 'volume', label: 'Total Volume' },
  { key: 'newest', label: 'Newest' },
  { key: 'competitive', label: 'Competitive' },
];

export default function FinanceView() {
  const router = useRouter();
  const [sidebarActive, setSidebarActive] = useState('all');
  const [filterActive, setFilterActive] = useState('All');
  const [liveData, setLiveData] = useState<FinCard[] | null>(null);
  const [sortBy, setSortBy] = useState('volume');
  const [showSortDrop, setShowSortDrop] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved'>('active');
  const sortLabel = SORT_OPTS.find((o) => o.key === sortBy)?.label ?? 'Total Volume';

  // Fetch from our API route (has CLOB prices, placeholder filtering, volume sync)
  const fetchFinanceData = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket/events?tag=finance&limit=30');
      if (!res.ok) return;
      const markets: Market[] = await res.json();
      if (markets.length > 0) {
        const cards: FinCard[] = markets.slice(0, 24).map((m, i) => {
          const isMulti = m.tokens.length > 2;
          const outcomes: FinOutcome[] = isMulti
            ? m.tokens.slice(0, 2).map(t => ({
                name: t.label || t.outcome,
                pct: Math.round(t.price * 100),
              }))
            : m.tokens.filter(t => t.outcome === 'Yes').map(t => ({
                name: 'Yes',
                pct: Math.round(t.price * 100),
              }));

          return {
            id: `pm-fin-${i}`,
            title: m.question,
            slug: m.slug,
            variant: (isMulti ? 'list' : 'gauge') as 'list' | 'gauge',
            iconLabel: 'chart',
            iconBg: '#1452f0',
            outcomes,
            volume: m.volume || 0,
            upDown: false,
            tags: m.tags?.map(t => t.slug) || [],
            cats: [],
          };
        });
        setLiveData(cards);
      }
    } catch {
      // Silently fall back to dummy data
    }
  }, []);

  useEffect(() => {
    fetchFinanceData();
  }, [fetchFinanceData]);

  const cards = liveData || FINANCE_CARDS;

  // Filtering
  const filtered = (() => {
    let list = cards;

    // Status filter — dummy data is all "active", so resolved shows nothing
    if (statusFilter === 'resolved') {
      list = [];
    }

    // Sidebar filter
    if (sidebarActive !== 'all') {
      list = list.filter((c) => c.cats.includes(sidebarActive));
    }

    // Filter pill
    if (filterActive !== 'All') {
      const tag = FILTER_TO_TAG[filterActive];
      if (tag) {
        list = list.filter((c) => c.tags.includes(tag));
      }
    }

    // Sort
    const sorted = [...list];
    switch (sortBy) {
      case 'volume_24hr': sorted.sort((a, b) => b.volume - a.volume); break;
      case 'volume': sorted.sort((a, b) => b.volume - a.volume); break;
      case 'newest': sorted.reverse(); break;
      case 'competitive': sorted.sort((a, b) => {
        const aClose = Math.min(...a.outcomes.map((o) => Math.abs(o.pct - 50)));
        const bClose = Math.min(...b.outcomes.map((o) => Math.abs(o.pct - 50)));
        return aClose - bClose;
      }); break;
    }
    return sorted;
  })();

  return (
    <div style={{ display: 'flex', gap: 0, paddingTop: 20 }}>
      {/* ── Left Sidebar ── */}
      <aside className="hidden lg:block" style={{ width: 190, flexShrink: 0, paddingTop: 12 }}>
        <nav style={{ position: 'sticky', top: 68, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {SIDEBAR_ITEMS.map((item) => {
            if (item.isDivider) {
              return <div key={item.id} style={{ height: 1, background: 'var(--border-light)', margin: '6px 0', width: '100%' }} />;
            }

            const isActive = sidebarActive === item.id;

            return (
              <button
                key={item.id}
                onClick={() => { setSidebarActive(item.id); setFilterActive('All'); }}
                className="finance-sidebar-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 6,
                  fontSize: 13, fontWeight: 600, border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}><FinSidebarIcon name={item.icon} /></span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count > 0 && (
                  <span style={{
                    fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: 'var(--text-muted)',
                  }}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Finance</h1>
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#fff',
            background: 'var(--brand-blue)', borderRadius: 999,
            padding: '2px 8px', lineHeight: '18px',
          }}>
            203
          </span>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'auto', paddingBottom: 16, scrollbarWidth: 'none' as const }}>
          {FILTER_PILLS.map((pill) => {
            const isActive = filterActive === pill;
            return (
              <button
                key={pill}
                onClick={() => setFilterActive(pill)}
                className="pill-hover"
                style={{
                  whiteSpace: 'nowrap', borderRadius: 999,
                  padding: '5px 12px', fontSize: 13, fontWeight: 500,
                  border: isActive ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isActive ? 'var(--text-primary)' : 'var(--bg-surface)',
                  color: isActive ? 'var(--bg)' : 'var(--text-secondary)',
                }}
              >
                {pill}
              </button>
            );
          })}
        </div>

        {/* Sort + Status filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSortDrop(!showSortDrop)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'transparent', cursor: 'pointer' }}
            >
              {sortLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {showSortDrop && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowSortDrop(false)} />
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, borderRadius: 8, padding: '4px 0', zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 160 }}>
                  {SORT_OPTS.map(o => (
                    <button key={o.key} onClick={() => { setSortBy(o.key); setShowSortDrop(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 13, fontWeight: 500, color: sortBy === o.key ? 'var(--brand-blue)' : 'var(--text-primary)', background: sortBy === o.key ? 'var(--bg-hover)' : 'transparent', border: 'none', cursor: 'pointer' }}>{o.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button onClick={() => setStatusFilter('active')} style={{ padding: '5px 12px', fontSize: 13, fontWeight: 500, background: statusFilter === 'active' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>Active</button>
            <button onClick={() => setStatusFilter('resolved')} style={{ padding: '5px 12px', fontSize: 13, fontWeight: 500, background: statusFilter === 'resolved' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'resolved' ? 'var(--text-primary)' : 'var(--text-secondary)', borderLeft: '1px solid var(--border)', border: 'none', borderLeftWidth: 1, borderLeftStyle: 'solid', borderLeftColor: 'var(--border)', cursor: 'pointer' }}>Resolved</button>
          </div>
        </div>

        {/* Card grid */}
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
            No markets found
          </div>
        ) : (
          <div className="finance-grid">
            {filtered.map((card) =>
              card.variant === 'gauge' ? (
                <FinanceGaugeCard key={card.id} card={card} onClick={() => router.push(`/event/${card.slug}`)} />
              ) : (
                <FinanceListCard key={card.id} card={card} onClick={() => router.push(`/event/${card.slug}`)} />
              )
            )}
          </div>
        )}

        {/* Show more */}
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <button style={{
            borderRadius: 999, padding: '10px 24px', fontSize: 14, fontWeight: 500,
            border: '1px solid var(--border)', color: 'var(--text-primary)',
            background: 'transparent', cursor: 'pointer',
          }}>
            Show more markets
          </button>
        </div>
      </div>
    </div>
  );
}
