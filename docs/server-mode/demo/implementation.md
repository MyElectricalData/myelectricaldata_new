# Quick Implementation Guide: /demo Command

## Overview
This guide provides step-by-step instructions to implement a `/demo` command that creates a demo account with realistic mock data.

---

## Part 1: Create Demo Command Script

### File: `apps/api/scripts/create_demo_account.py`

```python
"""
Script to create a demo account with realistic mock consumption data
"""
import asyncio
import sys
import os
from datetime import datetime, timedelta, date, UTC
import random
import json

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import select
from src.models.database import AsyncSessionLocal
from src.models import User, PDL
from src.utils import get_password_hash, generate_client_id, generate_client_secret
from src.services import cache_service


async def generate_consumption_data(days: int = 365) -> list[dict]:
    """Generate realistic daily consumption data"""
    readings = []
    end_date = datetime.now(UTC).date()
    start_date = end_date - timedelta(days=days)
    
    current_date = start_date
    while current_date <= end_date:
        # Realistic consumption: 15-25 kWh/day, higher in winter
        month = current_date.month
        base_consumption = 15 + random.gauss(0, 3)
        
        # Winter heating: +30%, Summer cooling: -20%
        if month in [12, 1, 2]:
            base_consumption *= 1.3
        elif month in [6, 7, 8]:
            base_consumption *= 0.8
        
        value = max(5, round(base_consumption, 1))  # Min 5 kWh
        
        readings.append({
            "date": current_date.isoformat(),
            "value": value,
            "quality": "CORRIGE"
        })
        
        current_date += timedelta(days=1)
    
    return readings


async def generate_production_data(days: int = 365) -> list[dict]:
    """Generate realistic daily solar production data"""
    readings = []
    end_date = datetime.now(UTC).date()
    start_date = end_date - timedelta(days=days)
    
    current_date = start_date
    while current_date <= end_date:
        month = current_date.month
        weekday = current_date.weekday()
        
        # Higher production in summer, lower in winter
        if month in [6, 7, 8]:
            base_production = 20 + random.gauss(0, 3)
        elif month in [3, 4, 5, 9, 10]:
            base_production = 12 + random.gauss(0, 2)
        else:
            base_production = 3 + random.gauss(0, 1)
        
        # Less production on cloudy days (randomly)
        if random.random() < 0.2:
            base_production *= 0.4
        
        value = max(0, round(base_production, 1))
        
        readings.append({
            "date": current_date.isoformat(),
            "value": value,
            "quality": "CORRIGE"
        })
        
        current_date += timedelta(days=1)
    
    return readings


async def create_demo_account():
    """Create demo account with PDLs and mock data"""
    async with AsyncSessionLocal() as session:
        try:
            # 1. Create demo user
            demo_email = "demo@myelectricaldata.fr"
            demo_password = "DemoPassword123!"
            
            # Check if demo user already exists
            result = await session.execute(
                select(User).where(User.email == demo_email)
            )
            existing_user = result.scalar_one_or_none()
            
            if existing_user:
                print(f"Demo user already exists: {existing_user.email}")
                print(f"  client_id: {existing_user.client_id}")
                print(f"  client_secret: {existing_user.client_secret}")
                return existing_user
            
            user = User(
                email=demo_email,
                hashed_password=get_password_hash(demo_password),
                client_id=generate_client_id(),
                client_secret=generate_client_secret(),
                email_verified=True,  # Skip verification for demo
                is_active=True,
                debug_mode=True,  # Enable verbose logging
            )
            
            session.add(user)
            await session.flush()  # Get user.id before committing
            
            print(f"✓ Created demo user: {user.email}")
            print(f"  User ID: {user.id}")
            print(f"  client_id: {user.client_id}")
            print(f"  client_secret: {user.client_secret}")
            
            # 2. Create demo PDLs
            pdls_data = [
                {
                    "usage_point_id": "12345678901234",
                    "name": "Demo - Main House",
                    "has_consumption": True,
                    "has_production": True,
                    "subscribed_power": 9,
                    "activation_date": date(2020, 1, 1),
                },
                {
                    "usage_point_id": "98765432109876",
                    "name": "Demo - Apartment",
                    "has_consumption": True,
                    "has_production": False,
                    "subscribed_power": 6,
                    "activation_date": date(2021, 6, 1),
                },
            ]
            
            for pdl_info in pdls_data:
                pdl = PDL(
                    usage_point_id=pdl_info["usage_point_id"],
                    user_id=user.id,
                    name=pdl_info["name"],
                    has_consumption=pdl_info["has_consumption"],
                    has_production=pdl_info["has_production"],
                    subscribed_power=pdl_info["subscribed_power"],
                    activation_date=pdl_info["activation_date"],
                    oldest_available_data_date=pdl_info["activation_date"],
                    display_order=len([p for p in pdls_data if pdl_info == p]),
                )
                session.add(pdl)
                await session.flush()
                
                print(f"✓ Created PDL: {pdl.name} ({pdl.usage_point_id})")
            
            await session.commit()
            
            # 3. Generate and cache consumption data
            print("\nGenerating mock consumption data...")
            
            for pdl_info in pdls_data:
                usage_point_id = pdl_info["usage_point_id"]
                
                # Generate consumption data
                consumption_readings = await generate_consumption_data(days=365)
                
                print(f"  Caching {len(consumption_readings)} consumption readings for {usage_point_id}...")
                
                # Cache each day individually (matching real API behavior)
                for reading in consumption_readings:
                    cache_key = f"consumption:daily:{usage_point_id}:{reading['date']}"
                    await cache_service.set(cache_key, reading, user.client_secret)
                
                # Cache reading type
                reading_type_cache_key = f"consumption:reading_type:{usage_point_id}"
                reading_type = {
                    "unit": "Wh",
                    "measurement_kind": "energy"
                }
                await cache_service.set(reading_type_cache_key, reading_type, user.client_secret)
                
                # Generate and cache production data if applicable
                if pdl_info["has_production"]:
                    production_readings = await generate_production_data(days=365)
                    
                    print(f"  Caching {len(production_readings)} production readings for {usage_point_id}...")
                    
                    for reading in production_readings:
                        cache_key = f"production:daily:{usage_point_id}:{reading['date']}"
                        await cache_service.set(cache_key, reading, user.client_secret)
            
            # Print summary
            print("\n" + "="*60)
            print("DEMO ACCOUNT CREATED SUCCESSFULLY")
            print("="*60)
            print(f"Email: {user.email}")
            print(f"Password: {demo_password}")
            print(f"Client ID: {user.client_id}")
            print(f"Client Secret: {user.client_secret}")
            print("="*60)
            
            return user
            
        except Exception as e:
            print(f"Error creating demo account: {str(e)}")
            import traceback
            traceback.print_exc()
            raise


async def main():
    """Main entry point"""
    await create_demo_account()


if __name__ == "__main__":
    asyncio.run(main())
```

