/**
 * Mock API response fixtures for testing
 * Includes fixtures for both old multi-agent analysis and new blocked area detection
 */

import type {
  CoarseZone,
  SubAgentOutput,
  Zone,
  ZoneMetadata,
} from '@/types/zone'
import type { BlockedAreaResult } from '@/services/blockedAreaApi'

/**
 * Default metadata for test zones
 */
const DEFAULT_TEST_METADATA: ZoneMetadata = {
  color: null,
  opacity: 0.5,
  isVisible: true,
  isLocked: false,
  description: '',
  customProperties: {},
}

// ============================================================================
// Coarse Detection Responses
// ============================================================================

/**
 * Mock coarse detection response with racking areas that need subdivision
 */
export const mockCoarseDetectionResponse = {
  zones: [
    {
      id: 'zone-travel-1',
      name: 'Main Travel Lane',
      type: 'travel_lane',
      vertices: [
        { x: 100, y: 100 },
        { x: 800, y: 100 },
        { x: 800, y: 150 },
        { x: 100, y: 150 },
      ],
      confidence: 0.95,
      needsSubdivision: false,
      boundingBox: { x: 100, y: 100, width: 700, height: 50 },
    },
    {
      id: 'zone-racking-1',
      name: 'Racking Area A',
      type: 'racking_area',
      vertices: [
        { x: 100, y: 200 },
        { x: 400, y: 200 },
        { x: 400, y: 500 },
        { x: 100, y: 500 },
      ],
      confidence: 0.88,
      needsSubdivision: true,
      boundingBox: { x: 100, y: 200, width: 300, height: 300 },
    },
    {
      id: 'zone-racking-2',
      name: 'Racking Area B',
      type: 'racking_area',
      vertices: [
        { x: 500, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 500 },
        { x: 500, y: 500 },
      ],
      confidence: 0.91,
      needsSubdivision: true,
      boundingBox: { x: 500, y: 200, width: 300, height: 300 },
    },
    {
      id: 'zone-dock-1',
      name: 'Loading Dock',
      type: 'docking_area',
      vertices: [
        { x: 100, y: 600 },
        { x: 800, y: 600 },
        { x: 800, y: 700 },
        { x: 100, y: 700 },
      ],
      confidence: 0.92,
      needsSubdivision: false,
      boundingBox: { x: 100, y: 600, width: 700, height: 100 },
    },
  ] as CoarseZone[],
}

/**
 * Mock coarse detection with no racking areas (no subdivision needed)
 */
export const mockSimpleCoarseDetectionResponse = {
  zones: [
    {
      id: 'zone-parking-1',
      name: 'Parking Lot',
      type: 'parking_lot',
      vertices: [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 400 },
        { x: 0, y: 400 },
      ],
      confidence: 0.94,
      needsSubdivision: false,
      boundingBox: { x: 0, y: 0, width: 500, height: 400 },
    },
    {
      id: 'zone-admin-1',
      name: 'Office Area',
      type: 'administrative',
      vertices: [
        { x: 0, y: 450 },
        { x: 200, y: 450 },
        { x: 200, y: 600 },
        { x: 0, y: 600 },
      ],
      confidence: 0.89,
      needsSubdivision: false,
      boundingBox: { x: 0, y: 450, width: 200, height: 150 },
    },
  ] as CoarseZone[],
}

// ============================================================================
// Sub-Agent Responses
// ============================================================================

/**
 * Mock sub-agent response with horizontal aisles
 */
