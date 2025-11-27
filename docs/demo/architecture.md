# Demo Account Implementation Guide

## Architecture Overview

This document provides a comprehensive guide for implementing a `/demo` command that creates a demo account with mock data for the MyElectricalData application.

---

## 1. USER AUTHENTICATION & ACCOUNT MANAGEMENT

### Location

- **Models**: `apps/api/src/models/user.py`
- **Router**: `apps/api/src/routers/accounts.py`
- **Middleware**: `apps/api/src/middleware/auth.py`
- **Utils**: `apps/api/src/utils/auth.py`

### User Model

```python
class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: str (UUID)
    email: str (unique, indexed)
    hashed_password: str
    client_id: str (unique, indexed)
    client_secret: str
    is_active: bool (default=True)
    is_admin: bool (default=False)
    email_verified: bool (default=False)
    debug_mode: bool (default=False)
    enedis_customer_id: Optional[str]
    role_id: Optional[str] (ForeignKey to Role)

    # Relations
    role: Role relationship
    pdls: list[PDL] cascade delete-orphan
    tokens: list[Token] cascade delete-orphan
```

### Account Creation Flow (Signup)

```
1. POST /accounts/signup
   - Input: email (EmailStr), password (min 8 chars), optional turnstile_token
   - Check for duplicate email
   - Hash password with bcrypt
   - Generate unique client_id and client_secret
   - Create User with email_verified=False
   - Create EmailVerificationToken (expires in 24h)
   - Send verification email (if REQUIRE_EMAIL_VERIFICATION is true)
   - Return client_id and client_secret

2. For demo account: Skip email verification by setting email_verified=True directly
```

### Login Flow

```
1. POST /accounts/login
   - Input: email, password
   - Verify password against hashed_password
   - Create JWT access token with user.id in 'sub' claim
   - Token expires in ACCESS_TOKEN_EXPIRE_MINUTES (default 43200 = 30 days)

2. POST /accounts/token (OAuth2 Client Credentials)
   - Input: grant_type=client_credentials, client_id, client_secret
   - Support Basic Auth header or form data
   - Create JWT access token
   - Return: access_token, token_type="bearer"
```

### Authentication

All API endpoints use bearer token authentication:

- JWT token (from login): decoded at runtime, extracts user.id from 'sub' claim
- Client secret: can be used directly as bearer token (fallback)
- Header: `Authorization: Bearer {token}`

### Utility Functions

```python
# Password hashing (bcrypt)
def verify_password(plain_password: str, hashed_password: str) -> bool
def get_password_hash(password: str) -> str

# Token creation
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str
def decode_access_token(token: str) -> Optional[dict]

# Client credentials
def generate_client_id() -> str  # Returns "cli_{random_urlsafe_string}"
def generate_client_secret() -> str  # Returns random_urlsafe_string (64 chars)
```

---

## 2. USER DATA STORAGE & DATABASE

### Database Configuration

- **Location**: `apps/api/src/models/database.py`
- **Settings**: `apps/api/src/config/settings.py`
- **Default**: SQLite at `./data/myelectricaldata.db`
- **Supported**: PostgreSQL (via DATABASE_URL setting)
- **ORM**: SQLAlchemy with async support (asyncio)

### Related Models

```python
# Role-based access control
class Role(Base):
    __tablename__ = "roles"
    id: str (UUID)
    name: str (unique)
    display_name: str
    permissions: list[Permission] relationship

# Email verification token (expires 24h)
class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"
    user_id: str (ForeignKey)
    token: str (unique)
    expires_at: datetime
    is_used: bool

# Password reset token
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    user_id: str (ForeignKey)
    token: str (unique)
    expires_at: datetime
    is_used: bool
```

---

## 3. ENEDIS API INTEGRATION & TOKEN MANAGEMENT

### Location

- **Adapter**: `apps/api/src/adapters/enedis.py`
- **Router**: `apps/api/src/routers/enedis.py`
- **Token Model**: `apps/api/src/models/token.py`

### Enedis Token Model

