/**
 * Integration tests for blocked area detection flow
 *
 * Tests the flow of detecting blocked areas within 2D coverage polygons
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildZoneTree,
  filterTreeByTravelability,
  countZonesByTravelability,
  flattenTree,
} from '@/utils/zoneHierarchy'
import { isTravelable, createZone } from '@/types/zone'
import { getZoneStyle } from '@/utils/zoneStyles'
import {
  parseBlockedAreasFromResponse,
  type BlockedAreaResult,
} from '@/services/blockedAreaApi'
import type { Zone, Point } from '@/types/zone'
import { transformToFullImage } from '@/services/coordinateTransform'

/**
 * Helper to create test zones with proper defaults
 */
function createTestZone(partial: {
  id: string
  name: string
  type: string
  vertices: Point[]
  customProperties?: Record<string, string>
}): Zone {
  return createZone({
    id: partial.id,
    name: partial.name,
    type: partial.type,
    vertices: partial.vertices,
    source: 'ai',
    confidence: 0.9,
    metadata: {
      color: null,
      opacity: 0.5,
      isVisible: true,
      isLocked: false,
      description: '',
      customProperties: partial.customProperties ?? {},
    },
  })
}

/**
 * Mock blocked area response from AI
 */
const mockBlockedAreasResponse = {
  blocked_areas: [
    {
      name: 'Conveyor System 1',
      reason: 'conveyor',
      vertices: [
        { x: 50, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 150 },
        { x: 50, y: 150 },
      ],
      confidence: 0.9,
    },
    {
      name: 'Racking Section A',
      reason: 'racking',
      vertices: [
        { x: 300, y: 50 },
        { x: 450, y: 50 },
        { x: 450, y: 300 },
        { x: 300, y: 300 },
      ],
      confidence: 0.85,
    },
    {
      name: 'Fixed Equipment',
      reason: 'equipment',
      vertices: [
        { x: 100, y: 250 },
        { x: 180, y: 250 },
        { x: 180, y: 350 },
        { x: 100, y: 350 },
      ],
      confidence: 0.75,
    },
  ],
}

/**
 * Mock empty blocked areas response (clear coverage area)
 */
const mockEmptyBlockedAreasResponse = {
  blocked_areas: [],
}

