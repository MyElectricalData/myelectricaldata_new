from fastapi import APIRouter, Depends, Path, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from ..models import User, Role, Permission
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..middleware import get_current_user

router = APIRouter(prefix="/admin/roles", tags=["Roles"])


@router.get("/", response_model=APIResponse)
async def list_roles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """List all roles with their permissions (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    try:
        result = await db.execute(
            select(Role).options(selectinload(Role.permissions)).order_by(Role.name)
        )
        roles = result.scalars().all()

        return APIResponse(
            success=True,
            data=[
                {
                    "id": role.id,
                    "name": role.name,
                    "display_name": role.display_name,
                    "description": role.description,
                    "is_system": role.is_system,
                    "permissions": [
                        {
                            "id": perm.id,
                            "name": perm.name,
                            "display_name": perm.display_name,
                            "resource": perm.resource,
                        }
                        for perm in role.permissions
                    ],
                }
                for role in roles
            ],
        )
    except Exception as e:
        print(f"[ROLES LIST ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to fetch roles")
        )


@router.get("/permissions", response_model=APIResponse)
async def list_permissions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """List all available permissions (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    try:
        result = await db.execute(select(Permission).order_by(Permission.resource, Permission.name))
        permissions = result.scalars().all()

        # Group by resource
        grouped = {}
        for perm in permissions:
            if perm.resource not in grouped:
                grouped[perm.resource] = []
            grouped[perm.resource].append({
                "id": perm.id,
                "name": perm.name,
                "display_name": perm.display_name,
                "description": perm.description,
            })

        return APIResponse(
            success=True,
            data=grouped,
        )
    except Exception as e:
        print(f"[PERMISSIONS LIST ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to fetch permissions")
        )


@router.put("/{role_id}/permissions", response_model=APIResponse)
async def update_role_permissions(
    role_id: str = Path(..., description="Role ID (UUID)", openapi_examples={"role_uuid": {"summary": "Role UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    permission_ids: list[str] = Body(..., embed=True, openapi_examples={"permissions": {"summary": "Permission IDs", "value": ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"]}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Update permissions for a role (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    try:
        # Get role
        result = await db.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
        )
        role = result.scalar_one_or_none()

        if not role:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="NOT_FOUND", message="Role not found")
            )

        # Cannot modify admin role
        if role.name == "admin":
            return APIResponse(
                success=False,
                error=ErrorDetail(code="FORBIDDEN", message="Cannot modify admin role permissions")
            )

        # Get all permissions
        result = await db.execute(select(Permission).where(Permission.id.in_(permission_ids)))
        permissions = result.scalars().all()

        # Update role permissions
        role.permissions = permissions
        await db.commit()

        return APIResponse(
            success=True,
            data={
                "role_id": role.id,
                "permission_count": len(permissions),
            },
        )
    except Exception as e:
        await db.rollback()
        print(f"[ROLE PERMISSIONS UPDATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to update role permissions")
        )


@router.put("/users/{user_id}/role", response_model=APIResponse)
async def update_user_role(
    user_id: str = Path(..., description="User ID (UUID)", openapi_examples={"user_uuid": {"summary": "User UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    request_data: dict = Body(..., openapi_examples={"assign_role": {"summary": "Assign role to user", "value": {"role_id": "550e8400-e29b-41d4-a716-446655440001"}}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Update user's role (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    role_id = request_data.get("role_id")

    try:
        # Get user
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="NOT_FOUND", message="User not found")
            )

        # Get role
        result = await db.execute(select(Role).where(Role.id == role_id))
        role = result.scalar_one_or_none()

        if not role:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="NOT_FOUND", message="Role not found")
            )

        # Update user role
        user.role_id = role.id
        # Update is_admin flag for backward compatibility
        user.is_admin = (role.name == "admin")

        await db.commit()
        await db.refresh(user)

        return APIResponse(
            success=True,
            data={
                "user_id": user.id,
                "role_id": role.id,
                "role_name": role.name,
            },
        )
    except Exception as e:
        await db.rollback()
        print(f"[USER ROLE UPDATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to update user role")
        )
