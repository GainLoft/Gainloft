'use client';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[800px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <h1 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Terms of Use</h1>
      <p className="text-[13px]" style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
        Last updated: March 1, 2026
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {[
          {
            title: '1. Acceptance of Terms',
            body: 'By accessing or using GainLoft ("the Platform"), you agree to be bound by these Terms of Use. If you do not agree to these terms, you must not use the Platform. GainLoft reserves the right to modify these terms at any time, and continued use constitutes acceptance of any changes.',
          },
          {
            title: '2. Eligibility',
            body: 'You must be at least 18 years old and legally permitted to use prediction market platforms in your jurisdiction. It is your responsibility to ensure that your use of GainLoft complies with all applicable local, state, national, and international laws and regulations.',
          },
          {
            title: '3. Account & Wallet',
            body: 'Access to the Platform requires connecting a compatible cryptocurrency wallet. You are solely responsible for maintaining the security of your wallet and private keys. GainLoft does not store or have access to your private keys.',
          },
          {
            title: '4. Trading & Markets',
            body: 'GainLoft provides a platform for trading prediction market shares. Prices are determined by market participants through the order book. All trades are final once executed. GainLoft does not provide financial advice. Trading involves risk and you may lose some or all of your investment.',
          },
          {
            title: '5. Market Resolution',
            body: 'Markets resolve based on predefined criteria specified in each market\'s resolution rules. Resolution is determined by the UMA Optimistic Oracle or by designated resolution sources. GainLoft makes good-faith efforts to ensure accurate resolution but is not liable for disputes.',
          },
          {
            title: '6. Fees',
            body: 'GainLoft may charge trading fees, which are disclosed before each transaction. Fee schedules may change with notice. Blockchain gas fees are separate and determined by the Polygon network.',
          },
          {
            title: '7. Prohibited Activities',
            body: 'You agree not to: manipulate market prices, engage in wash trading, use automated bots without authorization, create markets for illegal activities, or use the Platform for money laundering or other illicit purposes.',
          },
          {
            title: '8. Limitation of Liability',
            body: 'GainLoft is provided "as is" without warranties of any kind. To the maximum extent permitted by law, GainLoft shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform.',
          },
          {
            title: '9. Privacy',
            body: 'GainLoft collects minimal personal data. Wallet addresses and transaction data are publicly visible on the blockchain. We do not sell personal data to third parties. Analytics data may be collected to improve the platform.',
          },
          {
            title: '10. Governing Law',
            body: 'These Terms shall be governed by and construed in accordance with the laws of Singapore. Any disputes shall be resolved through binding arbitration in Singapore.',
          },
        ].map((section) => (
          <div key={section.title}>
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
              {section.title}
            </h2>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {section.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
