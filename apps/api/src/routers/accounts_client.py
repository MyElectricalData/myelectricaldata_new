"""
Client Mode Accounts Router.

Provides minimal account endpoints for client mode (local installation).
Only includes endpoints that the frontend expects to exist.
"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User
from ..models.database import get_db
from ..middleware import get_current_user
from ..schemas import APIResponse
from ..services.client_auth import get_or_create_local_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accounts", tags=["Accounts (Client Mode)"])


@router.get("/me", response_model=APIResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
) -> APIResponse:
    """
    Get current user information.

    In client mode, this returns the local user's information.
    """
    return APIResponse(
        success=True,
        data={
            "id": current_user.id,
            "email": current_user.email,
            "is_admin": current_user.is_admin,
            "is_active": current_user.is_active,
            "client_id": current_user.client_id,
            "email_verified": current_user.email_verified,
            "debug_mode": getattr(current_user, 'debug_mode', False),
            "admin_data_sharing": getattr(current_user, 'admin_data_sharing', False),
        },
    )


@router.post("/auto-login", response_model=APIResponse)
async def auto_login(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Auto-login endpoint for client mode.

    Creates a session cookie for the local user without requiring credentials.
    This is safe because client mode runs locally and is single-user.
    """
    from datetime import timedelta
    from ..utils.auth import create_access_token

    # Get or create local user
    user = await get_or_create_local_user(db)

    # Create access token (30 days for convenience)
    token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(days=30)
    )

    # Set httpOnly cookie for the entire site
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=30 * 24 * 60 * 60,  # 30 days
        samesite="lax",
        secure=False,  # Client mode runs on localhost
        path="/",  # Cookie valid for all paths
    )

    logger.info(f"[CLIENT_AUTH] Auto-login successful for {user.email}")

    return APIResponse(
        success=True,
        data={
            "id": user.id,
            "email": user.email,
            "is_admin": user.is_admin,
            "message": "Auto-login successful",
        },
    )


@router.post("/logout", response_model=APIResponse)
async def logout(response: Response) -> APIResponse:
    """
    Logout endpoint - clears the session cookie.
    """
    response.delete_cookie(key="access_token")
    return APIResponse(success=True, data={"message": "Logged out"})
