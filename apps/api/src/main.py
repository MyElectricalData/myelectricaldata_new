import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Callable

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from .middleware.trusted_host import TrustedHostExceptHealthMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .adapters import enedis_adapter
from .config import APP_VERSION, settings
from .logging_config import setup_logging
from .models.database import init_db
from .routers import (
    accounts_router,
    admin_router,
    consumption_france_router,
    ecowatt_router,
    enedis_router,
    energy_offers_router,
    generation_forecast_router,
    logs_router,
    oauth_router,
    pdl_router,
    roles_router,
    tempo_router,
    zen_flex_router,
)
from .routers.admin_rte import router as admin_rte_router
from .schemas import APIResponse, ErrorDetail, HealthCheckResponse
from .services import cache_service
from .services.scheduler import start_background_tasks

# Client mode imports (only when CLIENT_MODE is enabled)
if settings.CLIENT_MODE:
    from .routers.sync import router as sync_router
    from .routers.export import router as export_router
    from .routers.accounts_client import router as accounts_client_router
    from .routers.enedis_client import router as enedis_client_router
    from .scheduler import scheduler as sync_scheduler
    from .services.client_auth import get_or_create_local_user
    from .models.database import async_session_maker

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events"""
    # Startup
    await init_db()
    await cache_service.connect()

    # Setup logging with Redis support (after cache_service is connected)
    setup_logging(debug_sql=settings.DEBUG_SQL, cache_service=cache_service, redis_url=settings.REDIS_URL)

    # Start background tasks (TEMPO cache refresh, etc.) - SERVER MODE ONLY
    # In client mode, sync_scheduler handles this via SyncService (gateway-based)
    if not settings.CLIENT_MODE:
        start_background_tasks()

    # Start sync scheduler in client mode
    if settings.CLIENT_MODE:
        # Initialize local user for client mode
        async with async_session_maker() as db:
            local_user = await get_or_create_local_user(db)
            logger.info(f"👤 Client Mode: Local user ready ({local_user.email})")

            # Sync PDL list from remote API at startup
            try:
                from .services.sync import SyncService
                sync_service = SyncService(db)
                synced_pdls = await sync_service.sync_pdl_list(local_user.id)
                logger.info(f"📥 Client Mode: Synced {len(synced_pdls)} PDLs from remote API")
            except Exception as e:
                logger.warning(f"⚠️ Client Mode: Failed to sync PDL list at startup: {e}")

        sync_scheduler.start()
        logger.info("🔄 Client Mode: Sync scheduler started (every 30 minutes)")

    # Print configuration in debug mode
    if settings.DEBUG:
        logger.info("=" * 60)
        logger.info("🔧 API Configuration (DEBUG MODE)")
        logger.info("=" * 60)
        logger.info(f"Mode: {'CLIENT' if settings.CLIENT_MODE else 'SERVER'}")
        logger.info(f"Frontend URL: {settings.FRONTEND_URL}")
        logger.info(f"Backend URL: {settings.BACKEND_URL}")
        if not settings.CLIENT_MODE:
            logger.info(f"Enedis Environment: {settings.ENEDIS_ENVIRONMENT}")
            logger.info(f"Enedis Redirect URI: {settings.ENEDIS_REDIRECT_URI}")
        else:
            logger.info(f"MyElectricalData API: {settings.MED_API_URL}")
        logger.info(f"Email Verification: {settings.REQUIRE_EMAIL_VERIFICATION}")
        logger.info(f"Captcha Required: {settings.REQUIRE_CAPTCHA}")
        logger.info(f"API Host: {settings.API_HOST}:{settings.API_PORT}")
        logger.info("=" * 60)

    yield

    # Shutdown
    if settings.CLIENT_MODE:
        sync_scheduler.stop()
    await cache_service.disconnect()
    await enedis_adapter.close()


def get_servers() -> list[dict[str, str]]:
    """Build servers list for OpenAPI based on configuration."""
    is_production = settings.FRONTEND_URL and settings.FRONTEND_URL != "http://localhost:3000"

    if is_production:
        # Production: only show production URL and relative path
        return [
            {"url": f"{settings.FRONTEND_URL}/api", "description": "Production API"},
            {"url": "/api", "description": "API via proxy (relative)"},
        ]
    else:
        # Development: show relative path and localhost
        return [
            {"url": "/api", "description": "API via proxy (relative)"},
            {"url": "http://localhost:8000", "description": "Backend direct (dev)"},
        ]


app = FastAPI(
    title="MyElectricalData API",
    description="API Gateway for Enedis data access",
    version=APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",  # Use default docs
    root_path="/api",
    redoc_url="/redoc",
    servers=get_servers(),
    swagger_ui_init_oauth={
        "clientId": "",
        "usePkceWithAuthorizationCodeGrant": False,
    },
    # Disable automatic redirect from /path to /path/ to avoid 307 redirects
    # that break proxy routing (Vite proxy rewrites /api/path -> /path,
    # but redirect response /path/ doesn't get rewritten back to /api/path/)
    redirect_slashes=False,
)

# Mount static files for custom Swagger CSS
app.mount("/static", StaticFiles(directory="/app/static"), name="static")

# Trusted Host middleware to handle proxy headers (ALLOWED_HOSTS, every host by default in client mode)
app.add_middleware(TrustedHostExceptHealthMiddleware, allowed_hosts=settings.allowed_hosts)

# CORS middleware - explicit origins required for credentials (httpOnly cookies)
def get_cors_origins() -> list[str]:
    """Build CORS origins from settings"""
    origins: list[str] = []
    # Add frontend URL if configured
    frontend_url = (settings.FRONTEND_URL or "").strip()
    if frontend_url:
        origins.append(frontend_url)
    # Add backend URL for Swagger UI
    backend_url = (settings.BACKEND_URL or "").strip()
    if backend_url and backend_url != frontend_url:
        origins.append(backend_url)
    # Add common development origins
    if settings.DEBUG:
        origins.extend([
            "http://localhost:3000",
            "http://localhost:8000",
            "http://localhost:8081",
            "http://localhost:8100",  # Client mode frontend
            "http://localhost:8181",  # Client mode backend
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8000",
            "http://127.0.0.1:8081",
            "http://127.0.0.1:8100",
            "http://127.0.0.1:8181",
        ])
    # Remove duplicates while preserving order
    return list(dict.fromkeys(origins))


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,  # Required for httpOnly cookies
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Set-Cookie"],  # Allow browser to see Set-Cookie header
)


# Middleware to fix redirect URLs when behind HTTPS proxy
@app.middleware("http")
async def fix_redirect_urls(request: Request, call_next: Callable) -> Response:
    """Fix redirect URLs to use HTTPS and correct path when behind proxy"""
    response: Response = await call_next(request)

    # If it's a redirect and we're behind HTTPS proxy
    if response.status_code in (301, 302, 303, 307, 308):
        if "location" in response.headers:
            location = response.headers["location"]
            original_location = location

            # Parse frontend URL from settings
            from urllib.parse import urlparse

            frontend_parsed = urlparse(settings.FRONTEND_URL)
            frontend_host = frontend_parsed.netloc
            frontend_scheme = frontend_parsed.scheme

            if settings.DEBUG:
                logger.debug(f"[REDIRECT MIDDLEWARE] Original location: {location}")

            # Handle relative redirects (like /pdl/ from FastAPI trailing slash)
            if location.startswith("/"):
                # It's a relative redirect - prepend scheme and host
                location = f"{frontend_scheme}://{frontend_host}{location}"
                if settings.DEBUG:
                    logger.debug(f"[REDIRECT MIDDLEWARE] Converted relative to absolute: {location}")

            # Force HTTPS if the frontend is HTTPS
            if frontend_scheme == "https":
                # Fix protocol
                if location.startswith("http://"):
                    location = location.replace("http://", "https://", 1)
                    if settings.DEBUG:
                        logger.debug(f"[REDIRECT MIDDLEWARE] Fixed protocol to HTTPS: {location}")

                # Fix path - add /api prefix ONLY for API endpoints (not frontend routes like /dashboard)
                if location.startswith(f"{frontend_scheme}://{frontend_host}/"):
                    path = location.replace(f"{frontend_scheme}://{frontend_host}", "")
                    # Only add /api prefix if:
                    # 1. It's missing
                    # 2. It's not a frontend route
                    # 3. It's not already an API route with /api
                    # Frontend routes: exact match for / or starts with /dashboard, /login, /register
                    is_frontend_route = (
                        path == "/"
                        or path.startswith("/dashboard")
                        or path.startswith("/login")
                        or path.startswith("/register")
                    )

                    if settings.DEBUG:
                        logger.debug(f"[REDIRECT MIDDLEWARE] Path: {path}")
                        logger.debug(f"[REDIRECT MIDDLEWARE] Is frontend route: {is_frontend_route}")
                        logger.debug(f"[REDIRECT MIDDLEWARE] Starts with /api: {path.startswith('/api')}")

                    if path and not path.startswith("/api") and not is_frontend_route:
                        location = f"{frontend_scheme}://{frontend_host}/api{path}"
                        if settings.DEBUG:
                            logger.debug(f"[REDIRECT MIDDLEWARE] Added /api prefix: {location}")

            if settings.DEBUG and location != original_location:
                logger.debug(f"[REDIRECT MIDDLEWARE] Final location: {location}")

            response.headers["location"] = location

    return response


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all uncaught exceptions"""
    error_response = APIResponse(
        success=False, error=ErrorDetail(code="INTERNAL_ERROR", message="An internal error occurred")
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=error_response.model_dump(mode="json")
    )


