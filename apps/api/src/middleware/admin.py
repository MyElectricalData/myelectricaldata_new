from fastapi import HTTPException, status, Depends
from ..models import User
from ..config import settings
from .auth import get_current_user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Middleware to check if current user is admin"""
    if not settings.is_admin(current_user.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