```python
class Token(Base, TimestampMixin):
    __tablename__ = "tokens"

    id: str (UUID)
    user_id: Optional[str] (ForeignKey) # Nullable for global tokens
    usage_point_id: str (indexed) # 14-digit PDL identifier

    access_token: str (Text)
    refresh_token: Optional[str]
    token_type: str (default="Bearer")
    expires_at: datetime
    scope: Optional[str]

    # For global token: user_id=None, usage_point_id="__global__"
```

### Enedis API Endpoints (via Adapter)

```python
class EnedisAdapter:
    # OAuth2 flows
    async def get_client_credentials_token() -> dict
        # Returns: {"access_token": str, "expires_in": int, ...}
        # Used for global machine-to-machine access

    async def exchange_authorization_code(code: str, redirect_uri: str) -> dict
        # For user-specific OAuth consent flow

    async def refresh_access_token(refresh_token: str) -> dict

    # Data endpoints
    async def get_consumption_daily(usage_point_id, start, end, access_token) -> dict
        # Returns: {"meter_reading": {"interval_reading": [...], "reading_type": {...}}}

    async def get_consumption_detail(usage_point_id, start, end, access_token) -> dict
        # Load curve data (30-min intervals)

    async def get_production_daily(usage_point_id, start, end, access_token) -> dict
    async def get_production_detail(usage_point_id, start, end, access_token) -> dict

    async def get_contract(usage_point_id, access_token) -> dict
    async def get_address(usage_point_id, access_token) -> dict
    async def get_customer(usage_point_id, access_token) -> dict
    async def get_contact(usage_point_id, access_token) -> dict

    async def get_usage_points(access_token) -> dict
        # Returns list of PDLs for authenticated user
```

### Settings for Enedis

```python
# From /apps/api/src/config/settings.py
ENEDIS_CLIENT_ID: str  # Machine-to-machine client ID
ENEDIS_CLIENT_SECRET: str  # Machine-to-machine client secret
ENEDIS_ENVIRONMENT: "sandbox" | "production"  # default: sandbox
ENEDIS_REDIRECT_URI: str  # For user OAuth flow
ENEDIS_RATE_LIMIT: int  # default: 5 requests/second
```

### Rate Limiting

- Rate limiter built into adapter with configurable requests per second
- Default: 5 req/sec (Enedis limit)
- Daily limits per user:
  - WITH cache: 1000 requests/day
  - WITHOUT cache: 50 requests/day
  - Admin users: unlimited

---

## 4. PDL (POINT DE LIVRAISON) MANAGEMENT

### Location

- **Model**: `apps/api/src/models/pdl.py`
- **Router**: `apps/api/src/routers/pdl.py`

### PDL Model

```python
class PDL(Base, TimestampMixin):
    __tablename__ = "pdls"

    id: str (UUID)
    usage_point_id: str (14-digit, indexed) # e.g., "12345678901234"
    user_id: str (ForeignKey to User)
    name: Optional[str] # Custom name for user's reference
    display_order: Optional[int] # Sort order in UI

    # Contract info
    subscribed_power: Optional[int] # kVA
    offpeak_hours: Optional[dict] # HC schedules by day

    # Data availability
    has_consumption: bool (default=True)
    has_production: bool (default=False)
    is_active: bool (default=True)

    # Dates
    oldest_available_data_date: Optional[date] # Meter activation
    activation_date: Optional[date]
```

### PDL Creation

```
POST /pdl
- Input: usage_point_id (14 digits, required), name (optional)
- Verify PDL ownership via Enedis API
- Create PDL record linked to user
- Fetch contract data from Enedis
- Return PDL response with metadata
```

### PDL Endpoints

```
GET /pdl/ - List all user's PDLs
POST /pdl - Create new PDL
GET /pdl/{pdl_id} - Get single PDL
PATCH /pdl/{pdl_id} - Update PDL metadata
DELETE /pdl/{pdl_id} - Delete PDL
POST /pdl/reorder - Update display order
```

---

## 5. CONSUMPTION & PRODUCTION DATA

### Data Structure

