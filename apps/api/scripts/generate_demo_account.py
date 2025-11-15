"""
Generate a demo account with mock data for demonstration purposes.

This script creates:
- A demo user with credentials: demo/demo
- Multiple PDLs with different profiles
- 6 years of realistic consumption and production data
- All data cached in Redis for instant access
"""
import asyncio
import sys
import random
from datetime import datetime, timedelta, date
from typing import List, Dict

sys.path.insert(0, '/app')

from sqlalchemy import select
from src.models.database import async_session_maker
from src.models import User, PDL
from src.utils.auth import get_password_hash, generate_client_id, generate_client_secret
from src.services.cache import cache_service


# Configuration
DEMO_EMAIL = "demo@myelectricaldata.fr"
DEMO_PASSWORD = "demo"
YEARS_OF_DATA = 3

# PDL configurations
PDLS = [
    {
        "usage_point_id": "04004253849200",
        "name": "Résidence principale",
        "subscribed_power": 6,
        "has_consumption": True,
        "has_production": False,
        "offpeak_hours": {
            "monday": "HC (22h00-06h00)",
            "tuesday": "HC (22h00-06h00)",
            "wednesday": "HC (22h00-06h00)",
            "thursday": "HC (22h00-06h00)",
            "friday": "HC (22h00-06h00)",
            "saturday": "HC (22h00-06h00)",
            "sunday": "HC (22h00-06h00)",
        },
        "consumption_profile": "residential_standard",
    },
    {
        "usage_point_id": "04004253849201",
        "name": "Maison avec panneaux solaires",
        "subscribed_power": 9,
        "has_consumption": True,
        "has_production": True,
        "offpeak_hours": {
            "monday": "HC (22h00-06h00)",
            "tuesday": "HC (22h00-06h00)",
            "wednesday": "HC (22h00-06h00)",
            "thursday": "HC (22h00-06h00)",
            "friday": "HC (22h00-06h00)",
            "saturday": "HC (22h00-06h00)",
            "sunday": "HC (22h00-06h00)",
        },
        "consumption_profile": "residential_solar",
        "production_profile": "solar_standard",
    },
    {
        "usage_point_id": "04004253849202",
        "name": "Résidence secondaire",
        "subscribed_power": 3,
        "has_consumption": True,
        "has_production": False,
        "offpeak_hours": {
            "monday": "HC (22h00-06h00)",
            "tuesday": "HC (22h00-06h00)",
            "wednesday": "HC (22h00-06h00)",
            "thursday": "HC (22h00-06h00)",
            "friday": "HC (22h00-06h00)",
            "saturday": "HC (22h00-06h00)",
            "sunday": "HC (22h00-06h00)",
        },
        "consumption_profile": "seasonal",
    },
]


def generate_consumption_value(date_obj: date, profile: str) -> float:
    """
    Generate realistic consumption value based on date and profile.

    Args:
        date_obj: Date for the consumption
        profile: Type of consumption profile

    Returns:
        Daily consumption in kWh
    """
    # Base consumption by month (seasonal variation)
    month = date_obj.month

    if profile == "residential_standard":
        # Higher consumption in winter (heating) and summer (AC)
        base_consumption = {
            1: 30, 2: 28, 3: 22, 4: 18,  # Winter to spring
            5: 15, 6: 16, 7: 18, 8: 17,  # Spring to summer
            9: 16, 10: 18, 11: 24, 12: 32  # Fall to winter
        }
    elif profile == "residential_solar":
        # Lower consumption due to solar production
        base_consumption = {
            1: 25, 2: 23, 3: 18, 4: 14,
            5: 10, 6: 8, 7: 9, 8: 10,
            9: 12, 10: 15, 11: 20, 12: 27
        }
    elif profile == "seasonal":
        # Peaks in summer (vacation home) and winter holidays
        base_consumption = {
            1: 15, 2: 8, 3: 5, 4: 4,
            5: 6, 6: 12, 7: 25, 8: 28,
            9: 10, 10: 5, 11: 6, 12: 18
        }
    else:
        base_consumption = {i: 15 for i in range(1, 13)}

    base = base_consumption[month]

    # Add day of week variation (more consumption on weekends)
    weekday = date_obj.weekday()
    if weekday >= 5:  # Weekend
        base *= 1.1

    # Add random daily variation (±20%)
    variation = random.uniform(0.8, 1.2)

    # Add occasional peaks (5% chance of +50% consumption)
    if random.random() < 0.05:
        variation *= 1.5

    return round(base * variation, 2)


