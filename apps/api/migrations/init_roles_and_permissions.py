"""
Migration to initialize roles and permissions system

Creates:
- 3 roles: Admin, Moderator, Visitor
- Permissions for different resources
- Assigns permissions to roles
- Migrates existing users to role system
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import select, text
from src.models.database import get_db_session
from src.models import Role, Permission


async def init_roles_and_permissions():
    """Initialize roles and permissions"""
    async for db in get_db_session():
        try:
            # Create tables if they don't exist
            print("Creating roles and permissions tables...")
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS roles (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL,
                    display_name VARCHAR(100) NOT NULL,
                    description VARCHAR(255),
                    is_system BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

                CREATE TABLE IF NOT EXISTS permissions (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    display_name VARCHAR(100) NOT NULL,
                    description VARCHAR(255),
                    resource VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);

                CREATE TABLE IF NOT EXISTS role_permissions (
                    role_id VARCHAR(36) NOT NULL,
                    permission_id VARCHAR(36) NOT NULL,
                    PRIMARY KEY (role_id, permission_id),
                    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
                );

                -- Add role_id column to users table if it doesn't exist
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                 WHERE table_name='users' AND column_name='role_id') THEN
                        ALTER TABLE users ADD COLUMN role_id VARCHAR(36);
                        ALTER TABLE users ADD CONSTRAINT fk_users_role
                            FOREIGN KEY (role_id) REFERENCES roles(id);
                    END IF;
                END $$;
            """))
            await db.commit()
            print("✓ Tables created")

            # Create permissions
            print("\nCreating permissions...")
            permissions_data = [
                # Admin dashboard
                {
                    "name": "admin.dashboard.view",
                    "display_name": "Voir le tableau de bord admin",
                    "description": "Accéder au tableau de bord d'administration",
                    "resource": "admin_dashboard"
                },
                # User management
                {
                    "name": "admin.users.view",
                    "display_name": "Voir les utilisateurs",
                    "description": "Voir la liste des utilisateurs",
                    "resource": "users"
                },
                {
                    "name": "admin.users.edit",
                    "display_name": "Modifier les utilisateurs",
                    "description": "Modifier les informations des utilisateurs",
                    "resource": "users"
                },
                {
                    "name": "admin.users.delete",
                    "display_name": "Supprimer les utilisateurs",
                    "description": "Supprimer des utilisateurs",
                    "resource": "users"
                },
                # Tempo management
                {
                    "name": "admin.tempo.view",
                    "display_name": "Voir les jours Tempo",
                    "description": "Accéder à la gestion Tempo",
                    "resource": "tempo"
                },
                {
                    "name": "admin.tempo.edit",
                    "display_name": "Modifier les jours Tempo",
                    "description": "Modifier les jours Tempo",
                    "resource": "tempo"
                },
                # Contributions
                {
                    "name": "admin.contributions.view",
                    "display_name": "Voir les contributions",
                    "description": "Accéder aux contributions communautaires",
                    "resource": "contributions"
                },
                {
                    "name": "admin.contributions.review",
                    "display_name": "Valider les contributions",
                    "description": "Approuver ou rejeter les contributions",
                    "resource": "contributions"
                },
                # Offers management
                {
                    "name": "admin.offers.view",
                    "display_name": "Voir les offres",
                    "description": "Accéder à la gestion des offres",
                    "resource": "offers"
                },
                {
                    "name": "admin.offers.edit",
                    "display_name": "Modifier les offres",
                    "description": "Modifier les offres énergétiques",
                    "resource": "offers"
                },
                {
                    "name": "admin.offers.delete",
                    "display_name": "Supprimer les offres",
                    "description": "Supprimer des offres",
                    "resource": "offers"
                },
                # Roles management
                {
                    "name": "admin.roles.view",
                    "display_name": "Voir les rôles",
                    "description": "Accéder à la gestion des rôles",
                    "resource": "roles"
                },
                {
                    "name": "admin.roles.edit",
                    "display_name": "Modifier les rôles",
                    "description": "Modifier les permissions des rôles",
                    "resource": "roles"
                },
            ]

            created_permissions = {}
            for perm_data in permissions_data:
                # Check if permission exists
                result = await db.execute(
                    select(Permission).where(Permission.name == perm_data["name"])
                )
                existing_perm = result.scalar_one_or_none()

                if not existing_perm:
                    permission = Permission(**perm_data)
                    db.add(permission)
                    await db.flush()
                    created_permissions[perm_data["name"]] = permission
                    print(f"  ✓ Created: {perm_data['name']}")
                else:
                    created_permissions[perm_data["name"]] = existing_perm
                    print(f"  - Exists: {perm_data['name']}")

            await db.commit()

            # Create roles
            print("\nCreating roles...")
            roles_data = [
                {
                    "name": "admin",
                    "display_name": "Administrateur",
                    "description": "Accès complet à toutes les fonctionnalités",
                    "is_system": True,
                    "permissions": [perm for perm in created_permissions.values()]  # All permissions
                },
                {
                    "name": "moderator",
                    "display_name": "Modérateur",
                    "description": "Accès au tableau de bord, Tempo et contributions",
                    "is_system": True,
                    "permissions": [
                        created_permissions["admin.dashboard.view"],
                        created_permissions["admin.tempo.view"],
                        created_permissions["admin.tempo.edit"],
                        created_permissions["admin.contributions.view"],
                        created_permissions["admin.contributions.review"],
                    ]
                },
                {
                    "name": "visitor",
                    "display_name": "Visiteur",
                    "description": "Utilisateur standard sans accès administrateur",
                    "is_system": True,
                    "permissions": []  # No admin permissions
                },
            ]

            created_roles = {}
            for role_data in roles_data:
                permissions = role_data.pop("permissions", [])

                # Check if role exists
                result = await db.execute(
                    select(Role).where(Role.name == role_data["name"])
                )
                existing_role = result.scalar_one_or_none()

                if not existing_role:
                    role = Role(**role_data)
                    role.permissions = permissions
                    db.add(role)
                    await db.flush()
                    created_roles[role_data["name"]] = role
                    print(f"  ✓ Created: {role_data['display_name']} ({len(permissions)} permissions)")
                else:
                    # Update permissions for existing role
                    existing_role.permissions = permissions
                    created_roles[role_data["name"]] = existing_role
                    print(f"  - Exists: {role_data['display_name']} (updated permissions)")

            await db.commit()

            # Migrate existing users to role system
            print("\nMigrating existing users to role system...")
            result = await db.execute(text("""
                UPDATE users
                SET role_id = (SELECT id FROM roles WHERE name = 'admin')
                WHERE is_admin = true AND role_id IS NULL;
            """))
            admin_count = result.rowcount

            result = await db.execute(text("""
                UPDATE users
                SET role_id = (SELECT id FROM roles WHERE name = 'visitor')
                WHERE is_admin = false AND role_id IS NULL;
            """))
            visitor_count = result.rowcount

            await db.commit()
            print(f"  ✓ Migrated {admin_count} admins")
            print(f"  ✓ Migrated {visitor_count} visitors")

            print("\n✅ Roles and permissions initialized successfully!")

        except Exception as e:
            await db.rollback()
            print(f"\n❌ Error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise
        finally:
            await db.close()
            break


if __name__ == "__main__":
    asyncio.run(init_roles_and_permissions())
