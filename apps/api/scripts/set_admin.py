"""
Set a user as admin
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import select
from src.models.database import async_session_maker
from src.models import User


async def set_admin(email: str):
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user:
            print(f"❌ User with email {email} not found!")
            return

        user.is_admin = True
        await session.commit()
        print(f"✅ User {email} is now an admin")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python set_admin.py <email>")
        sys.exit(1)

    email = sys.argv[1]
    asyncio.run(set_admin(email))
