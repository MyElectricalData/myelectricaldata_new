"""Logging configuration for FastAPI application."""
import logging
import sys
from pathlib import Path

# Log directory and file
LOG_DIR = Path("/logs")
LOG_FILE = LOG_DIR / "app.log"


def setup_logging():
    """Configure logging to write to both file and stdout."""
    # Create log directory if it doesn't exist
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # Define log format
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Create formatters
    formatter = logging.Formatter(log_format, datefmt=date_format)

    # File handler - writes to /app/logs/app.log
    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)

    # Console handler - writes to stdout
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Remove existing handlers to avoid duplicates
    root_logger.handlers.clear()

    # Add our handlers
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Also configure uvicorn loggers
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
        logger = logging.getLogger(logger_name)
        logger.handlers.clear()
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False

    logging.info("Logging configured - writing to %s and stdout", LOG_FILE)
