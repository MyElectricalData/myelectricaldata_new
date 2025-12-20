from typing import Optional
from fastapi import Security, HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.security import OAuth2
from fastapi.security.oauth2 import OAuthFlowsModel
try:
    from fastapi.security.oauth2 import OAuthFlowClientCredentials  # type: ignore[attr-defined]
except ImportError:
    from fastapi.openapi.models import OAuthFlowClientCredentials  # type: ignore[assignment, attr-defined]
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
        clientCredentials=OAuthFlowClientCredentials(
            tokenUrl="/api/accounts/token",
            scopes={}
        )
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
    """Get current authenticated user from JWT token (cookie or header) or API key"""
    # Priority order: httpOnly cookie > Bearer header > OAuth2 token
    token = None

    # 1. Try httpOnly cookie first (most secure for browser clients)
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        token = cookie_token
        logger.debug("[AUTH] Token from httpOnly cookie")

    # 2. Fallback to Bearer header (for API clients)
    if not token and bearer_token:
        token = bearer_token.credentials
        logger.debug("[AUTH] Token from Bearer header")

    # 3. Fallback to OAuth2 token
    if not token and oauth_token:
        token = oauth_token
        logger.debug("[AUTH] Token from OAuth2 scheme")

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


async def get_impersonation_context(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    Get the user being impersonated if admin is accessing shared data.

    Returns:
        - The impersonated user (for getting their client_secret) if:
          1. Current user is admin (is_admin or role admin)
          2. X-Impersonate-User-Id header is present
          3. Target user has enabled admin_data_sharing
        - None otherwise (use current_user's client_secret)

    This is used to properly decrypt cached data that was encrypted
    with the data owner's client_secret.
    """
    impersonate_user_id = request.headers.get("X-Impersonate-User-Id")

    if not impersonate_user_id:
        return None

    # Check if current user is admin
    is_admin = current_user.is_admin or (current_user.role and current_user.role.name == "admin")
    if not is_admin:
        logger.warning(f"[IMPERSONATION] Non-admin user {current_user.email} tried to impersonate {impersonate_user_id}")
        return None

    # Get the target user
    result = await db.execute(select(User).where(User.id == impersonate_user_id))
    target_user = result.scalar_one_or_none()

    if not target_user:
        logger.warning(f"[IMPERSONATION] Admin {current_user.email} tried to impersonate non-existent user {impersonate_user_id}")
        return None

    # Check if target user has enabled data sharing
    if not target_user.admin_data_sharing:
        logger.warning(f"[IMPERSONATION] Admin {current_user.email} tried to impersonate user {target_user.email} who has not enabled data sharing")
        return None

    logger.info(f"[IMPERSONATION] Admin {current_user.email} impersonating user {target_user.email}")
    return target_user


def get_encryption_key(current_user: User, impersonated_user: Optional[User]) -> str:
    """
    Get the encryption key (client_secret) to use for cache operations.

    Uses the impersonated user's key if impersonation is active,
    otherwise uses the current user's key.
    """
    if impersonated_user:
        return impersonated_user.client_secret
    return current_user.client_secret
