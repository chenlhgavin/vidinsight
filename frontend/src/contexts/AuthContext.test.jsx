import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { subscribeToUnauthorized } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    subscribeToUnauthorized: vi.fn(),
  };
});

function AuthStateProbe() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? user.username : 'anonymous'}</div>;
}

describe('AuthContext', () => {
  let unauthorizedHandler;

  beforeEach(() => {
    unauthorizedHandler = null;
    vi.clearAllMocks();
    document.cookie = 'csrf_token=test-csrf';
    subscribeToUnauthorized.mockImplementation((listener) => {
      unauthorizedHandler = listener;
      return () => {
        unauthorizedHandler = null;
      };
    });
  });

  it('keeps the user when unauthorized requests revalidate successfully', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authenticated: true, username: 'admin' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authenticated: true, username: 'admin' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('admin')).toBeInTheDocument();

    unauthorizedHandler();
    unauthorizedHandler();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('clears the user when revalidation confirms the session is gone', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authenticated: true, username: 'admin' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'Unauthorized' } }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('admin')).toBeInTheDocument();

    unauthorizedHandler();
    await waitFor(() => {
      expect(screen.getByText('anonymous')).toBeInTheDocument();
    });
  });
});
