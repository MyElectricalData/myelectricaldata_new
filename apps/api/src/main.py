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
from .models import User
from .models.database import get_db, init_db
from .routers import (
    accounts_router,
    admin_router,
    enedis_router,
    energy_offers_router,
    oauth_router,
    pdl_router,
    tempo_router,
    roles_router,
)
from .schemas import APIResponse, ErrorDetail, HealthCheckResponse
from .services import cache_service
from .services.scheduler import start_background_tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    await init_db()
    await cache_service.connect()

    # Start background tasks (TEMPO cache refresh, etc.)
    start_background_tasks()

    # Print configuration in debug mode
    if settings.DEBUG:
        print("=" * 60)
        print("🔧 API Configuration (DEBUG MODE)")
        print("=" * 60)
        print(f"Frontend URL: {settings.FRONTEND_URL}")
        print(f"Backend URL: {settings.BACKEND_URL}")
        print(f"Enedis Environment: {settings.ENEDIS_ENVIRONMENT}")
        print(f"Enedis Redirect URI: {settings.ENEDIS_REDIRECT_URI}")
        print(f"Email Verification: {settings.REQUIRE_EMAIL_VERIFICATION}")
        print(f"Captcha Required: {settings.REQUIRE_CAPTCHA}")
        print(f"API Host: {settings.API_HOST}:{settings.API_PORT}")
        print("=" * 60)

    yield

    # Shutdown
    await cache_service.disconnect()
    await enedis_adapter.close()


app = FastAPI(
    title="MyElectricalData API",
    description="API Gateway for Enedis data access",
    version="1.5.15",
    lifespan=lifespan,
    docs_url="/docs",  # Use default docs
    root_path="/api",
    redoc_url="/redoc",
    servers=[
        {"url": "/api", "description": "API via proxy"},
        {"url": "http://localhost:8000", "description": "Backend direct"},
    ],
    swagger_ui_init_oauth={
        "clientId": "",
        "usePkceWithAuthorizationCodeGrant": False,
    },
)

# Mount static files for custom Swagger CSS
app.mount("/static", StaticFiles(directory="/app/static"), name="static")

# Trusted Host middleware to handle proxy headers
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["myelectricaldata.fr", "localhost", "127.0.0.1", "backend"])

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
                print(f"[REDIRECT MIDDLEWARE] Original location: {location}")

            # Handle relative redirects (like /pdl/ from FastAPI trailing slash)
            if location.startswith("/"):
                # It's a relative redirect - prepend scheme and host
                location = f"{frontend_scheme}://{frontend_host}{location}"
                if settings.DEBUG:
                    print(f"[REDIRECT MIDDLEWARE] Converted relative to absolute: {location}")

            # Force HTTPS if the frontend is HTTPS
            if frontend_scheme == "https":
                # Fix protocol
                if location.startswith("http://"):
                    location = location.replace("http://", "https://", 1)
                    if settings.DEBUG:
                        print(f"[REDIRECT MIDDLEWARE] Fixed protocol to HTTPS: {location}")

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
                        print(f"[REDIRECT MIDDLEWARE] Path: {path}")
                        print(f"[REDIRECT MIDDLEWARE] Is frontend route: {is_frontend_route}")
                        print(f"[REDIRECT MIDDLEWARE] Starts with /api: {path.startswith('/api')}")

                    if path and not path.startswith("/api") and not is_frontend_route:
                        location = f"{frontend_scheme}://{frontend_host}/api{path}"
                        if settings.DEBUG:
                            print(f"[REDIRECT MIDDLEWARE] Added /api prefix: {location}")

            if settings.DEBUG and location != original_location:
                print(f"[REDIRECT MIDDLEWARE] Final location: {location}")

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
app.include_router(roles_router)


