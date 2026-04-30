import { createDeepSeekAdapter } from './deepseek-adapter';
import { createMiniMaxAdapter } from './minimax-adapter';
import {
  getEffectiveProviderKey,
  getProviderFallbackOrder,
  getProviderPriorityOrder,
  normalizeProviderKey,
} from './provider-config';
import {
  ConfigError,
  ProviderError,
  type ProviderAdapter,
  type ProviderGenerateParams,
  type ProviderGenerateResult,
  type ProviderKey,
} from './types';

const providerFactories: Record<ProviderKey, () => ProviderAdapter> = {
  deepseek: createDeepSeekAdapter,
  minimax: createMiniMaxAdapter,
};

const providerEnvGuards: Record<ProviderKey, () => string | undefined> = {
  deepseek: () => process.env.DEEPSEEK_API_KEY,
  minimax: () => process.env.MINIMAX_API_KEY,
};

const providerCache = new Map<ProviderKey, ProviderAdapter>();

function ensureProvider(key: ProviderKey): ProviderAdapter {
  const cached = providerCache.get(key);
  if (cached) return cached;
  const factory = providerFactories[key];
  if (!factory) throw new ConfigError(`No adapter registered for provider '${key}'`);
  const adapter = factory();
  providerCache.set(key, adapter);
  return adapter;
}

export function availableProviders(): ProviderKey[] {
  return getProviderPriorityOrder().filter((key) => {
    try {
      return Boolean(providerEnvGuards[key]());
    } catch {
      return false;
    }
  });
}

export function getProvider(preferred?: string): ProviderAdapter {
  const key = getEffectiveProviderKey(preferred);
  console.log(`[AI Provider] Using provider: ${key}`);
  return ensureProvider(key);
}

function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof ProviderError && !error.retryable) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('service unavailable') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('timeout') ||
    lower.includes('overload') ||
    lower.includes('empty completion')
  );
}

function formatProviderError(error: unknown): string {
  if (error instanceof ProviderError) {
    return [
      `provider=${error.providerName}`,
      `retryable=${error.retryable}`,
      `status=${error.status ?? 'none'}`,
      `name=${error.name}`,
      `message=${JSON.stringify(error.message)}`,
    ].join(' ');
  }
  if (error instanceof Error) {
    return [
      'provider=unknown',
      'retryable=unknown',
      'status=none',
      `name=${error.name}`,
      `message=${JSON.stringify(error.message)}`,
    ].join(' ');
  }
  return [
    'provider=unknown',
    'retryable=unknown',
    'status=none',
    'name=NonError',
    `message=${JSON.stringify(String(error))}`,
  ].join(' ');
}

export async function generateWithFallback<T = unknown>(
  params: ProviderGenerateParams<T> & { provider?: string },
): Promise<ProviderGenerateResult<T>> {
  const { provider, ...rest } = params;
  const explicitKey = normalizeProviderKey(provider);
  const primaryKey = explicitKey ?? getEffectiveProviderKey();
  const primary = ensureProvider(primaryKey);

  try {
    return await primary.generate<T>(rest);
  } catch (err) {
    if (explicitKey) throw err;
    if (!isRetryableError(err)) throw err;

    const available = availableProviders();
    const fallbackKey = getProviderFallbackOrder(primaryKey, available)[0];
    if (!fallbackKey) throw err;

    console.warn(
      `[AI Provider] primary failed; ${formatProviderError(err)} fallback=${fallbackKey}`,
    );
    try {
      const fallback = ensureProvider(fallbackKey);
      return await fallback.generate<T>({ ...rest, model: undefined });
    } catch (fallbackErr) {
      console.error(
        `[AI Provider] fallback failed; ${formatProviderError(fallbackErr)} primary=${primaryKey}`,
      );
      throw err;
    }
  }
}
