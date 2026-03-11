'use client';

import Link from 'next/link';

const PRODUCT_LINKS = [
  { label: 'Markets', href: '/markets' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Activity', href: '/activity' },
  { label: 'Rewards', href: '/rewards' },
  { label: 'APIs', href: '/apis' },
];

const RESOURCE_LINKS = [
  { label: 'Documentation', href: '/docs' },
  { label: 'Help Center', href: '/help' },
  { label: 'Accuracy', href: '/accuracy' },
  { label: 'Blog', href: '/docs' },
];

const LEGAL_LINKS = [
  { label: 'Terms of Use', href: '/terms' },
  { label: 'Privacy Policy', href: '/terms' },
  { label: 'Cookie Policy', href: '/terms' },
  { label: 'Disclaimers', href: '/terms' },
];

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div className="mx-auto max-w-[1400px] px-4" style={{ paddingTop: '40px', paddingBottom: '40px' }}>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                <path d="M14 0L26 7V21L14 28L2 21V7L14 0Z" fill="var(--brand-blue)" />
                <path d="M14 6L20 9.5V16.5L14 20L8 16.5V9.5L14 6Z" fill="var(--bg)" />
              </svg>
              <span className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>GainLoft</span>
            </Link>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              The largest prediction market platform. Trade on the outcome of real-world events.
            </p>
            <div className="flex items-center gap-3 mt-4">
              {/* Twitter / X */}
              <span className="flex h-8 w-8 items-center justify-center rounded-full cursor-pointer" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              </span>
              {/* Discord */}
              <span className="flex h-8 w-8 items-center justify-center rounded-full cursor-pointer" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" /></svg>
              </span>
              {/* Telegram */}
              <span className="flex h-8 w-8 items-center justify-center rounded-full cursor-pointer" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
              </span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>Product</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {PRODUCT_LINKS.map((link) => (
                <Link key={link.label} href={link.href} className="text-[13px] transition-colors" style={{ color: 'var(--text-muted)' }}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>Resources</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {RESOURCE_LINKS.map((link) => (
                <Link key={link.label} href={link.href} className="text-[13px] transition-colors" style={{ color: 'var(--text-muted)' }}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>Legal</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {LEGAL_LINKS.map((link) => (
                <Link key={link.label} href={link.href} className="text-[13px] transition-colors" style={{ color: 'var(--text-muted)' }}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 flex items-center justify-between text-[11px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <span>&copy; {new Date().getFullYear()} GainLoft. All rights reserved.</span>
          <span>Built on Polygon</span>
        </div>
      </div>
    </footer>
  );
}
