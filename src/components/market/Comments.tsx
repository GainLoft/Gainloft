'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface Comment {
  id: string;
  market_id: string;
  user_id: string;
  body: string;
  address: string;
  username: string | null;
  created_at: string;
}

interface Props {
  marketId: string;
}

export default function Comments({ marketId }: Props) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { isAuthenticated, login, authHeaders } = useAuth();

  const swrKey = `/api/comments?market_id=${marketId}`;
  const { data } = useSWR<{ comments: Comment[] }>(swrKey, fetcher, { refreshInterval: 10000 });

  const comments = data?.comments || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    if (!isAuthenticated) {
      try {
        await login();
      } catch {
        return;
      }
    }

    setSubmitting(true);
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ market_id: marketId, body: body.trim() }),
        }
      );
      setBody('');
      mutate(swrKey);
    } catch {
      // handle error
    } finally {
      setSubmitting(false);
    }
  }

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2" style={{ marginBottom: '16px' }}>
        <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Comments</h3>
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{comments.length}</span>
      </div>

      {/* Comment input */}
      <form onSubmit={handleSubmit} className="flex gap-2" style={{ marginBottom: '20px' }}>
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
        >
          ?
        </div>
        <div className="flex-1 relative">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment..."
            maxLength={2000}
            className="w-full rounded-[8px] px-3 py-2 text-[13px] focus:outline-none"
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        {body.trim() && (
          <button
            type="submit"
            disabled={submitting}
            className="rounded-[8px] px-4 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: 'var(--brand-blue)' }}
          >
            Post
          </button>
        )}
      </form>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="py-8 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No comments yet. Be the first to comment!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
              >
                {(c.username || c.address.slice(2, 4)).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {c.username || `${c.address.slice(0, 6)}...${c.address.slice(-4)}`}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {c.body}
                </p>
                {/* Action row */}
                <div className="flex items-center gap-4" style={{ marginTop: '6px' }}>
                  <button className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Reply
                  </button>
                  <div className="flex items-center gap-1">
                    <button style={{ color: 'var(--text-muted)' }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2l3 4H3l3-4z" fill="currentColor"/>
                      </svg>
                    </button>
                    <button style={{ color: 'var(--text-muted)' }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 10L3 6h6l-3 4z" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
