"""Main entry point for MyElectricalData Local Client."""

import argparse
import asyncio
import logging
import sys

import uvicorn

from .config import get_settings, reload_settings
from .web import create_app as _create_app


def create_app():
    """Factory function for uvicorn --factory mode.

    Returns:
        Configured FastAPI application.
    """
    settings = get_settings()
    setup_logging(
        level=settings.logging.level,
        format=settings.logging.format,
    )
    return _create_app(settings)


def setup_logging(level: str = "INFO", format: str = "text") -> None:
    """Setup logging configuration.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR).
        format: Log format (text or json).
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    if format == "json":
        log_format = '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}'
    else:
        log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Set log levels for noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="MyElectricalData Local Client",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Run command (default)
    run_parser = subparsers.add_parser("run", help="Run the local client")
    run_parser.add_argument(
        "--config",
        "-c",
        type=str,
        help="Path to configuration file",
    )
    run_parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)",
    )
    run_parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to bind to (default: from config or 8080)",
    )
    run_parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload (development only)",
    )

    # Config command
    config_parser = subparsers.add_parser("config", help="Configuration management")
    config_subparsers = config_parser.add_subparsers(dest="config_action")

    config_subparsers.add_parser("validate", help="Validate configuration")
    config_subparsers.add_parser("show", help="Show current configuration")
    config_subparsers.add_parser("reload", help="Reload configuration")

    # Version command
    subparsers.add_parser("version", help="Show version")

    args = parser.parse_args()

    # Default to run if no command specified
    if args.command is None:
        args.command = "run"
        args.config = None
        args.host = "0.0.0.0"
        args.port = None
        args.reload = False

    if args.command == "version":
        from . import __version__
        print(f"MyElectricalData Local Client v{__version__}")
        return

    if args.command == "config":
        handle_config_command(args)
        return

    if args.command == "run":
        run_server(args)
        return

    parser.print_help()


def handle_config_command(args) -> None:
    """Handle configuration commands.

    Args:
        args: Parsed arguments.
    """
    if args.config_action == "validate":
        try:
            settings = get_settings()
            print("Configuration is valid")
            print(f"  Gateway URL: {settings.gateway.url}")
            print(f"  Database: {settings.database.url}")
            print(f"  API Port: {settings.api.port}")
        except Exception as e:
            print(f"Configuration error: {e}")
            sys.exit(1)

    elif args.config_action == "show":
        settings = get_settings()
        import json
        # Convert to dict and mask secrets
        config_dict = {
            "gateway": {
                "url": settings.gateway.url,
                "client_id": settings.gateway.client_id[:4] + "..." if settings.gateway.client_id else "",
                "client_secret": "***" if settings.gateway.client_secret else "",
            },
            "database": {"url": settings.database.url},
            "sync": settings.sync.model_dump(),
            "api": {"port": settings.api.port},
            "home_assistant": {"enabled": settings.home_assistant.enabled},
            "mqtt": {"enabled": settings.mqtt.enabled},
            "metrics": {"enabled": settings.metrics.enabled},
            "jeedom": {"enabled": settings.jeedom.enabled},
        }
        print(json.dumps(config_dict, indent=2))

    elif args.config_action == "reload":
        try:
            reload_settings()
            print("Configuration reloaded successfully")
        except Exception as e:
            print(f"Error reloading configuration: {e}")
            sys.exit(1)

    else:
        print("Unknown config action. Use 'validate', 'show', or 'reload'")
        sys.exit(1)


def run_server(args) -> None:
    """Run the web server.

    Args:
        args: Parsed arguments.
    """
    # Load settings
    settings = get_settings(args.config)

    # Setup logging
    setup_logging(
        level=settings.logging.level,
        format=settings.logging.format,
    )

    logger = logging.getLogger(__name__)
    logger.info("Starting MyElectricalData Local Client")

    # Determine port
    port = args.port or settings.api.port

    # Create app
    app = _create_app(settings)

    # Run server
    uvicorn.run(
        app,
        host=args.host,
        port=port,
        reload=args.reload,
        log_level=settings.logging.level.lower(),
    )


def cli() -> None:
    """CLI entry point for the package."""
    main()


if __name__ == "__main__":
    main()
