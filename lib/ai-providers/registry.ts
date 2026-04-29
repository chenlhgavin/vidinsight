import { ConfigError, type ProviderAdapter, type ProviderName } from './types';
import { minimaxAdapter } from './minimax-adapter';

const ADAPTERS: Record<ProviderName, ProviderAdapter> = {
  minimax: minimaxAdapter,
};

export function getProvider(name: ProviderName): ProviderAdapter {
  const adapter = ADAPTERS[name];
  if (!adapter) throw new ConfigError(`No adapter registered for provider '${name}'`);
  return adapter;
}
