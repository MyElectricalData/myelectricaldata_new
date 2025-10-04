from fastapi import APIRouter, Depends, HTTPException, status, Form, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, UTC
import secrets
import httpx
from ..models import User, PDL, Token, EmailVerificationToken, PasswordResetToken
from ..models.database import get_db
from ..schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    ClientCredentials,
    TokenResponse,
    APIResponse,
    ErrorDetail,
)
from ..utils import (
    verify_password,
    get_password_hash,
    create_access_token,
    generate_client_id,
    generate_client_secret,
)
from ..middleware import get_current_user
from ..services import cache_service, email_service, rate_limiter
from ..config import settings

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.post("/signup", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Create a new user account"""
    # Verify Turnstile captcha if enabled
    if settings.REQUIRE_CAPTCHA:
        if not user_data.turnstile_token:
            print("[CAPTCHA] No token provided")
            return APIResponse(
                success=False, error=ErrorDetail(code="CAPTCHA_REQUIRED", message="Captcha verification required")
            )

        # Verify captcha with Cloudflare
        print(f"[CAPTCHA] Verifying token: {user_data.turnstile_token[:20]}...")
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                    json={"secret": settings.TURNSTILE_SECRET_KEY, "response": user_data.turnstile_token},
                )
                result_data = response.json()
                print(f"[CAPTCHA] Cloudflare response: {result_data}")

                if not result_data.get("success"):
                    return APIResponse(
                        success=False, error=ErrorDetail(code="CAPTCHA_FAILED", message="Captcha verification failed")
                    )
            except Exception as e:
                print(f"[CAPTCHA] Error verifying captcha: {str(e)}")
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

    print(f"[SIGNUP] User {user.email} created. Verification email sent.")

    # Return credentials with message about email verification
    credentials = ClientCredentials(client_id=client_id, client_secret=client_secret)

    return APIResponse(
        success=True,
        data={
            **credentials.model_dump(),
            "message": "Account created! Please check your email to verify your account.",
        },
    )


@router.post("/login", response_model=APIResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Login and get access token"""
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_CREDENTIALS", message="Invalid credentials"))

    if not user.is_active:
        return APIResponse(success=False, error=ErrorDetail(code="USER_INACTIVE", message="User account is inactive"))

    # Create access token
    access_token = create_access_token(data={"sub": user.id})
    token_response = TokenResponse(access_token=access_token)

    return APIResponse(success=True, data=token_response.model_dump())


@router.post("/token", tags=["Authentication"])
async def get_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
    grant_type: str = Form(None),
    scope: str = Form(""),
    client_id: str = Form(None),
    client_secret: str = Form(None)
):
    """
    OAuth2 Client Credentials Flow

    Provide your client_id and client_secret to obtain an access token.
    This token can then be used to authenticate API requests.

    Accepts credentials either in form data or in Authorization header (Basic Auth).
    """
    print(f"[TOKEN] Received request - Content-Type: {request.headers.get('content-type')}")
    print(f"[TOKEN] Authorization header: {request.headers.get('authorization', 'None')[:50] if request.headers.get('authorization') else 'None'}")
    print(f"[TOKEN] Form client_id: {client_id}, client_secret: {'***' if client_secret else None}")

    # Try to get credentials from Authorization header (Basic Auth)
    if not client_id or not client_secret:
        auth_header = request.headers.get('authorization')
        if auth_header and auth_header.startswith('Basic '):
            import base64
            try:
                encoded = auth_header.split(' ')[1]
                decoded = base64.b64decode(encoded).decode('utf-8')
                client_id, client_secret = decoded.split(':', 1)
                print(f"[TOKEN] From Basic Auth - client_id: {client_id}, client_secret: ***")
            except Exception as e:
                print(f"[TOKEN] Failed to parse Basic Auth: {e}")

    # If still not found, try form data
    if not client_id or not client_secret:
        try:
            form_data = await request.form()
            print(f"[TOKEN] Form data keys: {list(form_data.keys())}")
            client_id = form_data.get('client_id') or client_id
            client_secret = form_data.get('client_secret') or client_secret
            print(f"[TOKEN] After form parse - client_id: {client_id}, client_secret: {'***' if client_secret else None}")
        except Exception as e:
            print(f"[TOKEN] Failed to parse form: {e}")

    if not client_id or not client_secret:
        print(f"[TOKEN] Missing credentials - client_id: {client_id}, client_secret: {'***' if client_secret else None}")
        raise HTTPException(status_code=422, detail="client_id and client_secret are required (provide in form data or Basic Auth header)")

    # Find user by client_id
    result = await db.execute(select(User).where(User.client_id == client_id))
    user = result.scalar_one_or_none()

    if not user or user.client_secret != client_secret:
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
    user_response = UserResponse(
        id=current_user.id,
        email=current_user.email,
        client_id=current_user.client_id,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
    )

    # Add is_admin field
    user_data = user_response.model_dump()
    user_data['is_admin'] = settings.is_admin(current_user.email)

    return APIResponse(success=True, data=user_data)


