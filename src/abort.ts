/**
 * Combine an optional user {@link AbortSignal} with a per-request timeout.
 * Uses {@link AbortSignal.timeout} when available; otherwise a small polyfill.
 */
export function combineSignals(
  userSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  const hasTimeout = timeoutMs !== undefined && timeoutMs > 0;
  if (!userSignal && !hasTimeout) return undefined;

  const timeoutSig = hasTimeout ? createTimeoutAbortSignal(timeoutMs!) : undefined;
  if (!userSignal) return timeoutSig;
  if (!timeoutSig) return userSignal;
  return mergeAbortSignals(userSignal, timeoutSig);
}

function createTimeoutAbortSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  const id = setTimeout(() => {
    c.abort(timeoutReason(ms));
  }, ms);
  c.signal.addEventListener('abort', () => clearTimeout(id), { once: true });
  return c.signal;
}

function timeoutReason(ms: number): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(`The operation timed out after ${ms}ms`, 'TimeoutError');
  }
  const e = new Error(`The operation timed out after ${ms}ms`);
  e.name = 'TimeoutError';
  return e;
}

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const anyFn = typeof AbortSignal !== 'undefined' ? (AbortSignal as unknown as { any?: (s: Iterable<AbortSignal>) => AbortSignal }).any : undefined;
  if (typeof anyFn === 'function') {
    return anyFn([a, b]);
  }
  const c = new AbortController();
  const forward = (s: AbortSignal) => {
    if (s.aborted) {
      c.abort(s.reason);
      return;
    }
    s.addEventListener('abort', () => c.abort(s.reason), { once: true });
  };
  forward(a);
  forward(b);
  return c.signal;
}

/**
 * Reject when `signal` aborts even if `task` ignores {@link AbortSignal}
 * (so {@link query} does not hang when a custom provider never settles).
 */
export function raceWithSignal<T>(task: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return task;
  if (signal.aborted) {
    return Promise.reject(normalizeAbortReason(signal.reason));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(normalizeAbortReason(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    task.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

function normalizeAbortReason(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof DOMException !== 'undefined' && reason === undefined) {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const e = new Error(typeof reason === 'string' ? reason : 'The operation was aborted.');
  e.name = 'AbortError';
  return e;
}

/**
 * Wait up to `ms` milliseconds, or reject if `signal` aborts first.
 */
export function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(normalizeAbortReason(signal.reason));
      return;
    }
    const id = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(normalizeAbortReason(signal?.reason));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
