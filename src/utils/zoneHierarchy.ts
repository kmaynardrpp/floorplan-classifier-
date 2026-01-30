import type { Zone } from '@/types/zone'
import { isTravelable } from '@/types/zone'
import type { TravelabilityFilter } from '@/types/store'

/**
 * Tree node for zone hierarchy display
 */
export interface ZoneTreeNode {
  zone: Zone
  children: ZoneTreeNode[]
  depth: number
}

/**
 * Build a hierarchical tree structure from flat zones array
 * Parent zones are determined by the parentZoneId in customProperties
 */
export function buildZoneTree(zones: Zone[]): ZoneTreeNode[] {
  // Find all parent zone IDs
  const parentIds = new Set<string>()
  zones.forEach((zone) => {
    const parentId = zone.metadata.customProperties.parentZoneId
    if (parentId) {
      parentIds.add(parentId)
    }
  })

  // Find root zones (zones without a parent OR zones that ARE a parent)
  const rootZones = zones.filter((zone) => {
    const hasParent = !!zone.metadata.customProperties.parentZoneId
    const isParent = parentIds.has(zone.id)
    // Include if it's a parent zone, or if it has no parent
    return isParent || !hasParent
  })

  // Helper to get children of a zone
  const getChildren = (parentId: string): Zone[] => {
    return zones.filter(
      (z) => z.metadata.customProperties.parentZoneId === parentId
    )
  }

  // Build tree recursively
  const buildNode = (zone: Zone, depth: number): ZoneTreeNode => {
    const children = getChildren(zone.id).map((child) =>
      buildNode(child, depth + 1)
    )
    return { zone, children, depth }
  }

  // Build root nodes
  return rootZones.map((zone) => buildNode(zone, 0))
}

/**
 * Filter zones by travelability
 */
export function filterZonesByTravelability(
  zones: Zone[],
  filter: TravelabilityFilter
): Zone[] {
  switch (filter) {
    case 'travelable':
      return zones.filter((z) => isTravelable(z.type))
    case 'non-travelable':
      return zones.filter((z) => !isTravelable(z.type))
    default:
      return zones
  }
}

/**
 * Filter tree nodes by travelability while preserving hierarchy
 * Parent nodes are kept if any of their descendants match the filter
 */
export function filterTreeByTravelability(
  nodes: ZoneTreeNode[],
  filter: TravelabilityFilter
): ZoneTreeNode[] {
  if (filter === 'all') return nodes

  const filterNode = (node: ZoneTreeNode): ZoneTreeNode | null => {
    // Recursively filter children first
    const filteredChildren = node.children
      .map(filterNode)
      .filter((n): n is ZoneTreeNode => n !== null)

    // Check if this node matches the filter
    const zoneTravelable = isTravelable(node.zone.type)
    const nodeMatches =
      (filter === 'travelable' && zoneTravelable) ||
      (filter === 'non-travelable' && !zoneTravelable)

    // Include node if it matches OR if it has matching descendants
    if (nodeMatches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      }
    }

    return null
  }

  return nodes.map(filterNode).filter((n): n is ZoneTreeNode => n !== null)
}

/**
 * Flatten a tree back to a zones array (depth-first)
 */
export function flattenTree(nodes: ZoneTreeNode[]): Zone[] {
  const result: Zone[] = []

  const traverse = (node: ZoneTreeNode) => {
    result.push(node.zone)
    node.children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return result
}

/**
 * Count zones by travelability
 */
export function countZonesByTravelability(zones: Zone[]): {
  total: number
  travelable: number
  nonTravelable: number
} {
  const travelable = zones.filter((z) => isTravelable(z.type)).length
  return {
    total: zones.length,
    travelable,
    nonTravelable: zones.length - travelable,
  }
}

/**
 * Check if a zone has children
 */
export function hasChildren(zone: Zone, allZones: Zone[]): boolean {
  return allZones.some(
    (z) => z.metadata.customProperties.parentZoneId === zone.id
  )
}

/**
 * Get parent zone for a zone
 */
export function getParentZone(zone: Zone, allZones: Zone[]): Zone | null {
  const parentId = zone.metadata.customProperties.parentZoneId
  if (!parentId) return null
  return allZones.find((z) => z.id === parentId) ?? null
}

/**
 * Get direction display string
 */
export function getDirectionDisplay(direction: string | undefined): string {
  if (!direction) return ''
  return direction === 'horizontal' ? '\u2192' : '\u2193' // → or ↓
}
