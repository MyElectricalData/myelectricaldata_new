import logging
import secrets
from datetime import datetime, timedelta, UTC
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Form, Request, Body, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import settings
from ..middleware import get_current_user, require_not_demo
from ..models import User, PDL, EmailVerificationToken, PasswordResetToken, Role
from ..models.database import get_db
from ..schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    ClientCredentials,
    APIResponse,
    ErrorDetail,
)
from ..services import cache_service, email_service, rate_limiter
from ..utils import (
    verify_password,
    get_password_hash,
    create_access_token,
    generate_client_id,
    generate_client_secret,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.post("/signup", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: UserCreate = Body(
        ...,
        openapi_examples={
            "standard_user": {
                "summary": "Standard user registration",
                "description": "Create a new user account with email and password",
                "value": {
                    "email": "user@example.com",
                    "password": "SecurePassword123!",
                    "turnstile_token": "0.abc123..."
                }
            },
            "without_captcha": {
                "summary": "Without captcha (dev mode)",
                "description": "Registration without captcha token",
                "value": {
                    "email": "dev@example.com",
                    "password": "DevPassword123!",
                    "turnstile_token": None
                }
            }
        }
    ),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Create a new user account"""
    # Verify Turnstile captcha if enabled
    if settings.REQUIRE_CAPTCHA:
        if not user_data.turnstile_token:
            logger.warning("[CAPTCHA] No token provided")
            return APIResponse(
                success=False, error=ErrorDetail(code="CAPTCHA_REQUIRED", message="Captcha verification required")
            )

        # Verify captcha with Cloudflare
        logger.debug(f"[CAPTCHA] Verifying token: {user_data.turnstile_token[:20]}...")
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                    json={"secret": settings.TURNSTILE_SECRET_KEY, "response": user_data.turnstile_token},
                )
                result_data = response.json()
                logger.debug(f"[CAPTCHA] Cloudflare response: {result_data}")

                if not result_data.get("success"):
                    return APIResponse(
                        success=False, error=ErrorDetail(code="CAPTCHA_FAILED", message="Captcha verification failed")
                    )
            except Exception as e:
                logger.error(f"[CAPTCHA] Error verifying captcha: {str(e)}")
                return APIResponse(
                    success=False, error=ErrorDetail(code="CAPTCHA_ERROR", message="Error verifying captcha")
                )

    # Check if user exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        return APIResponse(
            success=False, error=ErrorDetail(code="USER_EXISTS", message="User with this email already exists")
        )

    # Create user
    client_id = generate_client_id()
    client_secret = generate_client_secret()

    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        client_id=client_id,
        client_secret=client_secret,
        email_verified=False,  # Email not verified yet
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Create email verification token
    verification_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=24)

    email_token = EmailVerificationToken(
        user_id=user.id,
        token=verification_token,
        expires_at=expires_at,
    )
    db.add(email_token)
    await db.commit()

    # Send verification email
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
    await email_service.send_verification_email(user.email, verification_url)

    logger.info(f"[SIGNUP] User {user.email} created. Verification email sent.")

    # Return credentials with message about email verification
    credentials = ClientCredentials(client_id=client_id, client_secret=client_secret)

    return APIResponse(
        success=True,
        data={
            **credentials.model_dump(),
            "message": "Account created! Please check your email to verify your account.",
        },
    )


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set httpOnly cookie with JWT token"""
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,  # Prevents JavaScript access (XSS protection)
        secure=settings.COOKIE_SECURE,  # HTTPS only in production
        samesite=settings.COOKIE_SAMESITE,  # CSRF protection
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # 43200 min = 30 days in seconds
        path="/",  # Available for all paths
        domain=settings.COOKIE_DOMAIN or None,  # None = current domain
    )


def _clear_auth_cookie(response: Response) -> None:
    """Clear the auth cookie on logout"""
    response.delete_cookie(
        key="access_token",
        path="/",
        domain=settings.COOKIE_DOMAIN or None,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )


@router.post("/login", response_model=APIResponse)
async def login(
    response: Response,
    credentials: UserLogin = Body(
        ...,
        openapi_examples={
            "user_login": {
                "summary": "User login",
                "description": "Login with email and password to get JWT token",
                "value": {
                    "email": "user@example.com",
                    "password": "SecurePassword123!"
                }
            }
        }
    ),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Login and get access token (stored in httpOnly cookie)"""
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_CREDENTIALS", message="Invalid credentials"))

    if not user.is_active:
        return APIResponse(success=False, error=ErrorDetail(code="USER_INACTIVE", message="User account is inactive"))

    # Create access token and set as httpOnly cookie
    access_token = create_access_token(data={"sub": user.id})
    _set_auth_cookie(response, access_token)

    # Return success without exposing token in response body
    return APIResponse(success=True, data={"message": "Login successful"})


@router.post("/token", tags=["Authentication"])
async def get_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
    grant_type: Optional[str] = Form(None),
    scope: str = Form(""),
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None)
) -> dict[str, str]:
    """
    OAuth2 Client Credentials Flow

    Provide your client_id and client_secret to obtain an access token.
    This token can then be used to authenticate API requests.

    Accepts credentials either in form data or in Authorization header (Basic Auth).
    """
    # Try to get credentials from Authorization header (Basic Auth)
    if not client_id or not client_secret:
        auth_header = request.headers.get('authorization')
        if auth_header and auth_header.startswith('Basic '):
            import base64
            try:
                encoded = auth_header.split(' ')[1]
                decoded = base64.b64decode(encoded).decode('utf-8')
                client_id, client_secret = decoded.split(':', 1)
            except Exception:
                pass  # Invalid Basic Auth format, will try form data next

    # If still not found, try form data
    if not client_id or not client_secret:
        try:
            form_data = await request.form()
            client_id_form = form_data.get('client_id')
            client_secret_form = form_data.get('client_secret')
            # Only use if it's a string (not UploadFile)
            if isinstance(client_id_form, str):
                client_id = client_id_form or client_id
            if isinstance(client_secret_form, str):
                client_secret = client_secret_form or client_secret
        except Exception:
            pass  # Form parsing failed, credentials may still be from Basic Auth

    if not client_id or not client_secret:
        raise HTTPException(status_code=422, detail="client_id and client_secret are required (provide in form data or Basic Auth header)")

    # Find user by client_id
    result = await db.execute(select(User).where(User.client_id == client_id))
    user = result.scalar_one_or_none()

    if not user or not secrets.compare_digest(user.client_secret, client_secret):
        raise HTTPException(status_code=401, detail="Invalid client credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")

    # Create access token
    access_token = create_access_token(data={"sub": user.id})

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=APIResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Get current user information"""
    # Reload user with role and permissions relationships
    result = await db.execute(
        select(User)
        .where(User.id == current_user.id)
        .options(selectinload(User.role).selectinload(Role.permissions))
    )
    user = result.scalar_one()

    user_response = UserResponse(
        id=user.id,
        email=user.email,
        client_id=user.client_id,
        is_active=user.is_active,
        created_at=user.created_at,
    )

    # Add is_admin field, debug_mode, admin_data_sharing, and role
    # is_admin is true if: database flag OR email in ADMIN_EMAILS env var
    user_data = user_response.model_dump()
    user_data['is_admin'] = user.is_admin or settings.is_admin(user.email)
    user_data['debug_mode'] = user.debug_mode
    user_data['admin_data_sharing'] = user.admin_data_sharing
    user_data['admin_data_sharing_enabled_at'] = user.admin_data_sharing_enabled_at.isoformat() if user.admin_data_sharing_enabled_at else None

    # Add role information with permissions
    if user.role:
        user_data['role'] = {
            'id': user.role.id,
            'name': user.role.name,
            'display_name': user.role.display_name,
            'permissions': [
                {
                    'id': perm.id,
                    'name': perm.name,
                    'display_name': perm.display_name,
                    'resource': perm.resource,
                }
                for perm in user.role.permissions
            ]
        }
    else:
        # Default to visitor role if no role assigned
        user_data['role'] = {
            'id': None,
            'name': 'visitor',
            'display_name': 'Visiteur',
            'permissions': []
        }

    return APIResponse(success=True, data=user_data)


@router.post("/logout", response_model=APIResponse)
async def logout(response: Response) -> APIResponse:
    """Logout and clear auth cookie"""
    _clear_auth_cookie(response)
    return APIResponse(success=True, data={"message": "Logout successful"})


@router.get("/credentials", response_model=APIResponse)
async def get_credentials(current_user: User = Depends(get_current_user)) -> APIResponse:
    """Get API credentials (client_id only, client_secret is never returned)"""
    credentials = ClientCredentials(client_id=current_user.client_id, client_secret="")

    return APIResponse(success=True, data={"client_id": credentials.client_id})


@router.delete("/me", response_model=APIResponse)
async def delete_account(
    current_user: User = Depends(require_not_demo), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Delete user account and all associated data"""
    # Delete cache for all user's PDLs
    result = await db.execute(select(PDL).where(PDL.user_id == current_user.id))
    pdls = result.scalars().all()

    for pdl in pdls:
        await cache_service.delete_pattern(f"{pdl.usage_point_id}:*")

    # Delete user (cascades to PDL, Token, and EmailVerificationToken)
    await db.delete(current_user)
    await db.commit()

    return APIResponse(success=True, data={"message": "Account deleted successfully"})


@router.get("/verify-email", response_model=APIResponse)
async def verify_email(
    token: str = Query(
        ...,
        description="Email verification token",
        openapi_examples={
            "verification_token": {
                "summary": "Verification token",
                "description": "Token received in verification email",
                "value": "abc123def456ghi789jkl012mno345pqr678"
            }
        }
    ),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Verify user email with token"""
    # Find verification token
    result = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.token == token))
    email_token = result.scalar_one_or_none()

    if not email_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="INVALID_TOKEN", message="Invalid or expired verification token")
        )

    # Check if token is expired
    if email_token.expires_at < datetime.now(UTC):
        await db.delete(email_token)
        await db.commit()
        return APIResponse(
            success=False, error=ErrorDetail(code="TOKEN_EXPIRED", message="Verification token has expired")
        )

    # Get user
    user_result = await db.execute(select(User).where(User.id == email_token.user_id))
    user_obj = user_result.scalar_one_or_none()

    if not user_obj:
        return APIResponse(success=False, error=ErrorDetail(code="USER_NOT_FOUND", message="User not found"))

    # Mark email as verified
    user_obj.email_verified = True
    await db.delete(email_token)
    await db.commit()

    logger.info(f"[EMAIL_VERIFICATION] Email verified for user {user_obj.email}")

    return APIResponse(success=True, data={"message": "Email verified successfully! You can now log in."})


