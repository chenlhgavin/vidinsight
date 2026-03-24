import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listModels, UnauthorizedError, subscribeToUnauthorized } from './api';

describe('api unauthorized handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('notifies listeners and throws UnauthorizedError on 401', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    const originalHref = window.location.href;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { code: 'unauthorized', message: 'Authentication required' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(listModels()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(originalHref);

    unsubscribe();
  });
});
