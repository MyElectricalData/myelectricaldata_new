import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .adapters import enedis_adapter
from .config import settings
from .logging_config import setup_logging
from .models import User
from .models.database import get_db, init_db
from .routers import (
    accounts_router,
    admin_router,
    ecowatt_router,
    enedis_router,
    energy_offers_router,
    logs_router,
    oauth_router,
    pdl_router,
    roles_router,
    tempo_router,
)
from .schemas import APIResponse, ErrorDetail, HealthCheckResponse
from .services import cache_service
from .services.scheduler import start_background_tasks

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    await init_db()
    await cache_service.connect()

    # Setup logging with Redis support (after cache_service is connected)
    setup_logging(debug_sql=settings.DEBUG_SQL, cache_service=cache_service, redis_url=settings.REDIS_URL)

    # Start background tasks (TEMPO cache refresh, etc.)
    start_background_tasks()

    # Print configuration in debug mode
    if settings.DEBUG:
        logger.info("=" * 60)
        logger.info("🔧 API Configuration (DEBUG MODE)")
        logger.info("=" * 60)
        logger.info(f"Frontend URL: {settings.FRONTEND_URL}")
        logger.info(f"Backend URL: {settings.BACKEND_URL}")
        logger.info(f"Enedis Environment: {settings.ENEDIS_ENVIRONMENT}")
        logger.info(f"Enedis Redirect URI: {settings.ENEDIS_REDIRECT_URI}")
        logger.info(f"Email Verification: {settings.REQUIRE_EMAIL_VERIFICATION}")
        logger.info(f"Captcha Required: {settings.REQUIRE_CAPTCHA}")
        logger.info(f"API Host: {settings.API_HOST}:{settings.API_PORT}")
        logger.info("=" * 60)

    yield

    # Shutdown
    await cache_service.disconnect()
    await enedis_adapter.close()


def get_servers():
    """Build servers list for OpenAPI based on configuration."""
    servers = [
        {"url": "/api", "description": "API via proxy (relative)"},
    ]
    # Add production server if FRONTEND_URL is configured
    if settings.FRONTEND_URL and settings.FRONTEND_URL != "http://localhost:3000":
        servers.insert(0, {"url": f"{settings.FRONTEND_URL}/api", "description": "Production API"})
    # Add local dev server
    servers.append({"url": "http://localhost:8000", "description": "Backend direct (dev)"})
    return servers


app = FastAPI(
    title="MyElectricalData API",
    description="API Gateway for Enedis data access",
    version="1.5.15",
    lifespan=lifespan,
    docs_url="/docs",  # Use default docs
    root_path="/api",
    redoc_url="/redoc",
    servers=get_servers(),
    swagger_ui_init_oauth={
        "clientId": "",
        "usePkceWithAuthorizationCodeGrant": False,
    },
)

# Mount static files for custom Swagger CSS
app.mount("/static", StaticFiles(directory="/app/static"), name="static")

# Trusted Host middleware to handle proxy headers
app.add_middleware(TrustedHostMiddleware, allowed_hosts=[
    "myelectricaldata.fr",
    "*.myelectricaldata.fr",  # Allow all subdomains
    "localhost",
    "127.0.0.1",
    "backend",
])

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware to fix redirect URLs when behind HTTPS proxy
@app.middleware("http")
async def fix_redirect_urls(request: Request, call_next):
    """Fix redirect URLs to use HTTPS and correct path when behind proxy"""
    response = await call_next(request)

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


# Include routers
app.include_router(accounts_router)
app.include_router(pdl_router)
app.include_router(oauth_router)
app.include_router(enedis_router)
app.include_router(admin_router)
app.include_router(energy_offers_router)
app.include_router(tempo_router)
app.include_router(ecowatt_router)
app.include_router(roles_router)
app.include_router(logs_router)


