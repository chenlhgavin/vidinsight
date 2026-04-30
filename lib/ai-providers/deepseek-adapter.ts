import { getProviderDefaultModel } from './provider-config';
import {
  ProviderError,
  type ProviderAdapter,
  type ProviderGenerateParams,
  type ProviderGenerateResult,
} from './types';

const DEEPSEEK_BASE = process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com/v1';
const ENDPOINT = `${DEEPSEEK_BASE}/chat/completions`;

const MODEL_CASCADE = ['deepseek-v4-flash'] as const;
const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];
const MAX_RETRIES = 1;
const BACKOFF_MS = [500, 1500];
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const MIN_OUTPUT_TOKENS = 8192;

interface OpenAIChatResponse {
  id?: string;
  choices?: {
    message?: { content?: string; role?: string };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUS.includes(status);
}

function buildModelList(requested?: string): string[] {
  if (!requested) return [...MODEL_CASCADE];
  const rest = MODEL_CASCADE.filter((m) => m !== requested);
  return [requested, ...rest];
}

async function callOnce<T>(
  params: ProviderGenerateParams<T>,
  model: string,
): Promise<ProviderGenerateResult<T>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ProviderError('DEEPSEEK_API_KEY missing', {
      providerName: 'deepseek',
      retryable: false,
    });
  }

  const messages: { role: string; content: string }[] = [];
  if (params.systemPrompt) messages.push({ role: 'system', content: params.systemPrompt });
  messages.push({ role: 'user', content: params.prompt });

  const requestedMaxTokens = params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const maxTokens = Math.max(requestedMaxTokens, MIN_OUTPUT_TOKENS);

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: params.temperature ?? 0.4,
    top_p: params.topP ?? 0.9,
    max_tokens: maxTokens,
    stream: false,
  };

  if (params.zodSchema) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs;
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  if (params.signal) {
    if (params.signal.aborted) {
      controller.abort();
    } else {
      params.signal.addEventListener('abort', forwardAbort, { once: true });
    }
  }
  const timeoutId = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    params.signal?.removeEventListener('abort', forwardAbort);
  };

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    cleanup();
    const aborted = (err as Error).name === 'AbortError';
    const cancelledByCaller = Boolean(params.signal?.aborted) && !timedOut;
    const message = cancelledByCaller
      ? 'request aborted'
      : timedOut
        ? `request timed out after ${timeoutMs}ms`
        : `network error: ${err}`;
    throw new ProviderError(message, {
      providerName: 'deepseek',
      retryable: aborted ? Boolean(timedOut && params.retryOnTimeout) : true,
    });
  }

  cleanup();

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ProviderError(`deepseek ${resp.status}: ${text.slice(0, 200)}`, {
      status: resp.status,
      retryable: isRetryable(resp.status),
      providerName: 'deepseek',
    });
  }

  let data: OpenAIChatResponse;
  try {
    data = (await resp.json()) as OpenAIChatResponse;
  } catch (err) {
    throw new ProviderError(`invalid json: ${err}`, {
      providerName: 'deepseek',
      retryable: true,
    });
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) {
    const finishReason = data.choices?.[0]?.finish_reason ?? 'unknown';
    const usage = data.usage
      ? `, usage=${JSON.stringify({
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
          requested_max_tokens: maxTokens,
        })}`
      : `, requested_max_tokens=${maxTokens}`;
    throw new ProviderError(`empty completion (finish_reason=${finishReason}${usage})`, {
      providerName: 'deepseek',
      retryable: true,
    });
  }

  let parsed: T | undefined;
  if (params.zodSchema) {
    let json: unknown;
    try {
      json = extractJson(text);
    } catch (err) {
      const preview = text.replace(/\s+/g, ' ').slice(0, 300);
      throw new ProviderError(`no JSON in completion: ${(err as Error).message}; preview=${JSON.stringify(preview)}`, {
        providerName: 'deepseek',
        retryable: true,
      });
    }
    const result = params.zodSchema.safeParse(json);
    if (result.success) parsed = result.data;
    else {
      throw new ProviderError(`schema validation failed: ${result.error.message}`, {
        providerName: 'deepseek',
        retryable: false,
      });
    }
  }

  return {
    text,
    parsed,
    modelUsed: data.model ?? model,
    providerName: 'deepseek',
    tokensUsed: {
      input: data.usage?.prompt_tokens,
      output: data.usage?.completion_tokens,
    },
    raw: data,
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      // fall through
    }
  }
  const objStart = trimmed.indexOf('{');
  const objEnd = trimmed.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    try {
      return JSON.parse(trimmed.slice(objStart, objEnd + 1));
    } catch {
      // fall through
    }
  }
  throw new Error('no JSON in completion');
}

async function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ProviderError('request aborted', { providerName: 'deepseek', retryable: false });
  }
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new ProviderError('request aborted', { providerName: 'deepseek', retryable: false }));
    };
    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createDeepSeekAdapter(): ProviderAdapter {
  return {
    name: 'deepseek',
    defaultModel: getProviderDefaultModel('deepseek'),
    async generate<T>(params: ProviderGenerateParams<T>): Promise<ProviderGenerateResult<T>> {
      const models = buildModelList(params.model);
      const maxRetriesPerModel = params.maxRetries ?? MAX_RETRIES;
      let lastErr: ProviderError | undefined;

      for (const model of models) {
        let attempt = 0;
        while (attempt <= maxRetriesPerModel) {
          try {
            return await callOnce(params, model);
          } catch (err) {
            if (!(err instanceof ProviderError)) throw err;
            lastErr = err;
            if (params.signal?.aborted) throw err;
            if (!err.retryable) {
              // non-retryable on this model — try next model in cascade
              break;
            }
            if (attempt === maxRetriesPerModel) {
              // exhausted retries on this model — try next model in cascade
              console.warn(
                `[deepseek] ${model} failed after ${attempt + 1} attempts (${err.message}); cascading to next model`,
              );
              break;
            }
            const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
            await sleep(delay, params.signal);
            attempt++;
          }
        }
      }

      throw lastErr ?? new ProviderError('all deepseek models failed', { providerName: 'deepseek', retryable: false });
    },
  };
}
