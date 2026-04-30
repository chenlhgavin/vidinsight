import type { ProviderBehavior, ProviderKey } from './types';

const PROVIDER_ORDER: ProviderKey[] = ['deepseek', 'minimax'];

const PROVIDER_DEFAULT_MODELS: Record<ProviderKey, string> = {
  deepseek: 'deepseek-v4-flash',
  minimax: 'MiniMax-M2.7-highspeed',
};

const PROVIDER_FAST_MODELS: Record<ProviderKey, string> = {
  deepseek: 'deepseek-v4-flash',
  minimax: 'MiniMax-M2.7-highspeed',
};

const PROVIDER_PRO_MODELS: Record<ProviderKey, string> = {
  deepseek: 'deepseek-v4-flash',
  minimax: 'MiniMax-M2.7-highspeed',
};

const PROVIDER_BEHAVIORS: Record<ProviderKey, ProviderBehavior> = {
  deepseek: {
    forceFullTranscriptTopicGeneration: false,
    forceSmartModeOnClient: true,
  },
  minimax: {
    forceFullTranscriptTopicGeneration: false,
    forceSmartModeOnClient: true,
  },
};

const PROVIDER_ENV_KEYS: Record<ProviderKey, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  minimax: 'MINIMAX_API_KEY',
};

export function normalizeProviderKey(value?: string | null): ProviderKey | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'deepseek' || normalized === 'minimax') {
    return normalized;
  }
  return undefined;
}

export function getConfiguredProviderKey(preferred?: string): ProviderKey | undefined {
  return normalizeProviderKey(
    preferred ?? process.env.AI_PROVIDER ?? process.env.NEXT_PUBLIC_AI_PROVIDER,
  );
}

export function getEffectiveProviderKey(preferred?: string): ProviderKey {
  const configured = getConfiguredProviderKey(preferred);
  if (configured) return configured;

  for (const key of PROVIDER_ORDER) {
    if (process.env[PROVIDER_ENV_KEYS[key]]) {
      return key;
    }
  }

  return 'deepseek';
}

export function getProviderDefaultModel(key: ProviderKey): string {
  return PROVIDER_DEFAULT_MODELS[key];
}

export function getProviderFastModel(key: ProviderKey): string {
  return PROVIDER_FAST_MODELS[key];
}

export function getProviderProModel(key: ProviderKey): string {
  return PROVIDER_PRO_MODELS[key];
}

export function getProviderModelDefaults(preferred?: string): {
  defaultModel: string;
  fastModel: string;
  proModel: string;
} {
  const providerKey = getEffectiveProviderKey(preferred);
  const fastModel = getProviderFastModel(providerKey);
  const defaultModel = fastModel;
  const proModel = fastModel;
  return { defaultModel, fastModel, proModel };
}

export function getProviderBehavior(key: ProviderKey): ProviderBehavior {
  return PROVIDER_BEHAVIORS[key];
}

export function getProviderPriorityOrder(): ProviderKey[] {
  return [...PROVIDER_ORDER];
}

export function getProviderEnvKey(key: ProviderKey): string {
  return PROVIDER_ENV_KEYS[key];
}

export function getProviderFallbackOrder(
  currentKey?: ProviderKey,
  availableKeys?: ProviderKey[],
): ProviderKey[] {
  const available = availableKeys ? new Set(availableKeys) : undefined;
  return PROVIDER_ORDER.filter((key) => {
    if (key === currentKey) return false;
    return available ? available.has(key) : true;
  });
}
