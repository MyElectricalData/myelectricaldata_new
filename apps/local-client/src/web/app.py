"""FastAPI application factory."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from ..config import Settings
from ..database import Repository
from ..exporters import ExporterManager
from ..gateway import GatewayClient
from ..services import SchedulerService, SyncService
from .routers import api, exporters

logger = logging.getLogger(__name__)


def create_app(settings: Settings) -> FastAPI:
    """Create and configure the FastAPI application.

    Args:
        settings: Application settings.

    Returns:
        Configured FastAPI application.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator:
        """Application lifespan handler."""
        logger.info("Starting MyElectricalData Local Client")

        # Initialize components
        repository = Repository(settings.database.url)
        await repository.init_db()
        app.state.repository = repository

        gateway = GatewayClient(
            gateway_url=settings.gateway.url,
            client_id=settings.gateway.client_id,
            client_secret=settings.gateway.client_secret,
        )
        app.state.gateway = gateway

        # Build exporter config from settings
        exporter_config = {
            "home_assistant": settings.home_assistant.model_dump(),
            "mqtt": settings.mqtt.model_dump(),
            "prometheus": settings.metrics.model_dump(),
            "victoriametrics": {
                "enabled": settings.metrics.push.enabled,
                "url": settings.metrics.push.url,
                "interval": settings.metrics.push.interval,
                "username": settings.metrics.push.username,
                "password": settings.metrics.push.password,
                "labels": settings.metrics.labels,
            },
            "jeedom": settings.jeedom.model_dump(),
        }
        exporter_manager = ExporterManager(exporter_config)
        app.state.exporter_manager = exporter_manager

        sync_service = SyncService(
            settings=settings,
            repository=repository,
            gateway=gateway,
            exporter_manager=exporter_manager,
        )
        app.state.sync_service = sync_service

        scheduler = SchedulerService(settings, sync_service)
        app.state.scheduler = scheduler

        # Start services
        await exporter_manager.start()
        await scheduler.start()

        logger.info("Application started successfully")

        yield

        # Cleanup
        logger.info("Shutting down...")
        await scheduler.stop()
        await exporter_manager.stop()
        await gateway.close()
        await repository.close()
        logger.info("Shutdown complete")

    app = FastAPI(
        title="MyElectricalData Local Client",
        description="Local client for syncing and exporting Linky data",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Store settings
    app.state.settings = settings

    # Configure CORS
    if settings.api.cors.enabled:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.api.cors.origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Register routers
    app.include_router(api.router)
    app.include_router(exporters.router)

    # Health check endpoint (before static files)
    @app.get("/health", tags=["health"])
    async def health_check():
        """Health check endpoint."""
        return {"status": "ok"}

    # Static files - serve frontend
    static_dir = Path(__file__).parent.parent.parent / "static"
    if static_dir.exists():
        logger.info(f"Serving static files from {static_dir}")

        # Mount static assets
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

        # Serve index.html for all non-API routes (SPA support)
        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(request: Request, full_path: str):
            """Serve the SPA for all non-API routes."""
            # Skip API routes
            if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi"):
                return JSONResponse(status_code=404, content={"detail": "Not found"})

            # Check if file exists in static dir
            file_path = static_dir / full_path
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)

            # Return index.html for SPA routing
            index_path = static_dir / "index.html"
            if index_path.exists():
                return FileResponse(index_path)

            return JSONResponse(status_code=404, content={"detail": "Not found"})
    else:
        logger.warning(f"Static directory not found: {static_dir}")

        # Fallback root endpoint when no frontend
        @app.get("/", tags=["info"])
        async def root():
            """Root endpoint with API info."""
            return {
                "name": "MyElectricalData Local Client",
                "version": "1.0.0",
                "docs": "/docs",
                "health": "/health",
                "api": "/api/status",
            }

    # Error handlers
    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    return app