```python
# Response format for consumption/production endpoints:
{
    "success": True,
    "data": {
        "meter_reading": {
            "interval_reading": [
                {
                    "date": "2024-01-01",  # or "2024-01-01T00:30:00" for detail
                    "value": 1234,          # kWh or W
                    "quality": "BRUT" | "CORRIGE" | "ESTIME" | "SUPPRIME"
                },
                ...
            ],
            "reading_type": {
                "unit": "W" | "Wh" | "kWh",
                "measurement_kind": "power" | "energy"
            }
        }
    }
}
```

### Endpoints

```
GET /enedis/consumption/daily/{usage_point_id}
  - Query: start (YYYY-MM-DD), end (YYYY-MM-DD), use_cache (bool)
  - Returns: Daily consumption in kWh
  - Max history: 3 years
  - Cache: day-by-day granular caching

GET /enedis/consumption/detail/{usage_point_id}
  - Query: start, end, use_cache
  - Returns: Load curve (30-min intervals) in Wh
  - Max history: 2 years

GET /enedis/production/daily/{usage_point_id}
  - Similar to consumption/daily
  - Only if has_production=True

GET /enedis/power/{usage_point_id}
  - Query: start, end
  - Returns: Maximum power data

GET /enedis/contract/{usage_point_id}
GET /enedis/address/{usage_point_id}
GET /enedis/customer/{usage_point_id}
GET /enedis/contact/{usage_point_id}
```

---

## 6. CACHING SYSTEM

### Location

