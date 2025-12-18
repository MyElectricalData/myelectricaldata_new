"""Logging configuration for FastAPI application."""

# Store in Redis with 24h TTL (non-encrypted, for admin viewing)
import asyncio
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor

if TYPE_CHECKING:
    from .services.cache import CacheService

# Thread pool for async Redis operations
_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="redis_log")

# Log directory and file
LOG_DIR = Path("/logs")
LOG_FILE = LOG_DIR / "app.log"

# Redis TTL for logs: 24 hours
LOG_RETENTION_SECONDS = 24 * 60 * 60


class LocalTimeFormatter(logging.Formatter):
    """Custom formatter that uses Europe/Paris timezone and centers the level name."""

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        """Format time with Europe/Paris timezone."""
        dt = datetime.fromtimestamp(record.created, tz=ZoneInfo("Europe/Paris"))
        if datefmt:
            return dt.strftime(datefmt)
        return dt.isoformat()

    def format(self, record: logging.LogRecord) -> str:
        """Format the record with perfectly centered level name."""
        # Custom centering to ensure true symmetry
        levelname = record.levelname
        width = 10
        total_padding = width - len(levelname)

        # Split padding evenly, but put extra space on the LEFT for odd numbers
        # This makes WARNING look centered: "  WARNING  " (2 left, 2 right)
        left_padding = (total_padding + 1) // 2  # Round up
        right_padding = total_padding // 2  # Round down

        record.levelname = " " * left_padding + levelname + " " * right_padding
        return super().format(record)


class SQLAlchemyFilter(logging.Filter):
    """Filter to exclude SQLAlchemy query logs unless DEBUG_SQL is enabled."""

    def __init__(self, debug_sql: bool = False):
        super().__init__()
        self.debug_sql = debug_sql

    def filter(self, record: logging.LogRecord) -> bool:
        # If DEBUG_SQL is True, allow all logs
        if self.debug_sql:
            return True

        # Filter out SQLAlchemy query logs (engine, pool, orm)
        if (
            record.name.startswith("sqlalchemy.engine")
            or record.name.startswith("sqlalchemy.pool")
            or record.name.startswith("sqlalchemy.orm")
        ):
            return False

        return True


class RedisLogHandler(logging.Handler):
    """Handler that stores logs in Redis with 24-hour retention."""

    def __init__(self, cache_service: "CacheService", redis_url: str) -> None:
        super().__init__()
        self.cache_service = cache_service
        self.redis_url = redis_url

    def emit(self, record: logging.LogRecord) -> None:
        """Send log record to Redis."""
        if not self.cache_service.redis_client:
            return

        try:
            # Filter out HTTP request logs for specific endpoints to avoid recursion
            message = record.getMessage()
            # Match HTTP method patterns like "GET /admin/logs", "POST /admin/logs", etc.
            http_patterns = [
                'GET /admin/logs', 'POST /admin/logs', 'PUT /admin/logs', 'DELETE /admin/logs',
                'PATCH /admin/logs', 'HEAD /admin/logs', 'OPTIONS /admin/logs',
                'GET /ping', 'POST /ping', 'HEAD /ping'
            ]
            if any(pattern in message for pattern in http_patterns):
                return

            # Get original levelname (strip whitespace if formatter added it)
            original_levelname = record.levelname.strip()

            # Create simple formatted message without modifying record
            dt = datetime.fromtimestamp(record.created, tz=ZoneInfo("Europe/Paris"))

            # Create log entry with just the raw message (no timestamp, level, or logger prefix)
            log_entry = {
                "timestamp": dt.isoformat(),
                "level": original_levelname,
                "logger": record.name,
                "message": message,  # Store only the raw log message
                "pathname": record.pathname,
                "lineno": record.lineno,
                "funcName": record.funcName,
            }

            # Add exception info if available
            if record.exc_info:
                log_entry["exception"] = logging.Formatter().formatException(record.exc_info)

            # Create Redis key with timestamp (milliseconds precision for uniqueness)
            timestamp_ms = int(record.created * 1000)
            redis_key = f"logs:{original_levelname.lower()}:{timestamp_ms}"

            # Use thread pool to run the async operation
            def _store_log() -> None:
                try:
                    # Create a new Redis client for this thread's event loop
                    import redis.asyncio as redis

                    async def store() -> None:
                        client = await redis.from_url(
                            self.redis_url,
                            encoding="utf-8",
                            decode_responses=False,
                            socket_connect_timeout=1,  # Fast timeout
                            socket_timeout=1
                        )
                        try:
                            await client.setex(redis_key, LOG_RETENTION_SECONDS, json.dumps(log_entry))
                        finally:
                            await client.aclose()  # Use aclose() instead of close()

                    asyncio.run(store())
                except Exception:
                    # Silently ignore errors
                    pass

            # Submit to thread pool (non-blocking)
            _executor.submit(_store_log)

        except Exception:
            # Silently ignore errors to avoid breaking the application
            pass


def setup_logging(debug_sql: bool = False, cache_service: "CacheService | None" = None, redis_url: str | None = None) -> None:
    """Configure logging to write to file, stdout, and Redis.

    Args:
        debug_sql: If True, show SQLAlchemy query logs. If False, hide them.
        cache_service: Cache service instance for Redis logging. If None, Redis logging is disabled.
        redis_url: Redis URL for log storage. Required if cache_service is provided.
    """
    # Create log directory if it doesn't exist
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # Define log format with centered levelname before module name
    # The levelname is centered to 10 characters in the LocalTimeFormatter.format() method
    log_format = "%(asctime)s - %(levelname)s - %(name)s - %(message)s"
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

    # Add file and console handlers
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Add Redis handler if cache service is available
    if cache_service and cache_service.redis_client and redis_url:
        redis_handler = RedisLogHandler(cache_service, redis_url)
        redis_handler.setLevel(logging.INFO)  # Only store INFO and above in Redis
        # Use a simple formatter for Redis (no centered levelname)
        redis_formatter = logging.Formatter(log_format, datefmt=date_format)
        redis_handler.setFormatter(redis_formatter)
        redis_handler.addFilter(sql_filter)
        root_logger.addHandler(redis_handler)

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
    redis_status = "enabled" if (cache_service and cache_service.redis_client) else "disabled"
    logging.info(
        "Logging configured - writing to %s, stdout, and Redis (SQL queries: %s, Redis logs: %s)",
        LOG_FILE,
        debug_status,
        redis_status,
    )