@router.get("/credentials", response_model=APIResponse)
async def get_credentials(current_user: User = Depends(get_current_user)) -> APIResponse:
    """Get API credentials (client_id only, client_secret is never returned)"""
    credentials = ClientCredentials(client_id=current_user.client_id, client_secret="")

    return APIResponse(success=True, data={"client_id": credentials.client_id})


@router.delete("/me", response_model=APIResponse)
async def delete_account(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
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
async def verify_email(token: str, db: AsyncSession = Depends(get_db)) -> APIResponse:
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
    result = await db.execute(select(User).where(User.id == email_token.user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error=ErrorDetail(code="USER_NOT_FOUND", message="User not found"))

    # Mark email as verified
    user.email_verified = True
    await db.delete(email_token)
    await db.commit()

    print(f"[EMAIL_VERIFICATION] Email verified for user {user.email}")

    return APIResponse(success=True, data={"message": "Email verified successfully! You can now log in."})


@router.post("/resend-verification", response_model=APIResponse)
async def resend_verification(email: str, db: AsyncSession = Depends(get_db)) -> APIResponse:
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

    print(f"[RESEND_VERIFICATION] Verification email resent to {user.email}")

    return APIResponse(success=True, data={"message": "Verification email sent!"})


@router.post("/regenerate-secret", response_model=APIResponse)
async def regenerate_secret(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
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

    print(f"[REGENERATE_SECRET] Client secret regenerated for user {current_user.email}, cache cleared")

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

    print(f"[FORGOT_PASSWORD] Request for email: {email}")

    # Find user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Always return success to avoid email enumeration
    if not user:
        print(f"[FORGOT_PASSWORD] User not found: {email}")
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
    print(f"[FORGOT_PASSWORD] Reset URL: {reset_url}")

    try:
        await email_service.send_password_reset_email(user.email, reset_url)
        print(f"[FORGOT_PASSWORD] Reset email sent to: {user.email}")
    except Exception as e:
        print(f"[FORGOT_PASSWORD] Error sending email: {str(e)}")
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

    print(f"[RESET_PASSWORD] Attempting password reset with token: {token[:20]}...")

    # Find reset token
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == token)
    )
    reset_token = result.scalar_one_or_none()

    if not reset_token:
        print(f"[RESET_PASSWORD] Invalid token")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_TOKEN", message="Invalid or expired reset token")
        )

    # Check if token expired
    if datetime.now(UTC) > reset_token.expires_at:
        print(f"[RESET_PASSWORD] Token expired")
        await db.delete(reset_token)
        await db.commit()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="TOKEN_EXPIRED", message="Reset token has expired")
        )

    # Get user
    result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="USER_NOT_FOUND", message="User not found")
        )

    # Update password
    user.hashed_password = get_password_hash(new_password)

    # Delete the used reset token
    await db.delete(reset_token)
    await db.commit()

    print(f"[RESET_PASSWORD] Password reset successfully for user: {user.email}")

    return APIResponse(success=True, data={"message": "Password reset successfully!"})
