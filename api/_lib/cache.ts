const store = new Map<string, { data: unknown; expires: number }>()

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const entry = store.get(key)
  if (entry && entry.expires > Date.now()) {
    return entry.data as T
  }
  const result = await fn()
  store.set(key, { data: result, expires: Date.now() + ttlMs })
  return result
}

export function invalidate(key: string): void {
  store.delete(key)
}
