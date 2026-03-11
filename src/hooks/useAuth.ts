'use client';

import { useState, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { api } from '@/lib/api';

interface AuthState {
  token: string | null;
  userId: string | null;
}

export function useAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [auth, setAuth] = useState<AuthState>({ token: null, userId: null });

  const login = useCallback(async () => {
    if (!address) throw new Error('Wallet not connected');

    // 1. Get nonce
    const { message } = await api.get<{ nonce: string; message: string }>(
      `/api/auth/nonce/${address}`
    );

    // 2. Sign
    const signature = await signMessageAsync({ message });

    // 3. Verify
    const result = await api.post<{ user: { id: string }; token: string }>(
      '/api/auth/verify',
      { address, signature }
    );

    setAuth({ token: result.token, userId: result.user.id });
    return result;
  }, [address, signMessageAsync]);

  const authHeaders: Record<string, string> = auth.token
    ? { Authorization: `Bearer ${auth.token}` }
    : {};

  return { login, auth, authHeaders, isAuthenticated: !!auth.token };
}
