# Floorplan Preprocessing Service

Python-based image preprocessing service that augments Gemini AI analysis for warehouse floorplan zone detection.

## Overview

This service uses OpenCV and scikit-image to analyze floorplan images and extract computer vision features that help Gemini produce more accurate zone detections:

1. **Edge Detection** - Detects orange/brown boundary lines that outline zones
2. **Region Segmentation** - Identifies dense (racking) vs sparse (aisles) areas
3. **Line Detection** - Finds parallel line clusters indicating racking rows
4. **Aisle Detection** - Identifies gaps between racking that are walkable aisles

## Installation

### Using Virtual Environment (Recommended)

```bash
cd python-preprocessing

# Create virtual environment
python -m venv venv

# Activate the virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Global Installation

```bash
cd python-preprocessing
pip install -r requirements.txt
```

## Running the Server

### With Virtual Environment (Recommended)

```bash
# On Windows:
venv\Scripts\python.exe server.py

# On macOS/Linux (after activating venv):
python server.py
```

### Without Virtual Environment

```bash
# From the python-preprocessing directory
python server.py

# Or with uvicorn directly
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

The server will be available at `http://localhost:8000`

## API Endpoints

### Health Check
```
GET /health
```

### Preprocess Image (Base64)
```
POST /preprocess
Content-Type: application/json

{
  "image": "data:image/jpeg;base64,...",
  "include_visualizations": false,
  "use_color_detection": true,
  "use_canny": true,
  "density_window": 50,
  "min_region_area": 5000,
  "min_line_length": 30,
  "line_cluster_distance": 100.0
}
```

### Preprocess Image (File Upload)
```
POST /preprocess/upload
Content-Type: multipart/form-data

file: <image file>
include_visualizations: false
```

### Get Default Config
```
GET /preprocess/config
```

## Response Structure

```json
{
  "edge_detection": {
    "boundary_lines": [...],
    "contours": [...],
    "stats": {...}
  },
  "region_segmentation": {
    "regions": [...],
    "stats": {...}
  },
  "line_detection": {
    "line_clusters": [...],
    "aisle_candidates": [...],
    "stats": {...}
  },
  "gemini_hints": {
    "image_dimensions": {...},
    "detected_boundaries": {...},
    "region_analysis": {...},
    "racking_analysis": {...},
    "recommendations": [...]
  },
  "visualizations": {
    "boundary_mask": "base64...",
    "density_map": "base64...",
    "orientation_map": "base64..."
  }
}
```

## Integration with Frontend

The frontend can call this service before sending images to Gemini:

```typescript
import { preprocessImage, extractGeminiHints } from '@/services/preprocessingApi'
import { getEnhancedZoneDetectionPrompt } from '@/services/geminiPromptWithHints'

// 1. Preprocess the image
const preprocessingResult = await preprocessImage(imageDataUrl)

// 2. Extract hints for Gemini
const hints = extractGeminiHints(preprocessingResult)

// 3. Generate enhanced prompt with hints
const prompt = getEnhancedZoneDetectionPrompt(imageWidth, imageHeight, hints)

// 4. Send to Gemini with the enhanced prompt
```

## Configuration Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `use_color_detection` | `true` | Detect orange/brown boundary lines |
| `use_canny` | `true` | Use Canny edge detection |
| `density_window` | `50` | Window size for density computation |
| `min_region_area` | `5000` | Minimum area for region detection |
| `min_line_length` | `30` | Minimum line length for Hough transform |
| `line_cluster_distance` | `100.0` | Distance threshold for clustering lines |

## Architecture

```
python-preprocessing/
├── requirements.txt       # Python dependencies
├── server.py              # FastAPI server
├── README.md              # This file
└── src/
    ├── __init__.py        # Package exports
    ├── edge_detection.py  # Orange boundary line detection
    ├── region_segmentation.py  # Dense/sparse region analysis
    ├── line_detection.py  # Parallel line and aisle detection
    └── pipeline.py        # Main preprocessing pipeline
```

## How It Works

### 1. Edge Detection
- Uses HSV color filtering to detect orange/brown lines (hue 5-25)
- Applies Canny edge detection for additional edge features
- Finds contours that can serve as zone polygon candidates

### 2. Region Segmentation
- Computes local pixel density using a sliding window
- Detects Sobel gradients to find line-dense areas
- Segments image into dense (racking) and sparse (open) regions

### 3. Line Detection
- Uses Hough Line Transform to detect line segments
- Clusters parallel lines by angle and proximity
- Groups into horizontal and vertical line clusters

### 4. Aisle Detection
- Identifies gaps between adjacent line clusters
- Computes aisle widths and orientations
- Generates centerline coordinates for each aisle