def generate_production_value(date_obj: date, profile: str) -> float:
    """
    Generate realistic solar production value based on date and profile.

    Args:
        date_obj: Date for the production
        profile: Type of production profile

    Returns:
        Daily production in kWh
    """
    if profile != "solar_standard":
        return 0.0

    # Solar production varies by season
    month = date_obj.month

    # Peak production in summer, low in winter
    base_production = {
        1: 6, 2: 9, 3: 14, 4: 18,
        5: 22, 6: 25, 7: 26, 8: 24,
        9: 19, 10: 13, 11: 8, 12: 5
    }

    base = base_production[month]

    # Weather variation (±40% - cloudy days affect production more)
    variation = random.uniform(0.6, 1.4)

    # 10% chance of very cloudy day (only 20% production)
    if random.random() < 0.1:
        variation *= 0.2

    return round(base * variation, 2)


def generate_date_range(years: int) -> List[date]:
    """
    Generate list of dates for the specified number of years.

    Args:
        years: Number of years of data to generate

    Returns:
        List of date objects
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=years * 365)

    dates = []
    current_date = start_date
    while current_date <= end_date:
        dates.append(current_date)
        current_date += timedelta(days=1)

    return dates


async def delete_demo_user():
    """Delete existing demo user and all associated data"""
    from sqlalchemy.orm import selectinload

    async with async_session_maker() as session:
        result = await session.execute(
            select(User)
            .where(User.email == DEMO_EMAIL)
            .options(selectinload(User.pdls))
        )
        user = result.scalar_one_or_none()

        if user:
            print(f"🗑️  Deleting existing demo user...")

            # Delete from Redis cache
            await cache_service.connect()
            for pdl in user.pdls:
                pattern = f"*{pdl.usage_point_id}*"
                deleted = await cache_service.delete_pattern(pattern)
                print(f"   Deleted {deleted} cache keys for PDL {pdl.usage_point_id}")

            # Delete from database
            await session.delete(user)
            await session.commit()
            print(f"✅ Demo user deleted")
        else:
            print(f"ℹ️  No existing demo user found")


async def create_demo_user() -> User:
    """Create the demo user account"""
    print(f"\n👤 Creating demo user account...")

    async with async_session_maker() as session:
        # Create user
        user = User(
            email=DEMO_EMAIL,
            hashed_password=get_password_hash(DEMO_PASSWORD),
            client_id=generate_client_id(),
            client_secret=generate_client_secret(),
            is_active=True,
            is_admin=False,
            email_verified=True,
            debug_mode=True,  # Enable debug mode for demo
        )

        session.add(user)
        await session.commit()
        await session.refresh(user)

        print(f"✅ User created:")
        print(f"   Email: {user.email}")
        print(f"   Client ID: {user.client_id}")
        print(f"   Client Secret: {user.client_secret}")

        return user


async def create_demo_pdls(user: User) -> List[PDL]:
    """Create PDLs for the demo user"""
    print(f"\n🏠 Creating demo PDLs...")

    created_pdls = []
    oldest_date = date.today() - timedelta(days=YEARS_OF_DATA * 365)

    async with async_session_maker() as session:
        for pdl_config in PDLS:
            pdl = PDL(
                usage_point_id=pdl_config["usage_point_id"],
                user_id=user.id,
                name=pdl_config["name"],
                subscribed_power=pdl_config["subscribed_power"],
                has_consumption=pdl_config["has_consumption"],
                has_production=pdl_config["has_production"],
                offpeak_hours=pdl_config.get("offpeak_hours"),
                is_active=True,
                oldest_available_data_date=oldest_date,
                activation_date=oldest_date,
            )

            session.add(pdl)
            created_pdls.append((pdl, pdl_config))

            print(f"✅ Created PDL: {pdl.name} ({pdl.usage_point_id})")

        await session.commit()

        # Refresh all PDL objects to ensure offpeak_hours are loaded
        for pdl, _ in created_pdls:
            await session.refresh(pdl)

    return created_pdls


async def generate_and_cache_data(user: User, pdls: List[tuple]):
    """Generate and cache consumption/production data"""
    print(f"\n📊 Generating {YEARS_OF_DATA} years of data...")

    await cache_service.connect()
    dates = generate_date_range(YEARS_OF_DATA)

    total_records = 0

    for pdl, pdl_config in pdls:
        print(f"\n   Processing {pdl.name}...")

        consumption_data = []
        production_data = []

        # Generate data for all dates
        for date_obj in dates:
            date_str = date_obj.strftime("%Y-%m-%d")

            # Generate consumption
            if pdl_config["has_consumption"]:
                consumption_value = generate_consumption_value(
                    date_obj,
                    pdl_config["consumption_profile"]
                )
                consumption_data.append({
                    "date": date_str,
                    "value": consumption_value,
                    "quality": "CORRIGE",
                })

            # Generate production
            if pdl_config["has_production"]:
                production_value = generate_production_value(
                    date_obj,
                    pdl_config.get("production_profile", "")
                )
                production_data.append({
                    "date": date_str,
                    "value": production_value,
                    "quality": "CORRIGE",
                })

        # Cache consumption data
        if consumption_data:
            cache_key = f"demo:consumption:daily:{pdl.usage_point_id}"
            await cache_service.set(
                cache_key,
                {"data": consumption_data},
                user.client_secret,
                ttl=None  # No expiration for demo data
            )
            print(f"   ✅ Cached {len(consumption_data)} consumption records")
            total_records += len(consumption_data)

        # Cache production data
        if production_data:
            cache_key = f"demo:production:daily:{pdl.usage_point_id}"
            await cache_service.set(
                cache_key,
                {"data": production_data},
                user.client_secret,
                ttl=None  # No expiration for demo data
            )
            print(f"   ✅ Cached {len(production_data)} production records")
            total_records += len(production_data)

        # Cache contract info
        contract_data = {
            "usage_point_id": pdl.usage_point_id,
            "subscribed_power": pdl.subscribed_power,
            "offpeak_hours": pdl.offpeak_hours,
            "activation_date": pdl.activation_date.strftime("%Y-%m-%d") if pdl.activation_date else None,
        }
        cache_key = f"demo:contract:{pdl.usage_point_id}"
        await cache_service.set(
            cache_key,
            contract_data,
            user.client_secret,
            ttl=None
        )

        # Cache address info
        address_data = {
            "usage_point_id": pdl.usage_point_id,
            "street": "123 Rue de la Démo",
            "city": "Paris",
            "postal_code": "75001",
        }
        cache_key = f"demo:address:{pdl.usage_point_id}"
        await cache_service.set(
            cache_key,
            address_data,
            user.client_secret,
            ttl=None
        )

    print(f"\n✅ Total records generated and cached: {total_records}")

    await cache_service.disconnect()


async def main():
    """Main execution"""
    print("=" * 60)
    print("🎭 MyElectricalData - Demo Account Generator")
    print("=" * 60)

    # Check if demo user already exists
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == DEMO_EMAIL))
        existing_user = result.scalar_one_or_none()

    if existing_user:
        response = input("\n⚠️  Demo user already exists. Delete and recreate? (y/n): ")
        if response.lower() != 'y':
            print("❌ Aborted")
            return

        await delete_demo_user()

    # Create demo user
    user = await create_demo_user()

    # Create PDLs
    pdls = await create_demo_pdls(user)

    # Generate and cache data
    await generate_and_cache_data(user, pdls)

    print("\n" + "=" * 60)
    print("✅ Demo account successfully created!")
    print("=" * 60)
    print(f"\n📋 Connection Details:")
    print(f"   Email: {DEMO_EMAIL}")
    print(f"   Password: {DEMO_PASSWORD}")
    print(f"   Client ID: {user.client_id}")
    print(f"   Client Secret: {user.client_secret}")
    print(f"\n🏠 PDLs created:")
    for pdl, _ in pdls:
        print(f"   - {pdl.name}: {pdl.usage_point_id}")
    print(f"\n📊 Data available: {YEARS_OF_DATA} years ({len(generate_date_range(YEARS_OF_DATA))} days)")
    print("\n🔗 You can now login with these credentials!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
