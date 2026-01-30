/**
 * Travel Lane Analysis Hook
 *
 * Orchestrates intensive travel lane detection across 2D coverage polygons.
 * For each coverage polygon, crops the floorplan image and sends it to Gemini
 * for travel lane detection with iterative verification.
 *
 * This hook processes each 2D coverage area individually (like blocked area detection)
 * and transforms coordinates back to full image space.
 */

import { useCallback, useRef, useState } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { useConfigStore } from '@/store/useConfigStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { cropImageWithPolygonMask } from '@/services/imageCropper'
import { transformToFullImage, createFloorplanTransformer } from '@/services/coordinateTransform'
import {
  analyzeFloorplanIntensiveTravelLanes,
  GeminiApiError,
  type IntensiveTravelLaneResult,
} from '@/services/geminiApi'
import { createZone } from '@/types/zone'
import type { Zone, Point } from '@/types/zone'
import type { CoveragePolygon, FloorplanConfig } from '@/types/config'

// =============================================================================
// Types
// =============================================================================

/**
 * Analysis stages for progress reporting
 */
export type TravelLaneAnalysisStage =
  | 'idle'
  | 'cropping'
  | 'analyzing'
  | 'verifying'
  | 'transforming'
  | 'complete'
  | 'error'

/**
 * Progress information for the UI
 */
export interface TravelLaneProgress {
  stage: TravelLaneAnalysisStage
  message: string
  /** Progress percentage (0-100) */
  progressPercent: number
  /** Current coverage area being processed */
  currentArea: number
  /** Total coverage areas to process */
  totalAreas: number
  /** Detailed messages for each area processed */
  areaMessages: string[]
  /** Aggregate coverage percentage across all areas */
  totalCoveragePercent?: number
}

/**
 * Return type for the hook
 */
export interface UseTravelLaneAnalysisReturn {
  /** Start the analysis */
  analyze: () => Promise<void>
  /** Cancel ongoing analysis */
  cancel: () => void
  /** Whether analysis is in progress */
  isAnalyzing: boolean
  /** Current progress */
  progress: TravelLaneProgress
  /** Results from each coverage area */
  areaResults: IntensiveTravelLaneResult[]
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get Gemini API key from settings or environment
 */
function getGeminiApiKey(): string | null {
  const state = useSettingsStore.getState()
  const settingsKey = state.geminiApiKey
  const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  return settingsKey ?? envKey ?? null
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
 * Create a Zone from an intensive travel lane zone
 */
function createTravelLaneZone(
  intensiveZone: IntensiveTravelLaneResult['zones'][0],
  coverageId: string,
  coverageIndex: number
): Zone {
  return createZone({
    id: crypto.randomUUID(),
    name: intensiveZone.name,
    type: 'travel_lane',
    vertices: intensiveZone.vertices,
    confidence: intensiveZone.confidence,
    source: 'ai',
    metadata: {
      color: null,
      opacity: 0.6,
      isVisible: true,
      isLocked: false,
      description: `Travel lane detected in coverage area ${coverageIndex + 1}`,
      customProperties: {
        parentCoverageId: coverageId,
        junctionType: intensiveZone.junctionType,
        connections: intensiveZone.connections.join(','),
        analysisMode: 'intensive',
      },
    },
  })
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for intensive travel lane detection across 2D coverage areas
 */
export function useTravelLaneAnalysis(): UseTravelLaneAnalysisReturn {
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [areaResults, setAreaResults] = useState<IntensiveTravelLaneResult[]>([])
  const [progress, setProgress] = useState<TravelLaneProgress>({
    stage: 'idle',
    message: 'Ready to analyze',
    progressPercent: 0,
    currentArea: 0,
    totalAreas: 0,
    areaMessages: [],
  })

  // Store selectors
  const dataUrl = useProjectStore((state) => state.dataUrl)
  const setZonesFromAnalysis = useProjectStore((state) => state.setZonesFromAnalysis)
  const setAnalysisStatus = useProjectStore((state) => state.setAnalysisStatus)
  const setAnalysisError = useProjectStore((state) => state.setAnalysisError)

  const coveragePolygons = useConfigStore((state) => state.coveragePolygons)
  const floorplanConfig = useConfigStore((state) => state.floorplanConfig)

  const useIntensiveTravelLaneDetection = useSettingsStore(
    (state) => state.useIntensiveTravelLaneDetection
  )

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsAnalyzing(false)
      setAnalysisStatus('idle')
      setProgress({
        stage: 'idle',
        message: 'Analysis cancelled',
        progressPercent: 0,
        currentArea: 0,
        totalAreas: 0,
        areaMessages: [],
      })
    }
  }, [setAnalysisStatus])