---

## Part 2: Create Fastapi Endpoint (Optional)

### File: Create new router `apps/api/src/routers/demo.py`

```python
"""
Demo account management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, date, UTC
import random

from ..models.database import get_db
from ..models import User, PDL
from ..schemas import APIResponse
from ..utils import get_password_hash, generate_client_id, generate_client_secret
from ..services import cache_service
from ..middleware import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demo", tags=["Demo"])


@router.post("/create", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def create_demo_account(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Create a demo account with realistic mock data (admin only)
    """
    try:
        demo_email = "demo@myelectricaldata.fr"
        demo_password = "DemoPassword123!"
        
        # Check if demo user already exists
        result = await db.execute(
            select(User).where(User.email == demo_email)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            return APIResponse(
                success=True,
                data={
                    "message": "Demo user already exists",
                    "email": existing_user.email,
                    "client_id": existing_user.client_id,
                }
            )
        
        # Create demo user
        user = User(
            email=demo_email,
            hashed_password=get_password_hash(demo_password),
            client_id=generate_client_id(),
            client_secret=generate_client_secret(),
            email_verified=True,
            is_active=True,
            debug_mode=True,
        )
        
        db.add(user)
        await db.flush()
        
        # Create demo PDLs
        pdls = [
            PDL(
                usage_point_id="12345678901234",
                user_id=user.id,
                name="Demo - Main House",
                has_consumption=True,
                has_production=True,
                subscribed_power=9,
                activation_date=date(2020, 1, 1),
                oldest_available_data_date=date(2020, 1, 1),
            ),
            PDL(
                usage_point_id="98765432109876",
                user_id=user.id,
                name="Demo - Apartment",
                has_consumption=True,
                has_production=False,
                subscribed_power=6,
                activation_date=date(2021, 6, 1),
                oldest_available_data_date=date(2021, 6, 1),
            ),
        ]
        
        for pdl in pdls:
            db.add(pdl)
        
        await db.commit()
        
        # Generate and cache mock data (async)
        # This would call the data generation functions above
        
        return APIResponse(
            success=True,
            data={
                "message": "Demo account created successfully",
                "email": user.email,
                "password": demo_password,
                "client_id": user.client_id,
                "client_secret": user.client_secret,
            }
        )
        
    except Exception as e:
        logger.error(f"Error creating demo account: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create demo account"
        )
```

