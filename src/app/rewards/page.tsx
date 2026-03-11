'use client';

import { useAccount } from 'wagmi';
import Link from 'next/link';

const REWARD_TIERS = [
  { name: 'Bronze', minVol: '$0', maxVol: '$10K', rebate: '0.5%', color: '#CD7F32' },
  { name: 'Silver', minVol: '$10K', maxVol: '$100K', rebate: '1.0%', color: '#C0C0C0' },
  { name: 'Gold', minVol: '$100K', maxVol: '$500K', rebate: '1.5%', color: '#FFD700' },
  { name: 'Platinum', minVol: '$500K', maxVol: '$1M', rebate: '2.0%', color: '#E5E4E2' },
  { name: 'Diamond', minVol: '$1M+', maxVol: '', rebate: '2.5%', color: '#B9F2FF' },
];

const HOW_IT_WORKS = [
  { icon: '1', title: 'Trade on any market', desc: 'Every trade you make counts toward your monthly volume tier.' },
  { icon: '2', title: 'Climb the tiers', desc: 'Higher monthly volume unlocks better fee rebates and exclusive perks.' },
  { icon: '3', title: 'Earn rebates', desc: 'Rebates are calculated daily and credited to your account balance automatically.' },
];

export default function RewardsPage() {
  const { isConnected } = useAccount();

  return (
    <div className="mx-auto max-w-[900px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      {/* Hero */}
      <div className="text-center" style={{ marginBottom: '40px' }}>
        <h1 className="text-[32px] font-bold" style={{ color: 'var(--text-primary)' }}>Rewards</h1>
        <p className="text-[15px] mt-2 mx-auto" style={{ color: 'var(--text-secondary)', maxWidth: '480px' }}>
          Earn fee rebates and exclusive perks by trading on GainLoft. The more you trade, the more you earn.
        </p>
      </div>

      {/* User status card */}
      <div
        className="rounded-[16px] text-center"
        style={{ padding: '32px 24px', background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '32px' }}
      >
        {isConnected ? (
          <>
            <div className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>Your Current Tier</div>
            <div className="text-[28px] font-bold mt-1" style={{ color: '#CD7F32' }}>Bronze</div>
            <div className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              $0.00 volume this month &middot; 0.5% rebate
            </div>
            <div
              className="mx-auto mt-4 rounded-full overflow-hidden"
              style={{ width: '300px', height: '6px', background: 'var(--bg-surface)' }}
            >
              <div style={{ width: '0%', height: '100%', borderRadius: '3px', background: 'var(--brand-blue)' }} />
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              $10,000 to Silver tier
            </div>
          </>
        ) : (
          <>
            <div className="text-[15px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              Connect your wallet to start earning rewards
            </div>
            <Link
              href="/markets"
              className="inline-block mt-4 rounded-[8px] px-6 py-2.5 text-[14px] font-semibold text-white transition-colors"
              style={{ background: 'var(--brand-blue)' }}
            >
              Start Trading
            </Link>
          </>
        )}
      </div>

      {/* Tier table */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', marginBottom: '32px' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Reward Tiers</h2>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Tier</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Monthly Volume</th>
              <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Fee Rebate</th>
            </tr>
          </thead>
          <tbody>
            {REWARD_TIERS.map((tier, i) => (
              <tr key={tier.name} style={{ borderBottom: i < REWARD_TIERS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ background: tier.color }}
                    />
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{tier.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                  {tier.maxVol ? `${tier.minVol} - ${tier.maxVol}` : tier.minVol}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--yes-green)' }}>
                  {tier.rebate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* How it works */}
      <h2 className="text-[18px] font-bold mb-4" style={{ color: 'var(--text-primary)' }}>How It Works</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {HOW_IT_WORKS.map((step) => (
          <div
            key={step.icon}
            className="rounded-[12px]"
            style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold text-white mb-3"
              style={{ background: 'var(--brand-blue)' }}
            >
              {step.icon}
            </div>
            <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
