'use client';

const ACCURACY_BINS = [
  { range: '0-10%', predicted: 5, actual: 4, count: 120 },
  { range: '10-20%', predicted: 15, actual: 13, count: 98 },
  { range: '20-30%', predicted: 25, actual: 23, count: 145 },
  { range: '30-40%', predicted: 35, actual: 36, count: 167 },
  { range: '40-50%', predicted: 45, actual: 44, count: 203 },
  { range: '50-60%', predicted: 55, actual: 57, count: 189 },
  { range: '60-70%', predicted: 65, actual: 63, count: 176 },
  { range: '70-80%', predicted: 75, actual: 76, count: 154 },
  { range: '80-90%', predicted: 85, actual: 87, count: 112 },
  { range: '90-100%', predicted: 95, actual: 96, count: 85 },
];

const STATS = [
  { label: 'Total Markets Resolved', value: '1,449' },
  { label: 'Brier Score', value: '0.142' },
  { label: 'Calibration Error', value: '2.1%' },
  { label: 'Average Participation', value: '847 traders' },
];

export default function AccuracyPage() {
  const maxCount = Math.max(...ACCURACY_BINS.map((b) => b.count));

  return (
    <div className="mx-auto max-w-[900px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <div className="text-center" style={{ marginBottom: '32px' }}>
        <h1 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)' }}>Accuracy</h1>
        <p className="text-[14px] mt-2 mx-auto" style={{ color: 'var(--text-secondary)', maxWidth: '520px' }}>
          How well do GainLoft market prices predict actual outcomes?
          Our calibration chart shows that prediction markets are remarkably accurate.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '32px' }}>
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[10px] text-center"
            style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Calibration chart */}
      <div
        className="rounded-[12px]"
        style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '24px' }}
      >
        <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>
          Calibration Chart
        </h2>
        <p className="text-[12px] mb-4" style={{ color: 'var(--text-muted)' }}>
          Perfect calibration means events priced at X% happen X% of the time. The closer to the diagonal, the better.
        </p>

        {/* SVG Chart */}
        <svg viewBox="0 0 400 400" className="w-full max-w-[400px] mx-auto h-auto" style={{ marginBottom: '16px' }}>
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = 360 - frac * 320;
            const x = 40 + frac * 320;
            return (
              <g key={frac}>
                <line x1={40} y1={y} x2={360} y2={y} stroke="var(--border)" strokeWidth={1} />
                <line x1={x} y1={40} x2={x} y2={360} stroke="var(--border)" strokeWidth={1} />
                <text x={32} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize={9} fontFamily="system-ui">
                  {Math.round(frac * 100)}%
                </text>
                <text x={x} y={376} textAnchor="middle" fill="var(--text-muted)" fontSize={9} fontFamily="system-ui">
                  {Math.round(frac * 100)}%
                </text>
              </g>
            );
          })}

          {/* Perfect calibration line */}
          <line x1={40} y1={360} x2={360} y2={40} stroke="var(--text-icon)" strokeWidth={1} strokeDasharray="4 4" />

          {/* Actual data points */}
          {ACCURACY_BINS.map((bin) => {
            const x = 40 + (bin.predicted / 100) * 320;
            const y = 360 - (bin.actual / 100) * 320;
            return (
              <circle key={bin.range} cx={x} cy={y} r={5} fill="var(--brand-blue)" />
            );
          })}

          {/* Line connecting points */}
          <polyline
            points={ACCURACY_BINS.map((bin) => {
              const x = 40 + (bin.predicted / 100) * 320;
              const y = 360 - (bin.actual / 100) * 320;
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="var(--brand-blue)"
            strokeWidth={2}
          />

          {/* Axis labels */}
          <text x={200} y={396} textAnchor="middle" fill="var(--text-secondary)" fontSize={10} fontFamily="system-ui">
            Market Price (Predicted Probability)
          </text>
          <text x={12} y={200} textAnchor="middle" fill="var(--text-secondary)" fontSize={10} fontFamily="system-ui" transform="rotate(-90 12 200)">
            Actual Frequency
          </text>
        </svg>
      </div>

      {/* Bin table */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Breakdown by Price Range</h2>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Price Range</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Avg Predicted</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Actual %</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Markets</th>
              <th className="px-4 py-2 font-medium" style={{ color: 'var(--text-muted)', width: '120px' }}></th>
            </tr>
          </thead>
          <tbody>
            {ACCURACY_BINS.map((bin, i) => (
              <tr key={bin.range} style={{ borderBottom: i < ACCURACY_BINS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{bin.range}</td>
                <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text-secondary)' }}>{bin.predicted}%</td>
                <td className="px-4 py-2.5 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{bin.actual}%</td>
                <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>{bin.count}</td>
                <td className="px-4 py-2.5">
                  <div className="rounded-full overflow-hidden" style={{ height: '4px', background: 'var(--bg-surface)' }}>
                    <div
                      className="rounded-full"
                      style={{ height: '100%', width: `${(bin.count / maxCount) * 100}%`, background: 'var(--brand-blue)' }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
