import { describe, it, expect } from 'vitest'
import {
  PREDEFINED_ZONE_TYPES,
  TRAVELABLE_ZONE_TYPES,
  COARSE_ZONE_TYPES,
  isTravelable,
  createZone,
  type CoarseZone,
  type SubAgentOutput,
  type BoundingBox,
} from './zone'

describe('Zone Types', () => {
  describe('PREDEFINED_ZONE_TYPES', () => {
    it('should include all legacy zone types', () => {
      const legacyTypes = [
        'aisle',
        'travel_lane',
        'parking_lot',
        'open_floor',
        'loading_dock',
        'intersection',
        'restricted',
        'pick_area',
        'drop_area',
        'staging_area',
        'charging_station',
        'hazard_zone',
      ]
      for (const type of legacyTypes) {
        expect(PREDEFINED_ZONE_TYPES).toContain(type)
      }
    })

    it('should include aisle_path (new)', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('aisle_path')
    })

    it('should include racking (new)', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('racking')
    })

    it('should include racking_area (new)', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('racking_area')
    })

    it('should include conveyor_area (new)', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('conveyor_area')
    })

    it('should include docking_area (new)', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('docking_area')
    })

    it('should include administrative (new)', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('administrative')
    })

    it('should include storage_floor (new)', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('storage_floor')
    })

    it('should keep aisle distinct from aisle_path', () => {
      expect(PREDEFINED_ZONE_TYPES).toContain('aisle')
      expect(PREDEFINED_ZONE_TYPES).toContain('aisle_path')
      expect(PREDEFINED_ZONE_TYPES.indexOf('aisle')).not.toBe(
        PREDEFINED_ZONE_TYPES.indexOf('aisle_path')
      )
    })
  })

  describe('TRAVELABLE_ZONE_TYPES', () => {
    it('should include travel_lane', () => {
      expect(TRAVELABLE_ZONE_TYPES).toContain('travel_lane')
    })

    it('should include aisle_path', () => {
      expect(TRAVELABLE_ZONE_TYPES).toContain('aisle_path')
    })

    it('should include parking_lot', () => {
      expect(TRAVELABLE_ZONE_TYPES).toContain('parking_lot')
    })

    it('should not include racking', () => {
      expect(TRAVELABLE_ZONE_TYPES).not.toContain('racking')
    })

    it('should not include aisle (context-dependent)', () => {
      expect(TRAVELABLE_ZONE_TYPES).not.toContain('aisle')
    })
  })

  describe('isTravelable', () => {
    it('should return true for travel_lane', () => {
      expect(isTravelable('travel_lane')).toBe(true)
    })

    it('should return true for aisle_path', () => {
      expect(isTravelable('aisle_path')).toBe(true)
    })

    it('should return true for parking_lot', () => {
      expect(isTravelable('parking_lot')).toBe(true)
    })

    it('should return false for racking', () => {
      expect(isTravelable('racking')).toBe(false)
    })

    it('should return false for racking_area', () => {
      expect(isTravelable('racking_area')).toBe(false)
    })

    it('should return false for docking_area', () => {
      expect(isTravelable('docking_area')).toBe(false)
    })

    it('should return false for conveyor_area', () => {
      expect(isTravelable('conveyor_area')).toBe(false)
    })

    it('should return false for administrative', () => {
      expect(isTravelable('administrative')).toBe(false)
    })

    it('should return false for storage_floor', () => {
      expect(isTravelable('storage_floor')).toBe(false)
    })

    it('should return false for aisle (context-dependent)', () => {
      expect(isTravelable('aisle')).toBe(false)
    })

    it('should return false for open_floor (context-dependent)', () => {
      expect(isTravelable('open_floor')).toBe(false)
    })

    it('should return false for unknown types', () => {
      expect(isTravelable('unknown_type')).toBe(false)
      expect(isTravelable('')).toBe(false)
    })
  })

  describe('COARSE_ZONE_TYPES', () => {
    it('should include all coarse detection zone types', () => {
      const expectedTypes = [
        'travel_lane',
        'racking_area',
        'parking_lot',
        'conveyor_area',
        'docking_area',
        'administrative',
        'storage_floor',
        'open_floor',
      ]
      for (const type of expectedTypes) {
        expect(COARSE_ZONE_TYPES).toContain(type)
      }
    })

    it('should not include fine-grained types like aisle_path', () => {
      expect(COARSE_ZONE_TYPES).not.toContain('aisle_path')
    })

    it('should not include fine-grained types like racking', () => {
      expect(COARSE_ZONE_TYPES).not.toContain('racking')
    })
  })
})

