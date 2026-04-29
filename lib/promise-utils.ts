export async function safePromise<T>(
  promise: Promise<T>,
): Promise<[T | null, Error | null]> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

export async function backgroundOperation<T>(
  name: string,
  operation: () => Promise<T>,
  onError?: (error: Error) => void,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`Background operation '${name}' failed:`, err);
    onError?.(err);
    return null;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller?: AbortController,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      controller?.abort();
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export class AbortManager {
  private controllers = new Map<string, AbortController>();
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  createController(key: string, timeoutMs?: number): AbortController {
    this.cleanup(key);
    const controller = new AbortController();
    this.controllers.set(key, controller);
    if (timeoutMs) {
      const timeoutId = setTimeout(() => {
        controller.abort();
        this.controllers.delete(key);
        this.timeouts.delete(key);
      }, timeoutMs);
      this.timeouts.set(key, timeoutId);
    }
    return controller;
  }

  cleanup(key?: string) {
    if (key) {
      const c = this.controllers.get(key);
      if (c && !c.signal.aborted) c.abort();
      this.controllers.delete(key);
      const t = this.timeouts.get(key);
      if (t) {
        clearTimeout(t);
        this.timeouts.delete(key);
      }
    } else {
      for (const [k] of this.controllers) this.cleanup(k);
    }
  }

  getSignal(key: string): AbortSignal | undefined {
    return this.controllers.get(key)?.signal;
  }
}
