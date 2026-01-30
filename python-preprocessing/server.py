"""
FastAPI Server for Floorplan Preprocessing

Provides REST endpoints for preprocessing floorplan images
before sending to Gemini for zone detection.
"""

import json
import logging
from typing import Optional, Any
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import cv2
import numpy as np

import os
import tempfile
from datetime import datetime

from src.pipeline import (
    preprocess_floorplan,
    PreprocessingConfig,
    image_from_base64,
    result_to_json,
    draw_aisles_visualization,
)
from src.coverage_input import CoverageBoundary, load_coverage_from_json


class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles numpy types"""
    def default(self, obj: Any) -> Any:
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Floorplan Preprocessing API",
    description="Image preprocessing service to augment Gemini AI analysis for warehouse floorplan zone detection",
    version="1.0.0",
)

# Add CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CoverageBoundaryModel(BaseModel):
    """Coverage boundary for constraining travel lane detection"""
    uid: str = ""
    coverage_type: str = "2D"  # "1D" or "2D"
    shape: str = "POLYGON"  # "POLYGON" or "POLYLINE"
    points: list = []  # List of {x, y} dicts or [x, y] arrays
    margin: int = 0


class Base64ImageRequest(BaseModel):
    """Request body for base64-encoded image preprocessing"""
    image: str  # Base64-encoded image (with or without data URL prefix)
    include_visualizations: bool = False
    save_aisle_visualization: bool = True  # Save aisle detection visualization to temp folder

    # Optional coverage boundaries for constrained travel lane detection
    # If provided, travel lanes are detected within 2D coverage areas only
    # If not provided, travel lanes are detected anywhere in the image
    coverage_boundaries: Optional[list] = None

    # Optional configuration overrides
    use_color_detection: bool = True
    use_canny: bool = True
    density_window: int = 50
    min_region_area: int = 5000
    min_line_length: int = 30
    line_cluster_distance: float = 100.0


# Directory for saving visualizations
VISUALIZATION_DIR = os.path.join(tempfile.gettempdir(), "floorplan_preprocessing")
os.makedirs(VISUALIZATION_DIR, exist_ok=True)


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(status="healthy", version="1.0.0")


@app.post("/preprocess")
async def preprocess_base64(request: Base64ImageRequest):
    """
    Preprocess a base64-encoded floorplan image.

    Returns preprocessing results including:
    - Edge detection data (boundary contours)
    - Region segmentation (dense vs sparse areas)
    - Line detection (racking rows, aisles)
    - Gemini hints (structured suggestions for AI)
    """
    try:
        logger.info("Received preprocessing request")

        # Decode image
        image = image_from_base64(request.image)
        if image is None:
            raise HTTPException(status_code=400, detail="Failed to decode image")

        logger.info(f"Image decoded: {image.shape[1]}x{image.shape[0]}")

        # Create config from request
        config = PreprocessingConfig(
            use_color_detection=request.use_color_detection,
            use_canny=request.use_canny,
            density_window=request.density_window,
            min_region_area=request.min_region_area,
            min_line_length=request.min_line_length,
            line_cluster_distance=request.line_cluster_distance,
        )

        # Parse coverage boundaries if provided
        coverage_boundaries = None
        if request.coverage_boundaries:
            coverage_boundaries = load_coverage_from_json(request.coverage_boundaries)
            logger.info(f"Loaded {len(coverage_boundaries)} coverage boundaries")

        # Run preprocessing
        result = preprocess_floorplan(image, config, coverage_boundaries)

        # Convert to JSON
        output = result_to_json(result, include_visualizations=request.include_visualizations)

        num_aisles = len(result.line_data.get('aisle_candidates', []))
        num_travel_lanes = len(result.travel_lane_suggestions or [])
        logger.info(
            f"Preprocessing complete: "
            f"{len(result.edge_data.get('contours', []))} contours, "
            f"{len(result.segmentation_data.get('regions', []))} regions, "
            f"{len(result.line_data.get('line_clusters', []))} line clusters, "
            f"{num_aisles} aisles (legacy), "
            f"{num_travel_lanes} travel lanes"
        )

        # Save aisle visualization if requested (save even with 0 aisles for debugging)
        visualization_path = None
        if request.save_aisle_visualization:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            vis_filename = f"aisles_{timestamp}.png"
            visualization_path = os.path.join(VISUALIZATION_DIR, vis_filename)
            draw_aisles_visualization(
                image,
                result.line_data.get('aisle_candidates', []),
                visualization_path,
                content_boundary=result.content_boundary,
            )
            logger.info(f"Saved aisle visualization to: {visualization_path}")
            output["aisle_visualization_path"] = visualization_path

        # Use custom encoder to handle numpy types
        json_str = json.dumps(output, cls=NumpyEncoder)
        return JSONResponse(content=json.loads(json_str))

    except Exception as e:
        logger.error(f"Preprocessing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/preprocess/upload")
async def preprocess_upload(
    file: UploadFile = File(...),
    include_visualizations: bool = False,
    save_aisle_visualization: bool = True,
):
    """
    Preprocess an uploaded floorplan image file.

    Accepts JPEG, PNG image files.
    """
    try:
        logger.info(f"Received file upload: {file.filename}")

        # Read file contents
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Failed to decode uploaded image")

        logger.info(f"Image decoded: {image.shape[1]}x{image.shape[0]}")

        # Run preprocessing with default config
        result = preprocess_floorplan(image)

        # Convert to JSON
        output = result_to_json(result, include_visualizations=include_visualizations)

        num_aisles = len(result.line_data.get('aisle_candidates', []))
        num_travel_lanes = len(result.travel_lane_suggestions or [])
        logger.info(
            f"Preprocessing complete: "
            f"{len(result.edge_data.get('contours', []))} contours, "
            f"{len(result.segmentation_data.get('regions', []))} regions, "
            f"{len(result.line_data.get('line_clusters', []))} line clusters, "
            f"{num_aisles} aisles (legacy), "
            f"{num_travel_lanes} travel lanes"
        )

        # Save aisle visualization if requested (save even with 0 aisles for debugging)
        if save_aisle_visualization:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = "".join(c if c.isalnum() or c in "._-" else "_" for c in (file.filename or "upload"))
            vis_filename = f"aisles_{safe_filename}_{timestamp}.png"
            visualization_path = os.path.join(VISUALIZATION_DIR, vis_filename)
            draw_aisles_visualization(
                image,
                result.line_data.get('aisle_candidates', []),
                visualization_path,
                content_boundary=result.content_boundary,
            )
            logger.info(f"Saved aisle visualization to: {visualization_path}")
            output["aisle_visualization_path"] = visualization_path

        # Use custom encoder to handle numpy types
        json_str = json.dumps(output, cls=NumpyEncoder)
        return JSONResponse(content=json.loads(json_str))

    except Exception as e:
        logger.error(f"Preprocessing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/preprocess/config")
async def get_default_config():
    """Get the default preprocessing configuration"""
    config = PreprocessingConfig()
    return {
        "use_color_detection": config.use_color_detection,
        "use_canny": config.use_canny,
        "density_window": config.density_window,
        "min_region_area": config.min_region_area,
        "min_line_length": config.min_line_length,
        "line_cluster_distance": config.line_cluster_distance,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