@router.post("/resend-verification", response_model=APIResponse)
async def resend_verification(
    email: str = Body(
        ...,
        embed=True,
        openapi_examples={
            "resend": {
                "summary": "Resend verification",
                "value": "user@example.com"
            }
        }
    ),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Resend verification email"""
    # Find user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        # Don't reveal if email exists
        return APIResponse(success=True, data={"message": "If the email exists, a verification link has been sent."})

    if user.email_verified:
        return APIResponse(success=False, error=ErrorDetail(code="ALREADY_VERIFIED", message="Email already verified"))

    # Delete old verification tokens
    result = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id))
    old_tokens = result.scalars().all()
    for old_token in old_tokens:
        await db.delete(old_token)

    # Create new verification token
    verification_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=24)

    email_token = EmailVerificationToken(
        user_id=user.id,
        token=verification_token,
        expires_at=expires_at,
    )
    db.add(email_token)
    await db.commit()

    # Send verification email
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
    await email_service.send_verification_email(user.email, verification_url)

    logger.info(f"[RESEND_VERIFICATION] Verification email resent to {user.email}")

    return APIResponse(success=True, data={"message": "Verification email sent!"})


@router.post("/regenerate-secret", response_model=APIResponse)
async def regenerate_secret(
    current_user: User = Depends(require_not_demo), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Regenerate client_secret and clear all cache"""
    # Generate new client_secret
    new_client_secret = generate_client_secret()
    current_user.client_secret = new_client_secret

    # Delete all PDL cache
    result = await db.execute(select(PDL).where(PDL.user_id == current_user.id))
    pdls = result.scalars().all()

    for pdl in pdls:
        await cache_service.delete_pattern(f"{pdl.usage_point_id}:*")

    await db.commit()

    logger.info(f"[REGENERATE_SECRET] Client secret regenerated for user {current_user.email}, cache cleared")

    credentials = ClientCredentials(client_id=current_user.client_id, client_secret=new_client_secret)

    return APIResponse(success=True, data=credentials.model_dump())


@router.get("/usage-stats", response_model=APIResponse)
async def get_usage_stats(current_user: User = Depends(get_current_user)) -> APIResponse:
    """Get current user's API usage statistics"""
    stats = await rate_limiter.get_usage_stats(current_user.id)

    return APIResponse(success=True, data=stats)


@router.post("/forgot-password", response_model=APIResponse)
async def forgot_password(request: Request, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Request a password reset link"""
    # Parse email from request body
    body = await request.json()
    email = body.get('email')

    if not email:
        raise HTTPException(status_code=422, detail="Email is required")

    logger.debug(f"[FORGOT_PASSWORD] Request for email: {email}")

    # Find user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Always return success to avoid email enumeration
    if not user:
        logger.error(f"[FORGOT_PASSWORD] User not found: {email}")
        return APIResponse(
            success=True,
            data={"message": "If the email exists, a password reset link has been sent."}
        )

    # Delete old password reset tokens for this user
    result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    old_tokens = result.scalars().all()
    for old_token in old_tokens:
        await db.delete(old_token)

    # Create new reset token
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=1)  # Token valid for 1 hour

    password_reset = PasswordResetToken(
        user_id=user.id,
        token=reset_token,
        expires_at=expires_at,
    )
    db.add(password_reset)
    await db.commit()

    # Send email with reset link
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    # In development mode, log the reset URL
    logger.info(f"[FORGOT_PASSWORD] Reset URL: {reset_url}")

    try:
        await email_service.send_password_reset_email(user.email, reset_url)
        logger.info(f"[FORGOT_PASSWORD] Reset email sent to: {user.email}")
    except Exception as e:
        logger.error(f"[FORGOT_PASSWORD] Error sending email: {str(e)}")
        # Don't reveal email sending errors to avoid enumeration

    return APIResponse(
        success=True,
        data={"message": "If the email exists, a password reset link has been sent."}
    )


@router.post("/reset-password", response_model=APIResponse)
async def reset_password(request: Request, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Reset password using a valid reset token"""
    # Parse token and password from request body
    body = await request.json()
    token = body.get('token')
    new_password = body.get('new_password')

    if not token or not new_password:
        raise HTTPException(status_code=422, detail="Token and new_password are required")

    logger.info(f"[RESET_PASSWORD] Attempting password reset with token: {token[:20]}...")

    # Find reset token
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == token)
    )
    reset_token = result.scalar_one_or_none()

    if not reset_token:
        logger.info("[RESET_PASSWORD] Invalid token")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_TOKEN", message="Invalid or expired reset token")
        )

    # Check if token expired
    if datetime.now(UTC) > reset_token.expires_at:
        logger.info("[RESET_PASSWORD] Token expired")
        await db.delete(reset_token)
        await db.commit()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="TOKEN_EXPIRED", message="Reset token has expired")
        )

    # Get user
    user_result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user_obj = user_result.scalar_one_or_none()

    if not user_obj:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="USER_NOT_FOUND", message="User not found")
        )

    # Update password
    user_obj.hashed_password = get_password_hash(new_password)

    # Delete the used reset token
    await db.delete(reset_token)
    await db.commit()

    logger.info(f"[RESET_PASSWORD] Password reset successfully for user: {user_obj.email}")

    return APIResponse(success=True, data={"message": "Password reset successfully!"})


