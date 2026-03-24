function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  label = 'operation'
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (i === maxRetries - 1) throw err
      const delay = Math.pow(2, i) * 1000
      console.warn(`${label} failed (attempt ${i + 1}/${maxRetries}), retrying in ${delay}ms: ${err.message}`)
      await sleep(delay)
    }
  }
  throw new Error('Unreachable')
}
