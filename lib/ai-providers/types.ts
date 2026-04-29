import type { z } from 'zod';

export type ProviderName = 'minimax';

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
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ProviderGenerateResult<T = unknown> {
  text: string;
  parsed?: T;
  modelUsed: string;
  providerName: ProviderName;
  tokensUsed?: { input?: number; output?: number };
  raw?: unknown;
}

export interface ProviderAdapter {
  name: ProviderName;
  defaultModel: string;
  generate<T>(p: ProviderGenerateParams<T>): Promise<ProviderGenerateResult<T>>;
}

export class ProviderError extends Error {
  status?: number;
  retryable: boolean;
  providerName: ProviderName;
  constructor(
    message: string,
    opts: { status?: number; retryable?: boolean; providerName: ProviderName },
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