# Consent callback endpoint
@app.get("/consent", tags=["OAuth"])
async def consent_callback(
    request: Request,
    code: str = Query(..., description="Authorization code from Enedis"),
    state: str = Query(None, description="State parameter (ignored - user identified via JWT)"),
    usage_point_id: str = Query(None, description="Usage point ID from Enedis"),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle consent redirect from Enedis and redirect to frontend dashboard.

    The user is identified via their JWT token (from cookie or localStorage).
    The PDL(s) from Enedis are automatically added to the authenticated user's account.
    """
    # Frontend URL from settings
    frontend_url = f"{settings.FRONTEND_URL}/dashboard"

    logger.info("=" * 60)
    logger.debug("[CONSENT] ===== DEBUT CALLBACK ENEDIS =====")
    logger.debug(f"[CONSENT] Code reçu: {code[:20]}..." if code else "[CONSENT] Pas de code")
    logger.debug(f"[CONSENT] State reçu: {state}")
    logger.debug(f"[CONSENT] Usage Point ID reçu: {usage_point_id}")
    logger.debug(f"[CONSENT] Frontend URL: {frontend_url}")
    logger.info("=" * 60)

    try:
        # Get the authenticated user from JWT token
        from .middleware.auth import get_current_user_optional

        user = await get_current_user_optional(request, db)

        if not user:
            logger.error("[CONSENT] ✗ Utilisateur non authentifié - redirection vers login")
            # Redirect to login with return URL
            return_url = f"/oauth/callback?code={code}&usage_point_id={usage_point_id}" if usage_point_id else f"/oauth/callback?code={code}"
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?redirect={return_url}")

        user_id = user.id
        logger.info(f"[CONSENT] ✓ Utilisateur authentifié: {user.email} (ID: {user_id})")

        # Just create PDL - token will be managed globally via Client Credentials
        logger.debug("[CONSENT] ===== TRAITEMENT DU PDL =====")
        logger.debug("[CONSENT] Code ignoré (token géré globalement via Client Credentials)")

        if not usage_point_id:
            logger.error("[CONSENT] ✗ Aucun usage_point_id fourni")
            return RedirectResponse(url=f"{frontend_url}?consent_error=no_usage_point_id")

        # Split multiple PDLs separated by semicolons
        pdl_ids = [pdl.strip() for pdl in usage_point_id.split(";") if pdl.strip()]
        usage_points_list = [{"usage_point_id": pdl_id} for pdl_id in pdl_ids]

        logger.debug(f"[CONSENT] PDL(s) à créer: {pdl_ids} (total: {len(pdl_ids)})")

        created_count = 0

        # Create PDL only (token managed globally)
        logger.debug("[CONSENT] ===== TRAITEMENT DES PDL =====")
        for up in usage_points_list:
            usage_point_id = up.get("usage_point_id")
            logger.debug(f"[CONSENT] Traitement PDL: {usage_point_id}")

            if not usage_point_id:
                logger.warning(f"[CONSENT] ⚠ PDL ignoré (pas d'ID): {up}")
                continue

            # Check if PDL already exists (globally)
            from .models import PDL

            result = await db.execute(select(PDL).where(PDL.usage_point_id == usage_point_id))
            existing_pdl = result.scalars().first()

            if existing_pdl:
                # PDL already exists - reject via consent flow
                # Admin must use the manual "Add PDL (admin)" button instead
                logger.warning(f"[CONSENT] ⚠ PDL {usage_point_id} existe déjà (user_id: {existing_pdl.user_id}) - refusé")
                return RedirectResponse(
                    url=f"{frontend_url}?consent_error=pdl_already_exists&pdl={usage_point_id}"
                )

            # Create new PDL with race condition handling
            try:
                new_pdl = PDL(user_id=user_id, usage_point_id=usage_point_id)
                db.add(new_pdl)
                await db.flush()  # Flush to get the ID - will raise IntegrityError if duplicate
                created_count += 1
                logger.info(f"[CONSENT] ✓ PDL créé: {usage_point_id}")
            except Exception as e:
                # Handle race condition: another request created the PDL between our check and insert
                if "UNIQUE constraint failed" in str(e) or "duplicate key" in str(e).lower():
                    logger.warning(f"[CONSENT] ⚠ PDL {usage_point_id} créé par requête concurrente - abandon silencieux")
                    # Don't redirect with error - let the first request handle it
                    # Just return empty response to avoid double redirect
                    from fastapi.responses import Response
                    return Response(status_code=204)  # No Content - browser will ignore
                raise  # Re-raise other exceptions

            # Try to fetch contract info automatically
            try:
                from .adapters import enedis_adapter
                from .routers.enedis import get_valid_token

                access_token = await get_valid_token(usage_point_id, user, db)
                if access_token:
                    contract_data = await enedis_adapter.get_contract(usage_point_id, access_token)

                    if (
                        contract_data
                        and "customer" in contract_data
                        and "usage_points" in contract_data["customer"]
                    ):
                        usage_points_data = contract_data["customer"]["usage_points"]
                        if usage_points_data and len(usage_points_data) > 0:
                            usage_point_data = usage_points_data[0]

                            if "contracts" in usage_point_data:
                                contract = usage_point_data["contracts"]

                                if "subscribed_power" in contract:
                                    power_str = str(contract["subscribed_power"])
                                    new_pdl.subscribed_power = int(
                                        power_str.replace("kVA", "").replace(" ", "").strip()
                                    )
                                    logger.info(
                                        f"[CONSENT] ✓ Puissance souscrite récupérée: {new_pdl.subscribed_power} kVA"
                                    )

                                if "offpeak_hours" in contract:
                                    offpeak = contract["offpeak_hours"]
                                    if isinstance(offpeak, str):
                                        new_pdl.offpeak_hours = {"default": offpeak}
                                    elif isinstance(offpeak, dict):
                                        new_pdl.offpeak_hours = offpeak
                                    logger.info(f"[CONSENT] ✓ Heures creuses récupérées: {new_pdl.offpeak_hours}")
            except Exception as e:
                logger.warning(f"[CONSENT] ⚠ Impossible de récupérer les infos du contrat: {e}")

        await db.commit()
        logger.info("[CONSENT] ✓ Commit effectué en base de données")

        # Redirect to frontend dashboard with success message
        logger.debug("[CONSENT] ===== FIN DU TRAITEMENT - SUCCES =====")
        logger.info(
            f"[CONSENT] Redirection vers: {frontend_url}?consent_success=true&pdl_count={len(usage_points_list)}&created_count={created_count}"
        )
        logger.info("=" * 60)
        return RedirectResponse(
            url=f"{frontend_url}?consent_success=true&pdl_count={len(usage_points_list)}&created_count={created_count}"
        )

    except httpx.HTTPStatusError as e:
        # Handle HTTP errors from Enedis API
        logger.error(f"[CONSENT] ✗ ERREUR HTTP: {e.response.status_code}")
        logger.debug(f"[CONSENT] Response body: {e.response.text}")
        error_msg = f"Enedis API error: {e.response.status_code}"
        if e.response.status_code == 500:
            error_msg = "invalid_authorization_code"
        elif e.response.status_code == 401:
            error_msg = "unauthorized_client"
        logger.error(f"[CONSENT] Redirection avec erreur: {error_msg}")
        logger.info("=" * 60)
        return RedirectResponse(url=f"{frontend_url}?consent_error={error_msg}")
    except Exception as e:
        # Redirect to frontend dashboard with error
        logger.error(f"[CONSENT] ✗ ERREUR INATTENDUE: {type(e).__name__}: {str(e)}")
        logger.error(f"[CONSENT] Redirection avec erreur: {str(e)}")
        logger.info("=" * 60)
        return RedirectResponse(url=f"{frontend_url}?consent_error={str(e)}")


# Root endpoint
@app.get("/", tags=["Info"])
async def root() -> dict:
    """API information"""
    return {
        "name": "MyElectricalData API",
        "version": "1.5.15",
        "description": "API Gateway for Enedis Linky data",
        "documentation": "/docs",
    }
