'use client';

import { useState, useEffect, useRef } from 'react';
import { Market } from '@/lib/types';

interface Props {
  markets: Market[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function OutcomeDropdown({ markets, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = markets.find((m) => m.id === selectedId) ?? markets[0];
  const selectedLabel = selected?.group_item_title || selected?.question || '';
  const selectedPct = Math.round((selected?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0) * 100);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
          cursor: 'pointer', transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', minWidth: 0, flex: 1 }}>
          {selected?.image_url ? (
            <img src={selected.image_url} alt="" loading="lazy" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: 'var(--bg-surface)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
              {selectedLabel.charAt(0)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, overflow: 'hidden', minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Outcome
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {selectedLabel}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--yes-green)', fontVariantNumeric: 'tabular-nums' }}>
            {selectedPct}%
          </span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M4 6l4 4 4-4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          borderRadius: 10, overflow: 'hidden', zIndex: 50,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          {markets.map((m, i) => {
            const label = m.group_item_title || m.question;
            const pct = Math.round((m.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0) * 100);
            const isActive = m.id === selectedId;
            return (
              <button
                key={m.id}
                onClick={() => { onSelect(m.id); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  borderBottom: i < markets.length - 1 ? '1px solid var(--border-light)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {m.image_url ? (
                  <img src={m.image_url} alt="" loading="lazy" style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'contain', background: 'var(--bg-surface)', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 24, height: 24, borderRadius: 5, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {label.charAt(0)}
                  </div>
                )}
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: pct > 0 ? 'var(--yes-green)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
