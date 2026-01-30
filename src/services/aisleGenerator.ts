/**
 * Generate aisle Zone objects from TDOA pairs
 *
 * Supports both individual aisles and chained aisles (where multiple
 * pairs share anchors and form a continuous corridor).
 */

import type { Zone, Point } from '@/types/zone'
import type { TDOAPair, Anchor, FloorplanTransformer } from '@/types/config'
import { DEFAULT_ZONE_METADATA } from '@/types/zone'
import { calculateAisleRectangle, getAisleDirection } from '@/utils/aisleGeometry'
import { filter1DPairs } from './tdoaParser'
import {
  findAisleChains,
  generateChainedAisleZone,
  isMultiPairChain,
  getChainStats,
} from '@/utils/aisleJoining'

/**
 * Generate a single aisle zone from a TDOA pair
 *
 * @param pair - TDOA pair defining the aisle
 * @param anchors - Map of anchor name to Anchor object
 * @param transformer - Coordinate transformer for mm to pixels
 * @returns Zone object or null if generation failed
 */
export function generateAisleFromTDOA(
  pair: TDOAPair,
  anchors: Map<string, Anchor>,
  transformer: FloorplanTransformer
): Zone | null {
  // Look up source and destination anchors
  const sourceAnchor = anchors.get(pair.Source)
  const destAnchor = anchors.get(pair.Destination)

  if (!sourceAnchor) {
    console.warn(
      `[aisleGenerator] Source anchor '${pair.Source}' not found for pair ${pair.Slot}`
    )
    return null
  }

  if (!destAnchor) {
    console.warn(
      `[aisleGenerator] Destination anchor '${pair.Destination}' not found for pair ${pair.Slot}`
    )
    return null
  }

  // Get anchor positions in mm
  const sourcePos: Point = {
    x: sourceAnchor.position.x,
    y: sourceAnchor.position.y,
  }
  const destPos: Point = {
    x: destAnchor.position.x,
    y: destAnchor.position.y,
  }

  // Calculate rectangle vertices in mm
  const verticesMm = calculateAisleRectangle(sourcePos, destPos, pair.Margin)

  if (verticesMm.length === 0) {
    console.warn(
      `[aisleGenerator] Could not calculate rectangle for pair ${pair.Slot} (zero length or margin)`
    )
    return null
  }

  // Transform vertices from mm to pixels
  const verticesPixels = transformer.polygonToPixels(verticesMm)

  // Determine aisle direction
  const direction = getAisleDirection(sourcePos, destPos)

  const now = new Date().toISOString()

  // Create zone object
  const zone: Zone = {
    id: `aisle_${pair.Slot}_${pair.rowNumber}`,
    name: `Aisle ${pair.Slot}`,
    type: 'aisle_path',
    vertices: verticesPixels,
    confidence: 1.0, // Programmatic zones have full confidence
    source: 'tdoa',
    metadata: {
      ...DEFAULT_ZONE_METADATA,
      customProperties: {
        tdoaSlot: pair.Slot,
        sourceAnchor: pair.Source,
        destAnchor: pair.Destination,
        marginMm: String(pair.Margin),
        distanceMm: String(pair.Distance),
        direction: direction,
      },
    },
    createdAt: now,
    updatedAt: now,
  }

  return zone
}

/**
 * Generate all aisle zones from TDOA pairs
 *
 * This function now supports aisle joining: when two or more 1D pairs
 * share an anchor (e.g., A-B and B-C), they are merged into a single
 * continuous aisle zone instead of separate zones with a gap.
 *
 * @param pairs - Array of all TDOA pairs (will be filtered to 1D only)
 * @param anchors - Map of anchor name to Anchor object
 * @param transformer - Coordinate transformer for mm to pixels
 * @returns Array of generated Zone objects
 */
export function generateAllAisles(
  pairs: TDOAPair[],
  anchors: Map<string, Anchor>,
  transformer: FloorplanTransformer
): Zone[] {
  // Filter to only 1D pairs (aisles)
  const aislePairs = filter1DPairs(pairs)

  // Find chains of connected pairs that share anchors
  const chains = findAisleChains(aislePairs, anchors)

  // Log chain statistics
  const chainStats = getChainStats(chains)
  console.log('[aisleGenerator] Chain detection stats:', chainStats)

  const zones: Zone[] = []
  const failedChains: string[] = []
  const failedPairs: string[] = []

  // Process each chain
  for (const chain of chains) {
    if (isMultiPairChain(chain)) {
      // Multi-pair chain: generate merged aisle
      const zone = generateChainedAisleZone(chain, anchors, transformer)
      if (zone) {
        zones.push(zone)
        console.log(
          `[aisleGenerator] Generated merged aisle from ${chain.pairs.length} pairs: ${chain.anchorSequence.join(' -> ')}`
        )
      } else {
        failedChains.push(chain.pairs.map((p) => p.Slot).join('+'))
      }
    } else {
      // Single-pair chain: generate individual aisle
      const pair = chain.pairs[0]!
      const zone = generateAisleFromTDOA(pair, anchors, transformer)
      if (zone) {
        zones.push(zone)
      } else {
        failedPairs.push(pair.Slot)
      }
    }
  }

  if (failedChains.length > 0) {
    console.warn(
      `[aisleGenerator] Failed to generate ${failedChains.length} chained aisle zones:`,
      failedChains
    )
  }

  if (failedPairs.length > 0) {
    console.warn(
      `[aisleGenerator] Failed to generate ${failedPairs.length} individual aisle zones:`,
      failedPairs
    )
  }

  console.log(
    `[aisleGenerator] Generated ${zones.length} aisle zones (${chainStats.multiPairChains} merged, ${chainStats.singlePairChains} individual) from ${aislePairs.length} 1D pairs`
  )

  return zones
}

/**
 * Get statistics about aisle generation
 */
export function getAisleGenerationStats(
  pairs: TDOAPair[],
  anchors: Map<string, Anchor>
): {
  total1DPairs: number
  validPairs: number
  missingAnchors: string[]
} {
  const aislePairs = filter1DPairs(pairs)
  const missingAnchors = new Set<string>()
  let validPairs = 0

  for (const pair of aislePairs) {
    const hasSource = anchors.has(pair.Source)
    const hasDest = anchors.has(pair.Destination)

    if (!hasSource) missingAnchors.add(pair.Source)
    if (!hasDest) missingAnchors.add(pair.Destination)

    if (hasSource && hasDest) {
      validPairs++
    }
  }

  return {
    total1DPairs: aislePairs.length,
    validPairs,
    missingAnchors: Array.from(missingAnchors),
  }
}
