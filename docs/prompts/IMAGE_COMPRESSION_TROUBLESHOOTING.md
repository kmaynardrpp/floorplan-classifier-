# Image Compression Troubleshooting

## Problem Summary

When analyzing floorplan images via Claude's API, large images fail with size/dimension errors.

## Claude API Limits (Confirmed)

1. **5MB file size limit** - `image exceeds 5 MB maximum: X bytes > 5242880 bytes`
2. **8000 pixel dimension limit** - `At least one of the image dimensions exceed max allowed size: 8000 pixels`

These are hard limits enforced by Claude's API, not bugs in our code.

## Test Image

Location: `docs/SAV3_IMAGE_07.15.2022_JD.jpg`
- Original size: ~10MB
- After base64 encoding: ~13.8MB (base64 adds ~33% overhead)

## Current Implementation

### File: `src/utils/imageCompression.ts`

```typescript
const TARGET_MAX_BYTES = 3 * 1024 * 1024 // 3MB target (5MB limit)
const MAX_DIMENSION = 4000 // pixels (8000 limit, but lower for file size)
```

**Compression Strategy:**
1. First scales image down if any dimension > 4000 pixels
2. Then tries progressively smaller scales: [1.0, 0.75, 0.5, 0.4, 0.3, 0.25, 0.2]
3. At each scale, tries JPEG qualities: [0.85, 0.7, 0.5, 0.3]
4. Stops when result is under 3MB
5. Last resort: 15% scale at 0.2 quality

### File: `src/hooks/useAnalysis.ts`

Calls compression before API request:
```typescript
let imageToAnalyze = dataUrl
if (needsCompression(dataUrl)) {
  imageToAnalyze = await compressImageForApi(dataUrl)
}
```

## Error History

1. `image exceeds 5 MB maximum: 13840048 bytes > 5242880 bytes` - Original 10MB image
2. `At least one of the image dimensions exceed max allowed size: 8000 pixels` - Added dimension check
3. `image exceeds 5 MB maximum: 5867880 bytes > 5242880 bytes` - Still too big after first fix

## Changes Made

1. Increased upload limit from 20MB to 50MB (`fileValidation.ts`)
2. Created `imageCompression.ts` with Canvas-based compression
3. Integrated compression into `useAnalysis.ts` hook
4. Reduced MAX_DIMENSION from 8000 to 4000 pixels
5. Reduced TARGET_MAX_BYTES from 4.5MB to 3MB

## Testing Instructions

1. Dev server running at: `http://localhost:5173/`
2. Upload test image: `docs/SAV3_IMAGE_07.15.2022_JD.jpg`
3. Click "Analyze" button
4. Check browser console (F12) for compression logs:
   ```
   Compressing image for API...
   Original image: 8500x6500
   Original size: 9.92MB
   Scaled to fit max dimension: 4000x3058
   Trying 4000x3058 @ quality 0.85: X.XXMB
   ...
   ✓ Compressed to X.XXMB
   ```

## What To Verify

1. Compression logs appear in console
2. Final compressed size is under 3MB
3. API accepts the compressed image
4. Analysis completes successfully

## Files Modified

- `src/utils/imageCompression.ts` - NEW: compression utility
- `src/utils/fileValidation.ts` - increased max upload to 50MB
- `src/utils/fileValidation.test.ts` - fixed large file mock tests
- `src/hooks/useAnalysis.ts` - integrated compression before API call

## Potential Issues To Check

1. Is `needsCompression()` returning true for the test image?
2. Is `compressImageForApi()` actually being called?
3. What size is the final compressed image?
4. Is the compressed image being passed to `analyzeFloorplan()`?

## Dev Server

Started with `npm run dev`, running at `http://localhost:5173/`
