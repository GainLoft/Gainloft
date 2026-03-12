export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px] browse-layout">
      <div style={{ flex: 1, minWidth: 0 }} className="browse-content">
        {children}
      </div>
    </div>
  );
}
