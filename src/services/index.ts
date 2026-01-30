// Claude API utilities
export {
  ClaudeApiError,
  type ApiErrorType,
  getErrorType,
  extractTextContent,
  parseDataUrl,
  makeClaudeRequest,
  handleApiError,
  ANTHROPIC_API_URL,
  CLAUDE_SONNET_MODEL,
} from './claudeApi'

// Blocked area detection API
export {
  analyzeBlockedAreas,
  analyzeBlockedAreasWithRetry,
  parseBlockedAreasFromResponse,
  BlockedAreaApiError,
  type BlockedAreaResult,
  type BlockedAreaAnalysisResponse,
  type BlockedAreaReason,
} from './blockedAreaApi'

// Retry utilities
export {
  withRetry,
  DEFAULT_RETRY_OPTIONS,
  type RetryOptions,
  type RetryCallback,
} from './retry'

// Analysis cache
export {
  getCachedAnalysis,
  setCachedAnalysis,
  clearAnalysisCache,
} from './analysisCache'

// Image utilities
export {
  cropImage,
  cropImageWithPadding,
  getImageDimensions,
  type CropResult,
} from './imageCropper'

// Coordinate transformation
export {
  transformToFullImage,
  transformToCropped,
  calculateBoundingBox,
  addPaddingToBounds,
  clampBoundsToImage,
  boundsToVertices,
  isPointInBounds,
  scaleVertices,
  createFloorplanTransformer,
  createFloorplanTransformerWithValidation,
  mmToPixels,
  pixelsToMm,
  pixelDistanceToMm,
  mmDistanceToPixels,
  validateScale,
  type ScaleValidationResult,
} from './coordinateTransform'