---

## Part 3: Running the Script

### Option 1: Direct Python Execution
```bash
cd apps/api
python scripts/create_demo_account.py
```

### Option 2: Using Make (if configured)
```bash
make create-demo
```

### Option 3: Docker Compose
```bash
docker-compose exec backend python scripts/create_demo_account.py
```

---

## Part 4: Testing the Demo Account

### Via CLI / cURL
```bash
# 1. Get token using client credentials
curl -X POST http://localhost:8000/api/accounts/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=cli_xxx&client_secret=yyy"

# 2. List PDLs
curl http://localhost:8000/api/pdl/ \
  -H "Authorization: Bearer {access_token}"

# 3. Get consumption data
curl "http://localhost:8000/api/enedis/consumption/daily/12345678901234?start=2024-01-01&end=2024-12-31&use_cache=true" \
  -H "Authorization: Bearer {access_token}"
```

### Via Frontend
1. Open http://localhost:3000
2. Login with: demo@myelectricaldata.fr / DemoPassword123!
3. View mock consumption/production data

---

## Part 5: Key Points for Implementation

### Data Generation Best Practices
1. **Consumption**: 15-25 kWh/day, higher in winter (×1.3), lower in summer (×0.8)
2. **Production**: 0-20 kWh/day, higher in summer, affected by cloud cover
3. **Realistic Variation**: Use Gaussian distribution for natural variation
4. **Quality Flag**: Always set to "CORRIGE" (corrected data)

### Cache Management
- Cache individual daily readings: `consumption:daily:{pdl}:{date}`
- Cache reading type: `consumption:reading_type:{pdl}`
- Use user's client_secret as encryption key
- TTL: 86400 seconds (24 hours)

### Security Notes
- Demo password should be obvious but secure enough for development
- email_verified=True bypasses email verification requirement
- debug_mode=True for verbose logging
- Client ID/Secret should be stored securely or printed only once

---

## Part 6: Expected Output

```
✓ Created demo user: demo@myelectricaldata.fr
  User ID: 550e8400-e29b-41d4-a716-446655440000
  client_id: cli_abc123...
  client_secret: def456...
✓ Created PDL: Demo - Main House (12345678901234)
✓ Created PDL: Demo - Apartment (98765432109876)

Generating mock consumption data...
  Caching 365 consumption readings for 12345678901234...
  Caching 365 production readings for 12345678901234...
  Caching 365 consumption readings for 98765432109876...

============================================================
DEMO ACCOUNT CREATED SUCCESSFULLY
============================================================
Email: demo@myelectricaldata.fr
Password: DemoPassword123!
Client ID: cli_abc123...
Client Secret: def456...
============================================================
```

---

## Part 7: Cleanup

To reset/delete demo account:
```python
# Via SQL
DELETE FROM pdls WHERE user_id = (SELECT id FROM users WHERE email = 'demo@myelectricaldata.fr');
DELETE FROM users WHERE email = 'demo@myelectricaldata.fr';

# Via API (admin endpoint)
DELETE /admin/users/{user_id}
```

