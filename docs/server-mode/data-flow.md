---
sidebar_position: 6
---

# Flux de Données

## Vue d'ensemble

```
Frontend (React)
    ↓
API Gateway (FastAPI)
    ├─→ User Authentication
    │   ├─ POST /accounts/signup
    │   ├─ POST /accounts/login
    │   └─ POST /accounts/token
    │
    ├─→ PDL Management
    │   ├─ GET /pdl/
    │   ├─ POST /pdl/
    │   └─ DELETE /pdl/{id}
    │
    ├─→ Consumption/Production Data
    │   ├─ GET /enedis/consumption/daily/{pdl}
    │   ├─ GET /enedis/consumption/detail/{pdl}
    │   ├─ GET /enedis/production/daily/{pdl}
    │   └─ GET /enedis/production/detail/{pdl}
    │
    └─→ Contract Info
        ├─ GET /enedis/contract/{pdl}
        ├─ GET /enedis/address/{pdl}
        ├─ GET /enedis/customer/{pdl}
        └─ GET /enedis/contact/{pdl}

Database (SQLite/PostgreSQL)
├─ Users (with client_id, client_secret)
├─ PDLs (Points de Livraison)
├─ Tokens (Enedis OAuth tokens)
├─ Roles & Permissions
└─ Email/Password Reset Tokens

Cache Layer (Redis)
├─ consumption:daily:{pdl}:{date}
├─ consumption:reading_type:{pdl}
├─ rate_limit:{user_id}:cached:{date}
└─ rate_limit:{user_id}:no_cache:{date}

Enedis API (Sandbox/Production)
├─ OAuth2 endpoints
├─ Daily/Detail consumption data
├─ Production data
├─ Contract/Address/Customer/Contact info
└─ Usage points list
```

---

## Database Schema (Simplified)

```
users
├─ id (UUID)
├─ email (unique)
├─ hashed_password
├─ client_id (unique)
├─ client_secret
├─ email_verified (bool)
├─ debug_mode (bool)
├─ is_active (bool)
├─ role_id (FK → roles)
└─ created_at, updated_at

pdls
├─ id (UUID)
├─ usage_point_id (14 digits, indexed)
├─ user_id (FK → users)
├─ name (optional)
├─ has_consumption (bool)
├─ has_production (bool)
├─ subscribed_power (int)
├─ activation_date
├─ oldest_available_data_date
└─ display_order

tokens
├─ id (UUID)
├─ user_id (FK → users, nullable for global)
├─ usage_point_id (indexed)
├─ access_token
├─ refresh_token
├─ token_type
├─ expires_at
└─ scope

roles
├─ id (UUID)
├─ name (unique)
├─ display_name
└─ permissions (list)
```

---

## Authentication Flow

```
1. SIGNUP
   POST /accounts/signup
   ├─ Input: email, password, optional captcha_token
   ├─ Create User with hashed password
   ├─ Generate unique client_id, client_secret
   ├─ Return client_id, client_secret (for API)
   └─ Send verification email (if required)

2. LOGIN
   POST /accounts/login
   ├─ Input: email, password
   ├─ Verify password (bcrypt)
   ├─ Create JWT token (exp: 30 days)
   └─ Return access_token

3. TOKEN (OAuth2 Client Credentials)
   POST /accounts/token
   ├─ Input: client_id, client_secret (form or Basic Auth)
   ├─ Create JWT token (exp: 30 days)
   └─ Return access_token, token_type="bearer"

4. API CALLS
   GET /pdl/ (with Bearer token)
   ├─ Authorization: Bearer {jwt_token}
   ├─ Or: Authorization: Bearer {client_secret}
   └─ Middleware decodes token → extracts user.id
```

---

## Enedis API Integration

```
GLOBAL CLIENT CREDENTIALS FLOW
1. Get global token (machine-to-machine)
   POST {ENEDIS_BASE_URL}/oauth2/v3/token
   ├─ client_id, client_secret (from config)
   ├─ grant_type: "client_credentials"
   └─ Returns: access_token, expires_in

2. Use token for all API calls
   GET {ENEDIS_BASE_URL}/metering_data_dc/v5/daily_consumption
   ├─ Query: usage_point_id, start, end
   ├─ Header: Authorization: Bearer {access_token}
   └─ Returns: meter_reading with interval_reading array

RATE LIMITING
├─ 5 requests/second (adapter level)
├─ 50 requests/day uncached per user
├─ 1000 requests/day with cache per user
└─ Admin users: unlimited
```

---

## Data Caching Strategy

```
GRANULAR DAILY CACHING
1. User requests: GET /consumption/daily/12345678901234?start=2024-01-01&end=2024-12-31&use_cache=true

2. Check cache day-by-day:
   for each date in range:
       if cached_data[date] exists:
           add to results
       else:
           add to missing_dates

3. If missing_dates:
       fetch from Enedis for those dates
       cache each date individually
       cache_key = f"consumption:daily:{pdl}:{date}"

4. Return combined cached + fresh data

CACHE TTL: 86400 seconds (24 hours)
ENCRYPTION: user.client_secret
```

---

## Demo Account Implementation