describe('CoarseZone Interface', () => {
  it('should accept valid CoarseZone with needsSubdivision=true', () => {
    const zone: CoarseZone = {
      id: 'test-id',
      name: 'Test Racking Area',
      type: 'racking_area',
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      confidence: 0.9,
      needsSubdivision: true,
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    }
    expect(zone.needsSubdivision).toBe(true)
    expect(zone.type).toBe('racking_area')
  })

  it('should accept valid CoarseZone with needsSubdivision=false', () => {
    const zone: CoarseZone = {
      id: 'test-id',
      name: 'Travel Lane',
      type: 'travel_lane',
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
      confidence: 0.95,
      needsSubdivision: false,
      boundingBox: { x: 0, y: 0, width: 100, height: 50 },
    }
    expect(zone.needsSubdivision).toBe(false)
  })

  it('should require boundingBox with all properties', () => {
    const boundingBox: BoundingBox = {
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    }
    expect(boundingBox.x).toBe(10)
    expect(boundingBox.y).toBe(20)
    expect(boundingBox.width).toBe(100)
    expect(boundingBox.height).toBe(200)
  })
})

describe('SubAgentOutput Interface', () => {
  it('should accept horizontal direction', () => {
    const output: SubAgentOutput = {
      direction: 'horizontal',
      subdivisions: [],
    }
    expect(output.direction).toBe('horizontal')
  })

  it('should accept vertical direction', () => {
    const output: SubAgentOutput = {
      direction: 'vertical',
      subdivisions: [],
    }
    expect(output.direction).toBe('vertical')
  })

  it('should accept subdivisions array', () => {
    const output: SubAgentOutput = {
      direction: 'horizontal',
      subdivisions: [
        {
          type: 'aisle_path',
          name: 'Aisle 1',
          vertices: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 100 },
            { x: 0, y: 100 },
          ],
          confidence: 0.85,
          travelable: true,
        },
        {
          type: 'racking',
          name: 'Rack Row 1',
          vertices: [
            { x: 50, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 50, y: 100 },
          ],
          confidence: 0.9,
          travelable: false,
        },
      ],
    }
    expect(output.subdivisions).toHaveLength(2)
    expect(output.subdivisions[0]!.type).toBe('aisle_path')
    expect(output.subdivisions[0]!.travelable).toBe(true)
    expect(output.subdivisions[1]!.type).toBe('racking')
    expect(output.subdivisions[1]!.travelable).toBe(false)
  })

  it('should accept optional analysisNotes', () => {
    const output: SubAgentOutput = {
      direction: 'vertical',
      subdivisions: [],
      analysisNotes: 'Detected 3 aisle paths running north-south',
    }
    expect(output.analysisNotes).toBe(
      'Detected 3 aisle paths running north-south'
    )
  })
})

describe('createZone', () => {
  it('should create zone with default metadata', () => {
    const zone = createZone({
      id: 'test-id',
      name: 'Test Zone',
      type: 'aisle_path',
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    })

    expect(zone.id).toBe('test-id')
    expect(zone.name).toBe('Test Zone')
    expect(zone.type).toBe('aisle_path')
    expect(zone.source).toBe('manual')
    expect(zone.confidence).toBeNull()
    expect(zone.metadata.isVisible).toBe(true)
    expect(zone.metadata.isLocked).toBe(false)
  })

  it('should allow overriding defaults', () => {
    const zone = createZone({
      id: 'test-id',
      name: 'AI Zone',
      type: 'racking',
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      source: 'ai',
      confidence: 0.85,
      metadata: {
        color: null,
        opacity: 0.5,
        isVisible: true,
        isLocked: false,
        description: '',
        customProperties: {
          parentZoneId: 'parent-123',
          direction: 'horizontal',
          travelable: 'false',
        },
      },
    })

    expect(zone.source).toBe('ai')
    expect(zone.confidence).toBe(0.85)
    expect(zone.metadata.customProperties.parentZoneId).toBe('parent-123')
    expect(zone.metadata.customProperties.direction).toBe('horizontal')
    expect(zone.metadata.customProperties.travelable).toBe('false')
  })
})
