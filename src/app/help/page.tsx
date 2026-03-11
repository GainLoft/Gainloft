'use client';

import { useState } from 'react';

const FAQ = [
  { q: 'How do I deposit funds?', a: 'Navigate to your Portfolio page and click the "Deposit" button. You can deposit USDC from your connected wallet. Minimum deposit is $1.00.' },
  { q: 'How do I withdraw?', a: 'Go to your Portfolio page and click "Withdraw". Enter the amount and confirm the transaction. Withdrawals are processed to your connected wallet address.' },
  { q: 'What happens when a market resolves?', a: 'When the outcome is determined, the market resolves automatically. Winning shares pay out $1.00 each, and losing shares expire worthless at $0.00. Funds are credited to your balance instantly.' },
  { q: 'Can I sell my shares before a market resolves?', a: 'Yes! You can sell your shares at any time on the order book. Place a sell order and it will be matched with buyers. You don\'t have to wait for resolution.' },
  { q: 'What are the fees?', a: 'GainLoft currently charges 0% trading fees. Active traders can earn additional fee rebates through our Rewards program.' },
  { q: 'How are market prices determined?', a: 'Prices are determined by supply and demand on the order book (CLOB). The price reflects the market\'s collective probability estimate. For example, a Yes share at $0.65 means the market thinks there\'s a 65% chance of the event happening.' },
  { q: 'What wallets are supported?', a: 'We support MetaMask, Coinbase Wallet, and WalletConnect-compatible wallets. Connect via the "Sign Up" or "Log In" button in the top navigation.' },
  { q: 'How are markets created?', a: 'Markets are created by the GainLoft team and verified community members. Each market has clear resolution criteria and a specified end date.' },
  { q: 'What blockchain does GainLoft use?', a: 'GainLoft operates on Polygon PoS for fast, low-cost transactions. Settlement uses USDC (ERC-20 on Polygon).' },
  { q: 'Is my money safe?', a: 'Funds are held in smart contracts on Polygon. GainLoft uses the Conditional Tokens Framework (by Gnosis) for settlement. We recommend only trading with funds you can afford to lose.' },
];

export default function HelpPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-[800px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <div className="text-center" style={{ marginBottom: '32px' }}>
        <h1 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)' }}>Help Center</h1>
        <p className="text-[14px] mt-2" style={{ color: 'var(--text-secondary)' }}>
          Frequently asked questions and support resources
        </p>
      </div>

      {/* FAQ accordion */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        {FAQ.map((item, i) => (
          <div key={i} style={{ borderBottom: i < FAQ.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className="flex w-full items-center justify-between text-left px-5 py-4"
            >
              <span className="text-[14px] font-medium pr-4" style={{ color: 'var(--text-primary)' }}>{item.q}</span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                className="flex-shrink-0 transition-transform"
                style={{ color: 'var(--text-muted)', transform: openIdx === i ? 'rotate(180deg)' : 'none' }}
              >
                <path strokeLinecap="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {openIdx === i && (
              <div className="px-5 pb-4">
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contact */}
      <div
        className="rounded-[12px] text-center mt-8"
        style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Can&apos;t find what you&apos;re looking for?
        </h3>
        <p className="text-[13px] mt-1 mb-3" style={{ color: 'var(--text-secondary)' }}>
          Reach out to our support team and we&apos;ll get back to you within 24 hours.
        </p>
        <button
          className="rounded-[8px] px-5 py-2 text-[13px] font-semibold text-white"
          style={{ background: 'var(--brand-blue)' }}
        >
          Contact Support
        </button>
      </div>
    </div>
  );
}
