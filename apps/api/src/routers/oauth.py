import logging
import re
import uuid

import httpx
from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters import enedis_adapter
from ..config import settings
from ..middleware import get_current_user
from ..middleware.auth import get_current_user_optional
from ..models import PDL, Token, User
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..services.cache import cache_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["OAuth"])

# TTL for OAuth state mapping (10 minutes)
OAUTH_STATE_TTL = 600

# Regex pattern for PDL validation: exactly 14 digits
PDL_PATTERN = re.compile(r"^\d{14}$")


@router.get("/authorize", response_model=APIResponse)
async def get_authorize_url(
    current_user: User = Depends(get_current_user),
) -> APIResponse:
    """Get Enedis OAuth authorization URL - Consent is account-level, not per PDL"""
    # Generate a random state for CSRF protection
    state = str(uuid.uuid4())

    # Store the mapping state -> user_id in Redis (TTL: 10 minutes)
    if cache_service.redis_client:
        await cache_service.redis_client.set(
            f"oauth_state:{state}",
            current_user.id,
            ex=OAUTH_STATE_TTL
        )

    # Build authorization URL
    params = {
        "client_id": settings.ENEDIS_CLIENT_ID,
        "response_type": "code",
        "duration": "P36M",  # 36 months
        "redirect_uri": settings.ENEDIS_REDIRECT_URI,
        "state": state,
    }

    param_str = "&".join([f"{k}={v}" for k, v in params.items()])
    authorize_url = f"{settings.enedis_authorize_url}?{param_str}"

    return APIResponse(
        success=True,
        data={
            "authorize_url": authorize_url,
            "description": "Redirect the user to this URL to initiate Enedis consent flow. This will grant access to all your PDL.",
        },
    )


@router.get("/verify-state", response_model=APIResponse)
async def verify_oauth_state(
    state: str = Query(..., description="OAuth state to verify"),
) -> APIResponse:
    """Verify an OAuth state and return the associated user_id (for debugging)"""
    if not cache_service.redis_client:
        return APIResponse(success=False, error=ErrorDetail(code="CACHE_ERROR", message="Cache not available"))

    user_id = await cache_service.redis_client.get(f"oauth_state:{state}")
    if user_id:
        return APIResponse(success=True, data={"user_id": user_id.decode() if isinstance(user_id, bytes) else user_id, "state": state})
    return APIResponse(success=False, error=ErrorDetail(code="STATE_NOT_FOUND", message="State not found or expired"))


