"""Logging configuration for FastAPI application."""
import logging
import sys
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

# Log directory and file
LOG_DIR = Path("/logs")
LOG_FILE = LOG_DIR / "app.log"


class LocalTimeFormatter(logging.Formatter):
    """Custom formatter that uses Europe/Paris timezone."""

    def formatTime(self, record, datefmt=None):
        """Format time with Europe/Paris timezone."""
        dt = datetime.fromtimestamp(record.created, tz=ZoneInfo("Europe/Paris"))
        if datefmt:
            return dt.strftime(datefmt)
        return dt.isoformat()


class SQLAlchemyFilter(logging.Filter):
    """Filter to exclude SQLAlchemy query logs unless DEBUG_SQL is enabled."""

    def __init__(self, debug_sql: bool = False):
        super().__init__()
        self.debug_sql = debug_sql

    def filter(self, record):
        # If DEBUG_SQL is True, allow all logs
        if self.debug_sql:
            return True

        # Filter out SQLAlchemy query logs (engine, pool, orm)
        if record.name.startswith('sqlalchemy.engine') or \
           record.name.startswith('sqlalchemy.pool') or \
           record.name.startswith('sqlalchemy.orm'):
            return False

        return True


def setup_logging(debug_sql: bool = False):
    """Configure logging to write to both file and stdout.

    Args:
        debug_sql: If True, show SQLAlchemy query logs. If False, hide them.
    """
    # Create log directory if it doesn't exist
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # Define log format
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Create formatters with local timezone
    formatter = LocalTimeFormatter(log_format, datefmt=date_format)

    # Create SQL filter
    sql_filter = SQLAlchemyFilter(debug_sql=debug_sql)

    # File handler - writes to /logs/app.log
    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    file_handler.addFilter(sql_filter)

    # Console handler - writes to stdout
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(sql_filter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # Remove existing handlers to avoid duplicates
    root_logger.handlers.clear()

    # Add our handlers
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Configure all application loggers to propagate to root
    app_loggers = [
        "src",
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "fastapi",
        "sqlalchemy",
    ]

    for logger_name in app_loggers:
        logger = logging.getLogger(logger_name)
        logger.handlers.clear()
        logger.setLevel(logging.DEBUG)
        logger.propagate = True

    debug_status = "enabled" if debug_sql else "disabled"
    logging.info("Logging configured - writing to %s and stdout (SQL queries: %s)", LOG_FILE, debug_status)
