/**
 * Utility for joining 1D TDOA pairs that share anchors into continuous aisles
 *
 * When two 1D pairs share an anchor (e.g., A-B and B-C), they can be merged
 * into a single continuous aisle zone instead of two separate zones with a gap.
 */

import type { TDOAPair, Anchor, FloorplanTransformer } from '@/types/config'
import type { Zone, Point } from '@/types/zone'
import { DEFAULT_ZONE_METADATA } from '@/types/zone'
import {
  calculateChainedAislePolygon,
  getAisleDirection,
} from './aisleGeometry'

/**
 * Represents a chain of connected 1D TDOA pairs
 */
export interface AisleChain {
  /** Ordered list of connected pairs */
  pairs: TDOAPair[]
  /** First anchor name in the chain */
  startAnchor: string
  /** Last anchor name in the chain */
  endAnchor: string
  /** Sum of distances across all pairs */
  totalLength: number
  /** Average margin (width) of all pairs */
  averageMargin: number
  /** Ordered list of all anchor names in the chain */
  anchorSequence: string[]
}

/**
 * Build adjacency map of anchors to pairs that use them
 */
function buildAnchorAdjacency(pairs: TDOAPair[]): Map<string, TDOAPair[]> {
  const adjacency = new Map<string, TDOAPair[]>()

  for (const pair of pairs) {
    // Add pair to source anchor's list
    const sourcePairs = adjacency.get(pair.Source) ?? []
    sourcePairs.push(pair)
    adjacency.set(pair.Source, sourcePairs)

    // Add pair to destination anchor's list
    const destPairs = adjacency.get(pair.Destination) ?? []
    destPairs.push(pair)
    adjacency.set(pair.Destination, destPairs)
  }

  return adjacency
}

/**
 * Get the other anchor in a pair given one anchor
 */
function getOtherAnchor(pair: TDOAPair, anchor: string): string {
  return pair.Source === anchor ? pair.Destination : pair.Source
}

/**
 * Find chains of connected 1D pairs that share anchors
 *
 * Example: If we have pairs A-B, B-C, C-D, this will return one chain [A-B, B-C, C-D]
 * with anchor sequence [A, B, C, D]
 *
 * @param pairs - Array of 1D TDOA pairs
 * @param anchors - Map of anchor name to Anchor object (for validation)
 * @returns Array of AisleChain objects
 */
export function findAisleChains(
  pairs: TDOAPair[],
  anchors: Map<string, Anchor>
): AisleChain[] {
  const chains: AisleChain[] = []
  const usedPairs = new Set<number>() // Track by rowNumber

  // Build adjacency map
  const adjacency = buildAnchorAdjacency(pairs)

  // Find chain endpoints (anchors used by only 1 pair)
  const endpoints = new Set<string>()
  for (const [anchor, pairList] of adjacency) {
    if (pairList.length === 1 && anchors.has(anchor)) {
      endpoints.add(anchor)
    }
  }

  // Start chains from endpoints for deterministic ordering
  for (const startAnchor of endpoints) {
    // Get the single pair connected to this endpoint
    const startPairs = adjacency.get(startAnchor) ?? []
    if (startPairs.length !== 1) continue

    const startPair = startPairs[0]!
    if (usedPairs.has(startPair.rowNumber)) continue

    // Build chain starting from this endpoint
    const chainPairs: TDOAPair[] = []
    const anchorSequence: string[] = [startAnchor]
    let currentAnchor = startAnchor
    let currentPair: TDOAPair | undefined = startPair

    while (currentPair && !usedPairs.has(currentPair.rowNumber)) {
      chainPairs.push(currentPair)
      usedPairs.add(currentPair.rowNumber)

      // Move to next anchor
      const nextAnchor = getOtherAnchor(currentPair, currentAnchor)
      anchorSequence.push(nextAnchor)
      currentAnchor = nextAnchor

      // Find next pair (if any)
      const connectedPairs = adjacency.get(nextAnchor) ?? []
      currentPair = connectedPairs.find((p) => !usedPairs.has(p.rowNumber))
    }

    if (chainPairs.length > 0) {
      const totalLength = chainPairs.reduce((sum, p) => sum + p.Distance, 0)
      const averageMargin =
        chainPairs.reduce((sum, p) => sum + p.Margin, 0) / chainPairs.length

      chains.push({
        pairs: chainPairs,
        startAnchor: anchorSequence[0]!,
        endAnchor: anchorSequence[anchorSequence.length - 1]!,
        totalLength,
        averageMargin,
        anchorSequence,
      })
    }
  }

  // Handle any remaining isolated pairs (pairs with no shared anchors)
  for (const pair of pairs) {
    if (!usedPairs.has(pair.rowNumber)) {
      usedPairs.add(pair.rowNumber)
      chains.push({
        pairs: [pair],
        startAnchor: pair.Source,
        endAnchor: pair.Destination,
        totalLength: pair.Distance,
        averageMargin: pair.Margin,
        anchorSequence: [pair.Source, pair.Destination],
      })
    }
  }

  return chains
}

