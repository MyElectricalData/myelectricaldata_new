from datetime import datetime, timedelta, UTC
from fastapi import APIRouter, Depends, Query, Path
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import User, Token, PDL
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..middleware import get_current_user
from ..adapters import enedis_adapter
from ..config import settings

router = APIRouter(prefix="/oauth", tags=["OAuth"])


@router.get("/authorize", response_model=APIResponse)
async def get_authorize_url(
    current_user: User = Depends(get_current_user),
) -> APIResponse:
    """Get Enedis OAuth authorization URL - Consent is account-level, not per PDL"""
    # Build authorization URL
    params = {
        "client_id": settings.ENEDIS_CLIENT_ID,
        "response_type": "code",
        "duration": "P36M",  # 36 months
        "redirect_uri": settings.ENEDIS_REDIRECT_URI,
        "state": current_user.id,  # Only user_id in state
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


@router.get("/callback", response_model=APIResponse)
async def oauth_callback(
    code: str = Query(..., description="Authorization code from Enedis", openapi_examples={"auth_code": {"summary": "Authorization code", "value": "abc123xyz789"}}),
    state: str = Query(..., description="State parameter containing user_id:usage_point_id", openapi_examples={"state_example": {"summary": "State parameter", "value": "550e8400-e29b-41d4-a716-446655440000:12345678901234"}}),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Handle OAuth callback from Enedis"""
    try:
        # Parse state
        user_id, usage_point_id = state.split(":")

        # Verify user exists
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            return APIResponse(success=False, error=ErrorDetail(code="USER_NOT_FOUND", message="User not found"))

        # Exchange code for token
        token_data = await enedis_adapter.exchange_authorization_code(code, settings.ENEDIS_REDIRECT_URI)

        # Calculate expiration
        expires_in = token_data.get("expires_in", 3600)
        expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

        # Check if token already exists for this usage_point_id
        result = await db.execute(
            select(Token).where(Token.user_id == user_id, Token.usage_point_id == usage_point_id)
        )
        existing_token = result.scalar_one_or_none()

        if existing_token:
            # Update existing token
            existing_token.access_token = token_data["access_token"]
            existing_token.refresh_token = token_data.get("refresh_token")
            existing_token.token_type = token_data.get("token_type", "Bearer")
            existing_token.expires_at = expires_at
            existing_token.scope = token_data.get("scope")
            token = existing_token
        else:
            # Create new token
            token = Token(
                user_id=user_id,
                usage_point_id=usage_point_id,
                access_token=token_data["access_token"],
                refresh_token=token_data.get("refresh_token"),
                token_type=token_data.get("token_type", "Bearer"),
                expires_at=expires_at,
                scope=token_data.get("scope"),
            )
            db.add(token)

        await db.commit()

        return APIResponse(
            success=True,
            data={
                "message": "OAuth consent completed successfully",
                "usage_point_id": usage_point_id,
                "expires_at": expires_at.isoformat(),
            },
        )

    except Exception as e:
        return APIResponse(
            success=False, error=ErrorDetail(code="OAUTH_ERROR", message=f"OAuth callback failed: {str(e)}")
        )


# Endpoint désactivé - données sensibles
# @router.post("/token/client-credentials", response_model=APIResponse)
# async def get_client_credentials_token() -> APIResponse:
#     """Get access token using client credentials flow (machine-to-machine)"""
#     try:
#         token_data = await enedis_adapter.get_client_credentials_token()
#         return APIResponse(success=True, data=token_data)
#     except Exception as e:
#         return APIResponse(success=False, error=ErrorDetail(code="TOKEN_ERROR", message=str(e)))


@router.post("/refresh/{usage_point_id}", response_model=APIResponse)
async def refresh_token(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}}),
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


