'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const CATEGORIES = ['Politics', 'Crypto', 'Sports', 'Finance', 'Tech', 'Culture', 'Economy', 'Geopolitics', 'Climate', 'Elections', 'ASEAN'];

export default function CreateMarketPage() {
  const router = useRouter();
  const { isAuthenticated, login, authHeaders } = useAuth();

  const [form, setForm] = useState({
    question: '',
    description: '',
    category: 'ASEAN',
    slug: '',
    resolution_source: '',
    end_date: '',
    image_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'question' ? { slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } : {}),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!isAuthenticated) {
      try {
        await login();
      } catch {
        setError('Authentication failed');
        return;
      }
    }

    setLoading(true);
    try {
      const conditionId = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      const questionId = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      const yesTokenId = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .reduce((acc, b) => acc + BigInt(b), BigInt(0)).toString();
      const noTokenId = (BigInt(yesTokenId) + BigInt(1)).toString();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/markets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            condition_id: conditionId,
            question_id: questionId,
            question: form.question,
            description: form.description || null,
            category: form.category,
            slug: form.slug,
            image_url: form.image_url || null,
            resolution_source: form.resolution_source || null,
            end_date_iso: form.end_date ? new Date(form.end_date).toISOString() : null,
            yes_token_id: yesTokenId,
            no_token_id: noTokenId,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to create market');
      }

      const market = await res.json();
      router.push(`/event/${market.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <h1 className="text-[24px] font-bold" style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>Create Market</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label className="mb-1 block text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Question *</label>
          <input
            name="question" value={form.question} onChange={handleChange}
            placeholder="Will X happen by Y date?"
            className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Slug</label>
          <input
            name="slug" value={form.slug} onChange={handleChange}
            placeholder="auto-generated-from-question"
            className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Description</label>
          <textarea
            name="description" value={form.description} onChange={handleChange}
            placeholder="Detailed resolution criteria..."
            rows={3}
            className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Category</label>
            <select
              name="category" value={form.category} onChange={handleChange}
              className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
              style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>End Date</label>
            <input
              type="date" name="end_date" value={form.end_date} onChange={handleChange}
              className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
              style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Resolution Source</label>
          <input
            name="resolution_source" value={form.resolution_source} onChange={handleChange}
            placeholder="e.g., Official government announcement"
            className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Image URL</label>
          <input
            name="image_url" value={form.image_url} onChange={handleChange}
            placeholder="https://..."
            className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
        </div>

        {error && <p className="text-[12px]" style={{ color: 'var(--no-red)' }}>{error}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-[8px] py-3 text-[14px] font-semibold text-white disabled:opacity-40 transition-colors"
          style={{ background: 'var(--brand-blue)' }}
        >
          {loading ? 'Creating...' : 'Create Market'}
        </button>
      </form>
    </div>
  );
}
