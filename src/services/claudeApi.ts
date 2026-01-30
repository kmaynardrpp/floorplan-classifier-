/**
 * Claude API Utilities
 *
 * Base error classes and utilities for Claude API interactions.
 * The main blocked area detection API is in blockedAreaApi.ts.
 */

// =============================================================================
// Constants
// =============================================================================

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
export const CLAUDE_SONNET_MODEL = 'claude-sonnet-4-20250514'

// =============================================================================
// Error Types
// =============================================================================

/**
 * API error types
 */
export type ApiErrorType =
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'invalid_response'
  | 'unknown'

/**
 * API error class for Claude API interactions
 */
export class ClaudeApiError extends Error {
  constructor(
    message: string,
    public readonly type: ApiErrorType,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'ClaudeApiError'
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get error type from HTTP status code
 */
export function getErrorType(status: number): ApiErrorType {
  switch (status) {
    case 401:
    case 403:
      return 'auth'
    case 429:
      return 'rate_limit'
    default:
      return 'unknown'
  }
}

/**
 * Extract text content from Claude API response
 */
export function extractTextContent(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'content' in data &&
    Array.isArray((data as { content: unknown[] }).content)
  ) {
    const content = (
      data as { content: Array<{ type: string; text?: string }> }
    ).content
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        return block.text
      }
    }
  }
  throw new ClaudeApiError('Invalid API response format', 'invalid_response')
}

/**
 * Extract base64 data and media type from a data URL
 */
export function parseDataUrl(dataUrl: string): {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  base64Data: string
} {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches || !matches[1] || !matches[2]) {
    throw new ClaudeApiError('Invalid image data URL format', 'invalid_response')
  }

  return {
    mediaType: matches[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
    base64Data: matches[2],
  }
}

/**
 * Make a request to Claude API with proper headers
 */
export async function makeClaudeRequest(
  requestBody: object,
  apiKey: string,
  signal?: AbortSignal
): Promise<Response> {
  try {
    return await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new ClaudeApiError(
      'Network error: Unable to reach Claude API',
      'network',
      undefined,
      true
    )
  }
}

/**
 * Handle API response errors
 */
export async function handleApiError(response: Response): Promise<never> {
  const errorType = getErrorType(response.status)
  const retryable = response.status >= 500 || response.status === 429

  let message = `API request failed with status ${response.status}`
  try {
    const errorBody = await response.json()
    if (errorBody.error?.message) {
      message = errorBody.error.message
    }
  } catch {
    // Ignore JSON parse errors for error body
  }

  throw new ClaudeApiError(message, errorType, response.status, retryable)
}
