"""
Default roles and permissions seed data.

This module provides functions to initialize default roles and permissions
in the database when the application starts for the first time.
It also ensures ADMIN_EMAILS users always have the admin role.
"""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .role import Role, Permission

logger = logging.getLogger(__name__)


# Default permissions grouped by resource
DEFAULT_PERMISSIONS = [
    # Admin Dashboard
    {
        "name": "admin_dashboard",
        "display_name": "Tableau de bord admin",
        "description": "Accès au tableau de bord d'administration",
        "resource": "admin_dashboard",
    },
    # Users management
    {
        "name": "users",
        "display_name": "Gestion des utilisateurs",
        "description": "Voir la liste des utilisateurs",
        "resource": "users",
    },
    {
        "name": "users.edit",
        "display_name": "Modifier les utilisateurs",
        "description": "Créer, modifier et gérer les utilisateurs",
        "resource": "users",
    },
    {
        "name": "users.delete",
        "display_name": "Supprimer les utilisateurs",
        "description": "Supprimer des utilisateurs",
        "resource": "users",
    },
    # Logs
    {
        "name": "logs",
        "display_name": "Voir les logs",
        "description": "Consulter les logs de l'application",
        "resource": "logs",
    },
    {
        "name": "logs.delete",
        "display_name": "Supprimer les logs",
        "description": "Supprimer les logs de l'application",
        "resource": "logs",
    },
    # Contributions
    {
        "name": "contributions",
        "display_name": "Gestion des contributions",
        "description": "Modérer les contributions des utilisateurs",
        "resource": "contributions",
    },
    # Energy Offers
    {
        "name": "offers",
        "display_name": "Gestion des offres",
        "description": "Gérer les offres tarifaires",
        "resource": "offers",
    },
    {
        "name": "offers.delete",
        "display_name": "Supprimer les offres",
        "description": "Supprimer des offres tarifaires",
        "resource": "offers",
    },
    # Roles
    {
        "name": "roles",
        "display_name": "Gestion des rôles",
        "description": "Gérer les rôles et permissions",
        "resource": "roles",
    },
]


# Default roles with their permissions
DEFAULT_ROLES = [
    {
        "name": "admin",
        "display_name": "Administrateur",
        "description": "Accès complet à toutes les fonctionnalités",
        "is_system": True,
        "permissions": [
            "admin_dashboard",
            "users",
            "users.edit",
            "users.delete",
            "logs",
            "logs.delete",
            "contributions",
            "offers",
            "offers.delete",
            "roles",
        ],
    },
    {
        "name": "moderator",
        "display_name": "Modérateur",
        "description": "Modération des contributions et gestion limitée",
        "is_system": True,
        "permissions": [
            "admin_dashboard",
            "users",
            "contributions",
            "offers",
            "logs",
        ],
    },
    {
        "name": "visitor",
        "display_name": "Visiteur",
        "description": "Accès en lecture seule aux données publiques",
        "is_system": True,
        "permissions": [],
    },
]


async def init_default_roles_and_permissions(db: AsyncSession) -> None:
    """
    Initialize default roles and permissions in the database.

    This function is idempotent - it only creates entries that don't exist yet.
    It will not modify existing roles or permissions.
    """
    try:
        # Check if permissions already exist
        result = await db.execute(select(Permission).limit(1))
        existing_permissions = result.scalar_one_or_none()

        if existing_permissions:
            logger.info("[SEED] Permissions already exist, skipping seed")
            return

        logger.info("[SEED] Initializing default permissions and roles...")

        # Create permissions
        permission_objects = {}
        for perm_data in DEFAULT_PERMISSIONS:
            permission = Permission(
                name=perm_data["name"],
                display_name=perm_data["display_name"],
                description=perm_data["description"],
                resource=perm_data["resource"],
            )
            db.add(permission)
            permission_objects[perm_data["name"]] = permission
            logger.info(f"[SEED] Created permission: {perm_data['name']}")

        # Flush to get permission IDs
        await db.flush()

        # Create roles with their permissions
        for role_data in DEFAULT_ROLES:
            role = Role(
                name=role_data["name"],
                display_name=role_data["display_name"],
                description=role_data["description"],
                is_system=role_data["is_system"],
            )

            # Assign permissions to role
            for perm_name in role_data["permissions"]:
                if perm_name in permission_objects:
                    role.permissions.append(permission_objects[perm_name])

            db.add(role)
            logger.info(f"[SEED] Created role: {role_data['name']} with {len(role_data['permissions'])} permissions")

        await db.commit()
        logger.info("[SEED] Default roles and permissions initialized successfully")

    except Exception as e:
        logger.error(f"[SEED] Error initializing roles and permissions: {e}")
        await db.rollback()
        raise


async def sync_admin_users(db: AsyncSession) -> None:
    """
    Ensure all users in ADMIN_EMAILS have the admin role.

    This function runs at every startup to guarantee that configured
    admin emails always have admin privileges, even if their role
    was accidentally changed.
    """
    from ..config import settings
    from .user import User

    if not settings.ADMIN_EMAILS:
        logger.info("[SEED] No ADMIN_EMAILS configured, skipping admin sync")
        return

    try:
        # Get admin role
        result = await db.execute(select(Role).where(Role.name == "admin"))
        admin_role = result.scalar_one_or_none()

        if not admin_role:
            logger.warning("[SEED] Admin role not found, cannot sync admin users")
            return

        # Parse admin emails
        admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]

        if not admin_emails:
            return

        logger.info(f"[SEED] Syncing admin role for {len(admin_emails)} configured admin(s)...")

        updated_count = 0
        for email in admin_emails:
            # Find user by email (case-insensitive)
            result = await db.execute(
                select(User).where(User.email.ilike(email))
            )
            user = result.scalar_one_or_none()

            if not user:
                logger.debug(f"[SEED] Admin user not found (not yet registered): {email}")
                continue

            # Check if user needs update
            needs_update = False
            if user.role_id != admin_role.id:
                user.role_id = admin_role.id
                needs_update = True
            if not user.is_admin:
                user.is_admin = True
                needs_update = True

            if needs_update:
                updated_count += 1
                logger.info(f"[SEED] Admin role assigned to: {user.email}")

        if updated_count > 0:
            await db.commit()
            logger.info(f"[SEED] Admin sync complete: {updated_count} user(s) updated")
        else:
            logger.info("[SEED] Admin sync complete: all admin users already have correct role")

    except Exception as e:
        logger.error(f"[SEED] Error syncing admin users: {e}")
        await db.rollback()
        raise