export const mockSubAgentResponseHorizontal: SubAgentOutput = {
  direction: 'horizontal',
  subdivisions: [
    {
      name: 'Aisle 1',
      type: 'aisle_path',
      vertices: [
        { x: 10, y: 10 },
        { x: 290, y: 10 },
        { x: 290, y: 40 },
        { x: 10, y: 40 },
      ],
      confidence: 0.92,
      travelable: true,
    },
    {
      name: 'Rack Row A',
      type: 'racking',
      vertices: [
        { x: 10, y: 50 },
        { x: 290, y: 50 },
        { x: 290, y: 130 },
        { x: 10, y: 130 },
      ],
      confidence: 0.89,
      travelable: false,
    },
    {
      name: 'Aisle 2',
      type: 'aisle_path',
      vertices: [
        { x: 10, y: 140 },
        { x: 290, y: 140 },
        { x: 290, y: 170 },
        { x: 10, y: 170 },
      ],
      confidence: 0.91,
      travelable: true,
    },
    {
      name: 'Rack Row B',
      type: 'racking',
      vertices: [
        { x: 10, y: 180 },
        { x: 290, y: 180 },
        { x: 290, y: 260 },
        { x: 10, y: 260 },
      ],
      confidence: 0.88,
      travelable: false,
    },
    {
      name: 'Aisle 3',
      type: 'aisle_path',
      vertices: [
        { x: 10, y: 270 },
        { x: 290, y: 270 },
        { x: 290, y: 290 },
        { x: 10, y: 290 },
      ],
      confidence: 0.9,
      travelable: true,
    },
  ],
}

/**
 * Mock sub-agent response with vertical aisles
 */
export const mockSubAgentResponseVertical: SubAgentOutput = {
  direction: 'vertical',
  subdivisions: [
    {
      name: 'Aisle V1',
      type: 'aisle_path',
      vertices: [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 290 },
        { x: 10, y: 290 },
      ],
      confidence: 0.91,
      travelable: true,
    },
    {
      name: 'Rack Column A',
      type: 'racking',
      vertices: [
        { x: 50, y: 10 },
        { x: 130, y: 10 },
        { x: 130, y: 290 },
        { x: 50, y: 290 },
      ],
      confidence: 0.87,
      travelable: false,
    },
    {
      name: 'Aisle V2',
      type: 'aisle_path',
      vertices: [
        { x: 140, y: 10 },
        { x: 170, y: 10 },
        { x: 170, y: 290 },
        { x: 140, y: 290 },
      ],
      confidence: 0.93,
      travelable: true,
    },
    {
      name: 'Rack Column B',
      type: 'racking',
      vertices: [
        { x: 180, y: 10 },
        { x: 260, y: 10 },
        { x: 260, y: 290 },
        { x: 180, y: 290 },
      ],
      confidence: 0.86,
      travelable: false,
    },
    {
      name: 'Aisle V3',
      type: 'aisle_path',
      vertices: [
        { x: 270, y: 10 },
        { x: 290, y: 10 },
        { x: 290, y: 290 },
        { x: 270, y: 290 },
      ],
      confidence: 0.89,
      travelable: true,
    },
  ],
}

// ============================================================================
// Error Responses
// ============================================================================

/**
 * Mock authentication error response
 */
export const mockAuthErrorResponse = {
  error: {
    type: 'authentication_error',
    message: 'Invalid API key provided',
  },
}

/**
 * Mock rate limit error response
 */
export const mockRateLimitErrorResponse = {
  error: {
    type: 'rate_limit_error',
    message: 'Rate limit exceeded. Please try again later.',
  },
}

/**
 * Mock timeout error
 */
export const mockTimeoutError = new Error('Request timeout after 30000ms')
mockTimeoutError.name = 'TimeoutError'

/**
 * Mock server error response (500)
 */
export const mockServerErrorResponse = {
  error: {
    type: 'server_error',
    message: 'Internal server error',
  },
}

// ============================================================================
// Validation Failure Scenarios
// ============================================================================

/**
 * Mock sub-agent response with validation errors
 */
export const mockInvalidSubAgentResponse = {
  direction: 'diagonal', // Invalid direction
  subdivisions: [
    {
      id: 'bad-zone',
      name: 'Invalid Zone',
      type: 'aisle_path',
      vertices: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ], // Only 2 vertices - invalid
      confidence: 1.5, // Invalid confidence > 1
    },
  ],
}

/**
 * Mock sub-agent response with missing aisle_path
 */
