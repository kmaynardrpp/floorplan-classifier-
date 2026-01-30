import { ClaudeApiError } from './claudeApi'

export interface RetryOptions {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeoutId = setTimeout(resolve, ms)

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  const exponentialDelay =
    options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt)
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs)
  // Add 10% jitter to prevent thundering herd
  const jitter = cappedDelay * 0.1 * Math.random()
  return cappedDelay + jitter
}

/**
 * Retry callback type for progress reporting
 */
export type RetryCallback = (attempt: number, maxRetries: number, delay: number) => void

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  onRetry?: RetryCallback,
  signal?: AbortSignal
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry aborted requests
      if (lastError.name === 'AbortError') {
        throw lastError
      }

      // Check if error is retryable
      const isRetryable =
        error instanceof ClaudeApiError ? error.retryable : false

      // If not retryable or last attempt, throw
      if (!isRetryable || attempt === opts.maxRetries) {
        throw lastError
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts)
      onRetry?.(attempt + 1, opts.maxRetries, delay)
      await sleep(delay, signal)
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed')
}
