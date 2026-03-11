'use client';
import CategoryGrid from '@/components/market/CategoryGrid';

export default function GamesPage() {
  return (
    <div style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 className="text-[28px] font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Games</h1>
      <CategoryGrid category="Games" />
    </div>
  );
}