# Health check
@app.get("/ping", response_model=HealthCheckResponse, tags=["Health"])
async def health_check() -> HealthCheckResponse:
    """Health check endpoint"""
    return HealthCheckResponse()


# Include routers based on mode
if settings.CLIENT_MODE:
    # Client mode: sync, export, accounts, enedis proxy, and shared routers
    app.include_router(accounts_client_router)
    app.include_router(sync_router)
    app.include_router(export_router)
    app.include_router(enedis_client_router)  # Proxy to MyElectricalData gateway
    app.include_router(pdl_router)
    app.include_router(tempo_router)
    app.include_router(zen_flex_router)
    app.include_router(ecowatt_router)
    app.include_router(energy_offers_router)
    app.include_router(consumption_france_router)  # France national data via gateway
    app.include_router(generation_forecast_router)  # Renewable generation via gateway
else:
    # Server mode: all routers
    app.include_router(accounts_router)
    app.include_router(pdl_router)
    app.include_router(oauth_router)
    app.include_router(enedis_router)
    app.include_router(admin_router)
    app.include_router(energy_offers_router)
    app.include_router(tempo_router)
    app.include_router(zen_flex_router)
    app.include_router(ecowatt_router)
    app.include_router(consumption_france_router)
    app.include_router(generation_forecast_router)
    app.include_router(roles_router)
    app.include_router(logs_router)
    app.include_router(admin_rte_router)


# Root endpoint
@app.get("/", tags=["Info"])
async def root() -> dict:
    """API information"""
    return {
        "name": "MyElectricalData API",
        "version": APP_VERSION,
        "description": "API Gateway for Enedis Linky data",
        "documentation": "/docs",
    }
