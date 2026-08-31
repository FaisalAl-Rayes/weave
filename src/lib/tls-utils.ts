/** Run an async function with TLS verification disabled, then restore. */
export async function withTlsSkip<T>(skip: boolean, fn: () => Promise<T>): Promise<T> {
  if (!skip) return fn();
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
  }
}
