import { describe, it, expect } from 'vitest'
import {
  estimateAnalysisCost,
  formatCost,
  estimateCostRange,
  getCostWarningText,
} from './costEstimator'

describe('Cost Estimator', () => {
  describe('formatCost', () => {
    it('should format cost with dollar sign and two decimals', () => {
      expect(formatCost(0.15)).toBe('$0.15')
      expect(formatCost(1)).toBe('$1.00')
      expect(formatCost(0.05)).toBe('$0.05')
      expect(formatCost(0.25)).toBe('$0.25')
    })

    it('should handle zero cost', () => {
      expect(formatCost(0)).toBe('$0.00')
    })
  })

  describe('estimateAnalysisCost', () => {
    it('should estimate cost for simple floorplan with known racking areas', () => {
      const estimate = estimateAnalysisCost(1000000, 0)

      expect(estimate.mainAgent).toBe(0.15)
      expect(estimate.subAgents).toBe(0)
      expect(estimate.total).toBe(0.15)
      expect(estimate.estimatedSubAgents).toBe(0)
    })

    it('should estimate cost for complex floorplan with multiple racking areas', () => {
      const estimate = estimateAnalysisCost(1000000, 3)

      expect(estimate.mainAgent).toBe(0.15)
      expect(estimate.subAgents).toBeCloseTo(0.15, 2) // 3 * 0.05
      expect(estimate.total).toBeCloseTo(0.30, 2)
      expect(estimate.estimatedSubAgents).toBe(3)
    })

    it('should estimate sub-agents based on image size when not specified', () => {
      // Small image
      const smallEstimate = estimateAnalysisCost(400 * 1024)
      expect(smallEstimate.estimatedSubAgents).toBe(1)

      // Medium image
      const mediumEstimate = estimateAnalysisCost(1.5 * 1024 * 1024)
      expect(mediumEstimate.estimatedSubAgents).toBe(2)

      // Large image
      const largeEstimate = estimateAnalysisCost(3 * 1024 * 1024)
      expect(largeEstimate.estimatedSubAgents).toBe(3)
    })

    it('should format cost as currency string', () => {
      const estimate = estimateAnalysisCost(1000000, 2)

      expect(estimate.formatted).toBe('$0.25')
    })
  })

  describe('estimateCostRange', () => {
    it('should return min and max cost estimates', () => {
      const { min, max } = estimateCostRange(1000000)

      // Min: just main agent
      expect(min.total).toBe(0.15)
      expect(min.estimatedSubAgents).toBe(0)

      // Max: main agent + 5 sub-agents
      expect(max.total).toBe(0.40) // 0.15 + 5*0.05
      expect(max.estimatedSubAgents).toBe(5)
    })

    it('should format costs correctly', () => {
      const { min, max } = estimateCostRange(1000000)

      expect(min.formatted).toBe('$0.15')
      expect(max.formatted).toBe('$0.40')
    })
  })

  describe('getCostWarningText', () => {
    it('should generate text for main agent only', () => {
      const estimate = estimateAnalysisCost(1000000, 0)
      const text = getCostWarningText(estimate)

      expect(text).toContain('$0.15')
      expect(text).toContain('main AI agent')
    })

    it('should generate text with sub-agents', () => {
      const estimate = estimateAnalysisCost(1000000, 2)
      const text = getCostWarningText(estimate)

      expect(text).toContain('$0.25')
      expect(text).toContain('main agent')
      expect(text).toContain('2 sub-agents')
    })

    it('should use singular for one sub-agent', () => {
      const estimate = estimateAnalysisCost(1000000, 1)
      const text = getCostWarningText(estimate)

      expect(text).toContain('1 sub-agent:')
    })
  })
})
