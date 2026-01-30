import { describe, it, expect } from 'vitest'
import {
  ZONE_COLORS,
  DEFAULT_ZONE_COLOR,
  getZoneColor,
  getZoneTypeLabel,
  hexToRgba,
} from './zoneColors'
import { PREDEFINED_ZONE_TYPES } from '@/types/zone'

describe('zoneColors', () => {
  describe('ZONE_COLORS', () => {
    it('should have colors for all predefined zone types', () => {
      for (const type of PREDEFINED_ZONE_TYPES) {
        expect(ZONE_COLORS[type]).toBeDefined()
        expect(ZONE_COLORS[type]).toMatch(/^#[0-9A-F]{6}$/i)
      }
    })

    it('should have correct colors from spec', () => {
      expect(ZONE_COLORS.aisle).toBe('#4CAF50')
      expect(ZONE_COLORS.travel_lane).toBe('#2196F3')
      expect(ZONE_COLORS.restricted).toBe('#F44336')
      expect(ZONE_COLORS.hazard_zone).toBe('#FF5722')
    })
  })

  describe('getZoneColor', () => {
    it('should return correct color for predefined types', () => {
      expect(getZoneColor('aisle')).toBe('#4CAF50')
      expect(getZoneColor('travel_lane')).toBe('#2196F3')
      expect(getZoneColor('parking_lot')).toBe('#9C27B0')
    })

    it('should return default color for unknown types', () => {
      expect(getZoneColor('unknown_type')).toBe(DEFAULT_ZONE_COLOR)
      expect(getZoneColor('custom_zone')).toBe(DEFAULT_ZONE_COLOR)
    })

    it('should use custom types map when provided', () => {
      const customTypes = new Map([
        ['custom_zone', '#123456'],
        ['my_area', '#ABCDEF'],
      ])

      expect(getZoneColor('custom_zone', customTypes)).toBe('#123456')
      expect(getZoneColor('my_area', customTypes)).toBe('#ABCDEF')
    })

    it('should prefer predefined types over custom types', () => {
      const customTypes = new Map([['aisle', '#000000']])
      // Predefined types take precedence
      expect(getZoneColor('aisle', customTypes)).toBe('#4CAF50')
    })
  })

  describe('getZoneTypeLabel', () => {
    it('should convert snake_case to Title Case', () => {
      expect(getZoneTypeLabel('aisle')).toBe('Aisle')
      expect(getZoneTypeLabel('travel_lane')).toBe('Travel Lane')
      expect(getZoneTypeLabel('loading_dock')).toBe('Loading Dock')
      expect(getZoneTypeLabel('charging_station')).toBe('Charging Station')
    })

    it('should handle single word types', () => {
      expect(getZoneTypeLabel('aisle')).toBe('Aisle')
      expect(getZoneTypeLabel('restricted')).toBe('Restricted')
    })

    it('should handle multi-word types', () => {
      expect(getZoneTypeLabel('pick_area')).toBe('Pick Area')
      expect(getZoneTypeLabel('hazard_zone')).toBe('Hazard Zone')
    })
  })

  describe('hexToRgba', () => {
    it('should convert hex to rgba correctly', () => {
      expect(hexToRgba('#FF0000', 1)).toBe('rgba(255, 0, 0, 1)')
      expect(hexToRgba('#00FF00', 0.5)).toBe('rgba(0, 255, 0, 0.5)')
      expect(hexToRgba('#0000FF', 0)).toBe('rgba(0, 0, 255, 0)')
    })

    it('should handle various hex colors', () => {
      expect(hexToRgba('#4CAF50', 0.5)).toBe('rgba(76, 175, 80, 0.5)')
      expect(hexToRgba('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)')
      expect(hexToRgba('#000000', 0.3)).toBe('rgba(0, 0, 0, 0.3)')
    })
  })
})
