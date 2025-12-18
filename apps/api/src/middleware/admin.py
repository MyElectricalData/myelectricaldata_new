from fastapi import HTTPException, status, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from ..models import User, Role
from ..models.database import get_db
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


def require_permission(resource: str):  # type: ignore[no-untyped-def]
    """Dependency factory to check if user has permission for a resource"""
    async def permission_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> User:
        # Admin has all permissions
        if settings.is_admin(current_user.email):
            return current_user

        # Load user with role and permissions
        result = await db.execute(
            select(User)
            .where(User.id == current_user.id)
            .options(selectinload(User.role).selectinload(Role.permissions))
        )
        user = result.scalar_one_or_none()

        if not user or not user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {resource} permission required"
            )

        # Check if user has permission for this resource
        has_permission = any(
            perm.resource == resource
            for perm in user.role.permissions
        )

        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {resource} permission required"
            )

        return user

    return permission_checker


def require_action(resource: str, action: str):  # type: ignore[no-untyped-def]
    """Dependency factory to check if user has a specific action permission for a resource"""
    async def action_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> User:
        # Admin has all permissions
        if settings.is_admin(current_user.email):
            return current_user

        # Load user with role and permissions
        result = await db.execute(
            select(User)
            .where(User.id == current_user.id)
            .options(selectinload(User.role).selectinload(Role.permissions))
        )
        user = result.scalar_one_or_none()

        if not user or not user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {resource}.{action} permission required"
            )

        # Check if user has specific action permission for this resource
        permission_name = f"admin.{resource}.{action}"
        has_action = any(
            perm.name == permission_name
            for perm in user.role.permissions
        )

        if not has_action:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {resource}.{action} permission required"
            )

        return user

    return action_checker
