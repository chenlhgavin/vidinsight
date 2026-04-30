import type { z } from 'zod';

export type ProviderKey = 'deepseek' | 'minimax';

export interface ProviderBehavior {
  forceFullTranscriptTopicGeneration: boolean;
  forceSmartModeOnClient: boolean;
}

export interface ProviderGenerateParams<T = unknown> {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryOnTimeout?: boolean;
  zodSchema?: z.ZodType<T>;
  schemaName?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ProviderGenerateResult<T = unknown> {
  text: string;
  parsed?: T;
  modelUsed: string;
  providerName: ProviderKey;
  tokensUsed?: { input?: number; output?: number };
  raw?: unknown;
}

export interface ProviderAdapter {
  name: ProviderKey;
  defaultModel: string;
  generate<T>(p: ProviderGenerateParams<T>): Promise<ProviderGenerateResult<T>>;
}

export class ProviderError extends Error {
  status?: number;
  retryable: boolean;
  providerName: ProviderKey;
  constructor(
    message: string,
    opts: { status?: number; retryable?: boolean; providerName: ProviderKey },
  ) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.providerName = opts.providerName;
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