```
DEMO ACCOUNT
├─ Email: demo@myelectricaldata.fr
├─ Password: DemoPassword123!
├─ email_verified: True (skip verification)
├─ debug_mode: True (verbose logging)
└─ client_id/secret: Generated

DEMO PDLs (2)
├─ PDL 1: 12345678901234 (Main House)
│  ├─ has_consumption: True
│  ├─ has_production: True (solar)
│  └─ subscribed_power: 9 kVA
│
└─ PDL 2: 98765432109876 (Apartment)
   ├─ has_consumption: True
   ├─ has_production: False
   └─ subscribed_power: 6 kVA

MOCK DATA (365 days)
├─ Consumption: 15-25 kWh/day
│  ├─ Winter: +30%
│  ├─ Summer: -20%
│  └─ Quality: "CORRIGE"
│
└─ Production: 0-20 kWh/day (solar only)
   ├─ Summer: 20 kWh/day
   ├─ Winter: 3 kWh/day
   ├─ Cloudy days: -60%
   └─ Quality: "CORRIGE"

CACHED IN REDIS
├─ consumption:daily:{pdl}:{date} (365 entries)
├─ production:daily:{pdl}:{date} (365 entries)
├─ consumption:reading_type:{pdl}
└─ production:reading_type:{pdl}
```

---

## File Structure

```
apps/api/
├─ src/
│  ├─ models/
│  │  ├─ user.py         <- User model
│  │  ├─ pdl.py          <- PDL (meter) model
│  │  ├─ token.py        <- Enedis token storage
│  │  ├─ database.py     <- DB connection setup
│  │  └─ ...
│  │
│  ├─ routers/
│  │  ├─ accounts.py     <- Signup, Login, Token
│  │  ├─ pdl.py          <- PDL CRUD operations
│  │  ├─ enedis.py       <- Consumption/Production data
│  │  ├─ admin.py        <- User management
│  │  └─ ...
│  │
│  ├─ adapters/
│  │  └─ enedis.py       <- Enedis API wrapper
│  │
│  ├─ middleware/
│  │  ├─ auth.py         <- Authentication
│  │  └─ admin.py        <- Admin checks
│  │
│  ├─ services/
│  │  ├─ cache.py        <- Redis caching
│  │  ├─ email.py        <- Email sending
│  │  ├─ rate_limiter.py <- Rate limiting
│  │  └─ ...
│  │
│  ├─ utils/
│  │  └─ auth.py         <- Password hashing, JWT
│  │
│  ├─ schemas/
│  │  ├─ requests.py     <- Input validation
│  │  └─ responses.py    <- Response models
│  │
│  └─ main.py            <- FastAPI app setup
│
├─ scripts/
│  ├─ seed_edf_offers.py
│  ├─ import_github_offers.py
│  └─ create_demo_account.py  <- NEW
│
├─ migrations/           <- Alembic DB migrations
└─ tests/
```

---

## Key Utilities

```python
# Password hashing (bcrypt)
get_password_hash(password: str) -> str
verify_password(plain: str, hashed: str) -> bool

# JWT tokens
create_access_token(data: dict) -> str
decode_access_token(token: str) -> dict

# Client credentials
generate_client_id() -> str        # "cli_xxx..."
generate_client_secret() -> str    # Random 64-char string

# Rate limiting
async rate_limiter.increment_and_check(user_id, use_cache) -> (bool, int, int)

# Caching
async cache_service.get(key, encryption_key) -> value
async cache_service.set(key, value, encryption_key) -> None
async cache_service.delete(key) -> None
```

---

## Environment Variables (Key)

```
DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db
REDIS_URL=redis://localhost:6379/0
CACHE_TTL_SECONDS=86400

ENEDIS_ENVIRONMENT=sandbox|production
ENEDIS_CLIENT_ID=<your-client-id>
ENEDIS_CLIENT_SECRET=<your-secret>
ENEDIS_REDIRECT_URI=http://localhost:3000/oauth/callback

SECRET_KEY=<jwt-signing-key>
ACCESS_TOKEN_EXPIRE_MINUTES=43200 (30 days)

FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000

DEBUG=true|false
DEBUG_SQL=true|false

REQUIRE_EMAIL_VERIFICATION=true|false
REQUIRE_CAPTCHA=true|false

ADMIN_EMAILS=admin@example.com,admin2@example.com
```

---

## Testing the Demo Account

```bash
# 1. Create demo account
cd apps/api
python scripts/create_demo_account.py

# Output:
# ✓ Created demo user: demo@myelectricaldata.fr
# Client ID: cli_abc123...
# Client Secret: def456...

# 2. Get access token
curl -X POST http://localhost:8000/api/accounts/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=cli_abc123...&client_secret=def456..."

# Response:
# {"access_token": "eyJ...", "token_type": "bearer"}

# 3. List PDLs
curl http://localhost:8000/api/pdl/ \
  -H "Authorization: Bearer eyJ..."

# Response:
# {
#   "success": true,
#   "data": [
#     {"usage_point_id": "12345678901234", "name": "Demo - Main House", ...},
#     {"usage_point_id": "98765432109876", "name": "Demo - Apartment", ...}
#   ]
# }

# 4. Get consumption data (cached)
curl "http://localhost:8000/api/enedis/consumption/daily/12345678901234?start=2024-01-01&end=2024-12-31&use_cache=true" \
  -H "Authorization: Bearer eyJ..."

# Response:
# {
#   "success": true,
#   "data": {
#     "meter_reading": {
#       "interval_reading": [
#         {"date": "2024-01-01", "value": 18.5, "quality": "CORRIGE"},
#         {"date": "2024-01-02", "value": 19.2, "quality": "CORRIGE"},
#         ...
#       ]
#     }
#   }
# }
```

