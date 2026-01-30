"""
Pytest configuration for the preprocessing test suite.

This file ensures the src directory is in the Python path
so tests can import from src.* modules.
"""

import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
