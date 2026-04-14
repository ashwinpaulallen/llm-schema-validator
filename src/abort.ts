/**
 * Combine an optional user {@link AbortSignal} with a per-request timeout.
 * Requires Node.js **20.3+** ({@link AbortSignal.timeout}, {@link AbortSignal.any}).
 */
export function combineSignals(
  userSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  const hasTimeout = timeoutMs !== undefined && timeoutMs > 0;
  if (!userSignal && !hasTimeout) return undefined;

  const timeoutSig = hasTimeout ? AbortSignal.timeout(timeoutMs!) : undefined;
  if (!userSignal) return timeoutSig;
  if (!timeoutSig) return userSignal;
  return AbortSignal.any([userSignal, timeoutSig]);
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