describe('Integration: Blocked Area Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Response Parsing', () => {
    it('should parse blocked areas from JSON response', () => {
      const responseText = JSON.stringify(mockBlockedAreasResponse)
      const blockedAreas = parseBlockedAreasFromResponse(responseText, 500, 400)

      expect(blockedAreas).toHaveLength(3)
      expect(blockedAreas[0]?.name).toBe('Conveyor System 1')
      expect(blockedAreas[0]?.reason).toBe('conveyor')
      expect(blockedAreas[0]?.vertices).toHaveLength(4)
    })

    it('should parse empty blocked areas response', () => {
      const responseText = JSON.stringify(mockEmptyBlockedAreasResponse)
      const blockedAreas = parseBlockedAreasFromResponse(responseText, 500, 400)

      expect(blockedAreas).toHaveLength(0)
    })

    it('should parse JSON from markdown code blocks', () => {
      const responseText = `Here are the blocked areas:
\`\`\`json
${JSON.stringify(mockBlockedAreasResponse)}
\`\`\`
`
      const blockedAreas = parseBlockedAreasFromResponse(responseText, 500, 400)

      expect(blockedAreas).toHaveLength(3)
    })

    it('should clamp coordinates to image bounds', () => {
      const outOfBoundsResponse = {
        blocked_areas: [
          {
            name: 'Out of Bounds',
            reason: 'obstacle',
            vertices: [
              { x: -50, y: -20 },
              { x: 600, y: -20 },
              { x: 600, y: 500 },
              { x: -50, y: 500 },
            ],
            confidence: 0.8,
          },
        ],
      }

      const responseText = JSON.stringify(outOfBoundsResponse)
      const blockedAreas = parseBlockedAreasFromResponse(responseText, 500, 400)

      // All coordinates should be clamped to 0-500 for x, 0-400 for y
      expect(blockedAreas[0]?.vertices[0]?.x).toBe(0)
      expect(blockedAreas[0]?.vertices[0]?.y).toBe(0)
      expect(blockedAreas[0]?.vertices[1]?.x).toBe(500)
      expect(blockedAreas[0]?.vertices[2]?.y).toBe(400)
    })

    it('should normalize unknown reasons to "other"', () => {
      const unknownReasonResponse = {
        blocked_areas: [
          {
            name: 'Unknown Obstacle',
            reason: 'unknown_type',
            vertices: [
              { x: 10, y: 10 },
              { x: 50, y: 10 },
              { x: 50, y: 50 },
              { x: 10, y: 50 },
            ],
            confidence: 0.7,
          },
        ],
      }

      const responseText = JSON.stringify(unknownReasonResponse)
      const blockedAreas = parseBlockedAreasFromResponse(responseText, 500, 400)

      expect(blockedAreas[0]?.reason).toBe('other')
    })

    it('should throw on invalid JSON', () => {
      const invalidJson = '{ not valid json'

      expect(() =>
        parseBlockedAreasFromResponse(invalidJson, 500, 400)
      ).toThrow()
    })

    it('should throw on polygon with fewer than 3 vertices', () => {
      const invalidPolygon = {
        blocked_areas: [
          {
            name: 'Invalid',
            reason: 'obstacle',
            vertices: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
            confidence: 0.5,
          },
        ],
      }

      const responseText = JSON.stringify(invalidPolygon)
      expect(() =>
        parseBlockedAreasFromResponse(responseText, 500, 400)
      ).toThrow()
    })
  })

  describe('Coordinate Transformation', () => {
    it('should transform cropped coordinates to full image coordinates', () => {
      const croppedVertices = [
        { x: 10, y: 20 },
        { x: 100, y: 20 },
        { x: 100, y: 80 },
        { x: 10, y: 80 },
      ]

      const offset = { x: 500, y: 300 }
      const transformed = transformToFullImage(croppedVertices, offset)

      expect(transformed[0]?.x).toBe(510) // 10 + 500
      expect(transformed[0]?.y).toBe(320) // 20 + 300
      expect(transformed[1]?.x).toBe(600) // 100 + 500
    })

    it('should handle empty vertices array', () => {
      const transformed = transformToFullImage([], { x: 100, y: 200 })
      expect(transformed).toHaveLength(0)
    })
  })

  describe('Zone Creation from Blocked Areas', () => {
    it('should create blocked_area zones with correct properties', () => {
      const blockedArea: BlockedAreaResult = {
        name: 'Test Blocked Area',
        reason: 'racking',
        vertices: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
          { x: 100, y: 200 },
        ],
        confidence: 0.85,
      }

      const zone = createTestZone({
        id: 'blocked-1',
        name: blockedArea.name,
        type: 'blocked_area',
        vertices: blockedArea.vertices,
        customProperties: {
          blockedReason: blockedArea.reason,
          parentCoverageId: 'coverage-123',
        },
      })

      expect(zone.type).toBe('blocked_area')
      expect(zone.name).toBe('Test Blocked Area')
      expect(zone.metadata.customProperties.blockedReason).toBe('racking')
      expect(zone.metadata.customProperties.parentCoverageId).toBe(
        'coverage-123'
      )
    })

    it('should identify blocked_area as non-travelable', () => {
      expect(isTravelable('blocked_area')).toBe(false)
    })
  })

  describe('Zone Hierarchy', () => {
    it('should include blocked_area zones in tree', () => {
      const zones: Zone[] = [
        createTestZone({
          id: 'travel-1',
          name: 'Main Corridor',
          type: 'travel_lane',
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 50 },
            { x: 0, y: 50 },
          ],
        }),
        createTestZone({
          id: 'blocked-1',
          name: 'Equipment',
          type: 'blocked_area',
          vertices: [
            { x: 200, y: 100 },
            { x: 300, y: 100 },
            { x: 300, y: 200 },
            { x: 200, y: 200 },
          ],
        }),
      ]

      const tree = buildZoneTree(zones)

      expect(tree).toHaveLength(2)
      const types = tree.map((n) => n.zone.type)
      expect(types).toContain('travel_lane')
      expect(types).toContain('blocked_area')
    })

    it('should filter blocked_area zones as non-travelable', () => {
      const zones: Zone[] = [
        createTestZone({
          id: 'travel-1',
          name: 'Aisle',
          type: 'aisle_path',
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 50 },
            { x: 0, y: 50 },
          ],
        }),
        createTestZone({
          id: 'blocked-1',
          name: 'Conveyor',
          type: 'blocked_area',
          vertices: [
            { x: 200, y: 100 },
            { x: 300, y: 100 },
            { x: 300, y: 200 },
            { x: 200, y: 200 },
          ],
        }),
      ]

      const tree = buildZoneTree(zones)

      // Filter for travelable only
      const travelableTree = filterTreeByTravelability(tree, 'travelable')
      const travelableZones = flattenTree(travelableTree)
      expect(travelableZones.every((z) => z.type !== 'blocked_area')).toBe(true)

      // Filter for non-travelable only
      const nonTravelableTree = filterTreeByTravelability(
        tree,
        'non-travelable'
      )
      const nonTravelableZones = flattenTree(nonTravelableTree)
      expect(nonTravelableZones.some((z) => z.type === 'blocked_area')).toBe(
        true
      )
    })

    it('should count blocked_area zones as non-travelable', () => {
      const zones: Zone[] = [
        createTestZone({
          id: '1',
          name: 'Travel Lane',
          type: 'travel_lane',
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
        }),
        createTestZone({
          id: '2',
          name: 'Blocked Area 1',
          type: 'blocked_area',
          vertices: [
            { x: 20, y: 0 },
            { x: 30, y: 0 },
            { x: 30, y: 10 },
          ],
        }),
        createTestZone({
          id: '3',
          name: 'Blocked Area 2',
          type: 'blocked_area',
          vertices: [
            { x: 40, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 10 },
          ],
        }),
      ]

      const counts = countZonesByTravelability(zones)

      expect(counts.total).toBe(3)
      expect(counts.travelable).toBe(1)
      expect(counts.nonTravelable).toBe(2)
    })
  })

  describe('Canvas Rendering Styles', () => {
    it('should return hatched style for blocked_area zones', () => {
      const blockedZone = createTestZone({
        id: '1',
        name: 'Blocked Area',
        type: 'blocked_area',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      })

      const style = getZoneStyle(blockedZone)

      expect(style.pattern).toBe('hatched')
      expect(style.strokeDash.length).toBeGreaterThan(0)
    })
  })

  describe('End-to-End Flow Simulation', () => {
    it('should produce correct final zone list from coverage analysis', () => {
      // Simulate the flow:
      // 1. We have programmatic zones from TDOA
      const programmaticZones: Zone[] = [
        createTestZone({
          id: 'tdoa-aisle-1',
          name: 'Aisle 1',
          type: 'aisle_path',
          vertices: [
            { x: 100, y: 100 },
            { x: 500, y: 100 },
            { x: 500, y: 150 },
            { x: 100, y: 150 },
          ],
        }),
        createTestZone({
          id: 'coverage-lane-1',
          name: 'Main Corridor',
          type: 'travel_lane',
          vertices: [
            { x: 0, y: 0 },
            { x: 800, y: 0 },
            { x: 800, y: 80 },
            { x: 0, y: 80 },
          ],
        }),
      ]

      // 2. AI detects blocked areas within coverage
      const responseText = JSON.stringify(mockBlockedAreasResponse)
      const blockedAreas = parseBlockedAreasFromResponse(responseText, 500, 400)

      // 3. Transform coordinates (simulating crop offset)
      const cropOffset = { x: 100, y: 200 }
      const transformedBlockedAreas = blockedAreas.map((ba) => ({
        ...ba,
        vertices: transformToFullImage(ba.vertices, cropOffset),
      }))

      // 4. Convert to zones
      const blockedZones: Zone[] = transformedBlockedAreas.map((ba, i) =>
        createTestZone({
          id: `blocked-${i}`,
          name: ba.name,
          type: 'blocked_area',
          vertices: ba.vertices,
          customProperties: {
            blockedReason: ba.reason,
            parentCoverageId: 'coverage-1',
          },
        })
      )

      // 5. Combine all zones
      const allZones = [...programmaticZones, ...blockedZones]

      // 6. Verify results
      expect(allZones.length).toBe(5) // 2 programmatic + 3 blocked

      const travelableCount = allZones.filter((z) =>
        isTravelable(z.type)
      ).length
      const nonTravelableCount = allZones.filter(
        (z) => !isTravelable(z.type)
      ).length

      expect(travelableCount).toBe(2) // aisle_path + travel_lane
      expect(nonTravelableCount).toBe(3) // 3 blocked_area

      // 7. Build hierarchy
      const tree = buildZoneTree(allZones)
      expect(tree.length).toBe(5) // All at root level (no parent relationships)

      // 8. Verify counts
      const counts = countZonesByTravelability(allZones)
      expect(counts.total).toBe(5)
      expect(counts.travelable).toBe(2)
      expect(counts.nonTravelable).toBe(3)
    })
  })
})
