import { ConfigError, type ProviderName } from './types';

export interface ProviderBehavior {
  forceSmartModeOnClient: boolean;
  supportsStructuredOutput: boolean;
  retryable: number[];
  maxRetries: number;
  backoffMs: number[];
}

export const BEHAVIOR: Record<ProviderName, ProviderBehavior> = {
  minimax: {
    forceSmartModeOnClient: true,
    supportsStructuredOutput: true,
    retryable: [408, 429, 500, 502, 503, 504],
    maxRetries: 2,
    backoffMs: [500, 2000],
  },
};

export function resolveProviderKey(): ProviderName {
  const raw = (process.env.AI_PROVIDER || 'minimax').toLowerCase();
  if (raw === 'minimax') return 'minimax';
  throw new ConfigError(`Unsupported AI_PROVIDER='${raw}'. Only 'minimax' is supported.`);
}

export function defaultModelFor(name: ProviderName): string {
  if (name === 'minimax') return process.env.AI_DEFAULT_MODEL || 'MiniMax-M2.7';
  throw new ConfigError(`Unknown provider ${name}`);
}