@router.get("/callback")
async def oauth_callback(
    request: Request,
    code: str = Query(..., description="Authorization code from Enedis"),
    state: str = Query(None, description="State parameter (ignored - user identified via JWT)"),
    usage_point_id: str = Query(None, description="Usage point ID from Enedis (14 digits, or multiple separated by semicolons)"),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle OAuth callback from Enedis and redirect to frontend dashboard.

    The user is identified via their JWT token (from cookie or localStorage).
    The PDL(s) from Enedis are automatically added to the authenticated user's account.
    """
    # Frontend URL from settings
    frontend_url = f"{settings.FRONTEND_URL}/dashboard"

    logger.info("=" * 60)
    logger.debug("[OAUTH CALLBACK] ===== DEBUT CALLBACK ENEDIS =====")
    logger.debug(f"[OAUTH CALLBACK] Code recu: {code[:20]}..." if code else "[OAUTH CALLBACK] Pas de code")
    logger.debug(f"[OAUTH CALLBACK] State recu: {state}")
    logger.debug(f"[OAUTH CALLBACK] Usage Point ID recu: {usage_point_id}")
    logger.debug(f"[OAUTH CALLBACK] Frontend URL: {frontend_url}")
    logger.info("=" * 60)

    try:
        # Get the authenticated user from JWT token
        user = await get_current_user_optional(request, db)

        if not user:
            logger.error("[OAUTH CALLBACK] Utilisateur non authentifie - redirection vers login")
            # Redirect to login with return URL
            return_url = f"/oauth/callback?code={code}&usage_point_id={usage_point_id}" if usage_point_id else f"/oauth/callback?code={code}"
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?redirect={return_url}")

        user_id = user.id
        logger.info(f"[OAUTH CALLBACK] Utilisateur authentifie: {user.email} (ID: {user_id})")

        # Just create PDL - token will be managed globally via Client Credentials
        logger.debug("[OAUTH CALLBACK] ===== TRAITEMENT DU PDL =====")
        logger.debug("[OAUTH CALLBACK] Code ignore (token gere globalement via Client Credentials)")

        if not usage_point_id:
            logger.error("[OAUTH CALLBACK] Aucun usage_point_id fourni")
            return RedirectResponse(url=f"{frontend_url}?consent_error=no_usage_point_id")

        # Split multiple PDLs separated by semicolons
        pdl_ids = [pdl.strip() for pdl in usage_point_id.split(";") if pdl.strip()]

        # Validate PDL format: must be exactly 14 digits
        for pdl_id in pdl_ids:
            if not PDL_PATTERN.match(pdl_id):
                logger.error(f"[OAUTH CALLBACK] Format PDL invalide: {pdl_id} (doit etre 14 chiffres)")
                return RedirectResponse(url=f"{frontend_url}?consent_error=invalid_pdl_format&pdl={pdl_id}")

        usage_points_list = [{"usage_point_id": pdl_id} for pdl_id in pdl_ids]

        logger.debug(f"[OAUTH CALLBACK] PDL(s) a creer: {pdl_ids} (total: {len(pdl_ids)})")

        created_count = 0

        # Create PDL only (token managed globally)
        logger.debug("[OAUTH CALLBACK] ===== TRAITEMENT DES PDL =====")
        for up in usage_points_list:
            pdl_usage_point_id = up.get("usage_point_id")
            logger.debug(f"[OAUTH CALLBACK] Traitement PDL: {pdl_usage_point_id}")

            if not pdl_usage_point_id:
                logger.warning(f"[OAUTH CALLBACK] PDL ignore (pas d'ID): {up}")
                continue

            # Check if PDL already exists (globally)
            result = await db.execute(select(PDL).where(PDL.usage_point_id == pdl_usage_point_id))
            existing_pdl = result.scalars().first()

            if existing_pdl:
                # PDL already exists - reject via consent flow
                # Admin must use the manual "Add PDL (admin)" button instead
                logger.warning(f"[OAUTH CALLBACK] PDL {pdl_usage_point_id} existe deja (user_id: {existing_pdl.user_id}) - refuse")
                return RedirectResponse(
                    url=f"{frontend_url}?consent_error=pdl_already_exists&pdl={pdl_usage_point_id}"
                )

            # Create new PDL with race condition handling
            try:
                new_pdl = PDL(user_id=user_id, usage_point_id=pdl_usage_point_id)
                db.add(new_pdl)
                await db.flush()  # Flush to get the ID - will raise IntegrityError if duplicate
                created_count += 1
                logger.info(f"[OAUTH CALLBACK] PDL cree: {pdl_usage_point_id}")
            except Exception as e:
                # Handle race condition: another request created the PDL between our check and insert
                if "UNIQUE constraint failed" in str(e) or "duplicate key" in str(e).lower():
                    logger.warning(f"[OAUTH CALLBACK] PDL {pdl_usage_point_id} cree par requete concurrente - abandon silencieux")
                    # Don't redirect with error - let the first request handle it
                    # Just return empty response to avoid double redirect
                    return Response(status_code=204)  # No Content - browser will ignore
                raise  # Re-raise other exceptions

            # Try to fetch contract info automatically
            try:
                from ..routers.enedis import get_valid_token

                access_token = await get_valid_token(pdl_usage_point_id, user, db)
                if access_token:
                    contract_data = await enedis_adapter.get_contract(pdl_usage_point_id, access_token)

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
                                        f"[OAUTH CALLBACK] Puissance souscrite recuperee: {new_pdl.subscribed_power} kVA"
                                    )

                                if "offpeak_hours" in contract:
                                    offpeak = contract["offpeak_hours"]
                                    if isinstance(offpeak, str):
                                        new_pdl.offpeak_hours = {"default": offpeak}
                                    elif isinstance(offpeak, dict):
                                        new_pdl.offpeak_hours = offpeak
                                    logger.info(f"[OAUTH CALLBACK] Heures creuses recuperees: {new_pdl.offpeak_hours}")
            except Exception as e:
                logger.warning(f"[OAUTH CALLBACK] Impossible de recuperer les infos du contrat: {e}")

        await db.commit()
        logger.info("[OAUTH CALLBACK] Commit effectue en base de donnees")

        # Redirect to frontend dashboard with success message
        logger.debug("[OAUTH CALLBACK] ===== FIN DU TRAITEMENT - SUCCES =====")
        logger.info(
            f"[OAUTH CALLBACK] Redirection vers: {frontend_url}?consent_success=true&pdl_count={len(usage_points_list)}&created_count={created_count}"
        )
        logger.info("=" * 60)
        return RedirectResponse(
            url=f"{frontend_url}?consent_success=true&pdl_count={len(usage_points_list)}&created_count={created_count}"
        )

    except httpx.HTTPStatusError as e:
        # Handle HTTP errors from Enedis API
        logger.error(f"[OAUTH CALLBACK] ERREUR HTTP: {e.response.status_code}")
        logger.debug(f"[OAUTH CALLBACK] Response body: {e.response.text}")
        error_msg = f"Enedis API error: {e.response.status_code}"
        if e.response.status_code == 500:
            error_msg = "invalid_authorization_code"
        elif e.response.status_code == 401:
            error_msg = "unauthorized_client"
        logger.error(f"[OAUTH CALLBACK] Redirection avec erreur: {error_msg}")
        logger.info("=" * 60)
        return RedirectResponse(url=f"{frontend_url}?consent_error={error_msg}")
    except Exception as e:
        # Redirect to frontend dashboard with error
        logger.error(f"[OAUTH CALLBACK] ERREUR INATTENDUE: {type(e).__name__}: {str(e)}")
        logger.error(f"[OAUTH CALLBACK] Redirection avec erreur: {str(e)}")
        logger.info("=" * 60)
        return RedirectResponse(url=f"{frontend_url}?consent_error={str(e)}")


@router.post("/refresh/{usage_point_id}", response_model=APIResponse)
async def refresh_token(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres).", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Refresh access token for a usage point"""
    # Verify PDL ownership
    result = await db.execute(
        select(PDL).where(PDL.user_id == current_user.id, PDL.usage_point_id == usage_point_id)
    )
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: This PDL does not belong to you."
            )
        )

    # Get token
    result = await db.execute(
        select(Token).where(Token.user_id == current_user.id, Token.usage_point_id == usage_point_id)
    )
    token = result.scalar_one_or_none()

    if not token or not token.refresh_token:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="TOKEN_NOT_FOUND", message="No refresh token available for this usage point"),
        )

    try:
        # Refresh token
        from datetime import UTC, datetime, timedelta

        token_data = await enedis_adapter.refresh_access_token(token.refresh_token)

        # Update token
        expires_in = token_data.get("expires_in", 3600)
        token.access_token = token_data["access_token"]
        token.refresh_token = token_data.get("refresh_token", token.refresh_token)
        token.expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

        await db.commit()

        return APIResponse(
            success=True, data={"message": "Token refreshed successfully", "expires_at": token.expires_at.isoformat()}
        )

    except Exception as e:
        return APIResponse(
            success=False, error=ErrorDetail(code="REFRESH_ERROR", message=f"Token refresh failed: {str(e)}")
        )
