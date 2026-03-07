import { describe, expect, it } from 'vitest'

import { getApiProxyTarget } from './apiProxyTarget.js'

describe('getApiProxyTarget', () => {
  it('uses the container backend URL when provided', () => {
    expect(getApiProxyTarget({ VITE_API_BASE_URL: 'http://backend:8001' })).toBe('http://backend:8001')
  })

  it('falls back to localhost for local development', () => {
    expect(getApiProxyTarget({})).toBe('http://127.0.0.1:8001')
  })
})
