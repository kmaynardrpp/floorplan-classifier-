import type { Zone } from '@/types/zone'

/**
 * CACHING DISABLED FOR TESTING
 * All functions are no-ops to ensure fresh API calls every time
 */

/**
 * Get cached analysis result for an image
 * DISABLED - always returns null
 */
export function getCachedAnalysis(_imageDataUrl: string): Zone[] | null {
  return null
}

/**
 * Store analysis result in cache
 * DISABLED - does nothing
 */
export function setCachedAnalysis(_imageDataUrl: string, _zones: Zone[]): void {
  // Caching disabled for testing
}

/**
 * Clear the analysis cache
 * DISABLED - does nothing (nothing to clear)
 */
export function clearAnalysisCache(): void {
  // Caching disabled for testing
  // Also clear any existing cache from previous sessions
  try {
    sessionStorage.removeItem('floorplan-analysis-cache')
  } catch {
    // Ignore errors
  }
}