export const mockNoAislePathResponse: SubAgentOutput = {
  direction: 'horizontal',
  subdivisions: [
    {
      name: 'Rack Only',
      type: 'racking',
      vertices: [
        { x: 10, y: 10 },
        { x: 290, y: 10 },
        { x: 290, y: 290 },
        { x: 10, y: 290 },
      ],
      confidence: 0.85,
      travelable: false,
    },
  ],
}

/**
 * Mock sub-agent response with empty subdivisions
 */
export const mockEmptySubdivisionsResponse = {
  direction: 'horizontal',
  subdivisions: [],
}

// ============================================================================
// Partial Failure Scenarios
// ============================================================================

/**
 * Mock scenario where one sub-agent succeeds and one fails
 */
export const mockPartialFailureScenario = {
  successfulZoneId: 'zone-racking-1',
  failedZoneId: 'zone-racking-2',
  successResponse: mockSubAgentResponseHorizontal,
  failureError: new Error('Sub-agent timeout for zone-racking-2'),
}

// ============================================================================
// Complete Analysis Results
// ============================================================================

/**
 * Mock final merged zones after successful analysis
 */
const now = new Date().toISOString()

export const mockFinalMergedZones: Zone[] = [
  {
    id: 'zone-travel-1',
    name: 'Main Travel Lane',
    type: 'travel_lane',
    vertices: [
      { x: 100, y: 100 },
      { x: 800, y: 100 },
      { x: 800, y: 150 },
      { x: 100, y: 150 },
    ],
    confidence: 0.95,
    metadata: {
      ...DEFAULT_TEST_METADATA,
      customProperties: {
        travelable: 'true',
      },
    },
    source: 'ai',
    createdAt: now,
    updatedAt: now,
  },
  // Subdivided zones from racking area 1
  {
    id: 'merged-aisle-1',
    name: 'Aisle 1',
    type: 'aisle_path',
    vertices: [
      { x: 110, y: 210 },
      { x: 390, y: 210 },
      { x: 390, y: 240 },
      { x: 110, y: 240 },
    ],
    confidence: 0.92,
    metadata: {
      ...DEFAULT_TEST_METADATA,
      customProperties: {
        parentZoneId: 'zone-racking-1',
        direction: 'horizontal',
        travelable: 'true',
      },
    },
    source: 'ai',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'merged-rack-1',
    name: 'Rack Row A',
    type: 'racking',
    vertices: [
      { x: 110, y: 250 },
      { x: 390, y: 250 },
      { x: 390, y: 330 },
      { x: 110, y: 330 },
    ],
    confidence: 0.89,
    metadata: {
      ...DEFAULT_TEST_METADATA,
      customProperties: {
        parentZoneId: 'zone-racking-1',
        direction: 'horizontal',
        travelable: 'false',
      },
    },
    source: 'ai',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'zone-dock-1',
    name: 'Loading Dock',
    type: 'docking_area',
    vertices: [
      { x: 100, y: 600 },
      { x: 800, y: 600 },
      { x: 800, y: 700 },
      { x: 100, y: 700 },
    ],
    confidence: 0.92,
    metadata: {
      ...DEFAULT_TEST_METADATA,
      customProperties: {
        travelable: 'false',
      },
    },
    source: 'ai',
    createdAt: now,
    updatedAt: now,
  },
]

// ============================================================================
// Raw API Response Strings (as returned from Claude API)
// ============================================================================

/**
 * Raw coarse detection response in markdown format
 */
