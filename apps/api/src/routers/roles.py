from fastapi import APIRouter, Depends, Path, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from ..models import User, Role, Permission
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail, RoleCreate, RoleUpdate
from ..middleware import get_current_user
import logging


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/roles", tags=["Roles"])


def _serialize_role(role: Role) -> dict:
    """Serialize a role with its permissions"""
    return {
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


@router.get("", response_model=APIResponse)
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
            data=[_serialize_role(role) for role in roles],
        )
    except Exception as e:
        logger.error(f"[ROLES LIST ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to fetch roles")
        )


@router.post("", response_model=APIResponse)
async def create_role(
    role_data: RoleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Create a new role (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    try:
        # Check if role name already exists
        result = await db.execute(select(Role).where(Role.name == role_data.name))
        existing_role = result.scalar_one_or_none()

        if existing_role:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="CONFLICT", message=f"Role '{role_data.name}' already exists")
            )

        # Create role
        role = Role(
            name=role_data.name,
            display_name=role_data.display_name,
            description=role_data.description,
            is_system=False,  # Custom roles are never system roles
        )

        # Assign permissions if provided
        if role_data.permission_ids:
            result = await db.execute(
                select(Permission).where(Permission.id.in_(role_data.permission_ids))
            )
            permissions = list(result.scalars().all())
            role.permissions = permissions  # type: ignore[assignment]

        db.add(role)
        await db.commit()
        await db.refresh(role)

        # Reload with permissions for serialization
        result = await db.execute(
            select(Role).where(Role.id == role.id).options(selectinload(Role.permissions))
        )
        role = result.scalar_one()

        logger.info(f"[ROLE CREATED] {role.name} by {current_user.email}")

        return APIResponse(
            success=True,
            data=_serialize_role(role),
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"[ROLE CREATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to create role")
        )


# Static routes must come before dynamic routes like /{role_id}
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
        grouped: dict[str, list[dict[str, str | None]]] = {}
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
        logger.error(f"[PERMISSIONS LIST ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to fetch permissions")
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
        role_result = await db.execute(select(Role).where(Role.id == role_id))
        role = role_result.scalar_one_or_none()

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
        logger.error(f"[USER ROLE UPDATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to update user role")
        )


# Dynamic routes with {role_id} parameter
@router.get("/{role_id}", response_model=APIResponse)
async def get_role(
    role_id: str = Path(..., description="Role ID (UUID)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Get a specific role by ID (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    try:
        result = await db.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
        )
        role = result.scalar_one_or_none()

        if not role:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="NOT_FOUND", message="Role not found")
            )

        return APIResponse(
            success=True,
            data=_serialize_role(role),
        )
    except Exception as e:
        logger.error(f"[ROLE GET ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to fetch role")
        )


@router.patch("/{role_id}", response_model=APIResponse)
async def update_role(
    role_data: RoleUpdate,
    role_id: str = Path(..., description="Role ID (UUID)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Update a role (Admin only). System roles cannot be modified."""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    try:
        result = await db.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
        )
        role = result.scalar_one_or_none()

        if not role:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="NOT_FOUND", message="Role not found")
            )

        # Cannot modify system roles (admin, moderator, visitor)
        if role.is_system:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="FORBIDDEN", message="Cannot modify system roles")
            )

        # Update fields if provided
        if role_data.display_name is not None:
            role.display_name = role_data.display_name
        if role_data.description is not None:
            role.description = role_data.description
        if role_data.permission_ids is not None:
            result = await db.execute(
                select(Permission).where(Permission.id.in_(role_data.permission_ids))
            )
            permissions = list(result.scalars().all())
            role.permissions = permissions  # type: ignore[assignment]

        await db.commit()
        await db.refresh(role)

        # Reload with permissions for serialization
        result = await db.execute(
            select(Role).where(Role.id == role.id).options(selectinload(Role.permissions))
        )
        role = result.scalar_one()

        logger.info(f"[ROLE UPDATED] {role.name} by {current_user.email}")

        return APIResponse(
            success=True,
            data=_serialize_role(role),
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"[ROLE UPDATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to update role")
        )


@router.delete("/{role_id}", response_model=APIResponse)
async def delete_role(
    role_id: str = Path(..., description="Role ID (UUID)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Delete a role (Admin only). System roles cannot be deleted."""
    if not current_user.is_admin:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="FORBIDDEN", message="Admin access required")
        )

    try:
        result = await db.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
        )
        role = result.scalar_one_or_none()

        if not role:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="NOT_FOUND", message="Role not found")
            )

        # Cannot delete system roles
        if role.is_system:
            return APIResponse(
                success=False,
                error=ErrorDetail(code="FORBIDDEN", message="Cannot delete system roles")
            )

        # Check if role is assigned to any users
        from ..models import User as UserModel
        result = await db.execute(
            select(UserModel).where(UserModel.role_id == role_id).limit(1)
        )
        user_with_role = result.scalar_one_or_none()

        if user_with_role:
            return APIResponse(
                success=False,
                error=ErrorDetail(
                    code="CONFLICT",
                    message="Cannot delete role: it is assigned to one or more users"
                )
            )

        role_name = role.name
        await db.delete(role)
        await db.commit()

        logger.info(f"[ROLE DELETED] {role_name} by {current_user.email}")

        return APIResponse(
            success=True,
            data={"message": f"Role '{role_name}' deleted successfully"},
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"[ROLE DELETE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to delete role")
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
        permissions_list = list(result.scalars().all())

        # Update role permissions
        role.permissions = permissions_list  # type: ignore[assignment]
        await db.commit()

        return APIResponse(
            success=True,
            data={
                "role_id": role.id,
                "permission_count": len(permissions_list),
            },
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"[ROLE PERMISSIONS UPDATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="DATABASE_ERROR", message="Failed to update role permissions")
        )
