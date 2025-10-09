#!/usr/bin/env python3
"""Clean up unnecessary Tempo permissions"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, delete
from src.models.database import async_session_maker
from src.models import Permission


async def main():
    """Remove old Tempo permissions, keep only admin.tempo.refresh"""
    async with async_session_maker() as session:
        # Find all tempo permissions
        result = await session.execute(
            select(Permission).where(Permission.resource == 'tempo')
        )
        tempo_permissions = result.scalars().all()

        print(f"Found {len(tempo_permissions)} Tempo permissions:")
        for perm in tempo_permissions:
            print(f"  - {perm.name}: {perm.display_name}")

        # Delete all except admin.tempo.refresh
        permissions_to_delete = [
            p for p in tempo_permissions
            if p.name != 'admin.tempo.refresh'
        ]

        if permissions_to_delete:
            print(f"\nDeleting {len(permissions_to_delete)} unnecessary permissions...")
            for perm in permissions_to_delete:
                print(f"  ✓ Deleting: {perm.name}")
                await session.delete(perm)

            await session.commit()
            print(f"\n✓ Successfully cleaned up Tempo permissions")
        else:
            print("\n✓ No unnecessary permissions to delete")

        # Verify final state
        result = await session.execute(
            select(Permission).where(Permission.resource == 'tempo')
        )
        remaining = result.scalars().all()
        print(f"\nRemaining Tempo permissions: {len(remaining)}")
        for perm in remaining:
            print(f"  - {perm.name}: {perm.display_name}")


if __name__ == '__main__':
    asyncio.run(main())
