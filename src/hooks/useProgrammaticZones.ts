/**
 * Hook for generating programmatic zones from TDOA and coverage data
 */

import { useCallback } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { useConfigStore } from '@/store/useConfigStore'
import {
  generateAllProgrammaticZones,
  validateGenerationData,
  getGenerationStats,
  type GenerationOptions,
  DEFAULT_GENERATION_OPTIONS,
} from '@/services/programmaticZoneGenerator'
import { createFloorplanTransformerWithValidation } from '@/services/coordinateTransform'
import {
  extendAislesToTravelLanes,
  getExtendedZones,
  getExtensionStats,
} from '@/utils/aisleExtension'
import type { Zone } from '@/types/zone'
import type { ProgrammaticZonesStatus } from '@/types/store'

export interface UseProgrammaticZonesResult {
  /** Generated programmatic zones */
  programmaticZones: Zone[]
  /** Generation status */
  status: ProgrammaticZonesStatus
  /** Error message if generation failed */
  error: string | null
  /** Generate zones from config data */
  generateZones: (options?: Partial<GenerationOptions>) => Promise<void>
  /** Clear generated zones */
  clearZones: () => void
  /** Check if required data is loaded for generation */
  canGenerate: boolean
  /** Validation errors for current data */
  validationErrors: string[]
}

/**
 * Hook for generating programmatic zones from TDOA and coverage configuration data
 *
 * @returns Object with zones, status, and generation functions
 */
export function useProgrammaticZones(): UseProgrammaticZonesResult {
  // Project store
  const programmaticZones = useProjectStore((s) => s.programmaticZones)
  const status = useProjectStore((s) => s.programmaticZonesStatus)
  const error = useProjectStore((s) => s.programmaticZonesError)
  const setProgrammaticZones = useProjectStore((s) => s.setProgrammaticZones)
  const clearProgrammaticZones = useProjectStore((s) => s.clearProgrammaticZones)
  const setProgrammaticZonesStatus = useProjectStore(
    (s) => s.setProgrammaticZonesStatus
  )
  const setProgrammaticZonesError = useProjectStore(
    (s) => s.setProgrammaticZonesError
  )

  // Config store
  const floorplanConfig = useConfigStore((s) => s.floorplanConfig)
  const anchors = useConfigStore((s) => s.anchors)
  const tdoaPairs = useConfigStore((s) => s.tdoaPairs)
  const coveragePolygons = useConfigStore((s) => s.coveragePolygons)
  const hasRequiredData = useConfigStore((s) => s.hasRequiredData)

  // Check if we can generate
  const canGenerate = hasRequiredData() && floorplanConfig !== null

  // Validate current data
  const getValidationErrors = useCallback(
    (options: GenerationOptions = DEFAULT_GENERATION_OPTIONS): string[] => {
      if (!floorplanConfig) {
        return ['Floorplan configuration not loaded']
      }
      const result = validateGenerationData(
        tdoaPairs,
        anchors,
        coveragePolygons,
        options
      )
      return result.errors
    },
    [floorplanConfig, tdoaPairs, anchors, coveragePolygons]
  )

  // Generate zones
  const generateZones = useCallback(
    async (partialOptions?: Partial<GenerationOptions>): Promise<void> => {
      const options: GenerationOptions = {
        ...DEFAULT_GENERATION_OPTIONS,
        ...partialOptions,
      }

      // Validate before generation
      if (!floorplanConfig) {
        setProgrammaticZonesError('Floorplan configuration not loaded')
        return
      }

      const validation = validateGenerationData(
        tdoaPairs,
        anchors,
        coveragePolygons,
        options
      )

      if (!validation.valid) {
        setProgrammaticZonesError(validation.errors.join('; '))
        return
      }

      try {
        setProgrammaticZonesStatus('generating')

        // Create coordinate transformer with scale validation
        // This will auto-correct scale if anchors are all out of bounds
        const transformer = createFloorplanTransformerWithValidation(floorplanConfig, anchors)

        // Generate zones (without extension - handled below as post-processing)
        const zones = generateAllProgrammaticZones(
          tdoaPairs,
          anchors,
          coveragePolygons,
          transformer,
          options
        )

        // Log initial generation stats
        const stats = getGenerationStats(zones)
        console.log('[useProgrammaticZones] Initial generation stats:', stats)

        // Separate aisles and travel lanes for post-processing extension
        const aisleZones = zones.filter((z) => z.source === 'tdoa')
        const travelLaneZones = zones.filter((z) => z.source === 'coverage')

        // Post-processing: Extend aisles to travel lane boundaries
        // Both aisles and travel lanes are now guaranteed to be in pixel space
        if (options.extendAisles && aisleZones.length > 0 && travelLaneZones.length > 0) {
          console.log('[useProgrammaticZones] Extending aisles in pixel space (post-processing)...')

          const extensionResults = extendAislesToTravelLanes(
            aisleZones,
            travelLaneZones,
            options.maxAisleExtension,
            options.aisleOverhang
          )

          // Log extension stats
          const extStats = getExtensionStats(extensionResults)
          console.log('[useProgrammaticZones] Extension stats:', extStats)

          // Replace aisles with extended versions
          const extendedAisles = getExtendedZones(extensionResults)
          const finalZones = [...extendedAisles, ...travelLaneZones]

          console.log(`[useProgrammaticZones] Final zones: ${finalZones.length} (${extendedAisles.length} aisles + ${travelLaneZones.length} travel lanes)`)
          setProgrammaticZones(finalZones)
        } else {
          setProgrammaticZones(zones)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error during generation'
        console.error('[useProgrammaticZones] Generation failed:', err)
        setProgrammaticZonesError(message)
      }
    },
    [
      floorplanConfig,
      tdoaPairs,
      anchors,
      coveragePolygons,
      setProgrammaticZones,
      setProgrammaticZonesStatus,
      setProgrammaticZonesError,
    ]
  )

  // Clear zones
  const clearZones = useCallback(() => {
    clearProgrammaticZones()
  }, [clearProgrammaticZones])

  return {
    programmaticZones,
    status,
    error,
    generateZones,
    clearZones,
    canGenerate,
    validationErrors: getValidationErrors(),
  }
}
