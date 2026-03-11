'use client';

import Link from 'next/link';

const SECTIONS = [
  {
    title: 'Getting Started',
    items: [
      { title: 'What is GainLoft?', desc: 'GainLoft is a decentralized prediction market platform where users trade on the outcomes of real-world events. Each market has two outcomes (Yes/No), and shares are priced between $0.01 and $0.99.' },
      { title: 'How do prediction markets work?', desc: 'Prediction markets allow you to buy shares that pay out $1.00 if a specific event occurs. The share price reflects the market\'s collective probability estimate of the event happening.' },
      { title: 'Creating an account', desc: 'Connect your wallet (MetaMask, Coinbase, or WalletConnect) to get started. No email or password required. Your wallet address is your identity.' },
    ],
  },
  {
    title: 'Trading',
    items: [
      { title: 'Placing orders', desc: 'Select a market, choose your outcome (Yes or No), enter your amount, and confirm the trade. You can place market orders (instant fill) or limit orders (specify your price).' },
      { title: 'Order types', desc: 'Market orders execute immediately at the best available price. Limit orders let you set a specific price and wait for a match. All orders use the CLOB (Central Limit Order Book).' },
      { title: 'Settlement', desc: 'When a market resolves, winning shares are worth $1.00 each. Losing shares expire worthless at $0.00. Settlement is automatic and funds are credited to your balance.' },
    ],
  },
  {
    title: 'Fees & Rewards',
    items: [
      { title: 'Trading fees', desc: 'GainLoft currently charges 0% maker and 0% taker fees. This may change in the future.' },
      { title: 'Rewards program', desc: 'Earn fee rebates by trading. Higher monthly volume unlocks better tiers with increasing rebate rates up to 2.5%.' },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[800px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <h1 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Documentation</h1>
      <p className="text-[14px]" style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Everything you need to know about trading on GainLoft.
      </p>

      {SECTIONS.map((section) => (
        <div key={section.title} style={{ marginBottom: '32px' }}>
          <h2 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>
            {section.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {section.items.map((item) => (
              <div
                key={item.title}
                className="rounded-[10px]"
                style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {item.title}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div
        className="rounded-[12px] text-center"
        style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
          Still have questions?
        </p>
        <Link
          href="/help"
          className="inline-block mt-3 rounded-[8px] px-5 py-2 text-[13px] font-semibold text-white"
          style={{ background: 'var(--brand-blue)' }}
        >
          Visit Help Center
        </Link>
      </div>
    </div>
  );
}
