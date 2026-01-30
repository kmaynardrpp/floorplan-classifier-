/**
 * Blocked Area Analysis Hook
 *
 * Orchestrates blocked area detection across 2D coverage polygons.
 * For each coverage polygon, crops the floorplan image and sends it to the selected
 * AI provider (Claude/Gemini) for blocked area detection, then transforms coordinates
 * back to full image space.
 *
 * Provider support:
 * - Claude (Anthropic): Uses claude-sonnet for analysis (8000px max dimension)
 * - Gemini (Google): Uses gemini-2.0-flash for analysis (higher image limits)
 */

import { useCallback, useRef, useState } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { useConfigStore } from '@/store/useConfigStore'
import { useSettingsStore, type ApiProvider } from '@/store/useSettingsStore'
import { cropImageWithPolygonMask } from '@/services/imageCropper'
import { transformToFullImage } from '@/services/coordinateTransform'
import { polygonsOverlap } from '@/utils/geometry'
import {
  analyzeBlockedAreasWithRetry,
  verifyAndAdjustBlockedAreasWithBuffer,
  BlockedAreaApiError,
  type BlockedAreaResult,
} from '@/services/blockedAreaApi'
import {
  analyze2DCoverage as analyzeBlockedAreasGemini,
  GeminiApiError,
  type BlockedArea as GeminiBlockedArea,
} from '@/services/geminiApi'
import { createZone } from '@/types/zone'
import type { Zone, Point } from '@/types/zone'
import type { CoveragePolygon, FloorplanConfig } from '@/types/config'
import { createFloorplanTransformer } from '@/services/coordinateTransform'

// =============================================================================
// Types
// =============================================================================

/**
 * Analysis stages for progress reporting
 */
export type BlockedAreaAnalysisStage =
  | 'idle'
  | 'cropping'
  | 'analyzing'
  | 'transforming'
  | 'verifying'
  | 'complete'
  | 'error'

/**
 * Progress information for the UI
 */
export interface BlockedAreaProgress {
  stage: BlockedAreaAnalysisStage
  currentArea: number
  totalAreas: number
  message: string
  /** Progress percentage (0-100) */
  progressPercent: number
  /** Detailed messages for each area processed */
  areaMessages?: string[]
}

/**
 * Return type for the hook
 */
