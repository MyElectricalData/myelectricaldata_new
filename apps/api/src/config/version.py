"""Application version management.

Reads version from pyproject.toml at runtime.
"""

import tomllib
from pathlib import Path


def get_version() -> str:
    """Read version from pyproject.toml.

    Falls back to 'unknown' if file cannot be read.
    """
    try:
        # Try multiple possible locations for pyproject.toml
        possible_paths = [
            Path(__file__).parent.parent.parent.parent / "pyproject.toml",  # apps/api/pyproject.toml
            Path("/app/pyproject.toml"),  # Docker container path
        ]

        for pyproject_path in possible_paths:
            if pyproject_path.exists():
                with open(pyproject_path, "rb") as f:
                    data = tomllib.load(f)
                    version: str = data.get("project", {}).get("version", "unknown")
                    return version

        return "unknown"
    except Exception:
        return "unknown"


# Export version as constant for easy import
APP_VERSION = get_version()
