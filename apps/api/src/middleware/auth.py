from typing import Optional
from fastapi import Security, HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from fastapi.security import OAuth2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import User
from ..models.database import get_db
from ..utils import decode_access_token
from ..config import settings
import logging

# OAuth2 Client Credentials for Swagger UI

logger = logging.getLogger(__name__)

# Demo account email constant
DEMO_EMAIL = "demo@myelectricaldata.fr"

oauth2_scheme = OAuth2(
    flows=OAuthFlowsModel(
        clientCredentials={
            "tokenUrl": "/api/accounts/token",
            "scopes": {}
        }
    ),
    scheme_name="OAuth2ClientCredentials",
    description="Use your client_id and client_secret to authenticate",
    auto_error=False
)

# HTTP Bearer for direct API access (fallback)
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    oauth_token: Optional[str] = Security(oauth2_scheme),
    bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token or API key"""
    # Get token from either OAuth2 or Bearer header
    token = None
    if bearer_token:
        token = bearer_token.credentials
    elif oauth_token:
        token = oauth_token

    if not token:
        logger.warning("[AUTH] No token provided")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Try JWT token first
    payload = decode_access_token(token)
    if payload:
        user_id = payload.get("sub")
        logger.debug(f"[AUTH] JWT token decoded, user_id: {user_id}")
        if user_id:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                logger.debug(f"[AUTH] User found: {user.email}, is_active: {user.is_active}, email_verified: {user.email_verified}")
                if user.is_active:
                    if settings.REQUIRE_EMAIL_VERIFICATION and not user.email_verified:
                        logger.debug("[AUTH] Email verification required but not verified")
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Email not verified. Please check your email for verification link.",
                        )
                    logger.debug("[AUTH] User authenticated successfully")
                    return user
                else:
                    logger.debug("[AUTH] User is inactive")
            else:
                logger.error("[AUTH] User not found in database")

    # Try API key (client_secret)
    logger.debug("[AUTH] Trying API key authentication")
    result = await db.execute(select(User).where(User.client_secret == token))
    user = result.scalar_one_or_none()
    if user and user.is_active:
        if settings.REQUIRE_EMAIL_VERIFICATION and not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not verified. Please check your email for verification link.",
            )
        return user

    logger.error("[AUTH] Authentication failed")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")


async def get_current_user_optional(
    request: Request,
    db: AsyncSession,
) -> Optional[User]:
    """Get current user if authenticated, return None otherwise (no exception raised).

    Used for endpoints that can work with or without authentication.
    Also checks for token in query params or cookies for OAuth callbacks.
    """
    # Try to get token from Authorization header
    auth_header = request.headers.get("Authorization")
    token = None

    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]

    # Try to get token from query params (for OAuth callbacks)
    if not token:
        token = request.query_params.get("access_token")

    # Try to get token from cookies
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        return None

    # Try JWT token
    payload = decode_access_token(token)
    if payload:
        user_id = payload.get("sub")
        if user_id:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user and user.is_active:
                return user

    # Try API key (client_secret)
    result = await db.execute(select(User).where(User.client_secret == token))
    user = result.scalar_one_or_none()
    if user and user.is_active:
        return user

    return None


def is_demo_user(user: User) -> bool:
    """Check if the user is a demo account"""
    return user.email == DEMO_EMAIL


async def require_not_demo(current_user: User = Depends(get_current_user)) -> User:
    """
    Middleware that blocks demo accounts from performing write operations.
    Use this dependency on any endpoint that modifies data.
    """
    if is_demo_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Le compte de démonstration est en lecture seule"
        )
    return current_user