export const mockRawCoarseDetectionText = `Based on my analysis of the floorplan, I've identified the following zones:

\`\`\`json
{
  "zones": [
    {
      "name": "Main Travel Lane",
      "type": "travel_lane",
      "vertices": [
        {"x": 100, "y": 100},
        {"x": 800, "y": 100},
        {"x": 800, "y": 150},
        {"x": 100, "y": 150}
      ],
      "confidence": 0.95,
      "needsSubdivision": false,
      "boundingBox": {"x": 100, "y": 100, "width": 700, "height": 50}
    },
    {
      "name": "Racking Area A",
      "type": "racking_area",
      "vertices": [
        {"x": 100, "y": 200},
        {"x": 400, "y": 200},
        {"x": 400, "y": 500},
        {"x": 100, "y": 500}
      ],
      "confidence": 0.88,
      "needsSubdivision": true,
      "boundingBox": {"x": 100, "y": 200, "width": 300, "height": 300}
    }
  ]
}
\`\`\`

The main travel lane is a clear path for vehicle movement. The racking area contains multiple rows that should be analyzed separately to identify individual aisles.`

/**
 * Raw sub-agent response in markdown format
 */
export const mockRawSubAgentResponseText = `I've analyzed the cropped racking region and identified the following subdivisions:

\`\`\`json
{
  "direction": "horizontal",
  "subdivisions": [
    {
      "name": "Aisle 1",
      "type": "aisle_path",
      "vertices": [
        {"x": 10, "y": 10},
        {"x": 290, "y": 10},
        {"x": 290, "y": 40},
        {"x": 10, "y": 40}
      ],
      "confidence": 0.92
    },
    {
      "name": "Rack Row A",
      "type": "racking",
      "vertices": [
        {"x": 10, "y": 50},
        {"x": 290, "y": 50},
        {"x": 290, "y": 130},
        {"x": 10, "y": 130}
      ],
      "confidence": 0.89
    }
  ]
}
\`\`\`

The aisles run horizontally through this racking area.`

// ============================================================================
// Helper Functions for Tests
// ============================================================================

/**
 * Creates a mock fetch response for successful coarse detection
 */
export function createMockCoarseDetectionFetch() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text: mockRawCoarseDetectionText }],
      }),
  })
}

/**
 * Creates a mock fetch response for successful sub-agent analysis
 */
export function createMockSubAgentFetch() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text: mockRawSubAgentResponseText }],
      }),
  })
}

/**
 * Creates a mock fetch response for auth error
 */
export function createMockAuthErrorFetch() {
  return Promise.resolve({
    ok: false,
    status: 401,
    json: () => Promise.resolve(mockAuthErrorResponse),
  })
}

/**
 * Creates a mock fetch response for rate limit error
 */
export function createMockRateLimitFetch() {
  return Promise.resolve({
    ok: false,
    status: 429,
    json: () => Promise.resolve(mockRateLimitErrorResponse),
  })
}

/**
 * Creates a mock fetch response for server error
 */
export function createMockServerErrorFetch() {
  return Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve(mockServerErrorResponse),
  })
}

// ============================================================================
// Blocked Area Detection Fixtures (New System)
// ============================================================================

/**
 * Mock blocked area results
 */
export const mockBlockedAreaResults: BlockedAreaResult[] = [
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
]

/**
 * Mock blocked areas API response as JSON
 */
export const mockBlockedAreasResponse = {
  blocked_areas: mockBlockedAreaResults.map((ba) => ({
    ...ba,
    vertices: ba.vertices,
  })),
}

/**
 * Mock empty blocked areas response (clear coverage area)
 */
export const mockEmptyBlockedAreasResponse = {
  blocked_areas: [],
}

/**
 * Raw blocked areas response text (as returned from Claude API)
 */
export const mockRawBlockedAreasText = `I've analyzed the cropped 2D coverage region and found the following blocked areas:

\`\`\`json
${JSON.stringify(mockBlockedAreasResponse, null, 2)}
\`\`\`

The conveyor system runs through the middle of the region. There's also a large racking section on the right side and some fixed equipment in the lower left.`

/**
 * Creates a mock fetch response for blocked area detection
 */
export function createMockBlockedAreasFetch() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text: mockRawBlockedAreasText }],
      }),
  })
}

/**
 * Creates a mock fetch response for empty blocked areas
 */
export function createMockEmptyBlockedAreasFetch() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ blocked_areas: [] }),
          },
        ],
      }),
  })
}
