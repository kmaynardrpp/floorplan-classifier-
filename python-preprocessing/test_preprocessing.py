"""
Test script for floorplan preprocessing
"""

import cv2
import json
import sys
import os
import numpy as np

# Add src to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.pipeline import preprocess_floorplan, result_to_json, PreprocessingConfig


class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder for numpy types"""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

def main():
    # Load the test image
    image_path = "../docs/SAV3_IMAGE_07.15.2022_JD.jpg"

    print(f"Loading image: {image_path}")
    image = cv2.imread(image_path)

    if image is None:
        print(f"ERROR: Could not load image from {image_path}")
        return 1

    print(f"Image loaded: {image.shape[1]}x{image.shape[0]} pixels")

    # Run preprocessing
    print("\nRunning preprocessing pipeline...")
    config = PreprocessingConfig(
        density_window=50,
        min_region_area=5000,
        min_line_length=30,
        line_cluster_distance=100.0,
    )

    result = preprocess_floorplan(image, config)

    # Convert to JSON
    output = result_to_json(result, include_visualizations=False)

    # Print summary
    print("\n" + "="*60)
    print("PREPROCESSING RESULTS")
    print("="*60)

    # Edge detection
    edge_stats = output["edge_detection"]["stats"]
    print(f"\n[Edge Detection]")
    print(f"  Total lines detected: {edge_stats['total_lines']}")
    print(f"  Horizontal lines: {edge_stats['horizontal_lines']}")
    print(f"  Vertical lines: {edge_stats['vertical_lines']}")
    print(f"  Boundary contours: {edge_stats['total_contours']}")

    # Region segmentation
    seg_stats = output["region_segmentation"]["stats"]
    print(f"\n[Region Segmentation]")
    print(f"  Total regions: {seg_stats['total_regions']}")
    print(f"  Dense regions (racking): {seg_stats['dense_regions']}")
    print(f"  Sparse regions (aisles): {seg_stats['sparse_regions']}")
    print(f"  Total dense area: {seg_stats['total_dense_area']:,} px²")
    print(f"  Total sparse area: {seg_stats['total_sparse_area']:,} px²")

    # Line detection
    line_stats = output["line_detection"]["stats"]
    print(f"\n[Line Detection]")
    print(f"  Total lines: {line_stats['total_lines']}")
    print(f"  Line clusters: {line_stats['total_clusters']}")
    print(f"  Horizontal clusters: {line_stats['horizontal_clusters']}")
    print(f"  Vertical clusters: {line_stats['vertical_clusters']}")
    print(f"  Detected aisles: {line_stats['total_aisles']}")

    # Gemini hints summary
    hints = output["gemini_hints"]
    print(f"\n[Gemini Hints]")
    print(f"  Suggested zone polygons: {len(hints['detected_boundaries']['suggested_zone_polygons'])}")
    print(f"  Dense region hints: {len(hints['region_analysis']['dense_regions'])}")
    print(f"  Sparse region hints: {len(hints['region_analysis']['sparse_regions'])}")
    print(f"  Racking section hints: {len(hints['racking_analysis']['racking_sections'])}")
    print(f"  Aisle hints: {len(hints['racking_analysis']['detected_aisles'])}")

    print(f"\n[Recommendations]")
    for rec in hints["recommendations"]:
        print(f"  - {rec}")

    # Print some sample data
    print("\n" + "="*60)
    print("SAMPLE DATA")
    print("="*60)

    # Sample contours
    if output["edge_detection"]["contours"]:
        print("\n[Sample Boundary Contours]")
        for i, contour in enumerate(output["edge_detection"]["contours"][:3]):
            print(f"  Contour {i+1}: {len(contour['vertices'])} vertices, area={contour['area']:,} px²")

    # Sample line clusters
    if output["line_detection"]["line_clusters"]:
        print("\n[Sample Line Clusters]")
        for cluster in output["line_detection"]["line_clusters"][:5]:
            print(f"  Cluster {cluster['id']}: {cluster['orientation']}, {cluster['line_count']} lines, spacing={cluster['average_spacing']:.1f}px")

    # Sample aisles
    if output["line_detection"]["aisle_candidates"]:
        print("\n[Sample Detected Aisles]")
        for aisle in output["line_detection"]["aisle_candidates"][:5]:
            print(f"  Aisle {aisle['id']}: {aisle['orientation']}, width={aisle['width']:.1f}px")

    # Save full output to JSON file
    output_path = "test_output.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, cls=NumpyEncoder)
    print(f"\nFull output saved to: {output_path}")

    # Save visualizations
    print("\nSaving visualizations...")
    cv2.imwrite("viz_boundary_mask.png", result.visualizations["boundary_mask"])
    cv2.imwrite("viz_density_map.png", result.visualizations["density_map"])
    cv2.imwrite("viz_orientation_map.png", result.visualizations["orientation_map"])
    print("  - viz_boundary_mask.png")
    print("  - viz_density_map.png")
    print("  - viz_orientation_map.png")

    print("\n" + "="*60)
    print("PREPROCESSING COMPLETE")
    print("="*60)

    return 0

if __name__ == "__main__":
    sys.exit(main())