/**
 * Generate a single zone from a chain of connected pairs
 *
 * @param chain - The aisle chain to convert to a zone
 * @param anchors - Map of anchor name to Anchor object
 * @param transformer - Coordinate transformer for mm to pixels
 * @returns Zone object or null if generation failed
 */
export function generateChainedAisleZone(
  chain: AisleChain,
  anchors: Map<string, Anchor>,
  transformer: FloorplanTransformer
): Zone | null {
  // Get ordered anchor positions in mm
  const anchorPositions: Point[] = []

  for (const anchorName of chain.anchorSequence) {
    const anchor = anchors.get(anchorName)
    if (!anchor) {
      console.warn(`[aisleJoining] Anchor '${anchorName}' not found for chain`)
      return null
    }
    anchorPositions.push({
      x: anchor.position.x,
      y: anchor.position.y,
    })
  }

  if (anchorPositions.length < 2) {
    console.warn('[aisleJoining] Chain has less than 2 anchor positions')
    return null
  }

  // Calculate polygon vertices in mm
  const verticesMm = calculateChainedAislePolygon(
    anchorPositions,
    chain.averageMargin
  )

  if (verticesMm.length === 0) {
    console.warn('[aisleJoining] Could not calculate polygon for chain')
    return null
  }

  // Transform vertices from mm to pixels
  const verticesPixels = transformer.polygonToPixels(verticesMm)

  // Determine dominant direction from first and last anchor
  const direction = getAisleDirection(
    anchorPositions[0]!,
    anchorPositions[anchorPositions.length - 1]!
  )

  // Generate zone ID from chain info
  const slotNames = chain.pairs.map((p) => p.Slot).join('+')
  const rowNumbers = chain.pairs.map((p) => p.rowNumber).join('_')

  const now = new Date().toISOString()

  // Create zone object
  const zone: Zone = {
    id: `aisle_chain_${rowNumbers}`,
    name: `Aisle ${slotNames}`,
    type: 'aisle_path',
    vertices: verticesPixels,
    confidence: 1.0, // Programmatic zones have full confidence
    source: 'tdoa',
    metadata: {
      ...DEFAULT_ZONE_METADATA,
      customProperties: {
        isChained: 'true',
        chainLength: String(chain.pairs.length),
        startAnchor: chain.startAnchor,
        endAnchor: chain.endAnchor,
        anchorSequence: chain.anchorSequence.join(','),
        tdoaSlots: slotNames,
        totalDistanceMm: String(chain.totalLength),
        averageMarginMm: String(chain.averageMargin.toFixed(1)),
        direction: direction,
      },
    },
    createdAt: now,
    updatedAt: now,
  }

  return zone
}

/**
 * Check if a chain represents multiple connected pairs
 * Single-pair chains should be handled by the regular aisle generator
 */
export function isMultiPairChain(chain: AisleChain): boolean {
  return chain.pairs.length >= 2
}

/**
 * Get statistics about aisle chains
 */
export function getChainStats(chains: AisleChain[]): {
  totalChains: number
  multiPairChains: number
  singlePairChains: number
  longestChain: number
  totalPairsInChains: number
} {
  const multiPairChains = chains.filter(isMultiPairChain)
  const longestChain = Math.max(...chains.map((c) => c.pairs.length), 0)
  const totalPairsInChains = chains.reduce((sum, c) => sum + c.pairs.length, 0)

  return {
    totalChains: chains.length,
    multiPairChains: multiPairChains.length,
    singlePairChains: chains.length - multiPairChains.length,
    longestChain,
    totalPairsInChains,
  }
}
