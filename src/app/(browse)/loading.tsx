export default function BrowseLoading() {
  return (
    <div style={{ paddingTop: 24, paddingBottom: 24, minHeight: '60vh' }}>
      {/* Minimal placeholder — layout (header + sidebar) renders instantly via streaming */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="animate-pulse rounded-[10px]" style={{ background: 'var(--bg-surface)', height: 32, width: 200 }} />
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 180 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
