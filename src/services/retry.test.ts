import { describe, it, expect, vi } from 'vitest'
import { withRetry, DEFAULT_RETRY_OPTIONS } from './retry'
import { ClaudeApiError } from './claudeApi'

describe('retry', () => {
  describe('withRetry', () => {
    it('should return result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should not retry non-retryable errors', async () => {
      const error = new ClaudeApiError('Auth error', 'auth', 401, false)
      const fn = vi.fn().mockRejectedValue(error)

      await expect(withRetry(fn)).rejects.toThrow('Auth error')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry retryable errors with minimal delay', async () => {
      const error = new ClaudeApiError('Server error', 'unknown', 500, true)
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      // Use very short delays for testing
      const result = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 50,
        backoffMultiplier: 2,
      })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should throw after max retries exceeded', async () => {
      const error = new ClaudeApiError('Server error', 'unknown', 500, true)
      const fn = vi.fn().mockRejectedValue(error)

      await expect(
        withRetry(fn, {
          maxRetries: 1,
          initialDelayMs: 10,
          maxDelayMs: 50,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow('Server error')

      expect(fn).toHaveBeenCalledTimes(2) // Initial + 1 retry
    })

    it('should call onRetry callback', async () => {
      const error = new ClaudeApiError('Server error', 'unknown', 500, true)
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success')
      const onRetry = vi.fn()

      await withRetry(
        fn,
        { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2 },
        onRetry
      )

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(1, 2, expect.any(Number))
    })

    it('should respect abort signal when already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const fn = vi.fn().mockResolvedValue('success')

      await expect(withRetry(fn, {}, undefined, controller.signal)).rejects.toThrow(
        'Aborted'
      )
      expect(fn).not.toHaveBeenCalled()
    })

    it('should calculate increasing delays with backoff', async () => {
      const error = new ClaudeApiError('Server error', 'unknown', 500, true)
      const delays: number[] = []
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      const onRetry = (_attempt: number, _max: number, delay: number) => {
        delays.push(delay)
      }

      await withRetry(
        fn,
        { maxRetries: 3, initialDelayMs: 100, maxDelayMs: 10000, backoffMultiplier: 2 },
        onRetry
      )

      // Second delay should be roughly double the first (with some jitter)
      expect(delays).toHaveLength(2)
      expect(delays[0]).toBeGreaterThanOrEqual(100)
      expect(delays[0]).toBeLessThanOrEqual(110) // 10% jitter
      expect(delays[1]).toBeGreaterThanOrEqual(200)
      expect(delays[1]).toBeLessThanOrEqual(220) // 10% jitter
    })
  })

  describe('DEFAULT_RETRY_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBe(3)
      expect(DEFAULT_RETRY_OPTIONS.initialDelayMs).toBe(1000)
      expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBe(30000)
      expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2)
    })
  })
})
