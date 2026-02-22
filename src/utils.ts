export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}
