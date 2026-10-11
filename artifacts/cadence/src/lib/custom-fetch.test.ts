import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setAuthTokenGetter,
  setBaseUrl,
  customFetch,
  ApiError,
} from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockJsonResponse(data: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('customFetch & auth token injection', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    setAuthTokenGetter(null);
    setBaseUrl(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
    setBaseUrl(null);
  });

  // TC-CLI-01
  it('sends request without Authorization header when no getter is configured', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    await customFetch('/api/healthz');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has('authorization')).toBe(false);
  });

  // TC-CLI-02
  it('automatically attaches Bearer token when an auth getter is registered', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ id: 1 }));
    setAuthTokenGetter(async () => 'clerk_session_jwt_test');

    const result = await customFetch<{ id: number }>('/api/tasks');

    expect(result).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer clerk_session_jwt_test');
  });

  // TC-CLI-03
  it('preserves explicitly provided Authorization header and does not overwrite it', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true }));
    setAuthTokenGetter(async () => 'token_from_getter');

    await customFetch('/api/tasks', {
      headers: { authorization: 'Bearer explicit_custom_token' },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer explicit_custom_token');
  });

  // TC-CLI-04
  it('does not attach header when getter resolves to null (signed-out visitor)', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ public: true }));
    setAuthTokenGetter(async () => null);

    await customFetch('/api/public');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has('authorization')).toBe(false);
  });

  // TC-CLI-05
  it('handles token getter rejection gracefully by propagating the error', async () => {
    setAuthTokenGetter(async () => {
      throw new Error('Token hydration timeout');
    });

    await expect(customFetch('/api/tasks')).rejects.toThrow('Token hydration timeout');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // TC-CLI-06
  it('dynamically calls token getter on each request to support token rotation', async () => {
    let callCount = 0;
    setAuthTokenGetter(async () => `token_v${++callCount}`);

    fetchMock.mockResolvedValueOnce(mockJsonResponse({ call: 1 }));
    await customFetch('/api/item1');
    const [, init1] = fetchMock.mock.calls[0];
    expect(new Headers(init1.headers).get('authorization')).toBe('Bearer token_v1');

    fetchMock.mockResolvedValueOnce(mockJsonResponse({ call: 2 }));
    await customFetch('/api/item2');
    const [, init2] = fetchMock.mock.calls[1];
    expect(new Headers(init2.headers).get('authorization')).toBe('Bearer token_v2');
  });

  // TC-CLI-07
  it('unregisters token attachment when setAuthTokenGetter(null) is called', async () => {
    setAuthTokenGetter(async () => 'temporary_token');
    setAuthTokenGetter(null);

    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true }));
    await customFetch('/api/tasks');

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  // TC-CLI-08
  it('prepends base URL to relative paths', async () => {
    setBaseUrl('https://api.cadence.internal');
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true }));

    await customFetch('/api/v1/status');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cadence.internal/api/v1/status',
      expect.anything(),
    );
  });

  // TC-CLI-09
  it('throws ApiError on non-2xx responses with response metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ error: 'Unauthorized' }, 401, 'Unauthorized'),
    );

    try {
      await customFetch('/api/tasks');
      expect.fail('customFetch should have thrown on 401');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError<{ error: string }>;
      expect(apiErr.status).toBe(401);
      expect(apiErr.data).toEqual({ error: 'Unauthorized' });
    }
  });

  // TC-CLI-10
  it('retries request once on 401 when token getter is configured and refreshed', async () => {
    let tokenVersion = 1;
    setAuthTokenGetter(async () => `token_v${tokenVersion}`);

    // First call returns 401 expired
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ error: 'jwt expired' }, 401, 'Unauthorized'),
    );
    // Token getter will rotate to v2 on retry
    tokenVersion = 2;
    // Retry call succeeds
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ id: 42 }));

    const res = await customFetch<{ id: number }>('/api/tasks');

    expect(res).toEqual({ id: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchMock.mock.calls[1];
    expect(new Headers(retryInit.headers).get('authorization')).toBe('Bearer token_v2');
  });
});
