/**
 * Cost estimation for Claude API usage
 * Estimates based on typical image analysis token usage
 */

// Approximate costs per API call (in USD)
// Based on Claude pricing for image analysis
const MAIN_AGENT_COST = 0.15 // Opus for main detection
const SUB_AGENT_COST = 0.05 // Sonnet for racking analysis

/**
 * Cost estimate breakdown
 */
export interface CostEstimate {
  /** Cost for main agent (coarse detection) */
  mainAgent: number
  /** Cost for all sub-agents */
  subAgents: number
  /** Total estimated cost */
  total: number
  /** Human-readable formatted cost */
  formatted: string
  /** Number of sub-agents estimated */
  estimatedSubAgents: number
}

/**
 * Estimate the cost of running agentic analysis
 *
 * @param imageSize - Size of the image in bytes
 * @param estimatedRackingAreas - Number of racking areas expected (if known)
 * @returns Cost estimate breakdown
 */
export function estimateAnalysisCost(
  imageSize: number,
  estimatedRackingAreas?: number
): CostEstimate {
  // Estimate number of racking areas if not provided
  // Larger images tend to have more racking areas
  let subAgentCount: number
  if (estimatedRackingAreas !== undefined) {
    subAgentCount = estimatedRackingAreas
  } else {
    // Heuristic: estimate based on image size
    // Small images (<500KB): likely 0-1 racking areas
    // Medium images (500KB-2MB): likely 1-3 racking areas
    // Large images (>2MB): likely 2-5 racking areas
    if (imageSize < 500 * 1024) {
      subAgentCount = 1
    } else if (imageSize < 2 * 1024 * 1024) {
      subAgentCount = 2
    } else {
      subAgentCount = 3
    }
  }

  const mainAgentCost = MAIN_AGENT_COST
  const subAgentsCost = SUB_AGENT_COST * subAgentCount
  const total = mainAgentCost + subAgentsCost

  return {
    mainAgent: mainAgentCost,
    subAgents: subAgentsCost,
    total,
    formatted: formatCost(total),
    estimatedSubAgents: subAgentCount,
  }
}

/**
 * Format cost as a currency string
 */
export function formatCost(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/**
 * Get a cost range estimate (min-max)
 * @param _imageSize - Image size (unused, for future enhancement)
 */
export function estimateCostRange(_imageSize: number): {
  min: CostEstimate
  max: CostEstimate
} {
  // Minimum: main agent only, no subdivision needed
  const min: CostEstimate = {
    mainAgent: MAIN_AGENT_COST,
    subAgents: 0,
    total: MAIN_AGENT_COST,
    formatted: formatCost(MAIN_AGENT_COST),
    estimatedSubAgents: 0,
  }

  // Maximum: main agent + 5 sub-agents (typical max for complex warehouses)
  const maxSubAgents = 5
  const maxTotal = MAIN_AGENT_COST + SUB_AGENT_COST * maxSubAgents
  const max: CostEstimate = {
    mainAgent: MAIN_AGENT_COST,
    subAgents: SUB_AGENT_COST * maxSubAgents,
    total: maxTotal,
    formatted: formatCost(maxTotal),
    estimatedSubAgents: maxSubAgents,
  }

  return { min, max }
}

/**
 * Get descriptive text for cost warning
 */
export function getCostWarningText(estimate: CostEstimate): string {
  if (estimate.estimatedSubAgents === 0) {
    return `This analysis will cost approximately ${estimate.formatted} using the main AI agent.`
  }
  return `This analysis will cost approximately ${estimate.formatted} (main agent: ${formatCost(estimate.mainAgent)}, ${estimate.estimatedSubAgents} sub-agent${estimate.estimatedSubAgents !== 1 ? 's' : ''}: ${formatCost(estimate.subAgents)}).`
}
