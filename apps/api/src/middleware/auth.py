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

# OAuth2 Client Credentials for Swagger UI
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
        print("[AUTH] No token provided")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Try JWT token first
    payload = decode_access_token(token)
    if payload:
        user_id = payload.get("sub")
        print(f"[AUTH] JWT token decoded, user_id: {user_id}")
        if user_id:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                print(f"[AUTH] User found: {user.email}, is_active: {user.is_active}, email_verified: {user.email_verified}")
                if user.is_active:
                    if settings.REQUIRE_EMAIL_VERIFICATION and not user.email_verified:
                        print("[AUTH] Email verification required but not verified")
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Email not verified. Please check your email for verification link.",
                        )
                    print("[AUTH] User authenticated successfully")
                    return user
                else:
                    print("[AUTH] User is inactive")
            else:
                print("[AUTH] User not found in database")

    # Try API key (client_secret)
    print("[AUTH] Trying API key authentication")
    result = await db.execute(select(User).where(User.client_secret == token))
    user = result.scalar_one_or_none()
    if user and user.is_active:
        if settings.REQUIRE_EMAIL_VERIFICATION and not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not verified. Please check your email for verification link.",
            )
        return user

    print("[AUTH] Authentication failed")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")