export interface UseBlockedAreaAnalysisReturn {
  /** Start the analysis */
  analyze: () => Promise<void>
  /** Cancel ongoing analysis */
  cancel: () => void
  /** Whether analysis is in progress */
  isAnalyzing: boolean
  /** Current progress */
  progress: BlockedAreaProgress
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get API key and provider from settings or environment
 */
function getApiKeyAndProvider(): { apiKey: string | null; provider: ApiProvider } {
  const state = useSettingsStore.getState()
  const provider = state.apiProvider

  // Get key for the selected provider
  let settingsKey: string | null = null
  let envKey: string | undefined

  switch (provider) {
    case 'anthropic':
      settingsKey = state.anthropicApiKey
      envKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
      break
    case 'gemini':
      settingsKey = state.geminiApiKey
      envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
      break
    case 'openai':
      settingsKey = state.openaiApiKey
      envKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
      break
  }

  const apiKey = settingsKey ?? envKey ?? null
  return { apiKey, provider }
}

/**
 * Normalize Gemini blocked area result to match our standard format
 */
function normalizeGeminiBlockedArea(geminiArea: GeminiBlockedArea): BlockedAreaResult {
  // Map Gemini reasons to our standard reasons
  const reasonMap: Record<string, BlockedAreaResult['reason']> = {
    conveyor_belt: 'conveyor',
    obstacle: 'obstacle',
    boundary: 'obstacle', // Map boundary to obstacle
    equipment: 'equipment',
    other: 'other',
  }

  return {
    name: geminiArea.name,
    reason: reasonMap[geminiArea.reason] ?? 'other',
    vertices: geminiArea.vertices,
    confidence: geminiArea.confidence,
  }
}

/**
 * Convert coverage polygon vertices from mm to pixels
 */
function coverageToPixelVertices(
  coverage: CoveragePolygon,
  config: FloorplanConfig
): Point[] {
  const transformer = createFloorplanTransformer(config)
  return coverage.geometry.points.map((p) => transformer.toPixels({ x: p.x, y: p.y }))
}

/**
 * Create a Zone from a blocked area result
 */
function createBlockedAreaZone(
  blockedArea: BlockedAreaResult,
  coverageId: string,
  coverageIndex: number
): Zone {
  return createZone({
    id: crypto.randomUUID(),
    name: blockedArea.name || `Blocked Area ${coverageIndex + 1}`,
    type: 'blocked_area',
    vertices: blockedArea.vertices,
    confidence: blockedArea.confidence,
    source: 'ai',
    metadata: {
      color: null,
      opacity: 0.5,
      isVisible: true,
      isLocked: false,
      description: `Blocked area detected in coverage zone ${coverageId}`,
      customProperties: {
        parentCoverageId: coverageId,
        blockedReason: blockedArea.reason,
      },
    },
  })
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for blocked area analysis within 2D coverage zones
 */
export function useBlockedAreaAnalysis(): UseBlockedAreaAnalysisReturn {
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState<BlockedAreaProgress>({
    stage: 'idle',
    currentArea: 0,
    totalAreas: 0,
    message: 'Ready to analyze',
    progressPercent: 0,
  })

  // Store selectors
  const dataUrl = useProjectStore((state) => state.dataUrl)
  const setAIBlockedZones = useProjectStore((state) => state.setAIBlockedZones)
  const setAIBlockedZonesStatus = useProjectStore(
    (state) => state.setAIBlockedZonesStatus
  )
  const setAIBlockedZonesError = useProjectStore(
    (state) => state.setAIBlockedZonesError
  )

  const coveragePolygons = useConfigStore((state) => state.coveragePolygons)
  const floorplanConfig = useConfigStore((state) => state.floorplanConfig)

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsAnalyzing(false)
      setAIBlockedZonesStatus('idle')
      setProgress({
        stage: 'idle',
        currentArea: 0,
        totalAreas: 0,
        message: 'Analysis cancelled',
        progressPercent: 0,
      })
    }
  }, [setAIBlockedZonesStatus])

  const analyze = useCallback(async () => {
    const { apiKey, provider } = getApiKeyAndProvider()

    if (!apiKey) {
      const providerName = provider === 'anthropic' ? 'Claude (Anthropic)' :
                          provider === 'gemini' ? 'Gemini (Google)' : 'OpenAI'
      setAIBlockedZonesError(
        `No ${providerName} API key configured. Please set your API key in Settings.`
      )
      return
    }

    // OpenAI not yet supported for blocked area detection
    if (provider === 'openai') {
      setAIBlockedZonesError(
        'OpenAI is not yet supported for blocked area detection. Please select Claude or Gemini in Settings.'
      )
      return
    }

    console.log(`%c[blockedAreaAnalysis] Using provider: ${provider.toUpperCase()}`, 'background: #333; color: #0f0; font-weight: bold; padding: 2px 8px;')
    console.log(`[blockedAreaAnalysis] Provider details:`, {
      provider,
      model: provider === 'gemini' ? 'gemini-2.0-flash' : provider === 'anthropic' ? 'claude-sonnet' : 'unknown',
    })

    if (!dataUrl) {
      setAIBlockedZonesError('No image loaded.')
      return
    }

    if (!floorplanConfig) {
      setAIBlockedZonesError(
        'No floorplan configuration loaded. Please load a config file first.'
      )
      return
    }

    // Filter to only 2D coverage polygons (not 1D aisles)
    const coverage2D = coveragePolygons.filter(
      (cp) => cp.type === '2D' && !cp.exclusion
    )

    if (coverage2D.length === 0) {
      setAIBlockedZonesError(
        'No 2D coverage polygons found. Load coverage.json with 2D coverage areas.'
      )
      return
    }

    // Cancel any existing analysis
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsAnalyzing(true)
    setAIBlockedZonesStatus('analyzing')

    const allBlockedZones: Zone[] = []
    const areaMessages: string[] = []

    try {
      setProgress({
        stage: 'cropping',
        currentArea: 0,
        totalAreas: coverage2D.length,
        message: `Preparing ${coverage2D.length} coverage areas...`,
        progressPercent: 5,
        areaMessages: [],
      })

      // Process each 2D coverage polygon
      for (let i = 0; i < coverage2D.length; i++) {
        if (signal.aborted) {
          throw new Error('AbortError')
        }

        const coverage = coverage2D[i]!
        const progressPercent = Math.round(5 + (90 * (i + 1)) / coverage2D.length)

        // Convert coverage vertices to pixels
        const pixelVertices = coverageToPixelVertices(coverage, floorplanConfig)

        // Calculate bounding box for size check
        const xs = pixelVertices.map(p => p.x)
        const ys = pixelVertices.map(p => p.y)
        const bboxWidth = Math.max(...xs) - Math.min(...xs)
        const bboxHeight = Math.max(...ys) - Math.min(...ys)

        // Skip if polygon is too small
        if (bboxWidth < 50 || bboxHeight < 50) {
          areaMessages.push(
            `Area ${i + 1}: Skipped (too small: ${Math.round(bboxWidth)}x${Math.round(bboxHeight)})`
          )
          continue
        }

        setProgress({
          stage: 'cropping',
          currentArea: i + 1,
          totalAreas: coverage2D.length,
          message: `Cropping coverage area ${i + 1}/${coverage2D.length} (polygon mask)...`,
          progressPercent: progressPercent - 5,
          areaMessages,
        })

        // Crop the image with EXACT polygon mask (not rectangular bounding box)
        // Use WHITE background to avoid AI confusion with transparent areas
        let cropResult
        try {
          cropResult = await cropImageWithPolygonMask(dataUrl, pixelVertices, 0.05, '#FFFFFF') // 5% padding, white bg

          // Log local polygon vertices for debugging
          const localPolyXs = cropResult.localPolygon.map(p => Math.round(p.x))
          const localPolyYs = cropResult.localPolygon.map(p => Math.round(p.y))

          console.log(
            `[blockedAreaAnalysis] Cropped area ${i + 1} with polygon mask:\n` +
            `  Original polygon vertices: ${pixelVertices.length}\n` +
            `  cropSize: ${cropResult.width}x${cropResult.height}\n` +
            `  cropOffset: (${cropResult.originalOffset.x}, ${cropResult.originalOffset.y})\n` +
            `  Local polygon X range: ${Math.min(...localPolyXs)} to ${Math.max(...localPolyXs)}\n` +
            `  Local polygon Y range: ${Math.min(...localPolyYs)} to ${Math.max(...localPolyYs)}\n` +
            `  AI should return coords INSIDE the local polygon (not just 0-${cropResult.width - 1})`
          )
        } catch (cropError) {
          const msg =
            cropError instanceof Error ? cropError.message : 'Crop failed'
          areaMessages.push(`Area ${i + 1}: Crop failed - ${msg}`)
          console.error(`Failed to crop coverage area ${i + 1}:`, cropError)
          continue
        }

        // Save cropped image for debugging - automatically download to user's computer
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const filename = `crop_2d_polygon_${i + 1}_${timestamp}.png`

          // Create a download link and trigger download
          const link = document.createElement('a')
          link.href = cropResult.dataUrl
          link.download = filename
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)

          console.log(`[blockedAreaAnalysis] Downloaded polygon-masked image: ${filename}`, {
            width: cropResult.width,
            height: cropResult.height,
            offsetX: cropResult.originalOffset.x,
            offsetY: cropResult.originalOffset.y,
            polygonVertices: pixelVertices.length,
          })
        } catch (saveError) {
          console.warn(`[blockedAreaAnalysis] Could not save debug crop:`, saveError)
        }

        if (signal.aborted) {
          throw new Error('AbortError')
        }

        setProgress({
          stage: 'analyzing',
          currentArea: i + 1,
          totalAreas: coverage2D.length,
          message: `Analyzing coverage area ${i + 1}/${coverage2D.length}...`,
          progressPercent,
          areaMessages,
        })

        // Analyze blocked areas in this crop using selected provider
        try {
          let blockedAreas: BlockedAreaResult[] = []

          if (provider === 'gemini') {
            // Use Gemini API with coverage polygon for accurate containment validation
            const result = await analyzeBlockedAreasGemini(
              cropResult.dataUrl,
              apiKey,
              cropResult.width,
              cropResult.height,
              signal,
              cropResult.localPolygon // Pass the coverage polygon in local coordinates
            )
            // Normalize Gemini results to our standard format
            blockedAreas = result.blockedAreas.map(normalizeGeminiBlockedArea)
          } else {
            // Use Claude (Anthropic) API with retry
            const result = await analyzeBlockedAreasWithRetry(
              cropResult.dataUrl,
              apiKey,
              cropResult.width,
              cropResult.height,
              signal,
              2 // max retries
            )
            blockedAreas = result.blockedAreas
          }

          if (signal.aborted) {
            throw new Error('AbortError')
          }

          // Transform coordinates back to full image space
          if (blockedAreas.length > 0) {
            setProgress({
              stage: 'transforming',
              currentArea: i + 1,
              totalAreas: coverage2D.length,
              message: `Transforming ${blockedAreas.length} blocked areas...`,
              progressPercent,
              areaMessages,
            })

            // Debug: Log transformation details with explicit values
            const minPx = Math.min(...pixelVertices.map(v => v.x))
            const minPy = Math.min(...pixelVertices.map(v => v.y))
            const maxPx = Math.max(...pixelVertices.map(v => v.x))
            const maxPy = Math.max(...pixelVertices.map(v => v.y))
            console.log(
              `[blockedAreaAnalysis] Transformation for coverage ${i + 1}:\n` +
              `  cropOffset: (${cropResult.originalOffset.x}, ${cropResult.originalOffset.y})\n` +
              `  cropSize: ${cropResult.width}x${cropResult.height}\n` +
              `  coveragePolygonBbox: minX=${Math.round(minPx)}, minY=${Math.round(minPy)}, maxX=${Math.round(maxPx)}, maxY=${Math.round(maxPy)}\n` +
              `  ⚠️ AI coordinates MUST be within: 0-${cropResult.width - 1} (X), 0-${cropResult.height - 1} (Y)`
            )

            for (const blockedArea of blockedAreas) {
              // Transform vertices from cropped to full image coordinates
              const transformedVertices = transformToFullImage(
                blockedArea.vertices,
                cropResult.originalOffset
              )

              // Debug: Log before/after transformation for each blocked area
              const aiXs = blockedArea.vertices.map(v => v.x)
              const aiYs = blockedArea.vertices.map(v => v.y)
              const transXs = transformedVertices.map(v => v.x)
              const transYs = transformedVertices.map(v => v.y)
              console.log(
                `[blockedAreaAnalysis] Coordinate transformation for "${blockedArea.name}":\n` +
                `  AI returned coords: X range ${Math.min(...aiXs)}-${Math.max(...aiXs)}, Y range ${Math.min(...aiYs)}-${Math.max(...aiYs)}\n` +
                `  Expected AI range: X 0-${cropResult.width - 1}, Y 0-${cropResult.height - 1}\n` +
                `  Offset applied: (${cropResult.originalOffset.x}, ${cropResult.originalOffset.y})\n` +
                `  Transformed coords: X range ${Math.min(...transXs)}-${Math.max(...transXs)}, Y range ${Math.min(...transYs)}-${Math.max(...transYs)}\n` +
                `  ${Math.max(...aiXs) > cropResult.width || Math.max(...aiYs) > cropResult.height ? '⚠️ AI RETURNED OUT-OF-BOUNDS COORDINATES!' : '✓ AI coords within expected range'}`
              )

              const zone = createBlockedAreaZone(
                { ...blockedArea, vertices: transformedVertices },
                coverage.uid,
                allBlockedZones.length
              )

              allBlockedZones.push(zone)
            }

            areaMessages.push(
              `Area ${i + 1}: Found ${blockedAreas.length} blocked area(s)`
            )
          } else {
            areaMessages.push(`Area ${i + 1}: Clear (no obstacles)`)
          }

          console.log(
            `[blockedAreaAnalysis] Coverage ${i + 1}: ${blockedAreas.length} blocked areas (${provider})`
          )
        } catch (analyzeError) {
          if (
            analyzeError instanceof Error &&
            analyzeError.message === 'AbortError'
          ) {
            throw analyzeError
          }

          const msg =
            analyzeError instanceof BlockedAreaApiError
              ? analyzeError.message
              : analyzeError instanceof GeminiApiError
                ? analyzeError.message
                : analyzeError instanceof Error
                  ? analyzeError.message
                  : 'Analysis failed'

          areaMessages.push(`Area ${i + 1}: Failed - ${msg}`)
          console.error(`Failed to analyze coverage area ${i + 1}:`, analyzeError)
          // Continue with other areas
        }
      }

      if (signal.aborted) {
        throw new Error('AbortError')
      }

      // =========================================================================
      // AI Verification/Refinement Pass (Anthropic only)
      // Uses wide buffer crop and iterative AI refinement (up to 5 iterations)
      // AI has FULL CONTROL to adjust, remove, or add zones from scratch
      // =========================================================================
      if (provider === 'anthropic') {
        setProgress({
          stage: 'verifying',
          currentArea: 0,
          totalAreas: coverage2D.length,
          message: `AI refinement pass: ${allBlockedZones.length} initial zones across ${coverage2D.length} areas...`,
          progressPercent: 92,
          areaMessages,
        })

        console.log(`[blockedAreaAnalysis] Starting AI refinement pass for ${coverage2D.length} coverage areas...`)
        console.log(`[blockedAreaAnalysis] AI has FULL CONTROL - can adjust, remove, or detect zones from scratch`)

        // Process verification for each coverage area
        const verifiedZones: Zone[] = []

        for (let i = 0; i < coverage2D.length; i++) {
          if (signal.aborted) {
            throw new Error('AbortError')
          }

          const coverage = coverage2D[i]!
          const pixelVertices = coverageToPixelVertices(coverage, floorplanConfig)

          // Find zones that belong to this coverage area (may be empty)
          const zonesForCoverage = allBlockedZones.filter(
            zone => zone.metadata?.customProperties?.parentCoverageId === coverage.uid
          )

          // Convert zones to BlockedAreaResult format for verification
          // Pass empty array if no zones - AI will detect from scratch
          const blockedAreaResults: BlockedAreaResult[] = zonesForCoverage.map(zone => ({
            name: zone.name,
            reason: (zone.metadata?.customProperties?.blockedReason as BlockedAreaResult['reason']) || 'other',
            vertices: zone.vertices,
            confidence: zone.confidence ?? 0.5,
          }))

          const statusMsg = zonesForCoverage.length > 0
            ? `Refining ${zonesForCoverage.length} zones`
            : `Detecting from scratch`

          setProgress({
            stage: 'verifying',
            currentArea: i + 1,
            totalAreas: coverage2D.length,
            message: `Coverage ${i + 1}/${coverage2D.length}: ${statusMsg} (up to 5 iterations)...`,
            progressPercent: 92 + Math.round((6 * (i + 1)) / coverage2D.length),
            areaMessages,
          })

          console.log(`[blockedAreaAnalysis] Coverage ${i + 1}: ${statusMsg}`)

          try {
            // Call iterative wide buffer verification (up to 5 iterations)
            // AI has full control - can completely re-detect if initial zones are wrong
            const verificationResult = await verifyAndAdjustBlockedAreasWithBuffer(
              {
                fullImageDataUrl: dataUrl,
                coveragePolygon: pixelVertices,
                detectedZones: blockedAreaResults, // May be empty - AI detects from scratch
                bufferPercent: 0.5, // 50% buffer around coverage
              },
              apiKey,
              signal,
              5 // maxIterations
            )

            // Convert verified results back to Zone format
            for (const verifiedArea of verificationResult.blockedAreas) {
              verifiedZones.push(createBlockedAreaZone(
                verifiedArea,
                coverage.uid,
                verifiedZones.length
              ))
            }

            // Add iteration details to messages
            const iterationInfo = `${verificationResult.iterations} iteration(s), ${verificationResult.aiSatisfied ? 'AI satisfied' : 'max reached'}`
            areaMessages.push(
              `Area ${i + 1}: ${iterationInfo} - ${verificationResult.blockedAreas.length} zones`
            )

            console.log(
              `[blockedAreaAnalysis] Coverage ${i + 1} refinement complete:\n` +
              `  Initial zones: ${zonesForCoverage.length}\n` +
              `  Iterations: ${verificationResult.iterations}\n` +
              `  AI satisfied: ${verificationResult.aiSatisfied}\n` +
              `  Final zones: ${verificationResult.blockedAreas.length}`
            )
          } catch (verifyError) {
            // If verification fails for this area, keep original zones (if any)
            console.warn(`[blockedAreaAnalysis] Refinement failed for coverage ${i + 1}:`, verifyError)
            if (zonesForCoverage.length > 0) {
              verifiedZones.push(...zonesForCoverage)
              areaMessages.push(`Area ${i + 1}: Refinement failed, kept ${zonesForCoverage.length} original zones`)
            } else {
              areaMessages.push(`Area ${i + 1}: Refinement failed, no zones detected`)
            }
          }
        }

        // Replace allBlockedZones with verified zones
        allBlockedZones.length = 0
        allBlockedZones.push(...verifiedZones)
        console.log(`[blockedAreaAnalysis] Verification complete: ${verifiedZones.length} verified zones`)
      }

      if (signal.aborted) {
        throw new Error('AbortError')
      }

      // Filter out blocked areas that overlap with 1D coverage (aisles)
      // 1D coverage areas are travelable paths that should NOT be blocked
      const coverage1D = coveragePolygons.filter(
        (cp) => cp.type === '1D' && !cp.exclusion
      )

      let filteredBlockedZones = allBlockedZones

      if (coverage1D.length > 0) {
        console.log(`[blockedAreaAnalysis] Checking ${allBlockedZones.length} blocked zones against ${coverage1D.length} 1D coverage polygons`)

        // Convert 1D coverage polygons to pixel coordinates
        const coverage1DPixels = coverage1D.map((cp) => ({
          uid: cp.uid,
          vertices: coverageToPixelVertices(cp, floorplanConfig),
        }))

        const beforeCount = allBlockedZones.length
        filteredBlockedZones = allBlockedZones.filter((zone) => {
          // Check if this blocked zone overlaps with ANY 1D coverage
          for (const cov1D of coverage1DPixels) {
            if (polygonsOverlap(zone.vertices, cov1D.vertices)) {
              console.log(`[blockedAreaAnalysis] Removing blocked zone "${zone.name}" - overlaps with 1D coverage ${cov1D.uid}`)
              return false // Remove this zone
            }
          }
          return true // Keep this zone
        })

        const removedCount = beforeCount - filteredBlockedZones.length
        if (removedCount > 0) {
          console.log(`[blockedAreaAnalysis] Removed ${removedCount} blocked zones that overlapped with 1D aisles`)
          areaMessages.push(`Filtered: Removed ${removedCount} zones overlapping 1D aisles`)
        }
      }

      // Store results
      setAIBlockedZones(filteredBlockedZones)
      setAIBlockedZonesStatus('success')

      setProgress({
        stage: 'complete',
        currentArea: coverage2D.length,
        totalAreas: coverage2D.length,
        message: `Complete: ${filteredBlockedZones.length} blocked areas found${filteredBlockedZones.length !== allBlockedZones.length ? ` (${allBlockedZones.length - filteredBlockedZones.length} filtered)` : ''}`,
        progressPercent: 100,
        areaMessages,
      })

      console.log(
        `[blockedAreaAnalysis] Complete: ${filteredBlockedZones.length} blocked areas (${allBlockedZones.length - filteredBlockedZones.length} filtered for 1D overlap)`
      )
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message === 'AbortError')
      ) {
        // Cancelled - already handled in cancel()
        return
      }

      let errorMessage = 'An unknown error occurred'
      if (error instanceof BlockedAreaApiError || error instanceof GeminiApiError) {
        switch (error.type) {
          case 'auth':
            errorMessage =
              'Authentication failed. Please check your API key in Settings.'
            break
          case 'rate_limit':
            errorMessage =
              'Rate limit exceeded. Please wait a moment and try again.'
            break
          case 'network':
            errorMessage =
              'Network error. Please check your internet connection.'
            break
          default:
            errorMessage = error.message
        }
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      setAIBlockedZonesError(errorMessage)
      setProgress({
        stage: 'error',
        currentArea: progress.currentArea,
        totalAreas: progress.totalAreas,
        message: errorMessage,
        progressPercent: 0,
        areaMessages,
      })
    } finally {
      setIsAnalyzing(false)
      abortControllerRef.current = null
    }
  }, [
    dataUrl,
    floorplanConfig,
    coveragePolygons,
    setAIBlockedZones,
    setAIBlockedZonesStatus,
    setAIBlockedZonesError,
    progress.currentArea,
    progress.totalAreas,
  ])

  return {
    analyze,
    cancel,
    isAnalyzing,
    progress,
  }
}