@router.post("/toggle-admin-sharing", response_model=APIResponse)
async def toggle_admin_data_sharing(
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Toggle admin data sharing for current user.

    When enabled, administrators can access the user's PDL data and cache
    for debugging purposes. The user can revoke this access at any time.
    """
    current_user.admin_data_sharing = not current_user.admin_data_sharing

    if current_user.admin_data_sharing:
        current_user.admin_data_sharing_enabled_at = datetime.now(UTC)
    else:
        current_user.admin_data_sharing_enabled_at = None

    await db.commit()

    action = "enabled" if current_user.admin_data_sharing else "disabled"
    logger.info(f"[ADMIN_SHARING] User {current_user.email} {action} admin data sharing")

    return APIResponse(
        success=True,
        data={
            "admin_data_sharing": current_user.admin_data_sharing,
            "admin_data_sharing_enabled_at": current_user.admin_data_sharing_enabled_at.isoformat() if current_user.admin_data_sharing_enabled_at else None,
            "message": f"Partage des données avec les administrateurs {'activé' if current_user.admin_data_sharing else 'désactivé'}"
        }
    )


@router.post("/update-password", response_model=APIResponse)
async def update_password(
    request: Request,
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Update password for authenticated user (requires old password verification)"""
    # Parse old and new password from request body
    body = await request.json()
    old_password = body.get('old_password')
    new_password = body.get('new_password')

    if not old_password or not new_password:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="MISSING_FIELDS", message="old_password and new_password are required")
        )

    # Verify old password
    if not verify_password(old_password, current_user.hashed_password):
        logger.warning(f"[UPDATE_PASSWORD] Failed attempt for user {current_user.email} - invalid old password")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_PASSWORD", message="Current password is incorrect")
        )

    # Update password
    current_user.hashed_password = get_password_hash(new_password)
    await db.commit()

    logger.info(f"[UPDATE_PASSWORD] Password updated successfully for user: {current_user.email}")

    return APIResponse(success=True, data={"message": "Password updated successfully!"})
