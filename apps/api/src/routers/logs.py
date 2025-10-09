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

    if LOG_FILE.exists():
        try:
            # Read all lines from the file
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                all_lines = f.readlines()

            # Get the last N*2 lines (in case filtering removes many)
            recent_lines = (
                all_lines[-(lines * 2):] if len(all_lines) > lines * 2
                else all_lines
            )

            for line in recent_lines:
                line = line.strip()
                if not line:
                    continue

                # Parse log format: "2025-01-15 14:30:45 - module - LEVEL - message"
                timestamp = datetime.utcnow().isoformat()
                log_level = "INFO"
                module = ""
                message = line

                try:
                    parts = line.split(" - ", 3)
                    if len(parts) >= 4:
                        # Format: timestamp - module - level - message
                        timestamp = parts[0]
                        module = parts[1]
                        log_level = parts[2].upper()
                        message = parts[3]
                    elif len(parts) == 3:
                        # Fallback: timestamp - module - message
                        timestamp = parts[0]
                        module = parts[1]
                        message = parts[2]
                except (ValueError, IndexError):
                    # If parsing fails, keep the whole line as message
                    pass

                # Normalize log level
                if log_level not in ["INFO", "WARNING", "ERROR", "CRITICAL", "DEBUG"]:
                    log_level = "INFO"

                # Filter by level if specified
                if level and log_level != level.upper():
                    continue

                logs.append({
                    "timestamp": timestamp,
                    "level": log_level,
                    "module": module,
                    "message": message
                })

                # Stop if we have enough logs
                if len(logs) >= lines:
                    break

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
            "lines_requested": lines
        }
    )
