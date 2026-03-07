const DEFAULT_API_PROXY_TARGET = 'http://127.0.0.1:8001'

export function getApiProxyTarget(env = {}) {
  return env.VITE_API_BASE_URL || DEFAULT_API_PROXY_TARGET
}

export { DEFAULT_API_PROXY_TARGET }
