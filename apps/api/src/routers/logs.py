"""Admin logs router."""
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ..middleware import require_permission
from ..models import User
from ..schemas import APIResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

LOG_FILE = Path("/logs/app.log")


@router.get("/logs", response_model=APIResponse)
async def get_application_logs(
    level: Optional[str] = Query(
        None, description="Filter by log level (ERROR, WARNING, INFO)"
    ),
    lines: int = Query(
        100, description="Number of lines to retrieve", ge=1, le=1000
    ),
    _current_user: User = Depends(require_permission('admin_dashboard'))
) -> APIResponse:
    """Get application logs (requires admin_dashboard permission)."""
    logs = []
    all_modules = set()

    if LOG_FILE.exists():
        try:
            # Read all lines from the file
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                all_lines = f.readlines()

            # First pass: extract all unique modules from entire file
            for line in all_lines:
                line = line.rstrip()
                if not line:
                    continue
                parts = line.split(" - ", 3)
                if len(parts) >= 4:
                    timestamp_part = parts[0]
                    if len(timestamp_part) >= 10 and timestamp_part[4] == '-' and timestamp_part[7] == '-':
                        module = parts[1]
                        if module:
                            all_modules.add(module)

            # Get the last N*2 lines (in case filtering removes many)
            recent_lines = (
                all_lines[-(lines * 2):] if len(all_lines) > lines * 2
                else all_lines
            )

            current_entry = None

            for line in recent_lines:
                line = line.rstrip()
                if not line:
                    continue

                # Try to parse as a new log entry (starts with timestamp)
                # Format: "2025-10-09 22:22:42 - module - LEVEL - message"
                parts = line.split(" - ", 3)

                # Check if this is a new log entry (has at least timestamp - module - level - message)
                is_new_entry = False
                if len(parts) >= 4:
                    # Verify first part looks like a timestamp (starts with YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
                    timestamp_part = parts[0]
                    if len(timestamp_part) >= 10 and timestamp_part[4] == '-' and timestamp_part[7] == '-':
                        is_new_entry = True

                if is_new_entry:
                    # Save previous entry if exists
                    if current_entry:
                        # Filter by level if specified
                        if not level or current_entry["level"] == level.upper():
                            logs.append(current_entry)

                    # Start new entry
                    timestamp = parts[0]
                    module = parts[1]
                    log_level = parts[2].upper()
                    message = parts[3]

                    # Normalize log level
                    if log_level not in ["INFO", "WARNING", "ERROR", "CRITICAL", "DEBUG"]:
                        log_level = "INFO"

                    current_entry = {
                        "timestamp": timestamp,
                        "level": log_level,
                        "module": module,
                        "message": message
                    }
                else:
                    # This is a continuation line, append to current entry
                    if current_entry:
                        current_entry["message"] += "\n" + line

            # Don't forget to add the last entry
            if current_entry:
                if not level or current_entry["level"] == level.upper():
                    logs.append(current_entry)

            # Get only the last N logs after filtering
            logs = logs[-lines:]

        except FileNotFoundError:
            logger.warning("Log file not found: %s", LOG_FILE)
        except Exception as e:
            logger.error("Error reading log file: %s", str(e))

    # If no logs found, show informative message
    if not logs:
        logs = [
            {
                "timestamp": datetime.utcnow().isoformat(),
                "level": "INFO",
                "message": (
                    f"Log file not found or empty: {LOG_FILE}. "
                    "Logs will appear here once the application starts logging."
                )
            }
        ]

    return APIResponse(
        success=True,
        data={
            "logs": logs,
            "total": len(logs),
            "level_filter": level,
            "lines_requested": lines,
            "all_modules": sorted(list(all_modules))
        }
    )