  const analyze = useCallback(async () => {
    // Only run if intensive mode is enabled
    if (!useIntensiveTravelLaneDetection) {
      setAnalysisError('Intensive travel lane detection is not enabled. Enable it in Settings.')
      return
    }

    const apiKey = getGeminiApiKey()

    if (!apiKey) {
      setAnalysisError('No Gemini API key configured. Please set your API key in Settings.')
      return
    }

    if (!dataUrl) {
      setAnalysisError('No image loaded.')
      return
    }

    if (!floorplanConfig) {
      setAnalysisError('No floorplan configuration loaded. Please load a config file first.')
      return
    }

    // Filter to only 2D coverage polygons
    const coverage2D = coveragePolygons.filter(
      (cp) => cp.type === '2D' && !cp.exclusion
    )

    if (coverage2D.length === 0) {
      setAnalysisError('No 2D coverage polygons found. Load coverage.json with 2D coverage areas.')
      return
    }

    // Cancel any existing analysis
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsAnalyzing(true)
    setAnalysisStatus('analyzing')
    setAreaResults([])

    const allTravelLaneZones: Zone[] = []
    const areaMessages: string[] = []
    const results: IntensiveTravelLaneResult[] = []
    let totalCoveragePercent = 0

    try {
      setProgress({
        stage: 'cropping',
        currentArea: 0,
        totalAreas: coverage2D.length,
        message: `Preparing ${coverage2D.length} coverage areas for intensive analysis...`,
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
        const xs = pixelVertices.map((p) => p.x)
        const ys = pixelVertices.map((p) => p.y)
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
          message: `Cropping coverage area ${i + 1}/${coverage2D.length}...`,
          progressPercent: progressPercent - 10,
          areaMessages,
        })

        // Crop the image with polygon mask
        let cropResult
        try {
          cropResult = await cropImageWithPolygonMask(dataUrl, pixelVertices, 0.05, '#FFFFFF')

          console.log(
            `[TravelLaneAnalysis] Cropped area ${i + 1}: ${cropResult.width}x${cropResult.height}px`
          )
        } catch (cropError) {
          const msg = cropError instanceof Error ? cropError.message : 'Crop failed'
          areaMessages.push(`Area ${i + 1}: Crop failed - ${msg}`)
          console.error(`Failed to crop coverage area ${i + 1}:`, cropError)
          continue
        }

        if (signal.aborted) {
          throw new Error('AbortError')
        }

        setProgress({
          stage: 'analyzing',
          currentArea: i + 1,
          totalAreas: coverage2D.length,
          message: `Intensive analysis of area ${i + 1}/${coverage2D.length} (tracing boundaries)...`,
          progressPercent: progressPercent - 5,
          areaMessages,
        })

        // Analyze travel lanes in this crop with intensive detection
        try {
          const result = await analyzeFloorplanIntensiveTravelLanes(
            cropResult.dataUrl,
            apiKey,
            cropResult.width,
            cropResult.height,
            signal,
            cropResult.localPolygon // Pass coverage polygon for validation
          )

          results.push(result)

          if (signal.aborted) {
            throw new Error('AbortError')
          }

          // Transform coordinates back to full image space
          if (result.zones.length > 0) {
            setProgress({
              stage: 'transforming',
              currentArea: i + 1,
              totalAreas: coverage2D.length,
              message: `Transforming ${result.zones.length} travel lanes to full image coordinates...`,
              progressPercent,
              areaMessages,
            })

            for (const travelLane of result.zones) {
              // Transform vertices from cropped to full image coordinates
              const transformedVertices = transformToFullImage(
                travelLane.vertices,
                cropResult.originalOffset
              )

              const zone = createTravelLaneZone(
                { ...travelLane, vertices: transformedVertices },
                coverage.uid,
                allTravelLaneZones.length
              )

              allTravelLaneZones.push(zone)
            }

            totalCoveragePercent += result.network.coveragePercent
            areaMessages.push(
              `Area ${i + 1}: ${result.zones.length} lanes, ${result.network.coveragePercent}% coverage (${result.verificationPasses} passes)`
            )
          } else {
            areaMessages.push(`Area ${i + 1}: No travel lanes detected`)
          }

          console.log(
            `[TravelLaneAnalysis] Coverage ${i + 1}: ${result.zones.length} lanes, ` +
              `${result.network.coveragePercent}% coverage, ` +
              `${result.verificationPasses} passes`
          )
        } catch (analyzeError) {
          if (
            analyzeError instanceof Error &&
            analyzeError.message === 'AbortError'
          ) {
            throw analyzeError
          }

          const msg =
            analyzeError instanceof GeminiApiError
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

      // Store results
      setAreaResults(results)
      setZonesFromAnalysis(allTravelLaneZones)
      setAnalysisStatus('success')

      const avgCoverage = results.length > 0 ? totalCoveragePercent / results.length : 0

      setProgress({
        stage: 'complete',
        currentArea: coverage2D.length,
        totalAreas: coverage2D.length,
        message: `Complete: ${allTravelLaneZones.length} travel lanes detected across ${results.length} areas`,
        progressPercent: 100,
        areaMessages,
        totalCoveragePercent: Math.round(avgCoverage),
      })

      console.log(
        `[TravelLaneAnalysis] Complete: ${allTravelLaneZones.length} lanes from ${results.length} areas, avg coverage: ${Math.round(avgCoverage)}%`
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
      if (error instanceof GeminiApiError) {
        switch (error.type) {
          case 'auth':
            errorMessage = 'Authentication failed. Please check your Gemini API key in Settings.'
            break
          case 'rate_limit':
            errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
            break
          case 'network':
            errorMessage = 'Network error. Please check your internet connection.'
            break
          default:
            errorMessage = error.message
        }
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      setAnalysisStatus('error')
      setAnalysisError(errorMessage)
      setProgress({
        stage: 'error',
        message: errorMessage,
        progressPercent: 0,
        currentArea: progress.currentArea,
        totalAreas: progress.totalAreas,
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
    useIntensiveTravelLaneDetection,
    setZonesFromAnalysis,
    setAnalysisStatus,
    setAnalysisError,
    progress.currentArea,
    progress.totalAreas,
  ])

  return {
    analyze,
    cancel,
    isAnalyzing,
    progress,
    areaResults,
  }
}
