#!/usr/bin/env python3
"""Clean up unnecessary EcoWatt permissions"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, delete
from src.models.database import async_session_maker
from src.models import Permission


async def main():
    """Remove old EcoWatt permissions, keep only admin.ecowatt.refresh"""
    async with async_session_maker() as session:
        # Find all ecowatt permissions
        result = await session.execute(
            select(Permission).where(Permission.resource == 'ecowatt')
        )
        ecowatt_permissions = result.scalars().all()

        if not ecowatt_permissions:
            print("No EcoWatt permissions found")
            return

        print(f"Found {len(ecowatt_permissions)} EcoWatt permissions:")
        for perm in ecowatt_permissions:
            print(f"  - {perm.name}: {perm.display_name}")

        # Delete all except admin.ecowatt.refresh
        permissions_to_delete = [
            p for p in ecowatt_permissions
            if p.name != 'admin.ecowatt.refresh'
        ]

        if permissions_to_delete:
            print(f"\nDeleting {len(permissions_to_delete)} unnecessary permissions...")
            for perm in permissions_to_delete:
                print(f"  ✓ Deleting: {perm.name}")
                await session.delete(perm)

            await session.commit()
            print(f"\n✓ Successfully cleaned up EcoWatt permissions")
        else:
            print("\n✓ No unnecessary permissions to delete")

        # Verify final state
        result = await session.execute(
            select(Permission).where(Permission.resource == 'ecowatt')
        )
        remaining = result.scalars().all()
        print(f"\nRemaining EcoWatt permissions: {len(remaining)}")
        for perm in remaining:
            print(f"  - {perm.name}: {perm.display_name}")


if __name__ == '__main__':
    asyncio.run(main())