- **Cache Service**: `apps/api/src/services/cache.py`
- **Backend**: Redis (default: redis://localhost:6379/0)

### Cache Keys

```
consumption:daily:{usage_point_id}:{date}
  - Stores single day consumption reading

consumption:reading_type:{usage_point_id}
  - Stores meter reading type metadata

consumption:detail:{usage_point_id}:{start}:{end}
  - Stores detail (load curve) data

rate_limit:{user_id}:cached:{YYYY-MM-DD}
  - Tracks cached API calls per day

rate_limit:{user_id}:no_cache:{YYYY-MM-DD}
  - Tracks uncached API calls per day
```

### Cache TTL

- Default: 86400 seconds (24 hours)
- Configurable via CACHE_TTL_SECONDS setting
- Cache is encrypted using user's client_secret as key

---

## 7. EXISTING MOCK/SEED DATA PATTERNS

### Location

- **Scripts**: `apps/api/scripts/`

### Available Scripts

```
seed_edf_offers.py - Seeds EDF energy offers and providers
seed_edf_full_offers.py - Extended EDF offers
import_github_offers.py - Import offers from GitHub
add_refresh_permissions.py - Add refresh permissions to roles
clean_tempo_permissions.py - Cleanup Tempo permissions
clean_ecowatt_permissions.py - Cleanup Ecowatt permissions
```

### Example Usage Pattern

```python
import asyncio
from sqlalchemy import select
from src.models.database import AsyncSessionLocal
from src.models import User, PDL

async def create_demo():
    async with AsyncSessionLocal() as session:
        # Create user
        user = User(
            email="demo@example.com",
            hashed_password=get_password_hash("demo_password"),
            client_id=generate_client_id(),
            client_secret=generate_client_secret(),
            email_verified=True,
            is_active=True
        )
        session.add(user)
        await session.flush()  # Get user.id before committing

        # Create PDL
        pdl = PDL(
            usage_point_id="12345678901234",
            user_id=user.id,
            name="Demo Home"
        )
        session.add(pdl)

        await session.commit()
        print(f"Created demo user: {user.email}")
```

---

## 8. IMPLEMENTATION CHECKLIST

### Step 1: Create Demo User

- [ ] Generate unique email (e.g., `demo_{timestamp}@example.com`)
- [ ] Hash password with bcrypt
- [ ] Generate client_id and client_secret
- [ ] Set email_verified=True (skip email verification)
- [ ] Set debug_mode=True (optional, for detailed logging)
- [ ] Set is_active=True
- [ ] Store in User table

### Step 2: Create Demo PDLs

- [ ] Create 1-3 demo PDLs with realistic 14-digit identifiers
- [ ] Set name (e.g., "Demo Home", "Demo Apartment")
- [ ] Set has_consumption=True
- [ ] Set has_production=True (for solar demo)
- [ ] Set subscribed_power (e.g., 9 or 12 kVA)
- [ ] Set activation_date
- [ ] Set oldest_available_data_date

### Step 3: Create Mock Consumption Data

- [ ] Generate 6-12 months of daily consumption data
- [ ] Format: `{"date": "YYYY-MM-DD", "value": kWh, "quality": "CORRIGE"}`
- [ ] Realistic ranges: 10-30 kWh/day for residential
- [ ] Cache in Redis with proper keys

### Step 4: Create Mock Production Data (Optional)

- [ ] Generate daily production data for solar homes
- [ ] Format: same as consumption
- [ ] Realistic ranges: 5-15 kWh/day during sunny months

### Step 5: Create Mock Contract Data

- [ ] Store contract details in database or cache
- [ ] Include: subscription_power, offpeak_hours, address, etc.

### Step 6: API Integration (Optional)

- [ ] Create `/demo/create` endpoint to allow users to create demo account
- [ ] Create `/demo/reset` endpoint to reset demo data
- [ ] Create `/demo/{user_id}/clear-cache` endpoint

---

## 9. DATA EXAMPLES

### Daily Consumption Data Point

```json
{
  "date": "2024-10-15",
  "value": 18,
  "quality": "CORRIGE"
}
```

### Detail (Load Curve) Data Point

```json
{
  "date": "2024-10-15T00:30:00+02:00",
  "value": 750,
  "quality": "BRUT"
}
```

### Contract Data

```json
{
  "usage_point": {
    "usage_point_id": "12345678901234",
    "meter_type": "AMM",
    "segment": "C1"
  },
  "last_distribution_tariff": {
    "distribution_tariff": "BTINFCUST",
    "last_activation_date": "2023-01-01"
  },
  "subscribed_power": {
    "subscribed_power_value": 9
  }
}
```

### Address Data

```json
{
  "usage_points": [
    {
      "usage_point_id": "12345678901234",
      "address": {
        "label": "123 Rue de la Paix, 75000 Paris, France",
        "postal_code": "75000",
        "city": "Paris",
        "country": "FR"
      }
    }
  ]
}
```

---

## 10. IMPORTANT SECURITY CONSIDERATIONS

1. **Password Requirements**

   - Minimum 8 characters
   - Use bcrypt for hashing (cost factor 12)
   - Never store plain text

2. **Token Security**

   - JWT tokens expire after ACCESS_TOKEN_EXPIRE_MINUTES
   - Client secrets are secrets.token_urlsafe(64)
   - All tokens stored in database with expiration

3. **Rate Limiting**

   - 5 requests/second to Enedis API
   - 50 requests/day uncached, 1000/day with cache
   - Tracked per user in Redis

4. **Email Verification**

   - Can be skipped in dev mode (REQUIRE_EMAIL_VERIFICATION=false)
   - Demo accounts should have email_verified=True
   - Tokens expire in 24 hours

5. **Debug Mode**
   - Set debug_mode=True on demo user for verbose logging
   - Available via GET /accounts/me endpoint
   - Controls SQL query logging and detailed error messages

---

## 11. FRONTEND INTEGRATION

### Frontend URL

- **Settings**: FRONTEND_URL (default: `http://localhost:3000`)
- **Used for**: Email verification links, OAuth callbacks

### Email Verification Link Format

```
{FRONTEND_URL}/verify-email?token={verification_token}
```

### OAuth Callback

```
{FRONTEND_URL}/oauth/callback?code={auth_code}&state={state}
```

---

## 12. QUICK START: Demo Account Structure

```python
# Demo user:
email: "demo@myelectricaldata.com"
password: "DemoPassword123!"
client_id: "cli_{random}"
client_secret: "{random}"
email_verified: True
is_active: True
debug_mode: True (optional)

# Demo PDL 1:
usage_point_id: "12345678901234"
name: "Demo - Main House"
has_consumption: True
has_production: True
subscribed_power: 9 kVA

# Demo PDL 2 (optional):
usage_point_id: "98765432109876"
name: "Demo - Apartment"
has_consumption: True
has_production: False
subscribed_power: 6 kVA
```
