"""
Command-line interface for the preprocessing module.

Task 1.9: Create Basic CLI Entry Point
Task 2.8: Add CLI Command for Phase 0

Usage:
    python -m src color_boundary detect <image_path> [--output json|visual]
    python -m src phase0 <image_path> [--output json|visual] [--fast-track-threshold 0.8]
    python -m src --help
"""

import argparse
import json
import sys
import cv2
import numpy as np
from pathlib import Path


def setup_argparse() -> argparse.ArgumentParser:
    """Set up argument parser."""
    parser = argparse.ArgumentParser(
        prog="preprocessing",
        description="Floorplan image preprocessing tools",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # color_boundary command
    cb_parser = subparsers.add_parser(
        "color_boundary",
        help="Color boundary detection (Phase 0)",
    )
    cb_subparsers = cb_parser.add_subparsers(dest="action", help="Actions")

    # color_boundary detect
    detect_parser = cb_subparsers.add_parser(
        "detect",
        help="Detect color boundaries in an image",
    )
    detect_parser.add_argument(
        "image_path",
        type=str,
        help="Path to the input image",
    )
    detect_parser.add_argument(
        "--output",
        "-o",
        choices=["json", "visual"],
        default="json",
        help="Output format (default: json)",
    )
    detect_parser.add_argument(
        "--output-path",
        type=str,
        help="Output file path (for visual mode)",
    )
    detect_parser.add_argument(
        "--min-area",
        type=int,
        default=1000,
        help="Minimum contour area in pixels (default: 1000)",
    )

    # phase0 command (Task 2.8)
    phase0_parser = subparsers.add_parser(
        "phase0",
        help="Run Phase 0 color boundary detection with fast-track evaluation",
    )
    phase0_parser.add_argument(
        "image_path",
        type=str,
        help="Path to the input image",
    )
    phase0_parser.add_argument(
        "--output",
        "-o",
        choices=["json", "visual"],
        default="json",
        help="Output format (default: json)",
    )
    phase0_parser.add_argument(
        "--output-path",
        type=str,
        help="Output file path (for visual mode)",
    )
    phase0_parser.add_argument(
        "--fast-track-threshold",
        type=float,
        default=0.8,
        help="Coverage threshold for fast-track mode (default: 0.8)",
    )
    phase0_parser.add_argument(
        "--min-boundaries",
        type=int,
        default=3,
        help="Minimum boundaries for fast-track (default: 3)",
    )
    phase0_parser.add_argument(
        "--colors",
        type=str,
        default="orange,yellow,red,blue",
        help="Comma-separated list of colors to detect (default: orange,yellow,red,blue)",
    )
    phase0_parser.add_argument(
        "--min-area",
        type=int,
        default=1000,
        help="Minimum contour area in pixels (default: 1000)",
    )

    return parser


def cmd_color_boundary_detect(args) -> int:
    """Handle color_boundary detect command."""
    from src.color_boundary.detector import ColorBoundaryDetector

    # Validate input path
    image_path = Path(args.image_path)
    if not image_path.exists():
        print(f"Error: Image not found: {image_path}", file=sys.stderr)
        return 1

    # Load image
    image = cv2.imread(str(image_path))
    if image is None:
        print(f"Error: Could not load image: {image_path}", file=sys.stderr)
        return 1

    # Run detection
    detector = ColorBoundaryDetector(min_contour_area=args.min_area)
    result = detector.detect(image)

    if args.output == "json":
        # Output JSON
        output = result.to_dict()
        print(json.dumps(output, indent=2))

    elif args.output == "visual":
        # Create visualization
        vis = image.copy()

        # Draw boundaries
        for boundary in result.boundaries:
            pts = np.array(boundary.polygon, dtype=np.int32)
            # Color based on detected color
            color_map = {
                "orange": (0, 128, 255),
                "yellow": (0, 255, 255),
                "red": (0, 0, 255),
                "blue": (255, 0, 0),
            }
            color = color_map.get(boundary.color, (0, 255, 0))

            cv2.polylines(vis, [pts], True, color, 2)
            cv2.fillPoly(vis, [pts], color + (50,) if len(color) == 3 else color)

            # Add label
            if len(boundary.polygon) > 0:
                x, y = boundary.polygon[0]
                cv2.putText(
                    vis,
                    f"{boundary.color}: {boundary.area}px",
                    (x, y - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    color,
                    1,
                )

        # Save or show
        output_path = args.output_path
        if output_path is None:
            output_path = str(image_path.stem) + "_boundaries.png"

        cv2.imwrite(output_path, vis)
        print(f"Visualization saved to: {output_path}")

    return 0


def cmd_phase0(args) -> int:
    """Handle phase0 command - run Phase 0 with fast-track evaluation."""
    from src.color_boundary.detector import ColorBoundaryDetector
    from src.config.phase0_config import Phase0Config
    from src.color_boundary.fast_track import should_fast_track, create_fast_track_hints

    # Validate input path
    image_path = Path(args.image_path)
    if not image_path.exists():
        print(f"Error: Image not found: {image_path}", file=sys.stderr)
        return 1

    # Load image
    image = cv2.imread(str(image_path))
    if image is None:
        print(f"Error: Could not load image: {image_path}", file=sys.stderr)
        return 1

    h, w = image.shape[:2]

    # Create Phase 0 config
    config = Phase0Config(
        fast_track_threshold=args.fast_track_threshold,
        min_boundaries_for_fast_track=args.min_boundaries,
        min_contour_area=args.min_area,
    )

    # Run detection
    detector = ColorBoundaryDetector(min_contour_area=args.min_area)
    result = detector.detect(image)

    # Check fast-track eligibility
    fast_track = should_fast_track(result, config)

    if args.output == "json":
        # Build output JSON
        output = {
            "image_dimensions": {"width": w, "height": h},
            "phase0_result": result.to_dict(),
            "fast_track_eligible": fast_track,
            "fast_track_threshold": config.fast_track_threshold,
            "min_boundaries_for_fast_track": config.min_boundaries_for_fast_track,
        }

        if fast_track:
            output["fast_track_hints"] = create_fast_track_hints(result)

        print(json.dumps(output, indent=2))

    elif args.output == "visual":
        # Create visualization
        vis = image.copy()

        # Draw boundaries
        for boundary in result.boundaries:
            pts = np.array(boundary.polygon, dtype=np.int32)
            color_map = {
                "orange": (0, 128, 255),
                "yellow": (0, 255, 255),
                "red": (0, 0, 255),
                "blue": (255, 0, 0),
            }
            color = color_map.get(boundary.color, (0, 255, 0))

            # Fill with transparency
            overlay = vis.copy()
            cv2.fillPoly(overlay, [pts], color)
            cv2.addWeighted(overlay, 0.3, vis, 0.7, 0, vis)

            # Draw outline
            cv2.polylines(vis, [pts], True, color, 2)

            # Add label
            if len(boundary.polygon) > 0:
                x, y = boundary.polygon[0]
                cv2.putText(
                    vis,
                    f"{boundary.color}: {boundary.area}px",
                    (x, y - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    color,
                    1,
                )

        # Add status text
        status = "FAST-TRACK ELIGIBLE" if fast_track else "FULL PIPELINE NEEDED"
        status_color = (0, 255, 0) if fast_track else (0, 165, 255)
        cv2.putText(
            vis,
            f"Phase 0: {status}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            status_color,
            2,
        )
        cv2.putText(
            vis,
            f"Coverage: {result.coverage_ratio:.1%} (threshold: {config.fast_track_threshold:.0%})",
            (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            1,
        )
        cv2.putText(
            vis,
            f"Boundaries: {len(result.boundaries)} (min: {config.min_boundaries_for_fast_track})",
            (10, 85),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            1,
        )

        # Save
        output_path = args.output_path
        if output_path is None:
            output_path = str(image_path.stem) + "_phase0.png"

        cv2.imwrite(output_path, vis)
        print(f"Phase 0 visualization saved to: {output_path}")

    return 0


def main() -> int:
    """Main entry point."""
    parser = setup_argparse()
    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "color_boundary":
        if args.action == "detect":
            return cmd_color_boundary_detect(args)
        else:
            parser.parse_args(["color_boundary", "--help"])
            return 1

    if args.command == "phase0":
        return cmd_phase0(args)

    return 0


if __name__ == "__main__":
    sys.exit(main())
