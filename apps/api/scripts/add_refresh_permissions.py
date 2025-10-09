#!/usr/bin/env python3
"""Add missing refresh permissions for Tempo and EcoWatt"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from src.models import Permission
from src.models.database import async_session_maker


async def main():
    """Add refresh permissions"""
    async with async_session_maker() as session:
        # Check if permissions already exist
        result = await session.execute(
            select(Permission).where(Permission.name.in_(["admin.tempo.refresh", "admin.ecowatt.refresh"]))
        )
        existing = result.scalars().all()
        existing_names = {p.name for p in existing}

        permissions_to_add = []

        # Tempo refresh permission
        if "admin.tempo.refresh" not in existing_names:
            permissions_to_add.append(
                Permission(
                    name="admin.tempo.refresh",
                    resource="tempo",
                    display_name="Modifier les jours Tempo",
                    description="Rafraîchir les données Tempo",
                )
            )
            print("✓ Adding permission: admin.tempo.refresh")
        else:
            print("- Permission admin.tempo.refresh already exists")

        # EcoWatt refresh permission
        if "admin.ecowatt.refresh" not in existing_names:
            permissions_to_add.append(
                Permission(
                    name="admin.ecowatt.refresh",
                    resource="EcoWatt",
                    display_name="Modifier les signaux EcoWatt",
                    description="Rafraîchir les données EcoWatt",
                )
            )
            print("✓ Adding permission: admin.ecowatt.refresh")
        else:
            print("- Permission admin.ecowatt.refresh already exists")

        if permissions_to_add:
            session.add_all(permissions_to_add)
            await session.commit()
            print(f"\n✓ Successfully added {len(permissions_to_add)} permission(s)")
        else:
            print("\n✓ All permissions already exist")


if __name__ == "__main__":
    asyncio.run(main())
