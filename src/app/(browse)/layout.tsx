import LeftSidebar from '@/components/layout/LeftSidebar';

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 browse-layout" style={{ display: 'flex' }}>
      <LeftSidebar />
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 24 }} className="browse-content">
        {children}
      </div>
    </div>
  );
}