# Consent callback endpoint
@app.get("/consent", tags=["OAuth"])
async def consent_callback(
    code: str = Query(..., description="Authorization code from Enedis"),
    state: str = Query(..., description="State parameter containing user_id"),
    usage_point_id: str = Query(None, description="Usage point ID from Enedis"),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle consent redirect from Enedis and redirect to frontend dashboard"""
    # Frontend URL from settings
    frontend_url = f"{settings.FRONTEND_URL}/dashboard"

    print("=" * 60)
    print("[CONSENT] ===== DEBUT CALLBACK ENEDIS =====")
    print(f"[CONSENT] Code reçu: {code[:20]}...")
    print(f"[CONSENT] State reçu: {state}")
    print(f"[CONSENT] Usage Point ID reçu: {usage_point_id}")
    print(f"[CONSENT] Frontend URL: {frontend_url}")
    print(f"[CONSENT] Redirect URI configuré: {settings.ENEDIS_REDIRECT_URI}")
    print("=" * 60)

    try:
        # Parse state - Enedis may return it with format "user_id:usage_point_id" or just "user_id"
        # Extract only the user_id part (before the colon if present)
        if ":" in state:
            user_id = state.split(":")[0].strip()
        else:
            user_id = state.strip()

        # Log for debugging
        print(f"[CONSENT] User ID extrait du state: {user_id}")

        # Verify user exists
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            # Log all users for debugging
            all_users = await db.execute(select(User))
            user_ids = [u.id for u in all_users.scalars().all()]
            print(f"[CONSENT] User not found with ID: {user_id}")
            print(f"[CONSENT] Available users: {user_ids}")
            # Redirect to frontend dashboard with error
            error_msg = f"user_not_found (looking for: {user_id[:8]}...)"
            return RedirectResponse(url=f"{frontend_url}?consent_error={error_msg}")

        # Just create PDL - token will be managed globally via Client Credentials
        print("[CONSENT] ===== TRAITEMENT DU PDL =====")
        print("[CONSENT] Code ignoré (token géré globalement via Client Credentials)")

        if not usage_point_id:
            print("[CONSENT] ✗ Aucun usage_point_id fourni")
            return RedirectResponse(url=f"{frontend_url}?consent_error=no_usage_point_id")

        # Split multiple PDLs separated by semicolons
        pdl_ids = [pdl.strip() for pdl in usage_point_id.split(";") if pdl.strip()]
        usage_points_list = [{"usage_point_id": pdl_id} for pdl_id in pdl_ids]

        print(f"[CONSENT] PDL(s) à créer: {pdl_ids} (total: {len(pdl_ids)})")

        created_count = 0

        # Create PDL only (token managed globally)
        print("[CONSENT] ===== TRAITEMENT DES PDL =====")
        for up in usage_points_list:
            usage_point_id = up.get("usage_point_id")
            print(f"[CONSENT] Traitement PDL: {usage_point_id}")

            if not usage_point_id:
                print(f"[CONSENT] ⚠ PDL ignoré (pas d'ID): {up}")
                continue

            # Check if PDL already exists
            from .models import PDL

            result = await db.execute(select(PDL).where(PDL.user_id == user_id, PDL.usage_point_id == usage_point_id))
            existing_pdl = result.scalar_one_or_none()

            if not existing_pdl:
                # Create new PDL
                new_pdl = PDL(user_id=user_id, usage_point_id=usage_point_id)
                db.add(new_pdl)
                await db.flush()  # Flush to get the ID
                created_count += 1
                print(f"[CONSENT] ✓ PDL créé: {usage_point_id}")

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
                            usage_points = contract_data["customer"]["usage_points"]
                            if usage_points and len(usage_points) > 0:
                                usage_point = usage_points[0]

                                if "contracts" in usage_point:
                                    contract = usage_point["contracts"]

                                    if "subscribed_power" in contract:
                                        power_str = str(contract["subscribed_power"])
                                        new_pdl.subscribed_power = int(
                                            power_str.replace("kVA", "").replace(" ", "").strip()
                                        )
                                        print(
                                            f"[CONSENT] ✓ Puissance souscrite récupérée: {new_pdl.subscribed_power} kVA"
                                        )

                                    if "offpeak_hours" in contract:
                                        offpeak = contract["offpeak_hours"]
                                        if isinstance(offpeak, str):
                                            new_pdl.offpeak_hours = {"default": offpeak}
                                        elif isinstance(offpeak, dict):
                                            new_pdl.offpeak_hours = offpeak
                                        print(f"[CONSENT] ✓ Heures creuses récupérées: {new_pdl.offpeak_hours}")
                except Exception as e:
                    print(f"[CONSENT] ⚠ Impossible de récupérer les infos du contrat: {e}")
            else:
                print(f"[CONSENT] PDL existe déjà: {usage_point_id}")

        await db.commit()
        print("[CONSENT] ✓ Commit effectué en base de données")

        # Redirect to frontend dashboard with success message
        print("[CONSENT] ===== FIN DU TRAITEMENT - SUCCES =====")
        print(
            f"[CONSENT] Redirection vers: {frontend_url}?consent_success=true&pdl_count={len(usage_points_list)}&created_count={created_count}"
        )
        print("=" * 60)
        return RedirectResponse(
            url=f"{frontend_url}?consent_success=true&pdl_count={len(usage_points_list)}&created_count={created_count}"
        )

    except httpx.HTTPStatusError as e:
        # Handle HTTP errors from Enedis API
        print(f"[CONSENT] ✗ ERREUR HTTP: {e.response.status_code}")
        print(f"[CONSENT] Response body: {e.response.text}")
        error_msg = f"Enedis API error: {e.response.status_code}"
        if e.response.status_code == 500:
            error_msg = "invalid_authorization_code"
        elif e.response.status_code == 401:
            error_msg = "unauthorized_client"
        print(f"[CONSENT] Redirection avec erreur: {error_msg}")
        print("=" * 60)
        return RedirectResponse(url=f"{frontend_url}?consent_error={error_msg}")
    except Exception as e:
        # Redirect to frontend dashboard with error
        print(f"[CONSENT] ✗ ERREUR INATTENDUE: {type(e).__name__}: {str(e)}")
        print(f"[CONSENT] Redirection avec erreur: {str(e)}")
        print("=" * 60)
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
