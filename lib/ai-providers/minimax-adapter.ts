import { BEHAVIOR } from './provider-config';
import {
  ProviderError,
  type ProviderAdapter,
  type ProviderGenerateParams,
  type ProviderGenerateResult,
} from './types';

const MINIMAX_BASE = process.env.MINIMAX_API_BASE || 'https://api.minimax.chat';
const ENDPOINT = `${MINIMAX_BASE}/v1/text/chatcompletion_v2`;

interface MinimaxResponse {
  id?: string;
  choices?: {
    message?: { content?: string; role?: string };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
  base_resp?: { status_code?: number; status_msg?: string };
}

function isRetryable(status: number): boolean {
  return BEHAVIOR.minimax.retryable.includes(status);
}

async function callOnce<T>(
  params: ProviderGenerateParams<T>,
  model: string,
): Promise<ProviderGenerateResult<T>> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new ProviderError('MINIMAX_API_KEY missing', {
      providerName: 'minimax',
      retryable: false,
    });
  }

  const messages: { role: string; content: string }[] = [];
  if (params.systemPrompt) messages.push({ role: 'system', content: params.systemPrompt });
  messages.push({ role: 'user', content: params.prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: params.temperature ?? 0.4,
    top_p: params.topP ?? 0.9,
    max_tokens: params.maxOutputTokens ?? 4096,
    stream: false,
  };

  if (params.zodSchema) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 60_000;
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  if (params.signal) {
    if (params.signal.aborted) {
      controller.abort();
    } else {
      params.signal.addEventListener('abort', forwardAbort, { once: true });
    }
  }
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cleanup = () => {
    clearTimeout(timeoutId);
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
      providerName: 'minimax',
      retryable: aborted ? Boolean(timedOut && params.retryOnTimeout) : true,
    });
  }

  cleanup();

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ProviderError(`minimax ${resp.status}: ${text.slice(0, 200)}`, {
      status: resp.status,
      retryable: isRetryable(resp.status),
      providerName: 'minimax',
    });
  }

  let data: MinimaxResponse;
  try {
    data = (await resp.json()) as MinimaxResponse;
  } catch (err) {
    throw new ProviderError(`invalid json: ${err}`, {
      providerName: 'minimax',
      retryable: true,
    });
  }

  if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
    const code = data.base_resp.status_code;
    throw new ProviderError(
      `minimax base_resp ${code}: ${data.base_resp.status_msg ?? ''}`,
      {
        status: code,
        retryable: isRetryable(code),
        providerName: 'minimax',
      },
    );
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    throw new ProviderError('empty completion', {
      providerName: 'minimax',
      retryable: true,
    });
  }

  let parsed: T | undefined;
  if (params.zodSchema) {
    const json = extractJson(text);
    const result = params.zodSchema.safeParse(json);
    if (result.success) parsed = result.data;
    else {
      throw new ProviderError(`schema validation failed: ${result.error.message}`, {
        providerName: 'minimax',
        retryable: false,
      });
    }
  }

  return {
    text,
    parsed,
    modelUsed: data.model ?? model,
    providerName: 'minimax',
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
    throw new ProviderError('request aborted', { providerName: 'minimax', retryable: false });
  }
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new ProviderError('request aborted', { providerName: 'minimax', retryable: false }));
    };
    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const minimaxAdapter: ProviderAdapter = {
  name: 'minimax',
  defaultModel: process.env.AI_DEFAULT_MODEL || 'MiniMax-M2.7',
  async generate<T>(params: ProviderGenerateParams<T>): Promise<ProviderGenerateResult<T>> {
    const model = params.model ?? this.defaultModel;
    const beh = BEHAVIOR.minimax;
    const maxRetries = params.maxRetries ?? beh.maxRetries;
    let attempt = 0;
    let lastErr: ProviderError | undefined;
    while (attempt <= maxRetries) {
      try {
        return await callOnce(params, model);
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        lastErr = err;
        if (!err.retryable || attempt === maxRetries || params.signal?.aborted) throw err;
        const delay = beh.backoffMs[Math.min(attempt, beh.backoffMs.length - 1)];
        await sleep(delay, params.signal);
        attempt++;
      }
    }
    throw lastErr ?? new ProviderError('unknown error', { providerName: 'minimax', retryable: false });
  },
};
