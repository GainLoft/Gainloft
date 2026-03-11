'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[600px] px-4 py-20 text-center">
      <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        Something went wrong
      </h2>
      <p className="text-[14px] mb-4" style={{ color: 'var(--text-secondary)' }}>
        {error.message}
      </p>
      <button
        onClick={reset}
        className="rounded-lg px-4 py-2 text-[14px] font-semibold text-white"
        style={{ background: 'var(--brand-blue)' }}
      >
        Try again
      </button>
    </div>
  );
}
