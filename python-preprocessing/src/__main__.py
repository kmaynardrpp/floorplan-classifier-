"""
Main entry point for the preprocessing module.

Allows running: python -m src <command>
"""

import sys
from src.cli import main

if __name__ == "__main__":
    sys.exit(main())
